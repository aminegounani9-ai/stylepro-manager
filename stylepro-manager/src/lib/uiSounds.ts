export type UiSoundKind = 'click' | 'success' | 'error' | 'notification'

export const UI_SOUND_SETTINGS_KEY = 'stylepro-ui-sounds-v1'

export type UiSoundSettings = {
  enabled: boolean
  volume: number
}

export function readUiSoundSettings(): UiSoundSettings {
  try {
    const raw = localStorage.getItem(UI_SOUND_SETTINGS_KEY)
    if (!raw) return { enabled: true, volume: 0.22 }
    const value = JSON.parse(raw) as Partial<UiSoundSettings>
    return {
      enabled: value.enabled !== false,
      volume: typeof value.volume === 'number' ? Math.max(0, Math.min(1, value.volume)) : 0.22,
    }
  } catch {
    return { enabled: true, volume: 0.22 }
  }
}

let audioContext: AudioContext | null = null

export function playUiSound(kind: UiSoundKind = 'click', settings = readUiSoundSettings()): void {
  if (!settings.enabled || settings.volume <= 0 || typeof window === 'undefined') return
  try {
    const AudioContextConstructor = window.AudioContext
    if (!AudioContextConstructor) return
    audioContext ??= new AudioContextConstructor()
    if (audioContext.state === 'suspended') void audioContext.resume()

    const now = audioContext.currentTime
    const notes: Record<UiSoundKind, number[]> = {
      click: [660],
      success: [523.25, 659.25, 783.99],
      error: [310, 220],
      notification: [587.33, 739.99],
    }
    const durations: Record<UiSoundKind, number> = {
      click: 0.045, success: 0.11, error: 0.10, notification: 0.09,
    }
    notes[kind].forEach((frequency, index) => {
      const oscillator = audioContext!.createOscillator()
      const gain = audioContext!.createGain()
      const start = now + index * (kind === 'success' ? 0.09 : 0.075)
      oscillator.type = kind === 'error' ? 'triangle' : 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, settings.volume * 0.10), start + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + durations[kind])
      oscillator.connect(gain)
      gain.connect(audioContext!.destination)
      oscillator.start(start)
      oscillator.stop(start + durations[kind] + 0.01)
    })
  } catch {
    // Audio is an optional enhancement; it must never interrupt app workflows.
  }
}
