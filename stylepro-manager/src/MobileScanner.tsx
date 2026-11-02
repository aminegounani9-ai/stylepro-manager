import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'

type Props = {
  userId: string
  onClose: () => void
}

type ScannerSession = {
  id: string
  store_id: string
  session_token: string
  status: string
  expires_at: string
}

export default function MobileScanner({ userId, onClose }: Props) {
  const [session, setSession] = useState<ScannerSession | null>(null)
  const [status, setStatus] = useState('Vérification de la session…')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null)
  const busyRef = useRef(false)
  const cameraStartingRef = useRef(false)
  const elementId = 'stylepro-mobile-camera'

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session')
    const token = params.get('token')

    async function loadSession() {
      if (!sessionId || !token) {
        setStatus('Lien de session invalide. Scannez le QR affiché sur le PC.')
        return
      }

      const { data, error } = await supabase
        .from('mobile_scanner_sessions')
        .select('id,store_id,session_token,status,expires_at')
        .eq('id', sessionId)
        .eq('session_token', token)
        .maybeSingle()

      if (cancelled) return
      if (error || !data) {
        setStatus('Session introuvable ou accès refusé. Vérifiez votre compte et les droits du magasin.')
        return
      }
      if (data.status !== 'active' || new Date(data.expires_at).getTime() <= Date.now()) {
        setStatus('Cette session est fermée ou expirée.')
        return
      }

      setSession(data as ScannerSession)
      setStatus('Session connectée. Vous pouvez scanner un article.')
    }

    void loadSession()
    return () => {
      cancelled = true
      const scanner = scannerRef.current
      scannerRef.current = null
      if (scanner) {
        void (async () => {
          try {
            if (scanner.isScanning) await scanner.stop()
          } catch {
            // Ignore camera shutdown errors during unmount.
          }
          try {
            scanner.clear()
          } catch {
            // The scanner element may already be detached.
          }
        })()
      }
    }
  }, [])

  async function sendCode(raw: string) {
    const value = raw.trim()
    if (!value || !session || busyRef.current) return

    busyRef.current = true
    setBusy(true)
    setCode(value)

    try {
      const { error } = await supabase.from('mobile_scanner_events').insert({
        session_id: session.id,
        store_id: session.store_id,
        session_token: session.session_token,
        scanned_code: value,
        scanned_by: userId,
      })

      if (error) throw error
      setStatus(`Code envoyé au PC : ${value}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Impossible d’envoyer le code.')
    } finally {
      window.setTimeout(() => {
        busyRef.current = false
        setBusy(false)
      }, 900)
    }
  }

  async function startCamera() {
    if (cameraStartingRef.current || scannerRef.current?.isScanning) return
    cameraStartingRef.current = true
    let scanner: import('html5-qrcode').Html5Qrcode | null = null
    try {
      setStatus('Ouverture de la caméra…')
      const { Html5Qrcode } = await import('html5-qrcode')
      scanner = new Html5Qrcode(elementId)
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 230, height: 180 } },
        (decoded) => void sendCode(decoded),
        () => {}
      )
      setStatus('Caméra active. Placez le code devant l’objectif.')
    } catch (error) {
      if (scanner) {
        try {
          if (scanner.isScanning) await scanner.stop()
        } catch {
          // Ignore partial camera startup failures.
        }
        try {
          scanner.clear()
        } catch {
          // Ignore cleanup failures.
        }
      }
      if (scannerRef.current === scanner) scannerRef.current = null
      setStatus(error instanceof Error ? `Caméra indisponible : ${error.message}` : 'Caméra indisponible.')
    } finally {
      cameraStartingRef.current = false
    }
  }

  async function stopCamera() {
    const scanner = scannerRef.current
    if (cameraStartingRef.current && !scanner) {
      setStatus('Arrêt de la caméra en cours…')
      return
    }
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop()
        scanner.clear()
      } catch {
        // La caméra est peut-être déjà arrêtée.
      }
    }
    scannerRef.current = null
    setStatus('Caméra arrêtée.')
  }

  return (
    <main className="mobile-scanner-page">
      <section className="mobile-scanner-card">
        <div className="mobile-scanner-brand">STYLEPRO MANAGER</div>
        <h1>Scanner un article</h1>
        <p className="mobile-scanner-status" role="status">{status}</p>

        {session && (
          <>
            <div id={elementId} className="mobile-camera-view" />
            <div className="mobile-scanner-actions">
              <button type="button" className="primary-button" onClick={() => void startCamera()}>
                Ouvrir la caméra
              </button>
              <button type="button" className="secondary-button" onClick={() => void stopCamera()}>
                Arrêter
              </button>
            </div>

            <form
              className="mobile-manual-code"
              onSubmit={event => {
                event.preventDefault()
                void sendCode(code)
              }}
            >
              <label className="field">
                Saisie manuelle du code
                <input
                  value={code}
                  onChange={event => setCode(event.target.value)}
                  placeholder="Code-barres ou SKU"
                  autoComplete="off"
                />
              </label>
              <button type="submit" className="primary-button" disabled={busy || !code.trim()}>
                {busy ? 'Envoi…' : 'Envoyer au PC'}
              </button>
            </form>
          </>
        )}

        <button type="button" className="secondary-button mobile-close" onClick={() => void stopCamera().finally(onClose)}>
          Fermer
        </button>
      </section>
    </main>
  )
}
