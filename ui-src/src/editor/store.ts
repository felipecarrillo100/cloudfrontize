import { create } from 'zustand'

export type TabKind = 'function' | 'kvs' | 'manifest'

export interface EditorTab {
  key: string
  kind: TabKind
  id: string
}

/** An open file: what's in the editor, what was last saved (or loaded), and the revision it's based on. */
export interface FileBuffer {
  content: string
  saved: string
  revision: string | null
}

export const tabKey = (kind: TabKind, id: string) => (kind === 'manifest' ? 'manifest' : `${kind}:${id}`)
export const isDirty = (b?: FileBuffer) => !!b && b.content !== b.saved

interface EditorState {
  tabs: EditorTab[]
  /** The active tab's key; null shows the schematic. */
  active: string | null
  buffers: Record<string, FileBuffer>
  open(kind: TabKind, id: string): void
  close(key: string): void
  activate(key: string | null): void
  /** The file as on disk (replaces the buffer). */
  load(key: string, content: string, revision: string | null): void
  edit(key: string, content: string): void
  markSaved(key: string, content: string, revision: string): void
  /** Follows a function rename (its tab and buffer move to the new id). */
  renameFunction(from: string, to: string): void
  /** Another project: no tabs. */
  reset(): void
}

export const useEditor = create<EditorState>()(set => ({
  tabs: [],
  active: null,
  buffers: {},
  open: (kind, id) => set(s => {
    const key = tabKey(kind, id)
    return { tabs: s.tabs.some(t => t.key === key) ? s.tabs : [...s.tabs, { key, kind, id }], active: key }
  }),
  close: key => set(s => {
    const index = s.tabs.findIndex(t => t.key === key)
    const tabs = s.tabs.filter(t => t.key !== key)
    const buffers = { ...s.buffers }
    delete buffers[key]
    const active = s.active !== key ? s.active : (tabs[index] ?? tabs[index - 1])?.key ?? null
    return { tabs, buffers, active }
  }),
  activate: active => set({ active }),
  load: (key, content, revision) => set(s => ({ buffers: { ...s.buffers, [key]: { content, saved: content, revision } } })),
  edit: (key, content) => set(s => (s.buffers[key] ? { buffers: { ...s.buffers, [key]: { ...s.buffers[key], content } } } : s)),
  markSaved: (key, content, revision) => set(s => ({ buffers: { ...s.buffers, [key]: { content: s.buffers[key]?.content ?? content, saved: content, revision } } })),
  reset: () => set({ tabs: [], active: null, buffers: {} }),
  renameFunction: (from, to) => set(s => {
    const oldKey = tabKey('function', from)
    const newKey = tabKey('function', to)
    const buffers = { ...s.buffers }
    if (buffers[oldKey]) { buffers[newKey] = buffers[oldKey]; delete buffers[oldKey] }
    return {
      tabs: s.tabs.map(t => (t.key === oldKey ? { key: newKey, kind: 'function', id: to } : t)),
      buffers,
      active: s.active === oldKey ? newKey : s.active,
    }
  }),
}))

/** True when any open file has unsaved changes. */
export const hasUnsaved = () => Object.values(useEditor.getState().buffers).some(isDirty)
