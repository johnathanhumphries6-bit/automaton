# ATLAS — Repository and Railway Audit (Initial)

Date: 2026-10-16  
Repository audited: https://github.com/johnathanhumphries6-bit/automaton  
Branch audited: `main` at audit start  
Audit branch: `atlas/railway-audit-and-safety`

## Executive summary

The repository is a fork of Conway Research's Automaton. Its `main` branch was at commit `d8f816881fd24b6f5e3d616e59edec387a447667`, and the upstream `Conway-Research/automaton` `main` branch reported the same commit SHA at audit time. The code is a persistent worker-style Node.js/TypeScript CLI, but its first-run setup is interactive. A Railway deployment marked ACTIVE is not evidence that setup completed, credentials work, the agent loop is making progress, or state survives restarts.

This is an initial source audit, not a full execution/security certification. I inspected repository metadata, the full tracked-file tree, package metadata, README/documentation, entry point, setup/configuration, wallet/state paths, logging, heartbeat, financial top-up code, child-agent code, backup tooling, CI configuration, and selected policy/types files. I did not have Railway project/log access or a local checkout/runtime in which to run the test suite.

## Confirmed findings

- **Repository and fork:** `johnathanhumphries6-bit/automaton`, owned by `johnathanhumphries6-bit`; default branch `main`; public; the linked account has push/admin permissions. Upstream is `Conway-Research/automaton`. Both `main` branches reported commit `d8f816881fd24b6f5e3d616e59edec387a447667` during this inspection, so the fork was at the same commit as upstream at that point.
- **Runtime:** package `@conway/automaton`, version `0.2.1`; ESM TypeScript; Node.js `>=20`; package manager declared as `pnpm@10.28.1`. Root scripts include `pnpm build`, `pnpm test`, and `pnpm typecheck`. Both `pnpm-lock.yaml` and `package-lock.json` exist; prefer the declared pnpm manager and frozen pnpm lockfile for consistent builds.
- **Entry point:** `src/index.ts` builds to `dist/index.js`. The intended long-running command is `node dist/index.js --run`. Without `--run`, the CLI prints help rather than starting the worker.
- **First run:** if `~/.automaton/automaton.json` is absent, `--run` launches the interactive setup wizard. That wizard asks for chain selection, provisions a Conway API key, asks for agent name/genesis prompt/creator address and optional provider credentials, and configures treasury policy. This is not suitable for unattended first boot.
- **Credentials:** runtime requires a Conway API key (from config or `CONWAY_API_KEY`/the API-key config fallback); missing key makes startup exit nonzero. Optional provider inputs include OpenAI, Anthropic, and Ollama. The code also includes Conway inference.
- **State:** wallet code writes `~/.automaton/wallet.json` with mode `0600`; config save uses mode `0600`; database defaults to `~/.automaton/state.db`; heartbeat config defaults to `~/.automaton/heartbeat.yml`; skills and identity files also live under the Automaton directory. SQLite is backed by `better-sqlite3`. The repository has a backup/restore script.
- **Worker lifecycle:** after configuration, startup initializes the database, clients, policy engine, heartbeat daemon, and then enters a long-running agent loop. It handles SIGTERM/SIGINT and has a 30-second delay after caught run-loop errors. Heartbeat scheduling uses a durable SQLite-backed scheduler.
- **Financial risk:** startup code previously attempted a minimum **$5 USDC-to-credit top-up** when credits were low and the wallet held enough USDC. The default treasury policy also permits nonzero transfers/payments and inference spend. Those defaults do **not** satisfy an owner policy of $0 spending authority without additional explicit gates and configuration. The code has wallet generation, on-chain payment, sandbox creation, self-modification, and child-agent/replication capabilities; do not fund the wallet or enable replication during initial verification.
- **Logging:** structured logs are implemented, but the logger can include arbitrary error messages and stacks. Never share raw logs without reviewing/redacting them for tokens, URLs with credentials, wallet/private-key material, or personal data.
- **Git hygiene:** `.gitignore` excludes `.env`, databases, and some wallet paths, but does not broadly ignore every sensitive file that may exist under a local `.automaton` directory (for example, config/API-key/SOUL/heartbeat/skills files). The inspected tracked-file list did not itself prove that secrets have never been committed; a history scan is still required.

## Changes made on the audit branch

1. **Disabled automatic startup top-up by default.** In `src/index.ts`, the bootstrap payment only runs when `ATLAS_ALLOW_BOOTSTRAP_TOPUP=true` is explicitly configured. Otherwise startup logs that no payment was attempted. This gate is an opt-in safeguard; leave the variable unset for Atlas.
2. **Prevented unattended first-run setup from hanging.** In `src/index.ts`, when configuration is missing and stdin is not a TTY, the process now logs an actionable error and exits instead of entering the interactive wizard. Run setup in an interactive environment and persist the resulting state before starting the Railway worker.

