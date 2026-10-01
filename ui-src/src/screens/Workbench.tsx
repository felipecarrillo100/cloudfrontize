import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useServerInfo } from '@/api/queries'
import { DiagnosticsList } from '@/components/DiagnosticsList'
import { TopBar } from '@/components/TopBar'
import { useLive } from '@/live/store'
import { useUI } from '@/state/ui'
import { NewProjectDialog } from './NewProjectDialog'
import { OpenProjectDialog } from './OpenProjectDialog'
import { ProjectOverview } from './ProjectOverview'
import { TrafficList } from './TrafficList'

/** The workbench: the open project (or 2.x setup) and its live traffic. */
export function Workbench() {
  const server = useServerInfo()
  const invalid = useLive(s => s.invalidManifest)
  const showWorkbench = useUI(s => s.showWorkbench)
  const [dialog, setDialog] = useState<'open' | 'new' | null>(null)
  const legacy = server.data?.legacy

  return (
    <div className="flex h-full flex-col">
      <TopBar onOpen={() => setDialog('open')} onNew={() => setDialog('new')} />

      {legacy && (
        <div role="note" className="border-b border-line bg-surface-2 px-4 py-2 text-sm">
          This is a 2.x command-line setup: functions run on every path and can't be edited here.
          Create a project to use cache behaviors, the editor and the AWS rule checks.
        </div>
      )}
      {invalid && (
        <div role="alert" className="border-b border-danger/40 bg-surface px-4 py-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-danger">
            <AlertTriangle size={16} aria-hidden /> cloudfrontize.json was edited but can't be loaded. The previous version keeps running.
          </p>
          <DiagnosticsList diagnostics={invalid} />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-[3] overflow-y-auto">
          <ProjectOverview hasProject={!legacy} />
        </div>
        <div className="flex min-h-0 flex-[2] flex-col">
          <TrafficList />
        </div>
      </div>

      <OpenProjectDialog open={dialog === 'open'} onOpenChange={o => setDialog(o ? 'open' : null)} onOpened={showWorkbench} />
      <NewProjectDialog open={dialog === 'new'} onOpenChange={o => setDialog(o ? 'new' : null)} onCreated={showWorkbench} />
    </div>
  )
}
