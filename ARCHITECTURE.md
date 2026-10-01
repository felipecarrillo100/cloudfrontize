# CloudFrontize Architecture

This document describes the design philosophy, high-fidelity simulation models, and modular service architecture of the CloudFrontize emulator. CloudFrontize is engineered to provide bit-for-bit behavioral parity with the AWS CloudFront request life-cycle.

---

## 0. One-Pager: How It Works Internally ⚡

CloudFrontize is not a simple proxy; it is a **Propagator and Sandbox Engine**. It ensures that "It works on my machine" finally means "It works in AWS."

### 0.1 The Hook Highway (Visual Flow)
Every request travels through a strictly sequential pipeline. The **Orchestrator** manages this lifecycle:

```mermaid
graph LR
    subgraph "The Hook Highway"
    A[Viewer Request CFF] --> B[Viewer Request L@E]
    B --> C[Origin Request L@E]
    C --> D{Origin Provider}
    D --> E[Origin Response L@E]
    E --> F[Viewer Response L@E]
    F --> G[Viewer Response CFF]
    end
    D -.-> S3[(S3 / MinIO)]
    D -.-> LOC[(Local Folder)]
```

### 0.2 The Core Engines (Component Reference)

| Component | Code Path | Architectural Role |
| :--- | :--- | :--- |
| **Orchestrator** | `src/pipeline/Orchestrator.ts` | **The Brain.** Manages the Hook Highway and State Roll-Forward. |
| **HeaderManager** | `src/core/HeaderManager.ts` | **The Fidelity Layer.** Preserves casing and multi-value headers. |
| **EdgeRunner** | `src/core/EdgeRunner.ts` | **Lambda@Edge Sandbox.** Simulates the Node.js L@E runtime. |
| **CFFRunner** | `src/core/CFFRunner.ts` | **CFF Sandbox.** CloudFront Functions runtimes 1.0 (ES 5.1) and 2.0, with KeyValueStore. |
| **OriginSelector** | `src/pipeline/OriginSelector.ts` | **The Router.** Maps path patterns to specific providers. |
| **Telemetry** | `src/pipeline/Telemetry.ts` | **The Black Box.** Captures and broadcasts stage-by-stage snapshots. |

### 0.3 Developer Map: Core Logic Locations
- **Pipeline Execution**: `src/pipeline/Orchestrator.ts`
- **Sandbox Engines**: `src/core/EdgeRunner.ts` / `src/core/CFFRunner.ts`
- **Fidelity Normalization**: `src/core/HeaderManager.ts`
- **Origin Implementations**: `src/pipeline/Providers/`
- **WebUI Backend**: `src/pipeline/WebUI.ts`

---

## 1. The Core Lifecycle: The "Hook Highway" 🚀

CloudFrontize processes incoming HTTP requests through a strict, sequential pipeline mimicking the internal hook structure of AWS.

### 1.1 The Network Simulation Layer
Before the first hook runs, the Orchestrator injects **Sticky Headers** (Header Intelligence) into the request. This simulates the CloudFront Network Layer, providing hooks with realistic metadata such as Geo-location and Device type headers. Simulated headers on the CloudFront-added list (`AWS_HEADERS.CLOUDFRONT_ADDED`) are kept aside (`_splitSimulatedHeaders`): CloudFront Functions get them overlaid on their event, and they are added to the live request just before origin-request (`_addCloudFrontHeaders`), so Lambda@Edge sees them only on origin events and at the origin. Lambda@Edge viewer-response gets a viewer-facing copy of the request with the viewer's own values.

### 1.2 The Hook Chain (Execution Matrix)

| # | Stage Name | Runner | AWS Lifecycle Event | Mutation Power |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Viewer Request** | CFF | `viewer-request` | Headers, URI, Cookies |
| 2 | **Viewer Request** | L@E | `viewer-request` | Full (Headers, Body, URI) |
| 3 | **Origin Request** | L@E | `origin-request` | Full (Headers, Body, URI) |
| 4 | **Origin Provider** | Provider | (The Fetch) | N/A (Produces Response) |
| 5 | **Origin Response**| L@E | `origin-response`| Headers, Status (Blind Body) |
| 6 | **Viewer Response**| L@E | `viewer-response`| Headers, Status (Blind Body) |
| 7 | **Viewer Response**| CFF | `viewer-response`| Headers only |

