# CloudFrontize Developer Guide

Welcome to the CloudFrontize development team! This guide explains how to build, debug, and contribute to our high-fidelity edge simulator.

---

## 🏗️ Modular Architecture & Core Services

CloudFrontize utilizes a service-oriented architecture to maintain state across complex request lifecycles.

### 1. The Service Layer (`src/core/`)
- **`HeaderManager.ts`**: The "Guardian" of header fidelity. Centralizes normalization, forbidden rule enforcement, and multi-value preservation.
- **`HotRunner.ts`**: Abstract base class providing binary-safe hot-reloading, registry management, and global cache purging.
- **`EdgeRunner.ts`**: High-fidelity Lambda@Edge VM sandbox. Uses a **"Hybrid Return"** pattern for hook mutations.
- **`CFFRunner.ts`**: Strict ES5.1 runtime with microsecond timing and memory guards.

### 2. The Orchestration Layer (`src/pipeline/`)
- **`Orchestrator.ts`**: The "Command Center". Manages the sequential hook highway and maintains the unified Sticky Header state.
- **`WebUI.ts`**: Handles the developer control plane and provides real-time state synchronization via Server-Sent Events (SSE).
- **`Telemetry.ts`**: Metrics aggregator for execution timing, bandwidth measurement, and hook tracking.

---

## ⚡ Fidelity Patterns: Working with Headers

When contributing to the pipeline or runners, you must adhere to our **Dual-Format Standard**:

1.  **Internal Fidelity Format (HeaderMap)**: Used within runners and the `HeaderManager`.
    -   *Format*: `Record<string, { key: string, value: string }[]>`
    -   *Why*: Preserves original wire-case and supports multiple values per key (e.g., `Set-Cookie`).
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

### 3. WebUI Development (Frontend)
The dashboard is a React application powered by Vite:
```bash
npm run ui:dev
```

---

## 🧪 Testing Standards

We maintain a rigorous **140-test baseline** for all architectural changes.

- **Standard**: All tests must use the global `.tmp/` directory for artifact creation (mock servers, registries).
- **Execution**: Run the entire suite with `npm test`.
- **E2E Header Testing**: When testing headers, ensure you assert against BOTH the flattened root properties AND the nested high-fidelity `headers` map to guarantee system-wide compliance.

---

## 📦 Distribution & Builds

We use `tsup` to bundle the project into a dependency-free CLI binary:
```bash
npm run build
```
The output lands in `dist/`, optimized for distribution via NPM.
