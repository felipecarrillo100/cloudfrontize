# Multi-service Developer Guide

This document provides technical onboarding for engineers contributing to the CloudFrontize core or the companion WebUI.

---

## 1. Project Topology 🗺️

- **Root**: Backend core (Node.js/TypeScript).
- **`src/`**: The "Hook Highway" engines.
- **`ui-src/`**: The "Forensic Dashboard" (React/Vite).
- **`dist/`**: Unified production bundle.

---

## 2. The Forge (Build Pipeline) 🛠️

We use a high-performance build stack to ensure sub-second iteration cycles.

### 2.1 Backend Build (`tsup`)
The backend is bundled using `tsup` (which wraps `esbuild`).
```bash
npm run build
```
This triggers the `ui:build` first, then packages the CLI into `dist/`.

### 2.2 Frontend Build (`vite`)
The UI is a modern React application powered by Vite.
```bash
cd ui-src
npm run build
```

---

## 3. High-Fidelity Methodology 🧪

When modifying the engine, always prioritize **AWS Production Parity** over "Developer Convenience."

#### 3.1 The Snapshot Rule
Do not log full request/response bodies to the console. Use the centralized `AWS_LIMITS` constants to slice forensic snapshots.

#### 3.2 State Roll-Forward Rule
Never manually "fix" or merge a hook's output. If a hook returns an invalid structure or deletes a required header, the emulator must reflect that exactly as AWS would. We use the **State Roll-Forward** pattern to hand off state between stages.

#### 3.3 Header Reconciliation
Always use `HeaderManager.telemetryFlatten()` to prepare headers for the UI and `HeaderManager.applyToResponse()` for final delivery. This ensures "Wire Case" fidelity is preserved.

---

## 4. The Pulse (Telemetry) 📡

CloudFrontize uses a Server-Sent Events (SSE) stream to push the **Execution Journey** to the dashboard.
- **Server**: `src/pipeline/WebUI.ts` (Event Stream Handler).
- **Client**: `ui-src/src/components/TrafficCenter.tsx`.

When adding a new stage to the `Orchestrator`, call `this.broadcastStage()` to ensure the stage appears in the "Execution Journey" visualization.

---

## 5. Documentation Standard 📖

We use **TypeDoc** for interactive API documentation.
- Base: **TSDoc** standard.
- Separation: Use `@namespace Backend` or `@namespace Frontend`.
- Theme: **Material modern**.

Generate current docs:
```bash
npm run docs
```
Generated files are located in `docs/html`.
