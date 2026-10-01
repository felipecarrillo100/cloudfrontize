import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { EdgeEvent, FunctionType } from '@contract'
import { ApiRequestError, errorMessage } from '@/api/client'
import { useCreateFunction } from '@/api/mutations'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Field'
import { DiagnosticsList } from '@/components/DiagnosticsList'
import { typeName } from '@/schematic/rules'
import { useUI } from '@/state/ui'
import { CFF_RUNTIMES, idSchema, LAE_RUNTIMES } from './ids'

export interface NewFunctionTarget {
  type: FunctionType
  event: EdgeEvent
  behavior: string
}

const schema = z.object({ id: idSchema, runtime: z.string() })
type Values = z.infer<typeof schema>

const folder = (type: FunctionType) => (type === 'cloudfront-function' ? 'cloudfront' : 'lambda-edge')

/** Creates a function with starter code in a slot: its file goes to functions/<kind>/<event>.<id>.js. */
export function NewFunctionDialog({ target, onClose, takenIds }: { target: NewFunctionTarget | null; onClose(): void; takenIds: string[] }) {
  const create = useCreateFunction()
  const select = useUI(s => s.select)
  const runtimes = target?.type === 'cloudfront-function' ? CFF_RUNTIMES : LAE_RUNTIMES
  const { register, handleSubmit, control, setError, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    values: { id: '', runtime: runtimes[0].value },
  })
  const id = useWatch({ control, name: 'id' })

  const close = () => { reset(); create.reset(); onClose() }
  const onSubmit = handleSubmit(values => {
    if (!target) return
    if (takenIds.includes(values.id)) { setError('id', { message: `A function "${values.id}" already exists` }); return }
    create.mutate({ ...target, id: values.id, runtime: values.runtime }, {
      onSuccess: () => { select({ kind: 'function', id: values.id }); close() },
    })
  })

  const failure = create.error
  return (
    <Dialog
      open={!!target}
      onOpenChange={o => { if (!o) close() }}
      title={target ? `New ${typeName[target.type]}` : ''}
      description={target ? `Runs on ${target.event} of ${target.behavior === 'default' ? 'the default behavior' : target.behavior}.` : undefined}
      footer={<>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" type="submit" form="new-function" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create'}</Button>
      </>}
    >
      <form id="new-function" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Name" error={errors.id?.message}
          hint={target && id ? <>Creates <code className="font-mono">functions/{folder(target.type)}/{target.event}.{id}.js</code> with starter code</> : 'The function\'s id in the project'}>
          {p => <Input {...p} {...register('id')} placeholder="security-headers" autoFocus />}
        </Field>
        <Field label="Runtime">
          {p => <Select {...p} {...register('runtime')}>{runtimes.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</Select>}
        </Field>
        {failure && (
          <div role="alert" className="rounded-md border border-danger/40 p-3">
            <p className="mb-2 text-sm font-medium text-danger">{errorMessage(failure)}</p>
            {failure instanceof ApiRequestError && <DiagnosticsList diagnostics={failure.diagnostics} />}
          </div>
        )}
      </form>
    </Dialog>
  )
}
