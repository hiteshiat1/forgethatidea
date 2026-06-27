# Contributing to Forge

## Workspace layout

This is a pnpm + Turborepo monorepo:

| Path      | Package         | Role                                              |
| --------- | --------------- | ------------------------------------------------- |
| `app/`    | `@forge/app`    | Vite + React + React Router front end (the shell) |
| `server/` | `@forge/server` | Fastify orchestrator (agent loop, API, streaming) |
| `shared/` | `@forge/shared` | Design tokens, domain types shared by both        |

## Getting started

```bash
nvm use            # Node version pinned in .nvmrc
pnpm install
cp .env.example .env
pnpm dev           # runs app + server via turbo
```

Common scripts (run from the repo root):

```bash
pnpm lint          # eslint across workspaces
pnpm typecheck     # tsc --noEmit across workspaces
pnpm build         # build all workspaces
pnpm test          # run tests
pnpm format        # prettier --write
```

## Branching model

- `main` is always deployable. CI must be green to merge.
- Branch per unit of work, named `type/short-description`:
  - `feat/…`, `fix/…`, `chore/…`, `infra/…`, `docs/…`, `spike/…`
- Reference the backlog issue in the branch where useful, e.g. `feat/13-app-shell`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(server): add anthropic client wrapper
fix(app): correct phase rail active state
chore: bump turbo to 2.3
```

Scope is the workspace or area (`app`, `server`, `shared`, `ci`).

## Pull requests

- Keep PRs focused on a single issue where possible.
- Fill out the PR template; link the issue with `Closes #NN`.
- A pre-commit hook runs `lint-staged` (eslint + prettier on staged files).
- CI runs format check, lint, typecheck, build, and tests on every PR.
