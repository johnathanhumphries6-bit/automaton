# Atlas Private Dashboard Login

The repository now includes a minimal, single-owner dashboard shell. It has no public registration flow and requires two deployment secrets. It is separate from the agent worker: the dashboard is not a runtime monitor or control API until those integrations are deliberately implemented.

## Start locally

Build the project, then set these environment variables in your shell (do not commit them to Git):

- `ATLAS_DASHBOARD_PASSWORD`: a unique owner password of at least 20 characters. Prefer a password manager-generated value.
- `ATLAS_DASHBOARD_SESSION_SECRET`: a separate random secret of at least 32 characters.
- `ATLAS_DASHBOARD_PORT`: optional local port; defaults to 3000. The standard `PORT` environment variable takes precedence for platforms such as Railway.
- `NODE_ENV=production`: enable the Secure cookie flag when serving behind HTTPS.

Example secret generation on a trusted machine:
```sh
openssl rand -base64 36
```
Generate one value for the session secret. Set the password separately; do not reuse your GitHub, email, or hosting password. Never paste either secret into a chat or commit it to the repository.

Start with `node dist/index.js --dashboard`. Visit `/login` over HTTPS in production. The `/healthz` endpoint intentionally exposes only a basic liveness response.

## Security behavior

- One configured password; no usernames, sign-up, password reset, or account recovery route.
- Missing/short secrets cause startup to fail closed.
- Random in-memory sessions expire after 12 hours; cookies are HttpOnly and SameSite=Strict, and Secure in production.
- Login attempts are rate-limited per direct peer address.
- Password comparison uses constant-time digest comparison.
- Login POST checks the Origin host; responses set no-store and security headers.
- Sessions are stored in memory, so a restart invalidates sessions. This is a single-process starter, not a multi-replica session system.

## Deployment checklist

1. Configure the two secrets in the hosting provider's private environment-variable settings, never in source code or committed config.
2. Set `NODE_ENV=production` and ensure the public route is served only over HTTPS.
3. Deploy `node dist/index.js --dashboard` as a web service with its assigned `PORT`.
4. Test wrong-password rejection, rate limiting, logout, session expiry, HTTPS cookie behavior, and restart invalidation.
5. Keep the agent worker and dashboard as separate services unless the runtime architecture is deliberately changed.
6. Do not expose wallet controls, raw logs, secrets, payment actions, or other powerful tools through the dashboard without separate authorization checks and security review.

## Current limitation

The authenticated home page is a dashboard shell. It does not yet read live Atlas runtime status, display experiment logs, or expose control actions. Do not describe those capabilities as available until implemented and tested.