### 1.3 State Roll-Forward (Fidelity First)
To ensure 100% production parity, the emulator enforces a **Strict Overwrite Rule**:
- We do not "merge" hook outputs with previous state.
- If a hook returns a response or a header modification, that object **replaces** the internal state for the next stage.
- This ensures that if a developer's hook intends to delete a header, it is actually deleted in the emulator.

### 1.4 The "Blind Response" Protocol
To ensure 100% production parity, the emulator enforces the **Blind Response Rule**:
- In `origin-response` and `viewer-response`, the `event.Records[0].cf.response.body` field is **absent** (undefined).
- Functions can **replace** the body by returning a new one, but they can never inspect what the origin sent.

---

## 2. Component Breakdown 🧩

### A. The Orchestrator (`src/pipeline/Orchestrator.ts`)
The "Brain" of the system. Coordinates execution and implements the body resolution logic (`_resolveBody` / `_serializeBody`). It ensures the output is always a valid Node.js response while maintaining the internal "Hook Highway" state.

### B. Header Management Service (`src/core/HeaderManager.ts`)
The central authority for header integrity. It uses the **Internal Fidelity Format (IFF)**:
`Record<string, { key: string; value: string }[]>`

#### **IFF Example (The "Source of Truth")**
```json
{
  "set-cookie": [
    { "key": "Set-Cookie", "value": "ID=123; Path=/" },
    { "key": "Set-Cookie", "value": "Theme=Dark" }
  ],
  "x-custom-id": [
    { "key": "X-Custom-ID", "value": "A-77" }
  ]
}
```
This format bypasses Node.js normalization (which would lowercase `x-custom-id`) and ensures multi-value preservation.

### C. The Runners (Execution Engines)
Runners execute user-provided code within isolated environments using the Node.js `vm` module:
- **`EdgeRunner.ts`:** Implements a high-fidelity Node.js `vm` sandbox for Lambda@Edge. It maps human-friendly Node responses to the complex AWS `event` structure and back. The sandbox follows Lambda (`src/core/lambda/sandbox.ts`): any module in every event, resolved from the function's folder with a fallback to the bundled AWS SDK v3; a read-only file system except `/tmp` (mapped to `os.tmpdir()/cloudfrontize/<project>/tmp`, `EROFS` elsewhere); warnings for reads outside the project and for connections to localhost or private networks; and a Lambda-like `process` with only reserved variables plus the project's `.env`, never the host environment.
- **`CFFRunner.ts`**: Executes **CloudFront Functions**. Runtime 1.0 is checked as ES 5.1; runtime 2.0 (`src/core/cff2/runtime2.ts`) is validated against AWS's feature list, runs with `microtaskMode: 'afterEvaluate'` so async handlers settle inside one guarded evaluation, gets the documented globals and a `require` limited to `crypto`/`querystring`/`buffer`, and reads key value stores (`src/core/KeyValueStore.ts`, AWS import format). Both runtimes freeze `Date` at the function's start time. Runaway loops in runtime 2.0 are stopped by an injected loop guard, because the VM timeout can't safely interrupt code that runs after an `await`.

