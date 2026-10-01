import { z } from 'zod'

/** Function and store ids: the manifest's rule. */
export const idSchema = z.string().trim()
  .min(1, 'Give it a name')
  .max(64, 'Use at most 64 characters')
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Use letters, digits, ".", "_" or "-", starting with a letter or digit')

export const CFF_RUNTIMES = [
  { value: 'cloudfront-js-2.0', label: 'JavaScript runtime 2.0' },
  { value: 'cloudfront-js-1.0', label: 'JavaScript runtime 1.0 (ES 5.1)' },
]
export const LAE_RUNTIMES = [
  { value: 'nodejs22.x', label: 'Node.js 22' },
  { value: 'nodejs20.x', label: 'Node.js 20' },
]
