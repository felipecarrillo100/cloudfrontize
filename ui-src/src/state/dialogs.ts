import { create } from 'zustand'
import type { DistributionFunction } from '@contract'
import type { NewFunctionTarget } from '@/functions/NewFunctionDialog'

/** Dialogs opened from menus anywhere in the workbench (rendered once by DialogHost). */
interface DialogState {
  newFunction: NewFunctionTarget | null
  rename: string | null
  remove: DistributionFunction | null
  production: string | null
  /** Add a behavior (`null` key) or edit one. */
  behavior: { key: string | null } | null
  open<K extends keyof Omit<DialogState, 'open' | 'close'>>(name: K, value: DialogState[K]): void
  close(name: keyof Omit<DialogState, 'open' | 'close'>): void
}

export const useDialogs = create<DialogState>()(set => ({
  newFunction: null,
  rename: null,
  remove: null,
  production: null,
  behavior: null,
  open: (name, value) => set({ [name]: value } as Partial<DialogState>),
  close: name => set({ [name]: null } as Partial<DialogState>),
}))
