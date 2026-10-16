# Atlas fresh runtime setup (safe, zero-spend baseline)

This runbook prepares a fresh Automaton runtime without starting autonomous actions or spending funds.

## Current Railway layout

- `atlas-dashboard` serves the dashboard.
- `@conway/automaton-cli` is the worker service, but its current start command is the creator CLI development entry point, not the runtime.
- The runtime expects its first-run setup wizard to run in an interactive terminal. Railway background services do not provide that terminal.
- The runtime stores identity/configuration and its SQLite database under `~/.automaton` by default. That directory must be durable before the worker is started.

## Required order

1. Confirm the Railway plan's volume/storage cost and approve any non-zero cost before creating storage.
2. Create and attach a persistent volume to the worker at `/root/.automaton` (verify the runtime's HOME is `/root` in the deployment). Do not mount an empty volume over a directory containing an existing identity.
3. Run the setup wizard in a trusted interactive environment using the project's supported install/build process. Never put secrets in Git, logs, or chat.
4. Configure the identity, Conway API key, creator address, genesis prompt, and inference provider/model. Do not fund a wallet or enable bootstrap top-up.
5. Copy the complete generated `~/.automaton` directory to the attached persistent storage through a secure method; verify restrictive permissions and that the config, wallet material, heartbeat config, and database are present.
6. Set the worker start command to `node dist/index.js --run`. Keep `ATLAS_ALLOW_BOOTSTRAP_TOPUP` unset or set to `false`.
7. Start the worker only after the config and persistent mount are verified. Confirm logs show the runtime starting and database/identity loaded; then connect the dashboard to real runtime data. Never display wallet private keys or API keys in dashboard output.
8. Test first with a bounded, read-only genesis prompt and verify the policy denies spending, external outreach, account creation, contracts, and replication without explicit approval.

## Initial safe genesis prompt

> You are Atlas in a supervised test environment. Your first task is to report runtime health, summarize your available tools and current configuration without revealing secrets, and identify missing setup. Operate in read-only mode. Do not send messages or contact people, create accounts, publish content, execute financial transactions, deploy contracts, fund wallets, buy services, create child agents, or modify your own code. Do not attempt to bypass these restrictions. Ask the owner before any action with external side effects. Record factual activity only; never fabricate observations, completed work, or revenue.

## Dashboard integration acceptance checks

- The dashboard reads only sanitized runtime status/activity fields.
- Runtime not connected is shown honestly when no data source is available.
- Activity and revenue are derived from actual database/event records; unverified revenue remains $0.
- Controls remain disabled unless a real authenticated control API is available.
- No secrets, wallet private keys, or raw environment variables are exposed.

## Rollback

If the worker crashes or configuration is uncertain, stop the worker service and preserve the volume. Do not delete or recreate the volume or wallet to troubleshoot. Inspect logs with secrets redacted.
