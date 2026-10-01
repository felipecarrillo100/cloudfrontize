import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ApiEvent, RequestSummary } from '@contract'
import { API_BASE, api } from '../api/client'
import { keys } from '../api/queries'
import { useLive } from './store'

/**
 * Keeps the UI in sync with the server: opens the event stream (the browser resumes it with
 * Last-Event-ID after a disconnect), feeds traffic into the live store, and refetches what an event
 * makes stale. A fresh stream (server restarted, or too far behind) reloads everything.
 */
export function useLiveSync(): void {
  const qc = useQueryClient()

  useEffect(() => {
    const live = useLive.getState()
    const loadHistory = async () => {
      try {
        const { items } = await api<{ items: RequestSummary[] }>('GET', '/requests?limit=500')
        useLive.getState().seedHistory(items)
      } catch { /* the stream still shows new traffic */ }
    }

    const es = new EventSource(`${API_BASE}/events`)
    es.onopen = () => live.setConnection('open')
    es.onerror = () => live.setConnection(es.readyState === EventSource.CLOSED ? 'reconnecting' : 'connecting')
    es.onmessage = message => {
      let event: ApiEvent
      try { event = JSON.parse(message.data) } catch { return }
      const store = useLive.getState()
      switch (event.type) {
        case 'stream.hello':
          if (!event.data.resumed) {
            store.clearTraffic()
            void qc.invalidateQueries()
            void loadHistory()
          }
          break
        case 'stream.reset':
          store.clearTraffic()
          void qc.invalidateQueries()
          void loadHistory()
          break
        case 'request.started':
        case 'request.stage':
        case 'request.completed':
        case 'request.failed':
          store.ingest(event, event.seq)
          break
        case 'build.failed':
          toast.error(`Build failed: ${event.data.file.split(/[\\/]/).pop()}`, { description: event.data.message })
          void qc.invalidateQueries({ queryKey: keys.distribution })
          break
        case 'build.succeeded':
          void qc.invalidateQueries({ queryKey: keys.distribution })
          break
        case 'project.opened':
          store.setInvalidManifest(null)
          void qc.invalidateQueries()
          break
        case 'project.changed':
          store.setInvalidManifest(null)
          if (event.data.source === 'disk') toast.info('The project changed on disk and was reloaded')
          void qc.invalidateQueries({ queryKey: keys.project })
          void qc.invalidateQueries({ queryKey: keys.distribution })
          void qc.invalidateQueries({ queryKey: keys.server })
          break
        case 'project.invalid':
          store.setInvalidManifest(event.data.diagnostics)
          break
        case 'viewer.changed':
        case 'distribution.changed':
          void qc.invalidateQueries({ queryKey: keys.distribution })
          break
      }
    }
    return () => es.close()
  }, [qc])
}