#### Errors, Limits & Timing (`src/core/EdgeError.ts`, `src/constants.ts`)
Limits and rules follow the CloudFront Developer Guide (quotas and edge-function restrictions pages). Hook failures surface with the status CloudFront would return:
- **502 — validation error** (`LambdaValidationError` / `FunctionValidationError`), under `--strict`: adding a disallowed header, changing a per-event read-only header, a generated response over 40 KB (viewer) / 1 MB (origin), a replaced request body over its limit, a CloudFront Function over 10 KB, or combining CloudFront Functions with Lambda@Edge on viewer events (`InvalidFunctionAssociation`).
- **503 — execution error** (`LambdaExecutionError` / `FunctionExecutionError`): a thrown exception or rejected promise (CloudFront Functions: under `--strict`).
- **Timing only warns.** The AWS limits (Lambda@Edge 30 s; CloudFront Functions' 1 ms compute reference) are reference limits that warn in every mode, because local hardware isn't AWS hardware. Separate **enforced guards with leeway** stop only runaway code with a 503: `*_TIMEOUT_GUARD_MS` (60 s) for Lambda@Edge, and a 1 s VM timeout (`CFF_LIMITS.RUNAWAY_GUARD_MS`) for CloudFront Functions.

#### Pipeline Rules (AWS parity)
- Disallowed headers are never exposed to functions (request or response events).
- The request body exposed to a viewer-request function is truncated at 40 KB (1 MB for origin-request), with `inputTruncated: true`.
- **Cache behaviors** are matched first, on the viewer's original URI (in order; `*` and `?` wildcards; the default behavior last). The matched behavior decides the origin **and which functions run on each event**: project manifests attach functions per behavior; 2.x setups have one implicit behavior that runs every loaded hook. A rewrite doesn't change the behavior or origin.
- Functions are compiled once (a pool keyed by function id) and can be attached to several behaviors. A function that fails to build only blocks the behaviors that use it.
- Viewer-response functions don't run when the origin returns 400 or higher; a Lambda@Edge viewer-response function can't change the status code.

### D. Origin Providers (Data Resolution)
- **`LocalProvider`:** Efficiently serves local workspace assets while simulating S3-specific behaviors, including sending both `ETag` and `Last-Modified` (disable ETags with `--no-etag`).
- **`S3Provider`:** Simulates CloudFront connectivity to AWS S3. It bridges S3 metadata (ETags, Content-Types) back to standard HTTP headers and provides diagnostic context for connectivity failures.
- **SPA fallback (`--single`):** Handled by the Orchestrator for any provider: a GET/HEAD that the origin answers with 404 or 403 is re-fetched as `/index.html` and served with 200, before origin-response hooks run.

---

## 3. Advanced Fidelity: Body Serialization (`_resolveBody`) 💾

The Orchestrator ensures that large binary files can pass through hooks safely without corruption or OOM errors.

### 3.1 Transformation Pipeline
| Stage | Data Format | Logic |
| :--- | :--- | :--- |
| **Origin Fetch** | `Buffer` | Raw binary stream from S3 or Local Disk. |
| **Hook Handoff** | `Base64 String` | Sliced to **1MB** (AWS Limit) via `inputTruncated` flag. |
| **Hook Return** | `String / Object` | The hook can return a new body. If it returns nothing, we "Roll-Forward" the original origin Buffer. |
| **Final Resolution**| `Buffer` | The `_resolveBody` method converts the hook's return (Buffer, Base64, or Raw String) back into a bit-perfect binary for the wire. |

---

## 4. Origin & Routing Configuration (`--origins`) 🗺️

CloudFrontize uses a simple model to manage routing between different data sources. This configuration is defined in the JSON file passed via the `--origins` flag.

### 4.1 Technical Reference (JSON Schema)

The configuration file consists of two primary arrays: `origins` and `behaviors`.

#### **OriginConfig Object**
| Property | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | **Required.** Unique identifier for the origin. |
| `type` | `string` | **Required.** One of `s3`, `local`, or `custom`. |
| `bucket` | `string` | (S3 Only) Name of the bucket. |
| `region` | `string` | (S3 Only) AWS region (e.g., `us-east-1`). |
| `endpoint` | `string` | (S3/Custom) URL of the server (e.g., `http://localhost:4566`). |
| `credentials`| `object` | (S3 Only) Object with `accessKeyId` and `secretAccessKey`. |
| `directory` | `string` | (Local Only) Absolute or relative path to the folder. |
| `mode` | `string` | (S3 Only) Either `website` or `rest`. |

#### **CacheBehavior Object**
| Property | Type | Description |
| :--- | :--- | :--- |
| `pathPattern` | `string` | **Required.** CloudFront-style pattern (e.g., `*`, `/api/*`, `*.jpg`). |
| `targetOriginId`| `string` | **Required.** The `id` of the origin defined in the `origins` array. |

### 4.2 Multi-Provider "Power User" Example
This example demonstrates routing between LocalStack, MinIO, and a Local Folder simultaneously:

```json
{
  "origins": [
    { 
      "id": "LocalStack-Data", 
      "type": "s3", 
      "bucket": "dev-data",
      "endpoint": "http://localhost:4566"
    },
    { 
      "id": "MinIO-Assets", 
      "type": "s3", 
      "bucket": "media",
      "endpoint": "http://localhost:9000",
      "credentials": { "accessKeyId": "admin", "secretAccessKey": "password" }
    },
    { 
      "id": "Static-UI", 
      "type": "local", 
      "directory": "./dist" 
    }
  ],
  "behaviors": [
    { "pathPattern": "/api/*", "targetOriginId": "LocalStack-Data" },
    { "pathPattern": "/media/*", "targetOriginId": "MinIO-Assets" },
    { "pathPattern": "*", "targetOriginId": "Static-UI" }
  ]
}
```

---

## 5. System State & Concurrency 🧵

- **Request-Scoped State**: Headers, Body Snapshots, and the "Journey ID" are unique per request. The Orchestrator creates a new **State Container** for every incoming connection to ensure 100% isolation.
- **Singleton Services**: The `HistoryStore`, `HookRegistry`, and `WebUI` are singletons. They manage global state that persists across multiple requests.
- **Thread Safety**: Since Node.js is single-threaded, the Orchestrator relies on asynchronous isolation. We use the **IFF (Internal Fidelity Format)** to ensure that one request's header mutations never bleed into another.

---

## 6. Telemetry & Forensics 📊

- **Atomic Journey**: Every request creates a forensic journey record, capturing the state of headers and bodies at every stage of the pipeline via `broadcastStage()`.
- **Live Stream**: The WebUI receives live updates via Server-Sent Events (SSE).
- **WebUI Security**: The WebUI exposes hook source and baked values, so it listens on the loopback addresses only (`127.0.0.1`, and `::1` on the same port so `localhost` can't reach another program on IPv6), rejects requests whose `Host` or `Origin` isn't this machine's WebUI address, only opens loaded hook/config files in the editor, and never serves files outside its asset directory. API v2 also requires `Content-Type: application/json` on every `POST` and on any request with a body: a cross-site page can only send that after a CORS preflight, which the WebUI never answers.
- **Snapshot Logic**: Forensics use a **1 MB cap** (configurable via `AWS_LIMITS`) for body previews to ensure the dashboard remains high-performance.

### 6.1 WebUI API v2 (`src/api/`)

The 3.0 workbench talks to `/api/v2` on the WebUI port; it's the WebUI's only API (the 2.x UI's `/api/*` and `/events` endpoints were removed with it).

- **`contract.ts`**: every request, response and event type of the API, with no imports, so the WebUI (`ui-src`, alias `@contract`) compiles against exactly what the server sends. Server modules use the same types.
- **`router.ts`**: a small JSON router. Handlers return `{ status, body, headers }` or throw an `ApiError` (`errors.ts`), which becomes `{ "error": { "code", "message", "details" } }` with a matching status (400 `bad-request`, 404 `not-found`, 405 `method-not-allowed`, 409 `conflict`, 413 `too-large`, 415 `unsupported-media-type`, 422 `invalid`, 500 `internal`). Responses are `Cache-Control: no-store`.
- **`events.ts`**: the typed event model. Every event is `{ v: 2, seq, time, type, requestId?, data }`. Types: `stream.hello`, `stream.reset`, `request.started`, `request.stage`, `request.completed`, `request.failed`, `build.succeeded`, `build.failed`, `project.opened`, `project.changed`, `project.invalid`, `viewer.changed`, `distribution.changed`. A `request.stage` carries a structured `stage` (`function` / `short-circuit` with `event`, `runtime`, `functionIds`; `origin-fetch` with `origin`; `origin-response`; `final-response`), set by the Orchestrator's `broadcastStage`, so clients never parse display names.
- **`EventHub.ts`**: numbers telemetry events (`seq` increases by one for the server's lifetime), keeps the last 2,000 for replay, and serves `GET /api/v2/events` as Server-Sent Events (`id: <seq>`, `data: <json>`). A client that reconnects with `Last-Event-ID` (or `?since=<seq>`) gets exactly the events it missed, or `stream.reset` when they're gone or its id is ahead of the server (the server restarted and its numbering started over). A heartbeat comment every 15 s keeps idle streams open.
- **`v2.ts`**: the routes:
  - `GET /api/v2`: server, ports, open project, route list.
  - `GET /api/v2/events`: the event stream.
  - `GET /api/v2/requests`, `GET /api/v2/requests/:id`, `DELETE /api/v2/requests`: recorded traffic (summaries newest first, one request's journey as v2 events, clear).
  - `GET /api/v2/project`: the manifest **as written** (no defaults applied, so it can be edited and saved back), its `revision` (also the `ETag`), and diagnostics.
  - `PUT /api/v2/project/manifest`: `{ manifest, revision }` (or `If-Match`). Refused with `428 revision-required` without a revision, `409 conflict` (details: the current `revision` and `manifest`) when the file changed since, and `422 invalid-manifest` (details: `diagnostics`) when invalid, in which case nothing is written. Otherwise it's written atomically and the project reloads.
  - `POST /api/v2/project/validate`: diagnostics for a manifest, without saving. `POST /api/v2/project/reload`. `POST /api/v2/projects/open` `{ path }` (absolute).

- **`files.ts`**: functions and project files. Every manifest change goes through `editManifest` (`context.ts`): the edit is applied to the manifest as written and saved through the server, so it gets the same revision check, the same AWS rule validation (`422 invalid-manifest`) and the same reload as a manifest save. Files are written with `writeChecked`: a stale `revision` (`null`: the file must not exist yet) is a `409 conflict` with the current `revision` and `content`.
  - `GET /api/v2/functions` and `GET /api/v2/functions/:id` (with `source: { content, revision }`): type, runtime, file, attachments (`{ behavior: "default" | pathPattern, event }`), disabled, size, and build state (`ok`, `error` with line/column, `unused` when no behavior uses it, `missing`).
  - `PUT /api/v2/functions/:id/source` `{ content, revision }`: answers with the build result `{ status, checkedBy, size, sizeLimit, errors, warnings }`. For a function the emulator runs, it waits for the runner's rebuild (`checkedBy: "runtime"`); otherwise it's a static check (`src/project/functions.ts`: syntax, the CloudFront Functions runtime rules, the 10 KB limit).
  - `POST /api/v2/functions` `{ id, type, event, behavior?, runtime?, code?, replace? }`: creates `functions/<cloudfront|lambda-edge>/<event>.<id>.js` with starter code, adds it to the manifest and optionally attaches it. If the manifest is refused, the file is removed again.
  - `PATCH /api/v2/functions/:id` `{ id?, runtime?, keyValueStore? }`: a rename updates every attachment and renames a conventionally named file. `DELETE /api/v2/functions/:id` (`?deleteFile=true`) detaches the function everywhere.
  - `PUT` / `DELETE /api/v2/behaviors/:behavior/functions/:event`: attach (`{ function }`) or detach; `:behavior` is `default` or the URL-encoded path pattern.
  - `GET /api/v2/kvs`, `GET /api/v2/kvs/:id`, `PUT /api/v2/kvs/:id` (`422 invalid-kvs` for content AWS wouldn't import), `POST /api/v2/kvs` `{ id }` (creates `kvs/<id>.json`).
  - `GET` / `PUT /api/v2/viewer/headers`: the viewer simulation file, validated like the server reads it. A project without one gets `config/headers.json`.

- **`distribution.ts`**: `GET /api/v2/distribution`, the schematic's view of what runs, for projects and 2.x setups alike (`mode`): functions with build state, behaviors in match order (default last) with their four slots, origins without credentials. `POST /api/v2/controls` `{ action: "enable" | "disable" | "isolate" | "reset", function? }` switches functions for testing, without saving.
- **`workspace.ts`**: what the start screen and the Viewer node need.
  - `GET /api/v2/fs/roots`, `GET /api/v2/fs/list?path=&hidden=`: folder browsing for the Open and New project dialogs. Only folders are listed (`isProject` marks those with a `cloudfrontize.json`). Browsing is confined to your home folder, the folder CloudFrontize was started in and the open project's folder, never a whole drive; paths are resolved with `realpath`, so a symlink can't lead outside (`403 outside-roots`).
  - `GET /api/v2/projects/recent`, `DELETE /api/v2/projects/recent?dir=`: recent projects (`exists: false` for moved ones), stored in `~/.cloudfrontize/recent.json` (`$CLOUDFRONTIZE_HOME` overrides the folder). The CLI records opened projects; the library does when `createServer({ recentProjects: true })`.
  - `POST /api/v2/projects` `{ dir, name, origin?, open? }`: creates a project (`src/project/create.ts`: manifest, `origins/www` with a starter page, `.gitignore` for the env file) in an empty or new folder whose parent is inside the browse roots (`409` for a folder with content), then opens it.
  - `POST /api/v2/origins` `{ id, type, ... }`: adds an origin; a local one gets `origins/<id>` with a starter page when the folder doesn't exist (removed again if the manifest is refused). `POST /api/v2/origins/:id/check`: Test connection (a local folder exists; an S3 bucket answers `HeadBucket` with the configured credentials).
  - `POST /api/v2/functions/:id/open-in-editor`, `GET /api/v2/functions/:id/production?level=baked|minified|uglified`: open the file in the local editor; the code as deployed.
  - `POST /api/v2/invoke` `{ method?, path, headers?, body?, bodyEncoding? }`: sends a real request to the main port and answers with the response (text, or base64 for binary bodies; up to 1 MB) and its journey as v2 events. The request carries `X-Cloudfrontize-Invoke: <request id>` (`src/server/invoke.ts`); the server adopts that id for loopback clients and removes the header before anything else sees the request, so functions never get it.

### 6.2 Project lifecycle and external edits

- **Revisions** (`src/project/revision.ts`): a file's revision is a short SHA-256 of its exact bytes. Saves name the revision they edited, so an edit made meanwhile in an editor, git or another tab is never overwritten.
- **One operation at a time**: `openProject`, `reload`, `saveManifest` and reloads caused by external edits are serialized by the server, so they can't interleave.
- **`ProjectWatcher`** (`src/server/ProjectWatcher.ts`) watches the open project's manifest and viewer headers file (function, KVS and env files are watched by the runners). A manifest edit on disk reloads the project (`project.changed`, `source: "disk"`); the server's own saves are recognized by revision and not reloaded twice. If the edited manifest is invalid, the previous version keeps running and `project.invalid` reports the diagnostics. A viewer headers edit is applied in place (`viewer.changed`).

## 7. The WebUI (`ui-src/`) 🖥️

A React app built with Vite into `ui/` (shipped as `dist/ui`, served by the WebUI port). It uses only API v2. See [ui-src/README.md](ui-src/README.md) for the stack and the dev workflow.

- **Server data** goes through TanStack Query (`src/api/queries.ts`); there's no polling: `src/live/useLiveSync.ts` listens to the event stream and refetches only what an event makes stale (a build result refetches the distribution, a manifest change the project...). A fresh stream (`stream.hello` with `resumed: false`, or `stream.reset`) reloads everything.
- **Live traffic** is a pure model (`src/live/traffic.ts`: journeys built from events, newest first, capped at 5,000) in a zustand store, so traffic bursts only re-render traffic views.
- **Screens**: the start screen (recent projects, Open, New) and the workbench. In a 2.x setup the workbench says so and shows what runs, read-only.
- **The schematic** (`src/schematic/`): Viewer, Distribution and Origin with the request lane on top and the response lane below, each cache behavior as a tab, and its four event slots where CloudFront runs them. `rules.ts` holds the AWS slot rules (CloudFront Functions only on viewer events; one kind on a behavior's two viewer events), so a slot offers only valid choices and says why the others aren't; the server checks the same rules on save. Function actions (inspect, open in VS Code, production build, enable/disable, isolate, rename, remove from slot, delete) are one list rendered both as a right-click menu and as a button menu, for keyboard and touch.
- **Inspectors** (`src/inspector/`): Viewer (the viewer simulation file, with location and device presets using CloudFront's real header names), Distribution (settings; behaviors in match order: add, edit, reorder, delete), Origin (the behavior's origin, its settings, Test connection, add an origin) and Function (build state, runtime, key value store, the 10 KB meter, where it runs).
- **The editor** (`src/editor/`): Monaco, bundled with the UI (never from a CDN, so it works offline) and loaded the first time a file is opened. Only the editor core, JavaScript and JSON are included. Open files are tabs next to the schematic (`store.ts`: what's in the editor, what was saved, and the revision it's based on). `useFileSource.ts` gives every kind of file (function code, key value store, `cloudfrontize.json`) the same load/save contract:
  - **Ctrl/Cmd+S** saves with the revision being edited. The answer becomes editor markers and a problems list: build errors and warnings for functions, AWS rule diagnostics for the manifest (placed on the JSON field their pointer names, `problems.ts`), import problems for key value stores.
  - **Conflicts**: a `409` opens a diff (disk on the left, your version on the right) with *Keep my version* (saves against the disk revision) or *Use the disk version*. A change on disk is followed silently while nothing is unsaved, and announced while something is.
  - **Types**: `edgeTypes.ts` declares CloudFront's event structures for the JavaScript language service. Lambda@Edge handlers get them through `exports.handler`; CloudFront Functions through the JSDoc `@param {CloudFrontFunctionEvent} event` the starter code includes. `cloudfrontize.json` is validated against `schema/cloudfrontize.schema.json`, key value stores against the AWS import format.
  - A live 10 KB meter for CloudFront Functions; unsaved changes are kept per tab and guarded on close and on leaving the page.
- **Traffic** (`src/traffic/`): a virtualized list (TanStack Virtual) of the live journeys, with filters, search and keyboard navigation. Selecting a request shows its journey as steps (`journey.ts` labels them from the structured stages), each with its header snapshot compared to the previous step on the same side (request or response), so what each function changed stands out, and its body, decoded when textual. Copy as cURL and Resend (`POST /api/v2/invoke`). Requests from history are summaries until opened, then their journey is fetched.
- **Viewer** inspector: test requests (`POST /api/v2/invoke`; the journey opens in Traffic) and the viewer simulation: the project's viewer headers file, or for 2.x setups the session simulation (`GET`/`PUT /api/v2/viewer/simulation`, in memory like `--headers`).
- **Edits** go through `useManifestEdit` (`src/api/mutations.ts`): it applies a change to the manifest as written and saves it with the revision it was based on. A `409` (changed meanwhile) reloads instead of overwriting; a `422` shows the AWS rules that would break.
- **Design tokens** (light and dark) are CSS variables in `src/index.css`, exposed as Tailwind utilities (`bg-surface`, `text-muted`, `text-cff`...).

## 8. Templates and checks 🧩

- **Templates** (`templates/<id>/`, shipped with the package): each is a complete project (manifest, functions, origin content, `README.md`, `checks.json`) plus a `template.json` (`name`, `description`, `order`, optional `requires`). `src/project/templates.ts` lists them (the built-in **Empty** first); `createProject({ template })` copies one (without its `template.json`), names it, and validates the result, removing everything again if it's invalid. `cloudfrontize init --template <id>`, `cloudfrontize templates`, `GET /api/v2/templates` and the WebUI's New project dialog use it.
- **Checks** (`checks.json`): requests and what their responses must contain. `src/project/runChecks.ts` serves a project on a free port and runs them (`cloudfrontize check`, non-zero exit on failure, for CI). `__tests__/templates.test.ts` creates every template and runs its checks (templates with `requires`, which need Docker services, are only validated); `npm run tutorials` includes it.