These edits are on `atlas/railway-audit-and-safety`, not `main`. They have **not** been built or tested in this environment. They are not yet deployed to Railway.

## Unverified / still required

- Railway service settings, deployment source/commit, start command, runtime logs, environment variables, volume configuration, and whether the current deployment is actually running the agent.
- Whether first-run setup has completed and whether `~/.automaton` currently contains valid configuration, wallet, API key, database, and heartbeat state.
- Provider authentication and a successful inference call.
- Actual agent turn progress, heartbeat execution, recovery after restart, and data persistence.
- Full test suite, typecheck, build, dependency audit, and runtime shutdown/restart tests.
- Full source review of every tool, policy rule, self-modification path, replication path, and dependency; full secret scan across all Git history.
- Exact current Conway/provider pricing and actual spend. Cost cannot be estimated reliably until provider/model, heartbeat cadence, usage, and hosting plan are known.

## Railway configuration guidance (verify before applying)

- **Build command:** `pnpm install --frozen-lockfile && pnpm build` (matches repository package manager/build scripts; not yet tested here).
- **Start command:** `node dist/index.js --run` (verified against the CLI source).
- **Service type:** persistent worker; no public domain or exposed administrative endpoint is needed for background work.
- **Node:** use Node 20 or newer. CI is configured for Node 20 and 22.
- **Persistent volume:** mount a Railway volume at the actual resolved Automaton directory, which is `path.join(process.env.HOME || "/root", ".automaton")`. Confirm `HOME` in Railway before choosing the mount path. The volume must retain at least `wallet.json`, `automaton.json`, `config.json`/API-key fallback if used, `state.db` and SQLite sidecars, `heartbeat.yml`, `SOUL.md`, `constitution.md`, and installed skills. Back up before upgrades/restores; never overwrite existing state during initialization.
- **Secrets:** enter required credentials only in Railway's secret variables or through the supported setup/configuration process; never commit them. Do not paste secret values into logs or chat.
- **Do not set** `ATLAS_ALLOW_BOOTSTRAP_TOPUP=true` for the initial zero-spend verification. The new gate does not block every possible financial tool; the existing nonzero treasury defaults and any on-chain capabilities still require a separate reviewed spending-approval implementation before an autonomous production run.
- If the state volume is missing, do not let a replacement worker create a new wallet or identity. Stop and restore the correct volume/backup first.

## Test results

- Source inspection: completed for the files described above.
- Repository test suite: **not run** (no local checkout/runtime execution available through the current GitHub connection).
- Typecheck/build: **not run**.
- Railway runtime/log verification: **not available** through the current tools.
- Deployment readiness: **not verified**.

## Risk assessment

**High priority:** interactive setup vs noninteractive deployment; durable state volume; credentials/provider authentication; default nonzero financial policy conflicting with $0 spending authority; automatic payment paths; full secret/history scan; runtime/test verification.

**Recommended order:**
1. Keep the audit branch separate and review its diff.
2. Verify Railway points to the intended fork/branch and inspect logs without sharing secrets.
3. Complete setup interactively only if it has not already been completed; preserve all existing state.
4. Attach/verify a persistent volume before starting the worker.
5. Implement and test hard approval gates for all financial spending, public publishing/outreach, and child-agent creation; do not rely only on prompts or nonzero treasury limits.
6. Run build, typecheck, tests, secret scan, and dependency audit in CI.
7. Deploy the branch only after review, then verify logs, agent turns, heartbeat, and persistence across a controlled restart.

## Initial business research recommendation

Start with a small developer utility or fixed-scope automation tool. First compare at least three narrow problems using public evidence, buyer access, build time, competition, costs, and risks. Do not spend on ads, publish a product, or contact prospective customers without owner approval. No demand, revenue, or profitability has been established yet.


## Follow-up: zero-capital revenue mission (2026-10-16)

Added `docs/ATLAS_ZERO_CAPITAL_REVENUE_MISSION.md` and a default `zero-capital-opportunity-research` skill for newly initialized installations. Updated the default payment and survival skill text to emphasize zero spending authority, free resources, truthful reporting, and owner approval for spending, publishing, outreach, account creation, and child agents.

**Important rollout limitation:** the new default skill is written by the setup wizard's `installDefaultSkills` function. Existing installations will not automatically receive updated skill files just because code is deployed. Do not rerun first-run setup over existing state. Install/review the new skill deliberately on the existing persistent volume, or add a separate safe migration mechanism after verifying it cannot overwrite user-created skills.

This mission supports autonomous research and private prototyping; it does not grant authority to spend, publish, contact customers, create accounts, accept contracts, or spawn agents. "Every single opportunity" cannot be guaranteed; the workflow ranks a broad set of opportunities by evidence and tests them systematically. Revenue is not guaranteed.
