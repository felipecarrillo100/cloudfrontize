import { Loader2 } from 'lucide-react'

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <Loader2 size={16} className="animate-spin" aria-hidden />
      <span>{label}…</span>
    </span>
  )
}
