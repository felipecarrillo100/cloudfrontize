import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'cff' | 'lae' | 'accent'

const tones: Record<Tone, string> = {
  neutral: 'text-muted border-line',
  ok: 'text-ok border-ok/40',
  warn: 'text-warn border-warn/40',
  danger: 'text-danger border-danger/40',
  cff: 'text-cff border-cff/40',
  lae: 'text-lae border-lae/40',
  accent: 'text-accent border-accent/40',
}

export function Badge({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[11px] leading-4', tones[tone], className)}>
      {children}
    </span>
  )
}
