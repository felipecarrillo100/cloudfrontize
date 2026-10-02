import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'
export type View = 'start' | 'workbench'

/** What the inspector shows: a schematic node, or a function. */
export type Selection =
  | { kind: 'viewer' }
  | { kind: 'distribution' }
  | { kind: 'origin' }
  | { kind: 'function'; id: string }

const THEME_KEY = 'cloudfrontize.theme'

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

/** Applies a theme to <html data-theme>, resolving "system" from the OS setting. */
export function applyTheme(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

interface UIState {
  /** The start screen can be shown even while a project is open (Open / New project). */
  view: View | null
  theme: Theme
  selection: Selection | null
  /** The behavior shown on the schematic ("default" or a path pattern). */
  behaviorKey: string
  select(selection: Selection | null): void
  showBehavior(key: string): void
  showStart(): void
  showWorkbench(): void
  setTheme(theme: Theme): void
}

export const useUI = create<UIState>()(set => ({
  view: null,
  theme: readTheme(),
  selection: null,
  behaviorKey: 'default',
  select: selection => set({ selection }),
  showBehavior: behaviorKey => set({ behaviorKey }),
  showStart: () => set({ view: 'start' }),
  showWorkbench: () => set({ view: 'workbench' }),
  setTheme: theme => {
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* private mode: not remembered */ }
    applyTheme(theme)
    set({ theme })
  },
}))
