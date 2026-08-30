---
name: orchestrator
description: >
  Two-tier delegation for any repository: Claude plans + reviews (Fable 5 / Opus), non-Claude
  CLIs execute — Grok (grok-4.5) and Antigravity (gemini-3.x) for bulk agentic code,
  parallel/templated crew work, and a diversity review lens. Invoke at session start to
  activate. Triggers on: session start, orchestrator, delegation, grok, antigravity, agy,
  gemini, architect-crew, multi-agent, fable planning.
user_invocable: true
---

# Orchestrator Workflow — Claude plans, executors implement

Repo-agnostic delegation pattern. Where a project's CLAUDE.md defines its own model table,
check commands, or hard rules, those take precedence over the defaults here.

## Model tiers

Rankings, higher = better. Cost reflects what I actually pay (flat subscriptions / generous
limits), not list price. Intelligence is how hard a problem the model handles unsupervised;
taste covers UI/UX, code quality, API design, and copy.

| model               | cost | intelligence | taste |
| ------------------- | ---- | ------------ | ----- |
| grok-4.5            | 9    | 8            | —     |
| gemini-3.7-flash    | 9    | 6            | —     |
| gemini-3.1-pro-high | 8    | 8            | 6     |
| sonnet-5            | 5    | 5            | 7     |
| opus-4.8            | 4    | 7            | 8     |
| fable-5             | 2    | 9            | 9     |

- Defaults, not limits: if a cheaper model's output doesn't meet the bar, rerun with a smarter
  model without asking. Judge the output, not the price tag.
- Cost is a tie-breaker only; for anything that ships, intelligence > taste > cost.
- Anything user-facing (UI, copy, API design) needs taste ≥ 7.
- Never use Haiku.

## Roles

**Claude (you) = Orchestrator**
- Planning, repo understanding, architecture, task decomposition, and **final review of ALL executor output** before it reaches the user or a merge.
- Use **Fable 5** for planning/architecture/review subagents; the main loop runs Opus by default and steps up to Fable for the hard calls.

**Executors — non-Claude lanes, reached by shelling out (never a native Agent/Workflow model):**

- **Grok — `grok-4.5`** (via the `grok` CLI, authed through grok.com — no API credits needed)
  - Bulk agentic implementation, debugging, test-fixing, multi-file refactors.
  - The "construction crew": parallel/templated execution against a clear spec, plus an independent second/third review lens (a different model family = uncorrelated blind spots).
  - Headless: `grok -p "<self-contained prompt>" --output-format plain`. Structured: `--json-schema '<schema>'`. Parallel best-of: `--best-of-n <N>`. Isolated edits: `--worktree <name>`. Self-check: `--check`. Confirm the id with `grok models` (default `grok-4.5`).

- **Antigravity — `gemini-3.1-pro-high` / `gemini-3.7-flash-*`** (via the `agy` CLI on PATH at `~/.local/bin/agy`, authed through the Antigravity account — no API key needed)
  - The second bulk lane and the third review family: large-context sweeps, multi-file refactors, spec-driven generation, and a Google-family opinion for when Claude and Grok agree too easily.
  - Headless: `agy -p "<self-contained prompt>" --output-format text` (also `json` / `stream-json`). Model: `--model gemini-3.1-pro-high` — **the default is Gemini 3.7 Flash**, fine for mechanical work, so name Pro explicitly for anything that has to reason. Depth: `--effort low|medium|high`. Structured: `--json-schema '<schema or path>'`. Extra roots: `--add-dir <path>` (repeatable). Plan-only: `--mode plan`; apply edits: `--mode accept-edits`.
  - **Print mode denies every tool by default** — a plain `agy -p` that needs to read or edit files dies with `user denied permission to run command`. Agentic runs need `--dangerously-skip-permissions`, so scope them: a branch or worktree you created, plus `--sandbox` for terminal restrictions. Read-only/generation-only calls need no flag.
  - `--print-timeout` defaults to 5m — raise it for long jobs. Each `-p` call is a fresh conversation unless you pass `--continue` / `--conversation <id>`. Confirm ids with `agy models`.

**Claude subagents** (native, via the Agent/Workflow `model` param): `sonnet` (bulk/mechanical + the thin wrapper that shells out to an executor inside Workflows), `opus`/`fable` (review, taste, architecture). Never Haiku.

## Rules

1. **Never blindly trust executor output.** Inspect the diff yourself before presenting it; run a Fable adversarial review for anything delicate.
2. **Decompose before delegating.** Break large tasks into focused calls with clear scope and self-contained prompts (file paths, line numbers, exact change).
3. **Claude decides, executors implement.** Architecture and approach stay with Claude.
4. **Escalate the model when quality is low.** Rerun with a smarter model without asking — judge the output, not the price tag.
5. **The acceptance bar for code is real verification** — the repo's own lint · typecheck · build · tests, plus review — not "parses as JSON." A high retry rate is fine for generated content, never for shippable code.
6. **Hard gates stay in Claude.** High-stakes changes — security/auth, money/payments, data migrations or deletion, release-critical paths, and anything the repo's CLAUDE.md flags as a hard rule — get a Fable/Opus gate regardless of who wrote them.

## Picking the executor

- Bulk / multi-file / debugging agentic **code** → **Grok (grok-4.5)** by default; **Antigravity (`gemini-3.1-pro-high`)** when the job is a wide read-heavy sweep, when Grok is rate-limited or stuck in a loop, or when the same spec is worth executing twice by two families and diffing the results.
- Many near-identical jobs from one spec → **Grok** with `--best-of-n` / `--json-schema`. Antigravity has `--json-schema` but no best-of-n — fan out N parallel `agy -p` calls instead.
- Independent 2nd/3rd opinion in adversarial verify → **Grok and/or Antigravity**. Three families (Anthropic · xAI · Google) = maximally uncorrelated blind spots, and review is read-only, so `agy -p` needs no permission flag.
- Cheap mechanical text/codegen where reasoning barely matters → **Antigravity on the default Flash model** (`--effort low`).
- Taste-critical UI/copy/API, or the final review → **Claude** (opus/fable).

## Using an executor inside a Workflow

The Agent/Workflow `model` param only takes Claude models, so wrap the shell-out: spawn a thin Claude wrapper agent (`model: 'sonnet', effort: 'low'`) whose prompt writes a self-contained executor prompt, runs `grok -p` or `agy -p` via Bash, and returns the output. **Architect (Fable) → parallel crew (Grok / Antigravity wrappers) → review (Fable)** maps directly onto `agent()` → `parallel()`/`pipeline()` → `agent()`. Mixing families inside one `parallel()` is the cheapest way to get a diversity check for free.

## Parallel execution & hygiene

- Spawn multiple executor calls in parallel for independent subtasks (each its own `grok -p` / `agy -p`; or `grok --best-of-n`). Keep each scoped.
- Sandbox gotcha: Grok's agentic sandbox may block `.git` writes — create branches yourself (Claude), hand executors **edit-only** tasks, review, then commit. Same discipline for Antigravity: never hand `--dangerously-skip-permissions` a dirty main checkout.
- Two executors editing the same files concurrently will clobber each other — give each its own worktree, or serialize them.
- Context rot is real — clear the conversation after ~4 compactions; use `/handoff` (if available) or write a handoff summary to preserve context on a fresh conversation.
