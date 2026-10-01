import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { errorMessage } from '@/api/client'
import { useServerInfo } from '@/api/queries'
import { useLiveSync } from '@/live/useLiveSync'
import { applyTheme, useUI } from '@/state/ui'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { StartScreen } from '@/screens/StartScreen'
import { Workbench } from '@/screens/Workbench'

export function App() {
  useLiveSync()
  const server = useServerInfo()
  const { view, theme } = useUI()

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const follow = () => applyTheme('system')
    media?.addEventListener('change', follow)
    return () => media?.removeEventListener('change', follow)
  }, [theme])

  let content
  if (server.isLoading) {
    content = <div className="flex h-full items-center justify-center"><Spinner label="Connecting to CloudFrontize" /></div>
  } else if (server.error) {
    content = (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-danger">{errorMessage(server.error)}</p>
        <Button onClick={() => server.refetch()}>Try again</Button>
      </div>
    )
  } else {
    // Without an explicit choice: the workbench when something is being served, else the start screen
    const resolved = view ?? (server.data?.project || server.data?.legacy ? 'workbench' : 'start')
    content = resolved === 'start' ? <StartScreen /> : <Workbench />
  }

  return (
    <>
      {content}
      <Toaster position="bottom-right" richColors closeButton theme={theme === 'system' ? 'system' : theme} />
    </>
  )
}
