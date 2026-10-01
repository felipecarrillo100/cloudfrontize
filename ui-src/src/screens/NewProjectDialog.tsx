import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ApiRequestError, errorMessage } from '@/api/client'
import { useCreateProject } from '@/api/queries'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Field'
import { FolderBrowser } from '@/components/FolderBrowser'
import { DiagnosticsList } from '@/components/DiagnosticsList'
import { joinPath, slugify } from '@/lib/paths'

// The same rules the manifest schema applies, so most mistakes are caught before the request
const schema = z.object({
  name: z.string().trim().min(1, 'Give the project a name').max(128, 'Use at most 128 characters'),
  folder: z.string().trim().min(1, 'Choose a folder name').regex(/^[^\\/:*?"<>|]+$/, 'A folder name can\'t contain / \\ : * ? " < > |'),
  originType: z.enum(['local', 's3']),
  bucket: z.string().trim().optional(),
  region: z.string().trim().optional(),
  endpoint: z.string().trim().optional(),
  mode: z.enum(['rest', 'website']),
  profile: z.string().trim().optional(),
}).superRefine((v, ctx) => {
  if (v.originType !== 's3') return
  if (!v.bucket || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(v.bucket)) {
    ctx.addIssue({ code: 'custom', path: ['bucket'], message: 'Use a valid bucket name: 3–63 lowercase letters, digits, dots or hyphens' })
  }
  if (v.endpoint && !/^https?:\/\/\S+$/.test(v.endpoint)) {
    ctx.addIssue({ code: 'custom', path: ['endpoint'], message: 'Use a URL such as http://localhost:9000' })
  }
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange(open: boolean): void
  onCreated(): void
}

/** Create a project: a name, where it goes, and its origin (a local folder, or an S3 bucket). */
export function NewProjectDialog({ open, onOpenChange, onCreated }: Props) {
  const [location, setLocation] = useState<string | null>(null)
  const [folderEdited, setFolderEdited] = useState(false)
  const create = useCreateProject()
  const { register, handleSubmit, setValue, control, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', folder: '', originType: 'local', mode: 'rest' },
  })
  const name = useWatch({ control, name: 'name' })
  const originType = useWatch({ control, name: 'originType' })
  const folder = useWatch({ control, name: 'folder' })

  // The folder name follows the project name until edited by hand
  useEffect(() => {
    if (!folderEdited) setValue('folder', slugify(name ?? ''))
  }, [name, folderEdited, setValue])

  const onSubmit = handleSubmit(values => {
    if (!location) return
    const origin = values.originType === 'local'
      ? undefined
      : {
        id: 'bucket', type: 's3', bucket: values.bucket, mode: values.mode,
        ...(values.region ? { region: values.region } : {}),
        ...(values.endpoint ? { endpoint: values.endpoint, forcePathStyle: true } : {}),
        ...(values.profile ? { credentials: { profile: values.profile } } : {}),
      }
    create.mutate({ dir: joinPath(location, values.folder), name: values.name, origin }, {
      onSuccess: () => { onOpenChange(false); onCreated() },
    })
  })

  const failure = create.error
  const conflict = failure instanceof ApiRequestError && failure.status === 409
  return (
    <Dialog
      open={open}
      onOpenChange={o => { if (!o) create.reset(); onOpenChange(o) }}
      title="New project"
      description="A project is a folder with a cloudfrontize.json: its origins, behaviors and functions."
      className="max-w-2xl"
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" type="submit" form="new-project" disabled={create.isPending || !location}>
          {create.isPending ? 'Creating…' : 'Create project'}
        </Button>
      </>}
    >
      <form id="new-project" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Project name" error={errors.name?.message}>
          {p => <Input {...p} {...register('name')} placeholder="Shop frontend" autoFocus />}
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Location</span>
          <FolderBrowser path={location} onNavigate={setLocation} />
        </div>

        <Field label="Folder name" error={errors.folder?.message ?? (conflict ? errorMessage(failure) : undefined)}
          hint={location && folder ? <>Creates <code className="font-mono">{joinPath(location, folder)}</code></> : undefined}>
          {p => <Input {...p} {...register('folder', { onChange: () => setFolderEdited(true) })} />}
        </Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1.5 text-xs font-medium text-muted">Origin</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" value="local" {...register('originType')} /> Local folder (origins/www)</label>
            <label className="flex items-center gap-2"><input type="radio" value="s3" {...register('originType')} /> S3 bucket</label>
          </div>
          {originType === 's3' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Bucket" error={errors.bucket?.message}>{p => <Input {...p} {...register('bucket')} placeholder="my-site-bucket" />}</Field>
              <Field label="Region">{p => <Input {...p} {...register('region')} placeholder="us-east-1" />}</Field>
              <Field label="Endpoint" hint="For MinIO or LocalStack" error={errors.endpoint?.message}>{p => <Input {...p} {...register('endpoint')} placeholder="http://localhost:9000" />}</Field>
              <Field label="Bucket behavior">
                {p => <Select {...p} {...register('mode')}><option value="rest">REST (CloudFront with OAC)</option><option value="website">Website hosting</option></Select>}
              </Field>
              <Field label="AWS profile" hint="From your AWS config; keys are never stored in the project">{p => <Input {...p} {...register('profile')} placeholder="default" />}</Field>
            </div>
          )}
        </fieldset>

        {failure && !conflict && (
          <div role="alert" className="rounded-md border border-danger/40 p-3">
            <p className="mb-2 text-sm font-medium text-danger">{errorMessage(failure)}</p>
            {failure instanceof ApiRequestError && <DiagnosticsList diagnostics={failure.diagnostics} />}
          </div>
        )}
      </form>
    </Dialog>
  )
}
