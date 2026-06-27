# Architecture Overview

This document equips agents and contributors with a rapid understanding of the
**Forge** (forgethatidea.com) codebase. Forge turns an idea into a working, mocked
app through a guided, agent-driven session. Keep this document updated as the
codebase evolves.

## 1. Project Structure

A pnpm + Turborepo monorepo with three workspaces. The split mirrors the product's
boundary: a React shell, a Node orchestrator that runs the agent loop, and a shared
package for tokens and cross-cutting types.

```
forgethatidea/
├── app/                  # @forge/app — React front end (the two-pane shell)
│   ├── src/
│   │   ├── App.tsx        # Root view (foundation landing; shell lands in Epic 1)
│   │   ├── main.tsx       # React Router entry, mounts the app
│   │   └── styles/        # global.css (consumes shared token CSS vars)
│   ├── index.html
│   └── vite.config.ts     # Dev server :5173, proxies /api + /health to :3001
├── server/               # @forge/server — Fastify orchestrator + agent loop
│   ├── src/
│   │   ├── index.ts       # Boot: load env, build app, listen, graceful shutdown
│   │   ├── app.ts         # buildApp() — Fastify instance, CORS, /health
│   │   ├── env.ts         # Zod env contract, fail-fast validation (Epic 0.3)
│   │   └── app.test.ts    # Vitest health-check test
│   └── tsconfig.json
├── shared/               # @forge/shared — tokens + domain types (no runtime deps)
│   └── src/
│       ├── index.ts       # Barrel: tokens + phases
│       ├── phases.ts      # Ordered session phases (state machine source of truth)
│       ├── tokens/        # Design tokens as TS (index.ts) + CSS vars (tokens.css)
│       └── ui/            # Primitives: Button, Pill, Card (Epic 0.12)
├── .github/workflows/ci.yml  # CI: format, lint, typecheck, build, test
├── tsconfig.base.json    # Shared strict TS config, extended by each workspace
├── eslint.config.js      # Flat ESLint config (app=browser/React, server=node)
├── turbo.json            # Task graph (build/dev/lint/typecheck/test)
├── pnpm-workspace.yaml
├── .env.example          # Documented env contract (no secrets committed)
├── README.md             # Overview + quick start
├── CONTRIBUTING.md       # Branching, commits, PR conventions
└── architecture.md       # This document
```

## 2. High-Level System Diagram

```
                                  ┌─────────────────────────┐
[User] <──> [Forge Web App] <──> │  Fastify Orchestrator    │ <──> [Anthropic Messages API]
            (Vite + React,       │  (@forge/server)         │
             React Router)       │  - agent dispatch loop   │ <──> [Postgres]
                                 │  - phase state machine   │       (sessions, users,
                                 │  - manifest read/write   │        manifests, artifacts)
                                 │  - tool-call handling    │ <──> [Live pricing / web search]
                                 └─────────────────────────┘
```

- The **web app** streams chat and renders agent-produced "cards" on a canvas.
- The **orchestrator** owns the agent loop: it calls Anthropic, dispatches
  `tool_use` blocks to server-side tools, advances the phase state machine, and
  reads/writes the build manifest.
- The **shared** package is consumed at source by both sides (tokens, phases,
  primitives), keeping the visual system and domain model single-sourced.

Session flow advances through ordered phases (see `shared/src/phases.ts`):
`onboarding → sources → brainstorm → planning → build → refine`.

## 3. Core Components

### 3.1. Frontend — `@forge/app`

- **Description:** The two-pane shell (chat + canvas) users interact with to
  forge an idea. Hosts onboarding, the phase rail, the message stream, and the
  card host that renders agent tool output. (Shell built across Epic 1.)
- **Technologies:** React 19, React Router, Vite 6, TypeScript. Styling via shared
  design tokens (CSS custom properties + inline styles in primitives).
- **Deployment:** Static build (`vite build` → `app/dist`). Target host TBD (Epic 0.6).

### 3.2. Backend Services

#### 3.2.1. Forge Orchestrator — `@forge/server`

- **Description:** The single backend service. Wraps the Anthropic Messages API
  (streaming, tool-call dispatch, retries — Epic 0.9), enforces the phase state
  machine and gates (Epic 2), reads/writes the build manifest, applies cost
  guardrails (Epic 0.11), and exposes the API the web app consumes. Currently
  exposes `/health`; feature routes land in later epics.
- **Technologies:** Fastify 5, TypeScript, Zod (env + payload validation),
  Pino logging. `tsx` for dev watch, Vitest for tests.
- **Deployment:** Node service (`tsc` → `server/dist`, `node dist/index.js`).
  Health check at `/health`. Target host TBD (Epic 0.6).

### 3.3. Shared — `@forge/shared`

