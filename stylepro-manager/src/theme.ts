export type ThemeMode = 'light' | 'dark' | 'system'

const THEME_KEY = 'stylepro-theme'

export const getStoredTheme = (): ThemeMode => {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }
  return 'light'
}

export const persistTheme = (mode: ThemeMode): void => {
  localStorage.setItem(THEME_KEY, mode)
  document.documentElement.dataset.theme = mode
  document.body.classList.toggle('theme-dark', mode === 'dark')
  document.body.classList.toggle('theme-light', mode !== 'dark')
}

export const resolveEffectiveTheme = (mode: ThemeMode): 'light' | 'dark' => {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode === 'dark' ? 'dark' : 'light'
}
