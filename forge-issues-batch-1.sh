#!/usr/bin/env bash
# ============================================================================
#  Forge (forgethatidea.com) — Backlog Batch 1 (Issues 1–50)
#  Creates labels, milestones, and the first 50 dependency-ordered issues.
#
#  PREREQUISITES
#    1. Install GitHub CLI:  https://cli.github.com
#    2. Authenticate:        gh auth login   (needs 'repo' scope)
#    3. Repo must exist:     https://github.com/nexgen-tech-labs/forgethatidea
#
#  USAGE
#    chmod +x forge-issues-batch-1.sh
#    ./forge-issues-batch-1.sh
#
#  SAFE TO INSPECT FIRST: run with DRY_RUN=1 to print actions without writing.
#    DRY_RUN=1 ./forge-issues-batch-1.sh
# ============================================================================

set -euo pipefail

REPO="nexgen-tech-labs/forgethatidea"
DRY_RUN="${DRY_RUN:-0}"

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] $*"
  else
    eval "$@"
  fi
}

echo "==> Target repo: $REPO   (DRY_RUN=$DRY_RUN)"

# ----------------------------------------------------------------------------
# 0. Sanity check
# ----------------------------------------------------------------------------
if [[ "$DRY_RUN" != "1" ]]; then
  gh repo view "$REPO" >/dev/null 2>&1 || {
    echo "ERROR: cannot access $REPO. Check the repo exists and 'gh auth status'."; exit 1;
  }
fi

# ----------------------------------------------------------------------------
# 1. Labels
# ----------------------------------------------------------------------------
echo "==> Creating labels…"
create_label() { # name color description
  run "gh label create \"$1\" --repo \"$REPO\" --color \"$2\" --description \"$3\" --force"
}

# Epic labels
create_label "epic:0-foundations"   "5A5A5A" "Project setup & conventions"
create_label "epic:1-shell"         "E8703A" "App shell & onboarding"
create_label "epic:2-agent-core"    "F3A35C" "Agent phase state machine & tool loop"
create_label "epic:3-planning"      "7FB286" "Planning tools (options, arch, cost, marketing)"
# Type labels
create_label "type:feature"         "1D76DB" "New functionality"
create_label "type:infra"           "0E8A16" "Infrastructure / setup"
create_label "type:chore"           "C2E0C6" "Tooling / housekeeping"
create_label "type:spike"           "D93F0B" "Time-boxed investigation / de-risk"
# Meta
create_label "priority:p0"          "B60205" "Critical path"
create_label "priority:p1"          "D93F0B" "Important"
create_label "priority:p2"          "FBCA04" "Nice to have"
create_label "blocked"              "000000" "Has unmet dependencies"

# ----------------------------------------------------------------------------
# 2. Milestones  (gh has no direct milestone create; use the API)
# ----------------------------------------------------------------------------
echo "==> Creating milestones…"
create_milestone() { # title description
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] create milestone: $1"
  else
    gh api "repos/$REPO/milestones" -f title="$1" -f description="$2" -f state="open" \
      >/dev/null 2>&1 || echo "   (milestone '$1' may already exist — skipping)"
  fi
}
create_milestone "Epic 0 · Foundations"        "Repo, stack, CI, auth/db/deploy skeleton"
create_milestone "Epic 1 · Shell & Onboarding" "Two-pane layout, onboarding, chat UI, phase rail"
create_milestone "Epic 2 · Agent Core"         "Phase state machine, system prompt, tool-call loop"
create_milestone "Epic 3 · Planning Tools"     "Build options, architecture, cost, marketing cards"

# ----------------------------------------------------------------------------
# 3. Issue helper
# ----------------------------------------------------------------------------
# new_issue "<title>" "<body>" "<comma,labels>" "<milestone>"
new_issue() {
  local title="$1" body="$2" labels="$3" milestone="$4"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] issue: $title   [$labels]  («$milestone»)"
  else
    gh issue create --repo "$REPO" \
      --title "$title" \
      --body "$body" \
      --label "$labels" \
      --milestone "$milestone"
    sleep 0.6   # gentle on rate limits
  fi
}

# Body template builder: summary + acceptance criteria + dependency note
b() {
  local summary="$1" ac="$2" deps="$3"
  printf '## Summary\n%s\n\n## Acceptance criteria\n%s\n\n## Dependencies\n%s\n\n---\n_Part of the Forge (forgethatidea.com) build. Auto-generated backlog batch 1._' \
    "$summary" "$ac" "$deps"
}

