import { useCallback, useEffect, useState } from 'react'
import { Bell, CheckCheck, CircleAlert, CircleCheck, Info, Trash2, X } from 'lucide-react'

type NotificationKind = 'success' | 'error' | 'warning' | 'info'
type NotificationRecord = {
  id: string
  kind: NotificationKind
  title: string
  body: string
  createdAt: string
  read: boolean
}

type LowStockItem = { id: string; sku: string; current: number; minimum: number }

type Props = {
  error: string
  message: string
  lowStock: LowStockItem[]
  storeId: string
  language: 'fr' | 'ar'
}

const HISTORY_LIMIT = 80

function readHistory(key: string): NotificationRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item): item is NotificationRecord =>
      Boolean(item && typeof item === 'object' &&
        typeof item.id === 'string' &&
        ['success', 'error', 'warning', 'info'].includes(item.kind) &&
        typeof item.title === 'string' &&
        typeof item.body === 'string' &&
        typeof item.createdAt === 'string' &&
        typeof item.read === 'boolean')
    ).slice(0, HISTORY_LIMIT)
  } catch {
    return []
  }
}

const copy = {
  fr: {
    title: 'Notifications', empty: 'Aucune notification pour le moment',
    unread: 'non lues', markAll: 'Tout marquer comme lu',
    clear: 'Effacer l’historique', success: 'Opération réussie',
    error: 'Une erreur est survenue', warning: 'Stock faible',
    info: 'Information', close: 'Fermer', kinds: {
      success: 'Succès', error: 'Erreur', warning: 'Alerte', info: 'Info'
    }
  },
  ar: {
    title: 'الإشعارات', empty: 'لا توجد إشعارات حالياً',
    unread: 'غير مقروءة', markAll: 'تعليم الكل كمقروء',
    clear: 'مسح السجل', success: 'تمت العملية بنجاح',
    error: 'حدث خطأ', warning: 'المخزون منخفض',
    info: 'معلومة', close: 'إغلاق', kinds: {
      success: 'نجاح', error: 'خطأ', warning: 'تنبيه', info: 'معلومة'
    }
  }
}

export default function NotificationCenter({ error, message, lowStock, storeId, language }: Props) {
  const [history, setHistory] = useState<NotificationRecord[]>(() =>
    readHistory(storeId ? `stylepro_notifications_v2_${storeId}` : 'stylepro_notifications_v2')
  )
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<NotificationRecord | null>(null)
  const t = copy[language]
  const storageKey = storeId ? `stylepro_notifications_v2_${storeId}` : 'stylepro_notifications_v2'

  useEffect(() => {
    setHistory(readHistory(storageKey))
  }, [storageKey])

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(history.slice(0, HISTORY_LIMIT))) } catch { /* Storage may be unavailable. */ }
  }, [history, storageKey])

  const addNotification = useCallback((kind: NotificationKind, title: string, body: string) => {
    const item: NotificationRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind, title, body, createdAt: new Date().toISOString(), read: false
    }
    setHistory(previous => [item, ...previous].slice(0, HISTORY_LIMIT))
    setToast(item)
  }, [])

  useEffect(() => {
    if (error) addNotification('error', t.error, error)
  }, [error, addNotification, t.error])

  useEffect(() => {
    if (message) addNotification('success', t.success, message)
  }, [message, addNotification, t.success])

  useEffect(() => {
    if (!storeId) return
    const key = `stylepro_low_stock_active_v1_${storeId}`
    let previousIds: string[] = []
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) || '[]')
      if (Array.isArray(value)) previousIds = value.filter((id): id is string => typeof id === 'string')
    } catch { /* Start with an empty baseline if storage is unavailable. */ }

    const currentIds = lowStock.map(item => item.id)
    lowStock.filter(item => !previousIds.includes(item.id)).slice(0, 8).forEach(item => {
      addNotification(
        'warning',
        t.warning,
        `${item.sku} — ${language === 'ar' ? 'المتوفر' : 'Disponible'} : ${item.current} / ${item.minimum}`
      )
    })
    try { localStorage.setItem(key, JSON.stringify(currentIds)) } catch { /* Storage may be unavailable. */ }
  }, [lowStock, storeId, addNotification, t.warning, language])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 5200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const unreadCount = history.filter(item => !item.read).length
  const markAllRead = () => setHistory(previous => previous.map(item => ({ ...item, read: true })))
  const markRead = (id: string) => setHistory(previous => previous.map(item => item.id === id ? { ...item, read: true } : item))
  const iconFor = (kind: NotificationKind) => {
    if (kind === 'success') return <CircleCheck size={18} />
    if (kind === 'error') return <CircleAlert size={18} />
    if (kind === 'warning') return <CircleAlert size={18} />
    return <Info size={18} />
  }

  return (
    <>
      <div className="notification-center" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <button
          type="button"
          className="icon-button notification-trigger"
          aria-label={t.title}
          aria-expanded={open}
          title={t.title}
          onClick={() => {
            setOpen(value => !value)
            if (!open) markAllRead()
          }}
        >
          <Bell size={19} />
          {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </button>

        {open && (
          <section className="notification-popover" aria-label={t.title}>
            <div className="notification-popover-head">
              <div>
                <strong>{t.title}</strong>
                <small>{unreadCount} {t.unread}</small>
              </div>
              <button type="button" className="notification-close" aria-label={t.close} onClick={() => setOpen(false)}>
                <X size={17} />
              </button>
            </div>
            <div className="notification-toolbar">
              <button type="button" onClick={markAllRead}><CheckCheck size={14} /> {t.markAll}</button>
              <button type="button" onClick={() => setHistory([])}><Trash2 size={14} /> {t.clear}</button>
            </div>
            <div className="notification-list">
              {history.length === 0 ? (
                <div className="notification-empty"><Bell size={25} /><span>{t.empty}</span></div>
              ) : history.map(item => (
                <button
                  type="button"
                  className={`notification-item ${item.read ? 'is-read' : 'is-unread'} kind-${item.kind}`}
                  key={item.id}
                  onClick={() => markRead(item.id)}
                >
                  <span className="notification-item-icon">{iconFor(item.kind)}</span>
                  <span className="notification-item-copy">
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <small>{new Date(item.createdAt).toLocaleString(language === 'ar' ? 'ar-DZ' : 'fr-DZ')}</small>
                  </span>
                  {!item.read && <i className="notification-unread-dot" />}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {toast && (
        <div className={`notification-toast kind-${toast.kind}`} role="status" aria-live="polite" dir={language === 'ar' ? 'rtl' : 'ltr'}>
          <span className="notification-toast-icon">{iconFor(toast.kind)}</span>
          <span className="notification-toast-copy"><strong>{toast.title}</strong><small>{toast.body}</small></span>
          <button type="button" aria-label={t.close} onClick={() => setToast(null)}><X size={17} /></button>
        </div>
      )}
    </>
  )
}
