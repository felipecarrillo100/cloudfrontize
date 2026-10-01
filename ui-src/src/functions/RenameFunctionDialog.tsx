import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { errorMessage } from '@/api/client'
import { useUpdateFunction } from '@/api/mutations'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Field'
import { useUI } from '@/state/ui'
import { idSchema } from './ids'

const schema = z.object({ id: idSchema })

/** Renames a function everywhere it's attached (and its file, when it follows the naming convention). */
export function RenameFunctionDialog({ id, onClose, takenIds }: { id: string | null; onClose(): void; takenIds: string[] }) {
  const update = useUpdateFunction()
  const select = useUI(s => s.select)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<{ id: string }>({ resolver: zodResolver(schema), values: { id: id ?? '' } })
  const close = () => { update.reset(); onClose() }
  const onSubmit = handleSubmit(values => {
    if (!id || values.id === id) { close(); return }
    if (takenIds.includes(values.id)) { setError('id', { message: `A function "${values.id}" already exists` }); return }
    update.mutate({ id, newId: values.id }, { onSuccess: () => { select({ kind: 'function', id: values.id }); close() } })
  })
  return (
    <Dialog open={!!id} onOpenChange={o => { if (!o) close() }} title={`Rename ${id ?? ''}`}
      description="Every behavior using it is updated. A file named <event>.<name>.js is renamed too."
      footer={<>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" type="submit" form="rename-function" disabled={update.isPending}>Rename</Button>
      </>}>
      <form id="rename-function" onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <Field label="New name" error={errors.id?.message ?? (update.error ? errorMessage(update.error) : undefined)}>
          {p => <Input {...p} {...register('id')} autoFocus />}
        </Field>
      </form>
    </Dialog>
  )
}