echo "==> Creating issues 1–50…"

# ============================================================================
# EPIC 0 · FOUNDATIONS  (Issues 1–12)
# ============================================================================
M0="Epic 0 · Foundations"

new_issue "0.1 Initialise monorepo + framework" \
"$(b "Stand up the repository structure and choose the core stack (React front end, Node/server orchestrator). Establish the workspace layout (app, server, shared packages)." \
"- [ ] Repo builds with a single install command\n- [ ] \`/app\`, \`/server\`, \`/shared\` workspaces resolve\n- [ ] README documents the layout and run commands\n- [ ] Node version pinned via \`.nvmrc\`" \
"None — root of the dependency tree.")" \
"epic:0-foundations,type:infra,priority:p0" "$M0"

new_issue "0.2 TypeScript + lint + format baseline" \
"$(b "Configure TypeScript, ESLint, and Prettier consistently across all workspaces with shared config." \
"- [ ] \`tsc --noEmit\` passes repo-wide\n- [ ] Lint + format run via single npm scripts\n- [ ] Pre-commit hook runs lint-staged" \
"Depends on #1.")" \
"epic:0-foundations,type:chore,priority:p0" "$M0"

new_issue "0.3 Environment & secrets strategy" \
"$(b "Define how secrets (Anthropic API key, DB URL, Stripe keys later) are loaded in dev and prod. No secrets in the repo." \
"- [ ] \`.env.example\` documents every required var\n- [ ] Server validates required env at boot and fails fast\n- [ ] Secrets documented for the chosen host" \
"Depends on #1.")" \
"epic:0-foundations,type:infra,priority:p0" "$M0"

new_issue "0.4 CI skeleton (lint, typecheck, build)" \
"$(b "GitHub Actions workflow running on every PR: install, lint, typecheck, build." \
"- [ ] CI runs on pull_request and push to main\n- [ ] Fails the PR on lint/type/build errors\n- [ ] Caches dependencies for speed" \
"Depends on #1, #2.")" \
"epic:0-foundations,type:infra,priority:p0" "$M0"

new_issue "0.5 Branch & PR conventions" \
"$(b "Document branching model, PR template, commit conventions, and review rules." \
"- [ ] \`CONTRIBUTING.md\` written\n- [ ] PR template in \`.github/\`\n- [ ] Conventional-commit guidance documented" \
"Depends on #1.")" \
"epic:0-foundations,type:chore,priority:p1" "$M0"

new_issue "0.6 Deploy skeleton (frontend + server)" \
"$(b "Wire a no-op deploy of both the front end and the orchestrator to the chosen host so the pipeline is proven before features land." \
"- [ ] Front end deploys on merge to main\n- [ ] Server deploys with health check passing\n- [ ] Production URL reachable" \
"Depends on #1, #3, #4.")" \
"epic:0-foundations,type:infra,priority:p0" "$M0"

new_issue "0.7 Database provisioning + schema baseline" \
"$(b "Provision Postgres and create the baseline schema: sessions, users, manifests, artifacts. Migrations tooling set up." \
"- [ ] Migration tool runs up/down cleanly\n- [ ] Baseline tables created\n- [ ] Connection pooling configured" \
"Depends on #3, #6.")" \
"epic:0-foundations,type:infra,priority:p0" "$M0"

new_issue "0.8 Auth scaffolding (sessions/users)" \
"$(b "Minimal real auth for the product itself (not the mocked apps it generates): sign-up, sign-in, session handling." \
"- [ ] User can sign up and sign in\n- [ ] Sessions persist and expire correctly\n- [ ] Protected routes reject anonymous access" \
"Depends on #7.")" \
"epic:0-foundations,type:infra,priority:p0" "$M0"

new_issue "0.9 Anthropic API client wrapper" \
"$(b "Server-side wrapper around the Anthropic Messages API with streaming, tool-call handling, retries, and error mapping." \
"- [ ] Streams responses to the client\n- [ ] Surfaces tool_use blocks to the dispatcher\n- [ ] Retries transient failures with backoff\n- [ ] Token/usage logged per request" \
"Depends on #3.")" \
"epic:0-foundations,type:infra,priority:p0" "$M0"

new_issue "0.10 Observability + structured logging" \
"$(b "Add structured logging, request tracing, and a basic error reporter across the server." \
"- [ ] Correlated request IDs end to end\n- [ ] Errors captured with context\n- [ ] Log level configurable via env" \
"Depends on #1, #3.")" \
"epic:0-foundations,type:infra,priority:p1" "$M0"

new_issue "0.11 Cost guardrails for AI usage" \
"$(b "Per-session and per-user token/cost ceilings to prevent runaway spend. Soft-warn then hard-stop." \
"- [ ] Per-session token cap enforced\n- [ ] Per-user daily cap enforced\n- [ ] Clear error returned when capped" \
"Depends on #9.")" \
"epic:0-foundations,type:infra,priority:p0" "$M0"

new_issue "0.12 Design tokens & component primitives" \
"$(b "Encode the Forge visual system (ink palette, amber-coral signal, mono/sans type) as shared tokens and base components (Button, Pill, Card)." \
"- [ ] Tokens exported from shared package\n- [ ] Button/Pill/Card primitives reused by app\n- [ ] Dark base theme matches prototype" \
"Depends on #1, #2.")" \
"epic:0-foundations,type:feature,priority:p1" "$M0"

# ============================================================================
# EPIC 1 · SHELL & ONBOARDING  (Issues 13–26)
# ============================================================================
M1="Epic 1 · Shell & Onboarding"

new_issue "1.1 Two-pane app shell layout" \
"$(b "The core chat-left / canvas-right responsive layout with the top bar." \
"- [ ] Left chat pane and right canvas pane render\n- [ ] Resizes gracefully down to laptop widths\n- [ ] Top bar hosts logo + phase rail slot" \
"Depends on #12.")" \
"epic:1-shell,type:feature,priority:p0" "$M1"

new_issue "1.2 Brand lockup (Forge / that idea)" \
"$(b "Implement the logo lockup: 'Forge' wordmark with 'that idea' kicker, in hero and top-bar sizes." \
"- [ ] Hero lockup on onboarding\n- [ ] Compact lockup in top bar\n- [ ] Uses signal colour for kicker" \
"Depends on #12.")" \
"epic:1-shell,type:feature,priority:p2" "$M1"

new_issue "1.3 Phase rail component" \
"$(b "Horizontal phase progression indicator showing all phases with active/done/upcoming states." \
"- [ ] Reflects current phase from state\n- [ ] Done phases visually distinct\n- [ ] Scrolls horizontally on narrow screens" \
"Depends on #1.1 (#13).")" \
"epic:1-shell,type:feature,priority:p1" "$M1"

new_issue "1.4 Onboarding — schema & questions" \
"$(b "Define the onboarding question set (idea, industry, budget, technical level, goal) and its data model." \
"- [ ] Five questions captured to a typed object\n- [ ] Validation: all required before continue\n- [ ] Persisted to session on submit" \
"Depends on #8, #0.7 (#7).")" \
"epic:1-shell,type:feature,priority:p0" "$M1"

new_issue "1.5 Onboarding — Typeform-style UI" \
"$(b "Build the one-question-at-a-time onboarding experience with text + choice inputs." \
"- [ ] Text and single-choice question types\n- [ ] Progress affordance\n- [ ] 'Start the interview' gates on completeness" \
"Depends on #1.4 (#16).")" \
"epic:1-shell,type:feature,priority:p0" "$M1"

new_issue "1.6 Chat pane — message stream" \
"$(b "Render the agent/user message stream with roles, autoscroll, and streaming token display." \
"- [ ] Agent vs user bubbles styled distinctly\n- [ ] Autoscrolls on new message\n- [ ] Renders streamed tokens smoothly" \
"Depends on #1.1 (#13), #0.9 (#9).")" \
"epic:1-shell,type:feature,priority:p0" "$M1"

new_issue "1.7 Chat input — context-aware" \
"$(b "Input box whose affordances change by phase (typing vs use-the-cards vs refine)." \
"- [ ] Enter sends; disabled states correct\n- [ ] Placeholder adapts to phase\n- [ ] Non-typing phases show guidance" \
"Depends on #1.6 (#18).")" \
"epic:1-shell,type:feature,priority:p1" "$M1"

new_issue "1.8 Canvas pane — card host & states" \
"$(b "The right-pane container that hosts deliverable cards with draft/refined/locked/live states." \
"- [ ] Cards stack and scroll independently\n- [ ] Status badge reflects card state\n- [ ] Empty state shown before first card" \
"Depends on #1.1 (#13).")" \
"epic:1-shell,type:feature,priority:p0" "$M1"

new_issue "1.9 Card component framework" \
"$(b "Reusable card shell (title, index, status, accent) all deliverable cards extend." \
"- [ ] Consistent header/status API\n- [ ] Accent colour per card type\n- [ ] Accessible heading structure" \
"Depends on #0.12 (#12), #1.8 (#20).")" \
"epic:1-shell,type:feature,priority:p1" "$M1"

new_issue "1.10 Session persistence & resume" \
"$(b "Persist the whole session (phase, chat, cards, manifest) so a user can leave and resume." \
"- [ ] Refresh restores phase + chat + cards\n- [ ] Session tied to authenticated user\n- [ ] Resume lands on correct phase" \
"Depends on #0.7 (#7), #0.8 (#8).")" \
"epic:1-shell,type:feature,priority:p1" "$M1"

new_issue "1.11 Top bar status indicators" \
"$(b "Refinement meters and tier/entitlement pills surfaced in the top bar." \
"- [ ] App/marketing refinement counters render\n- [ ] Reflect entitlement (free vs unlimited)\n- [ ] Update live as rounds are used" \
"Depends on #1.3 (#15).")" \
"epic:1-shell,type:feature,priority:p2" "$M1"

new_issue "1.12 Responsive & mobile pass" \
"$(b "Ensure the two-pane experience degrades sensibly on small screens (tabbed panes)." \
"- [ ] Panes become tabs under a breakpoint\n- [ ] Onboarding usable on mobile\n- [ ] No horizontal overflow" \
"Depends on #1.1 (#13), #1.8 (#20).")" \
"epic:1-shell,type:feature,priority:p2" "$M1"

new_issue "1.13 Loading & streaming affordances" \
"$(b "Thinking/working indicators while the agent researches or generates." \
"- [ ] Typing/working indicator in chat\n- [ ] Skeletons for cards being generated\n- [ ] Cancel affordance where sensible" \
"Depends on #1.6 (#18).")" \
"epic:1-shell,type:feature,priority:p2" "$M1"

new_issue "1.14 Error & empty states (shell)" \
"$(b "Graceful handling of API failure, session loss, and empty canvas across the shell." \
"- [ ] API failure shows retry, not a crash\n- [ ] Lost session prompts re-auth\n- [ ] Friendly empty canvas copy" \
"Depends on #1.8 (#20), #0.10 (#10).")" \
"epic:1-shell,type:feature,priority:p1" "$M1"

# ============================================================================
# EPIC 2 · AGENT CORE  (Issues 27–42)
# ============================================================================
M2="Epic 2 · Agent Core"

new_issue "2.0 SPIKE: manifest → mocked app generator" \
"$(b "Time-boxed de-risk of the riskiest component: can a locked manifest reliably produce a working mocked React app? Test templated approach first." \
"- [ ] Throwaway: manifest JSON in, runnable app out\n- [ ] Tested across 3+ different idea shapes\n- [ ] Reliability + failure modes documented\n- [ ] Go/no-go note on templated vs open-ended" \
"Depends on #0.9 (#9). MUST complete before #4.x build pipeline.")" \
"epic:2-agent-core,type:spike,priority:p0" "$M2"

new_issue "2.1 Phase state machine" \
"$(b "Server-authoritative state machine driving all 14 phases with explicit gates and transitions." \
"- [ ] Phases + transitions defined declaratively\n- [ ] Illegal transitions rejected\n- [ ] State serialised to session" \
"Depends on #1.10 (#22).")" \
"epic:2-agent-core,type:feature,priority:p0" "$M2"

new_issue "2.2 Phase gate enforcement" \
"$(b "Encode gates (e.g. all four cards locked before build) so phases cannot be skipped." \
"- [ ] Build gate requires options+arch+cost+marketing locked\n- [ ] Gate status queryable by UI\n- [ ] Attempts to skip are blocked server-side" \
"Depends on #2.1 (#28).")" \
"epic:2-agent-core,type:feature,priority:p0" "$M2"

new_issue "2.3 System prompt — agent persona & rules" \
"$(b "Author the Forge agent system prompt: persona, phase awareness, honesty rules (no invented costs), stopping rules for brainstorm." \
"- [ ] Persona + tone codified\n- [ ] Brainstorm stopping rule defined\n- [ ] Cost/marketing honesty constraints included\n- [ ] Versioned for iteration" \
"Depends on #2.1 (#28).")" \
"epic:2-agent-core,type:feature,priority:p0" "$M2"

new_issue "2.4 Tool-call dispatch loop" \
"$(b "The orchestrator loop that interprets tool_use blocks, executes the matching tool, and returns results to the model." \
"- [ ] Maps tool name → handler\n- [ ] Streams tool results back into the conversation\n- [ ] Unknown/invalid tool calls handled safely" \
"Depends on #0.9 (#9), #2.1 (#28).")" \
"epic:2-agent-core,type:feature,priority:p0" "$M2"

new_issue "2.5 Build manifest — schema" \
"$(b "Define the manifest: entities, screens, roles, key actions, branding, plus references to research/cost/marketing. The single source of truth." \
"- [ ] Typed schema with validation\n- [ ] Versioned and migratable\n- [ ] Covers everything downstream tools need" \
"Depends on #2.1 (#28). Informed by #2.0 spike (#27).")" \
"epic:2-agent-core,type:feature,priority:p0" "$M2"

new_issue "2.6 Manifest read/write tools" \
"$(b "Tools the agent uses to read and update the manifest as the conversation progresses." \
"- [ ] get_manifest / update_manifest tools\n- [ ] Partial updates merge safely\n- [ ] Concurrent writes last-write-wins with audit" \
"Depends on #2.5 (#31), #2.4 (#30).")" \
"epic:2-agent-core,type:feature,priority:p0" "$M2"

new_issue "2.7 Brainstorm phase logic" \
"$(b "Phase 1 behaviour: ask sharp questions one at a time until ICP + core job + one differentiator are known." \
"- [ ] One question per turn\n- [ ] Stops when stopping-rule satisfied\n- [ ] Writes findings to manifest" \
"Depends on #2.3 (#29), #2.6 (#32).")" \
"epic:2-agent-core,type:feature,priority:p1" "$M2"

new_issue "2.8 Sources/RAG intake phase" \
"$(b "Phase 2: collect competitor names, apps, and reference links from the user for research." \
"- [ ] Accepts links and free text\n- [ ] Handles 'none' gracefully\n- [ ] Stores sources on manifest" \
"Depends on #2.7 (#33).")" \
"epic:2-agent-core,type:feature,priority:p1" "$M2"

new_issue "2.9 Web search / research tool" \
"$(b "Server tool giving the agent live web search for competitor and market research." \
"- [ ] Returns ranked snippets + URLs\n- [ ] Results attached to manifest research\n- [ ] Rate-limited and cached" \
"Depends on #2.4 (#30).")" \
"epic:2-agent-core,type:infra,priority:p0" "$M2"

new_issue "2.10 Conversation compaction / long-context handling" \
"$(b "Summarise/compact long sessions to stay within context and cost limits without losing manifest fidelity." \
"- [ ] Compacts old turns into a summary\n- [ ] Manifest remains authoritative\n- [ ] No regression in later phases" \
"Depends on #2.6 (#32), #0.11 (#11).")" \
"epic:2-agent-core,type:feature,priority:p1" "$M2"

new_issue "2.11 Refinement round tracking (server)" \
"$(b "Track app vs marketing refinement rounds independently per session, enforce free limits." \
"- [ ] Counts a 'round' = change request → re-emit\n- [ ] App and marketing tracked separately\n- [ ] Limit reached triggers gate signal" \
"Depends on #2.1 (#28).")" \
"epic:2-agent-core,type:feature,priority:p0" "$M2"

new_issue "2.12 Phase transition events to UI" \
"$(b "Stream phase changes and card-emit events to the client so chat and canvas stay in sync." \
"- [ ] UI updates phase rail on transition\n- [ ] Card-emit events render cards\n- [ ] Ordering guaranteed" \
"Depends on #2.1 (#28), #1.8 (#20).")" \
"epic:2-agent-core,type:feature,priority:p0" "$M2"

new_issue "2.13 Agent error recovery & guardrails" \
"$(b "Handle model errors, malformed tool calls, and off-track conversations; keep the user unblocked." \
"- [ ] Malformed tool call → safe retry/repair\n- [ ] Graceful 'let's get back on track' fallback\n- [ ] No dead-end states" \
"Depends on #2.4 (#30), #2.2 (#29-gate? #29).")" \
"epic:2-agent-core,type:feature,priority:p1" "$M2"

new_issue "2.14 Manifest → human-readable summary tool" \
"$(b "Tool that renders the current manifest as a plain-language recap for the user at any point." \
"- [ ] Summarises idea, plan, costs, marketing\n- [ ] Non-technical language\n- [ ] Reflects latest manifest state" \
"Depends on #2.6 (#32).")" \
"epic:2-agent-core,type:feature,priority:p2" "$M2"

new_issue "2.15 Session analytics events" \
"$(b "Emit funnel analytics (phase reached, drop-off, refinements used, conversions) for product learning." \
"- [ ] Event per phase entered\n- [ ] Drop-off measurable\n- [ ] No PII in events" \
"Depends on #2.1 (#28), #0.10 (#10).")" \
"epic:2-agent-core,type:feature,priority:p2" "$M2"

new_issue "2.16 End-to-end agent integration test" \
"$(b "Automated test driving a full happy-path session from onboarding to a built mocked app." \
"- [ ] Scripted run reaches 'app built'\n- [ ] Manifest assertions at each gate\n- [ ] Runs in CI nightly" \
"Depends on #2.7..#2.12 (#33–#39).")" \
"epic:2-agent-core,type:feature,priority:p1" "$M2"

# ============================================================================
# EPIC 3 · PLANNING TOOLS  (Issues 43–50)  — first 8 of the epic
# ============================================================================
M3="Epic 3 · Planning Tools"

new_issue "3.1 render_build_options tool + card" \
"$(b "Tool emitting 3 structured build options; card renders them side-by-side with select/refine." \
"- [ ] Tool returns exactly 3 typed options\n- [ ] Card renders compare view\n- [ ] Selection locks + writes to manifest" \
"Depends on #2.4 (#30), #1.9 (#21), #2.6 (#32).")" \
"epic:3-planning,type:feature,priority:p0" "$M3"

new_issue "3.2 render_architecture tool + card" \
"$(b "Tool producing a plain-language architecture (boxes/arrows); card renders it for non-technical users." \
"- [ ] Non-technical labels enforced\n- [ ] Card renders diagram + plain summary\n- [ ] Lockable state" \
"Depends on #3.1 (#43).")" \
"epic:3-planning,type:feature,priority:p1" "$M3"

new_issue "3.3 Live pricing fetch service" \
"$(b "Service that pulls real pricing tiers (hosting, DB, AI, domains, email) for defensible cost estimates." \
"- [ ] Fetches/caches current tier pricing\n- [ ] Each line item carries a source\n- [ ] Stale-data fallback labelled clearly" \
"Depends on #2.9 (#35).")" \
"epic:3-planning,type:infra,priority:p0" "$M3"

new_issue "3.4 render_cost_table tool + card" \
"$(b "Tool emitting line-item monthly/yearly costs with assumptions; card supports user-scale toggle. Tool MUST require a source per line." \
"- [ ] Requires source per line item (no invented prices)\n- [ ] Monthly + yearly totals\n- [ ] Scale toggle (e.g. 100 vs 1k users)\n- [ ] Lockable state" \
"Depends on #3.3 (#45), #1.9 (#21).")" \
"epic:3-planning,type:feature,priority:p0" "$M3"

new_issue "3.5 render_marketing_plans tool + card" \
"$(b "Tool emitting 3 marketing plans (ICP, GTM, SEO, ads, vs competitors); card renders compare/select." \
"- [ ] 3 plans referencing real competitors\n- [ ] Covers ICP/GTM/SEO/ads each\n- [ ] Selection locks + writes to manifest" \
"Depends on #2.9 (#35), #1.9 (#21), #2.6 (#32).")" \
"epic:3-planning,type:feature,priority:p0" "$M3"

new_issue "3.6 Plan refinement loop (phase 6)" \
"$(b "Allow the user to refine options/arch/cost/marketing via chat before locking; agent updates the cards in place." \
"- [ ] Chat requests update the right card\n- [ ] Cards move draft→refined→locked\n- [ ] Manifest stays consistent" \
"Depends on #3.1,#3.2,#3.4,#3.5 (#43,#44,#46,#47).")" \
"epic:3-planning,type:feature,priority:p1" "$M3"

new_issue "3.7 Confirm-build gate UI + logic" \
"$(b "The gate that unlocks 'Confirm build' only when all four planning cards are locked." \
"- [ ] Button disabled until 4 locks present\n- [ ] Shows per-item lock status\n- [ ] Confirm freezes the manifest for build" \
"Depends on #2.2 (#29), #3.6 (#48).")" \
"epic:3-planning,type:feature,priority:p0" "$M3"

echo ""
echo "==> Done. Created labels, 4 milestones, and 50 issues (Epics 0–2 complete, Epic 3 issues 1–7)."
echo "    Next batch (51+) starts at 3.8 (locked-manifest freeze) and moves into Epic 4 (Build & generator)."
[[ "$DRY_RUN" == "1" ]] && echo "    (DRY RUN — nothing was written. Re-run without DRY_RUN=1 to create.)"
