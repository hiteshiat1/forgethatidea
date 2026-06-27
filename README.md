# Forge — that idea

Forge ([forgethatidea.com](https://forgethatidea.com)) turns an idea into a working, mocked app
through a guided, agent-driven session: onboarding → sources → brainstorm → planning → build → refine.

## Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Front end (`app/`):** Vite + React 19 + React Router
- **Server (`server/`):** Fastify + TypeScript (agent orchestrator)
- **Shared (`shared/`):** design tokens + domain types
- **AI:** Anthropic Messages API
- **Database:** Postgres via Drizzle (Epic 0.7)

## Layout

```
.
├── app/        @forge/app     — React front end (two-pane shell)
├── server/     @forge/server  — Fastify orchestrator + agent loop
├── shared/     @forge/shared  — tokens, phases, shared types
└── .github/    CI + PR template
```

## Quick start

```bash
nvm use            # Node pinned in .nvmrc (22.11.0)
pnpm install
cp .env.example .env
pnpm dev           # app on :5173, server on :3001
```

Open http://localhost:5173 — the landing screen reports live server health.

## Scripts (root)

| Command          | Description                            |
| ---------------- | -------------------------------------- |
| `pnpm dev`       | Run app + server in watch mode (turbo) |
| `pnpm build`     | Build every workspace                  |
| `pnpm lint`      | ESLint across workspaces               |
| `pnpm typecheck` | `tsc --noEmit` across workspaces       |
| `pnpm test`      | Run tests                              |
| `pnpm format`    | Prettier write                         |

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branching, commits, and PR conventions,
and [architecture.md](./architecture.md) for the system architecture overview.
