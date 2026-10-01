import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import type { Distribution } from '@contract'
import { ApiRequestError, errorMessage } from '@/api/client'
import { useManifestEdit } from '@/api/mutations'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Field'
import { DiagnosticsList } from '@/components/DiagnosticsList'
import { useUI } from '@/state/ui'

// AWS path pattern rules ("Path pattern" in the distribution settings reference); the server checks them too
const schema = z.object({
  pathPattern: z.string().trim()
    .min(1, 'Enter a path pattern such as /images/* or *.jpg')
    .max(255, 'Use at most 255 characters')
    .refine(p => p !== '*' && p !== '/*', 'That matches everything: it\'s what the default behavior does')
    .refine(p => /^[A-Za-z0-9_\-.*$/~"'@:+&?=]+$/.test(p), 'Use letters, digits and _ - . * $ / ~ " \' @ : + & ? ='),
  origin: z.string().min(1),
})
type Values = z.infer<typeof schema>

/** Adds a cache behavior (after the existing ones, so they keep their precedence) or edits one. */
export function BehaviorDialog({ dist, target, onClose }: { dist: Distribution; target: { key: string | null } | null; onClose(): void }) {
  const edit = useManifestEdit()
  const showBehavior = useUI(s => s.showBehavior)
  const existing = target?.key ? dist.behaviors.find(b => b.key === target.key) : undefined
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    values: { pathPattern: existing?.pathPattern ?? '', origin: existing?.origin ?? dist.origins[0]?.id ?? '' },
  })
  const close = () => { edit.reset(); onClose() }

  const onSubmit = handleSubmit(values => {
    if (dist.behaviors.some(b => b.pathPattern === values.pathPattern && b.key !== existing?.key)) {
      setError('pathPattern', { message: 'Another behavior already uses this pattern' })
      return
    }
    edit.mutate(m => {
      m.behaviors ??= []
      if (existing) {
        const b = m.behaviors.find(x => x.pathPattern === existing.key)
        if (b) { b.pathPattern = values.pathPattern; b.origin = values.origin }
      } else {
        m.behaviors.push({ pathPattern: values.pathPattern, origin: values.origin })
      }
    }, {
      onSuccess: () => { toast.success(existing ? 'Behavior saved' : 'Behavior added'); showBehavior(values.pathPattern); close() },
    })
  })

  return (
    <Dialog open={!!target} onOpenChange={o => { if (!o) close() }} title={existing ? 'Edit behavior' : 'Add a cache behavior'}
      description="Requests whose path matches the pattern use this behavior's origin and functions. Behaviors are matched in order; the default behavior catches the rest."
      footer={<>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" type="submit" form="behavior" disabled={edit.isPending}>{existing ? 'Save' : 'Add'}</Button>
      </>}>
      <form id="behavior" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Path pattern" error={errors.pathPattern?.message} hint={<>* matches any characters, ? exactly one. Case-sensitive.</>}>
          {p => <Input {...p} {...register('pathPattern')} placeholder="/api/*" className="font-mono" autoFocus />}
        </Field>
        <Field label="Origin">
          {p => <Select {...p} {...register('origin')}>{dist.origins.map(o => <option key={o.id} value={o.id}>{o.id}</option>)}</Select>}
        </Field>
        {edit.error && (
          <div role="alert" className="rounded-md border border-danger/40 p-3">
            <p className="mb-2 text-sm font-medium text-danger">{errorMessage(edit.error)}</p>
            {edit.error instanceof ApiRequestError && <DiagnosticsList diagnostics={edit.error.diagnostics} />}
          </div>
        )}
      </form>
    </Dialog>
  )
}
