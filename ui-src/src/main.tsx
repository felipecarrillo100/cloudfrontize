import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { applyTheme, useUI } from './state/ui'
import './index.css'

applyTheme(useUI.getState().theme)

const queryClient = new QueryClient({
  defaultOptions: {
    // The event stream says when data changes; no polling or refetch-on-focus churn
    queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 5_000 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
