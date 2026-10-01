import * as Tabs from '@radix-ui/react-tabs'
import { useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import type { ProductionLevel } from '@contract'
import { errorMessage } from '@/api/client'
import { useProductionCode } from '@/api/mutations'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner } from '@/components/ui/Spinner'

const LEVELS: { value: ProductionLevel; label: string; hint: string }[] = [
  { value: 'baked', label: 'Baked', hint: '__VAR__ placeholders replaced with the bake file\'s values' },
  { value: 'minified', label: 'Minified', hint: 'Baked, without comments and whitespace' },
  { value: 'uglified', label: 'Uglified', hint: 'Baked and mangled: the smallest deployable code' },
]

/** The code as it would be deployed to AWS. */
export function ProductionCodeDialog({ id, onClose }: { id: string | null; onClose(): void }) {
  const [level, setLevel] = useState<ProductionLevel>('baked')
  const code = useProductionCode(id ?? '', level, !!id)
  const bytes = code.data ? new TextEncoder().encode(code.data.code).length : 0
  return (
    <Dialog open={!!id} onOpenChange={o => { if (!o) onClose() }} title={`Production build: ${id ?? ''}`} className="max-w-4xl"
      footer={<>
        {code.data && <span className="mr-auto self-center font-mono text-xs text-muted">{bytes.toLocaleString()} bytes</span>}
        <Button disabled={!code.data} onClick={() => code.data && navigator.clipboard.writeText(code.data.code).then(() => toast.success('Copied'))}><Copy size={14} /> Copy</Button>
        <Button variant="primary" onClick={onClose}>Close</Button>
      </>}>
      <Tabs.Root value={level} onValueChange={v => setLevel(v as ProductionLevel)}>
        <Tabs.List aria-label="Build level" className="mb-3 flex gap-1">
          {LEVELS.map(l => (
            <Tabs.Trigger key={l.value} value={l.value} title={l.hint}
              className="rounded-md border border-line px-3 py-1 text-sm text-muted data-[state=active]:border-accent data-[state=active]:text-accent">
              {l.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <p className="mb-2 text-xs text-muted">{LEVELS.find(l => l.value === level)?.hint}</p>
        {code.isLoading && <Spinner label="Building" />}
        {code.error && <p role="alert" className="text-sm text-danger">{errorMessage(code.error)}</p>}
        {code.data && <pre className="max-h-[55vh] overflow-auto rounded-md border border-line bg-bg p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">{code.data.code}</pre>}
      </Tabs.Root>
    </Dialog>
  )
}
