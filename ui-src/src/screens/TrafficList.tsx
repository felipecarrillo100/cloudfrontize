import { useLive } from '@/live/store'
import { cn } from '@/lib/cn'

const statusTone = (status?: number, failed?: boolean) =>
  failed || (status ?? 0) >= 500 ? 'text-danger' : (status ?? 0) >= 400 ? 'text-warn' : (status ?? 0) >= 300 ? 'text-response' : status ? 'text-ok' : 'text-muted'

/** Live requests, newest first. (The full traffic inspector replaces it in 4.4.) */
export function TrafficList() {
  const traffic = useLive(s => s.traffic)
  const rows = traffic.order.slice(0, 200).map(id => traffic.byId[id])

  return (
    <section aria-labelledby="traffic-title" className="flex min-h-0 flex-1 flex-col border-t border-line bg-surface">
      <h2 id="traffic-title" className="border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Traffic <span className="font-normal normal-case">({traffic.order.length})</span>
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && <p className="p-4 text-sm text-muted">Requests to the distribution appear here as they happen.</p>}
        <table className="w-full text-sm">
          <caption className="sr-only">Recent requests</caption>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-line/60">
                <td className={cn('w-14 px-4 py-1.5 font-mono text-xs font-semibold', statusTone(r.status, !!r.failure))}>{r.status ?? '…'}</td>
                <td className="w-16 py-1.5 font-mono text-xs text-muted">{r.method}</td>
                <td className="max-w-0 truncate py-1.5 font-mono text-xs">{r.url}</td>
                <td className="w-20 px-4 py-1.5 text-right font-mono text-xs text-muted">{r.durationMs != null ? `${r.durationMs} ms` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
