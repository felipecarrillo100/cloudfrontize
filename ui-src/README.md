# CloudFrontize WebUI

The workbench served by `cloudfrontize --webui`. It talks only to the WebUI API v2 (`/api/v2`), whose
types live in [`../src/api/contract.ts`](../src/api/contract.ts) and are imported here as `@contract`,
so the UI and the server always agree on every shape.

**Stack:** React 19, Vite, Tailwind 4 (design tokens in `src/index.css`), Radix primitives, TanStack Query
(server data), zustand (live and UI state), react-hook-form + zod (forms), Monaco (bundled locally, lazy-loaded),
vitest + Testing Library + msw (tests; Monaco is replaced by a textarea in tests, since it can't run in jsdom).

| Folder | What's there |
|---|---|
| `src/api/` | `client.ts` (typed calls, `ApiRequestError`), `queries.ts` (query keys and hooks) |
| `src/live/` | The event stream: `useLiveSync.ts` (EventSource, resumes with `Last-Event-ID`), `store.ts`, `traffic.ts` (pure journey model) |
| `src/screens/` | Start screen, New / Open project dialogs, workbench |
| `src/components/` | Shared components; `ui/` has the primitives (Button, Dialog, Field, Badge) |
| `src/schematic/` | The distribution schematic, slot rules (`rules.ts`), function menus |
| `src/inspector/` | Viewer, Distribution, Origin and Function inspectors |
| `src/editor/` | The Monaco editor: tabs and buffers (`store.ts`), file sources, problems, CloudFront typings |
| `src/state/` | UI state (view, theme, selection, dialogs) |

## Develop

```bash
npm install
# In another terminal, run CloudFrontize with its WebUI on port 3001 (any project)
npx cloudfrontize ../tutorial/v3/01-foundations/1.1-security-guard --webui 3001
npm run dev                # Vite with hot reload; /api is proxied to CFZ_WEBUI (default http://127.0.0.1:3001)
```

## Check

```bash
npm run lint
npm run typecheck
npm test                   # vitest (jsdom + msw)
npm run build              # writes ../ui, which the package ships as dist/ui
```
