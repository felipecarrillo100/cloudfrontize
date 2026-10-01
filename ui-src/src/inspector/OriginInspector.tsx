import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, Plug, Plus, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { Distribution, OriginCheck } from '@contract'
import { useProject } from '@/api/queries'
import { reportEditError, useAddOrigin, useCheckOrigin, useManifestEdit } from '@/api/mutations'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { idSchema } from '@/functions/ids'
import { useUI } from '@/state/ui'
import { asDraft, type DraftManifest, type DraftOrigin } from '@/api/draft'
import { behaviorEntry, behaviorsUsingOrigin, renameOrigin } from './manifest'
import { Panel, Section } from './Panel'

const originSchema = z.object({
  id: idSchema,
  path: z.string().trim().optional(),
  bucket: z.string().trim().optional(),
  region: z.string().trim().optional(),
  endpoint: z.string().trim().optional(),
  forcePathStyle: z.boolean().optional(),
  mode: z.enum(['rest', 'website']),
  credentials: z.enum(['default', 'profile', 'environment']),
  profile: z.string().trim().optional(),
})
type OriginValues = z.infer<typeof originSchema>

function toValues(o: DraftOrigin): OriginValues {
  return {
    id: o.id, path: o.path ?? '', bucket: o.bucket ?? '', region: o.region ?? '', endpoint: o.endpoint ?? '',
    forcePathStyle: !!o.forcePathStyle, mode: o.mode === 'website' ? 'website' : 'rest',
    credentials: o.credentials?.profile ? 'profile' : o.credentials?.fromEnv ? 'environment' : 'default',
    profile: o.credentials?.profile ?? '',
  }
}

function fromValues(type: string, v: OriginValues): DraftOrigin {
  if (type === 'local') return { id: v.id, type, path: v.path, mode: v.mode }
  return {
    id: v.id, type, bucket: v.bucket, mode: v.mode,
    ...(v.region ? { region: v.region } : {}),
    ...(v.endpoint ? { endpoint: v.endpoint } : {}),
    ...(v.forcePathStyle ? { forcePathStyle: true } : {}),
    ...(v.credentials === 'profile' && v.profile ? { credentials: { profile: v.profile } } : v.credentials === 'environment' ? { credentials: { fromEnv: true } } : {}),
  }
}

function CheckResult({ result }: { result: OriginCheck }) {
  return (
    <p role="status" className={`mt-2 flex gap-1.5 text-xs ${result.ok ? 'text-ok' : 'text-danger'}`}>
      {result.ok ? <CheckCircle2 size={14} className="shrink-0" aria-hidden /> : <XCircle size={14} className="shrink-0" aria-hidden />}
      <span className="break-words">{result.message}</span>
    </p>
  )
}

function OriginForm({ origin, manifest }: { origin: DraftOrigin; manifest: DraftManifest }) {
  const edit = useManifestEdit()
  const check = useCheckOrigin()
  const { register, handleSubmit, control, formState: { errors, isDirty } } = useForm<OriginValues>({ resolver: zodResolver(originSchema), values: toValues(origin) })
  const credentials = useWatch({ control, name: 'credentials' })
  const usedBy = behaviorsUsingOrigin(manifest, origin.id)

  const onSave = handleSubmit(values => edit.mutate(m => {
    m.origins = m.origins.map(o => (o.id === origin.id ? fromValues(origin.type, values) : o))
    if (values.id !== origin.id) renameOrigin(m, origin.id, values.id)
  }, { onSuccess: () => toast.success('Origin saved'), onError: reportEditError }))

  return (
    <form onSubmit={onSave} noValidate className="flex flex-col gap-3">
      <Field label="Id" error={errors.id?.message}>{p => <Input {...p} {...register('id')} />}</Field>
      {origin.type === 'local' ? (
        <Field label="Folder" hint="Relative to the project folder">{p => <Input {...p} {...register('path')} className="font-mono" />}</Field>
      ) : (
        <>
          <Field label="Bucket">{p => <Input {...p} {...register('bucket')} />}</Field>
          <Field label="Region">{p => <Input {...p} {...register('region')} placeholder="us-east-1" />}</Field>
          <Field label="Endpoint" hint="For MinIO or LocalStack; empty for AWS">{p => <Input {...p} {...register('endpoint')} placeholder="http://localhost:9000" />}</Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('forcePathStyle')} /> Path-style URLs</label>
          <Field label="Credentials" hint="Keys are never stored in the project">
            {p => <Select {...p} {...register('credentials')}>
              <option value="default">Default (AWS credential chain)</option>
              <option value="profile">AWS profile</option>
              <option value="environment">Environment variables</option>
            </Select>}
          </Field>
          {credentials === 'profile' && <Field label="Profile">{p => <Input {...p} {...register('profile')} placeholder="default" />}</Field>}
        </>
      )}
      <Field label="Bucket behavior" hint={origin.type === 'local' ? 'How the folder answers, like an S3 bucket would' : undefined}>
        {p => <Select {...p} {...register('mode')}><option value="rest">REST (CloudFront with OAC): no index for folders</option><option value="website">Website hosting: folders serve index.html</option></Select>}
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={!isDirty || edit.isPending}>Save</Button>
        <Button size="sm" onClick={() => check.mutate(origin.id)} disabled={check.isPending}><Plug size={13} /> {check.isPending ? 'Testing…' : 'Test connection'}</Button>
        <Button size="sm" variant="danger" className="ml-auto" disabled={usedBy.length > 0 || edit.isPending}
          title={usedBy.length ? `Used by ${usedBy.join(', ')}` : undefined}
          onClick={() => edit.mutate(m => { m.origins = m.origins.filter(o => o.id !== origin.id) }, { onError: reportEditError })}>
          <Trash2 size={13} /> Delete
        </Button>
      </div>
      {check.data && <CheckResult result={check.data} />}
      {usedBy.length > 0 && <p className="text-xs text-muted">Used by {usedBy.join(', ')}.</p>}
    </form>
  )
}

