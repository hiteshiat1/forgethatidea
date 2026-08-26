# Spike: manifest → mocked app generator (#27)

Time-boxed, throwaway de-risk of the riskiest component in the build:
can a manifest reliably produce a working mocked React app, and should
generation be **templated** (strict output contract) or **open-ended**
(light instructions)?

Not part of the shipped build — informs #32 (manifest schema) and #63
(codegen contract).

## What it does

- `manifest-fixtures.ts` — 5 hand-written test manifests covering the
  archetypes named in #62: CRUD tracker, marketplace listing,
  booking/scheduler, content feed, dashboard.
- `prompts.ts` — two prompt strategies per manifest: `templatedPrompt`
  (strict single-file/useReducer/forbidden-APIs contract) and
  `openEndedPrompt` (manifest + light instruction, few constraints).
- `checks.ts` — two automated checks per generated file: `checkCompiles`
  (esbuild TSX parse/transform, no execution) and `checkContract`
  (single file, no localStorage/fetch/`<form>`, has a default export).
- `run.ts` — generates 3 attempts × 5 archetypes × 2 strategies (30
  generations total) against `claude-opus-5`, runs both checks on each,
  writes every generated file plus a `results/SUMMARY.md` pass-rate
  table and failure-mode breakdown.

## Running it

Requires `ANTHROPIC_API_KEY` in the environment (real credentials —
this calls the live API ~30 times, a few dollars of usage).

```sh
cd server
ANTHROPIC_API_KEY=sk-ant-... pnpm exec tsx scripts/spike-manifest-to-app/run.ts
```

Takes a few minutes. Results land in `results/` (gitignored — throwaway
output, regenerated each run) with `results/SUMMARY.md` as the entry
point.

## After running

Write up the go/no-go finding as `docs/spikes/YYYY-MM-DD-manifest-to-app-spike.md`,
summarizing the pass-rate table and the templated-vs-open-ended
recommendation. That doc — not this script — is the actual deliverable
of issue #27.
