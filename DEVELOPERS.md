# CloudFrontize Developer Guide

Welcome to the CloudFrontize development team! This guide explains how to build, debug, and contribute to our high-fidelity edge simulator.

---

## 🏗️ Modular Architecture & Core Services

CloudFrontize utilizes a service-oriented architecture to maintain state across complex request lifecycles.

### 1. The Service Layer (`src/core/`)
- **`HeaderManager.ts`**: The central authority for header normalization, forbidden rule enforcement, and multi-value preservation.
- **`HotRunner.ts`**: Abstract class providing binary-safe hot-reloading and V8 JIT pre-heating logic.
- **`EdgeRunner.ts`**: High-fidelity Node.js `vm` sandbox for Lambda@Edge simulator.
- **`CFFRunner.ts`**: Lightweight **CloudFront Function** runtime with ES5.1 strictness.
- **`CodeProcessor.ts`**: Core engine for baking environment variables and enforcing ES5.1 syntax constraints.

### 2. The Orchestration Layer (`src/pipeline/`)
- **`Orchestrator.ts`**: The "Command Center". Manages the sequential hook highway and maintains the unified Sticky Header state.
- **`Telemetry.ts`**: Real-time metrics aggregator for execution timing and bandwidth tracking.
- **`OriginSelector.ts`**: Logic for matching request paths against Cache Behaviors to select the correct origin provider.

---

## ⚡ Fidelity Patterns: Working with Headers

When contributing to the pipeline or runners, you must adhere to our **Dual-Format Standard**:

1.  **Internal Fidelity Format (HeaderMap)**: Used within runners and the `HeaderManager`.
    -   *Format*: `Record<string, { key: string, value: string }[]>`
    -   *Why*: Our agile parser preserves wire-original casing and supports multiple values per key (e.g., `Set-Cookie`).
2.  **Neutral Format (Flat Map)**: Used for telemetry and final HTTP response delivery.
    -   *Format*: `Record<string, string | string[]>`
    -   *Why*: Simplified access for tests, UI displays, and Node.js `res.setHeader`.

> [!IMPORTANT]
> **The Hybrid Return**: All `EdgeRunner` hook results MUST return an object that contains a nested `headers` (HeaderMap) for hook chaining, but also spreads the **flattened** headers into the root of the object to satisfy legacy test assertions.

---

## 🚀 Getting Started

### 1. Installation
Clone the repository and install dependencies matching our Node.js v20 target:
```bash
npm install
```

### 2. Live Development Backend
Start the emulator in watch mode using the `tsx` loader:
```bash
npm run dev
```

### 3. WebUI Pro Development
The dashboard is a professional React application:
- **Source**: `ui-src/`
- **Stack**: Vite, React, TailwindCSS, Lucide Icons.
- **Build**: `npm run ui:build` (Outputs to root `ui/` directory).
- **Live Dev**: `npm run ui:dev`
- **Error Diagnostics**: The WebUI connects to the backend via SSE to display **Syntax Alert Banners** and **Hot-Reload Trace Snippets** in real-time.

---

## 🧪 Testing Standards

We maintain a rigorous **140-test baseline** for all architectural changes.

- **Standard**: All tests must use the global `.tmp/` directory for artifact creation (mock servers, registries).
- **Execution**: Run the entire suite with `npm test`.
- **E2E Header Testing**: When testing headers, verify against the `case_fidelity` baseline. Ensure actions assert against both the flattened root properties and the nested high-fidelity `headers` map to guarantee bit-perfect compliance.

---

## 📦 Distribution & Builds

We use `tsup` to bundle the project into a dependency-free CLI binary:
```bash
npm run build
```
The output lands in `dist/`, optimized for distribution via NPM.