function AddOrigin({ taken }: { taken: string[] }) {
  const [type, setType] = useState<'local' | 's3' | null>(null)
  const [id, setId] = useState('')
  const [bucket, setBucket] = useState('')
  const add = useAddOrigin()
  if (!type) {
    return (
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setType('local')}><Plus size={13} /> Local folder</Button>
        <Button size="sm" onClick={() => setType('s3')}><Plus size={13} /> S3 bucket</Button>
      </div>
    )
  }
  const idError = !id ? undefined : idSchema.safeParse(id).error?.issues[0]?.message ?? (taken.includes(id) ? 'Already used' : undefined)
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line p-3">
      <Field label="Id" error={idError}>{p => <Input {...p} value={id} onChange={e => setId(e.target.value)} placeholder={type === 'local' ? 'assets' : 'media'} autoFocus />}</Field>
      {type === 's3' && <Field label="Bucket">{p => <Input {...p} value={bucket} onChange={e => setBucket(e.target.value)} />}</Field>}
      {type === 'local' && <p className="text-xs text-muted">Creates <code className="font-mono">origins/{id || '<id>'}</code> with a starter page.</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={!id || !!idError || (type === 's3' && !bucket) || add.isPending}
          onClick={() => add.mutate({ id, type, ...(type === 's3' ? { bucket } : {}) }, {
            onSuccess: () => { toast.success(`Origin ${id} added`); setType(null); setId(''); setBucket('') },
            onError: reportEditError,
          })}>Add</Button>
        <Button size="sm" variant="ghost" onClick={() => setType(null)}>Cancel</Button>
      </div>
    </div>
  )
}

/** The origin of the behavior on the schematic, its settings, and the project's other origins. */
export function OriginInspector({ dist, editable }: { dist: Distribution; editable: boolean }) {
  const behaviorKey = useUI(s => s.behaviorKey)
  const project = useProject(editable)
  const edit = useManifestEdit()
  const behavior = dist.behaviors.find(b => b.key === behaviorKey) ?? dist.behaviors[dist.behaviors.length - 1]
  const manifest = project.data ? asDraft(project.data.manifest) : undefined
  const origins: DraftOrigin[] = manifest?.origins ?? dist.origins.map(({ credentials, ...o }) => ({ ...o, ...(credentials ? { credentials: {} } : {}) }))
  const origin = origins.find(o => o.id === behavior.origin)

  return (
    <Panel title="Origin" subtitle={`For ${behavior.pathPattern ?? 'the default behavior'}`}>
      <Section title="This behavior's origin">
        <Select aria-label="Origin for this behavior" value={behavior.origin} disabled={!editable || edit.isPending}
          onChange={e => {
            // Read the value now: the edit runs later, after the select re-renders
            const chosen = e.target.value
            edit.mutate(m => { const b = behaviorEntry(m, behavior.key); if (b) b.origin = chosen }, { onError: reportEditError })
          }}>
          {dist.origins.map(o => <option key={o.id} value={o.id}>{o.id} ({o.type === 's3' ? `s3://${o.bucket}` : o.path})</option>)}
        </Select>
        <p className="mt-1.5 text-xs text-muted">Chosen from the viewer's path; a function that rewrites the URI doesn't change it.</p>
      </Section>

      {origin && (
        <Section title={`${origin.id} settings`}>
          {editable && manifest
            ? <OriginForm key={`${origin.id}-${project.data?.revision}`} origin={origin} manifest={manifest} />
            : <pre className="overflow-x-auto rounded bg-surface-2 p-2 font-mono text-xs">{JSON.stringify(origin, null, 2)}</pre>}
        </Section>
      )}

      {editable && <Section title="Add an origin"><AddOrigin taken={dist.origins.map(o => o.id)} /></Section>}
    </Panel>
  )
}