- **Description:** Zero-runtime-dependency package of design tokens, the ordered
  phase model, and UI primitives (Button, Pill, Card). Imported by both app and
  server (server uses types/phases; app uses tokens + primitives).
- **Technologies:** TypeScript. React 19 as a peer dependency (for `ui/`).

## 4. Data Stores

### 4.1. Primary Database

- **Name:** Forge Postgres (Epic 0.7 — not yet provisioned).
- **Type:** PostgreSQL, accessed via Drizzle ORM (`drizzle-kit` migrations).
- **Purpose:** Persist product state — auth and session continuity, the build
  manifest per session, and generated artifacts.
- **Key Schemas/Tables (baseline):** `users`, `sessions`, `manifests`, `artifacts`.

> Note: this is the database for **Forge itself**, not for the mocked apps it
> generates.

## 5. External Integrations / APIs

- **Anthropic Messages API** — the agent's model backend. Streaming responses,
  `tool_use` dispatch, retries with backoff, per-request token/usage logging.
  Integration: server-side SDK/HTTP wrapper (Epic 0.9). Key: `ANTHROPIC_API_KEY`.
- **Live pricing / web search** (Epic 2.9, 3.3) — research and cost-table inputs
  surfaced during the planning phase. Integration: REST.
- **Stripe** (later) — billing/monetization. Integration: SDK.

## 6. Deployment & Infrastructure

- **Cloud Provider:** TBD (Epic 0.6 deploy skeleton). App is a static bundle;
  server is a long-running Node service with a health check.
- **CI/CD Pipeline:** GitHub Actions (`.github/workflows/ci.yml`) — runs on every
  PR and push to `main`: install (pnpm, cached) → format check → lint → typecheck
  → build → test. Deploy on merge to `main` lands in Epic 0.6.
- **Monitoring & Logging:** Structured logging via Pino with correlated request
  IDs (Epic 0.10). Error reporting TBD.

## 7. Security Considerations

- **Authentication:** Session-based auth for the product itself (Epic 0.8) —
  sign-up, sign-in, session persistence/expiry; protected routes reject anonymous
  access.
- **Authorization:** Per-user/per-session scoping of manifests and artifacts.
- **Secrets:** Loaded from environment only; never committed. The server validates
  required env at boot and fails fast (`server/src/env.ts`), with secrets
  (`ANTHROPIC_API_KEY`, `DATABASE_URL`) hard-required in production.
- **Cost safety:** Per-session and per-user token/cost ceilings with soft-warn
  then hard-stop (Epic 0.11) to prevent runaway AI spend.
- **Data Encryption:** TLS in transit (host-provided). At-rest encryption per the
  managed Postgres provider.

## 8. Development & Testing Environment

- **Local Setup:** See [CONTRIBUTING.md](./CONTRIBUTING.md). In short:
  `nvm use` → `pnpm install` → `cp .env.example .env` → `pnpm dev`.
- **Testing Frameworks:** Vitest (server today; app/E2E later).
- **Code Quality Tools:** TypeScript (strict), ESLint (flat config),
  Prettier, husky + lint-staged pre-commit. Orchestrated by Turborepo.

## 9. Future Considerations / Roadmap

Tracked as the GitHub backlog (Epics 0–3):

- **Epic 0 · Foundations** — monorepo, TS/lint, env, CI, conventions, tokens
  (done); deploy, DB, auth, Anthropic client, observability, cost guardrails
  (pending external resources).
- **Epic 1 · Shell** — two-pane layout, brand lockup, phase rail, onboarding,
  chat/canvas panes, card framework, persistence.
- **Epic 2 · Agent Core** — phase state machine + gates, system prompt, tool-call
  dispatch loop, build manifest schema + tools, research/RAG, guardrails.
- **Epic 3 · Planning** — build options, architecture, live pricing, cost table,
  marketing plans, refinement loop, confirm-build gate.

Known de-risking spike: manifest → mocked app generator (Epic 2.0) — must prove
reliable before the build pipeline lands.

## 10. Project Identification

- **Project Name:** Forge (forgethatidea.com)
- **Repository URL:** https://github.com/nexgen-tech-labs/forgethatidea
- **Primary Contact/Team:** nexgen-tech-labs
- **Date of Last Update:** 2026-06-27

## 11. Glossary / Acronyms

- **Manifest:** The structured build spec a session produces; the agent reads and
  writes it, and it drives generation of the mocked app.
- **Card:** A unit of agent output rendered on the canvas pane (e.g. build
  options, cost table, architecture diagram).
- **Phase:** One stage of the session state machine —
  `onboarding → sources → brainstorm → planning → build → refine`.
- **Phase gate:** A rule that must be satisfied before the agent may advance to
  the next phase.
- **Mocked app:** The runnable React app Forge generates from a locked manifest —
  distinct from Forge's own front end.
