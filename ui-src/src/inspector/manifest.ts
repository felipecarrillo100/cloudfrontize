import type { DraftBehavior, DraftManifest } from '@/api/draft'

/** Helpers for editing the manifest as written. */

/** The behavior entry for a key ("default" or a path pattern). */
export function behaviorEntry(m: DraftManifest, key: string): DraftBehavior | undefined {
  if (key === 'default') return m.defaultBehavior
  return (m.behaviors ?? []).find(b => b.pathPattern === key)
}

/** Every behavior entry, default included. */
export const allBehaviors = (m: DraftManifest): DraftBehavior[] => [m.defaultBehavior, ...(m.behaviors ?? [])].filter(Boolean)

/** Renames an origin everywhere it's referenced. */
export function renameOrigin(m: DraftManifest, from: string, to: string): void {
  for (const b of allBehaviors(m)) if (b.origin === from) b.origin = to
}

/** Behaviors (labels) using an origin. */
export function behaviorsUsingOrigin(m: DraftManifest, id: string): string[] {
  const out: string[] = []
  if (m.defaultBehavior?.origin === id) out.push('Default (*)')
  for (const b of m.behaviors ?? []) if (b.origin === id && b.pathPattern) out.push(b.pathPattern)
  return out
}
