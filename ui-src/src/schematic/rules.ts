import type { DistributionBehavior, DistributionFunction, EdgeEvent, FunctionType } from '@contract'

/**
 * What AWS allows in a cache behavior's event slots ("Restrictions on all edge functions ›
 * Combining CloudFront Functions with Lambda@Edge"). The UI offers only valid choices and says why
 * the others aren't; the server checks the same rules on save.
 */
export const EVENTS: EdgeEvent[] = ['viewer-request', 'origin-request', 'origin-response', 'viewer-response']
export const VIEWER_EVENTS: EdgeEvent[] = ['viewer-request', 'viewer-response']

export interface TypeOption {
  allowed: boolean
  /** Why it isn't allowed. */
  reason?: string
}

export interface SlotOptions {
  types: Record<FunctionType, TypeOption>
  /** Existing functions, each with whether it may go in this slot. */
  existing: { fn: DistributionFunction; allowed: boolean; reason?: string }[]
}

export const typeName: Record<FunctionType, string> = {
  'cloudfront-function': 'CloudFront Function',
  'lambda-edge': 'Lambda@Edge function',
}

const otherViewerEvent = (event: EdgeEvent): EdgeEvent => (event === 'viewer-request' ? 'viewer-response' : 'viewer-request')

/** The function types and existing functions allowed in `event` of `behavior`. */
export function slotOptions(behavior: DistributionBehavior, event: EdgeEvent, functions: DistributionFunction[]): SlotOptions {
  const byId = new Map(functions.map(f => [f.id, f]))
  const types: Record<FunctionType, TypeOption> = {
    'cloudfront-function': { allowed: true },
    'lambda-edge': { allowed: true },
  }

  if (!VIEWER_EVENTS.includes(event)) {
    types['cloudfront-function'] = { allowed: false, reason: 'CloudFront Functions run only on viewer events' }
  } else {
    const other = byId.get(behavior.functions[otherViewerEvent(event)] ?? '')
    if (other) {
      const blocked: FunctionType = other.type === 'cloudfront-function' ? 'lambda-edge' : 'cloudfront-function'
      types[blocked] = {
        allowed: false,
        reason: `${otherViewerEvent(event)} runs a ${typeName[other.type]}: AWS doesn't allow both kinds on a behavior's viewer events`,
      }
    }
  }

  const current = behavior.functions[event]
  const existing = functions
    .filter(fn => fn.id !== current)
    .map(fn => (types[fn.type].allowed ? { fn, allowed: true } : { fn, allowed: false, reason: types[fn.type].reason }))
  return { types, existing }
}

/** The behavior a viewer path matches (path patterns in order; `*` any characters, `?` one). */
export function matchBehavior(behaviors: DistributionBehavior[], path: string): DistributionBehavior | undefined {
  for (const b of behaviors) {
    if (b.pathPattern === null) return b
    const regex = new RegExp('^' + b.pathPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
    if (regex.test(path)) return b
  }
  return undefined
}
