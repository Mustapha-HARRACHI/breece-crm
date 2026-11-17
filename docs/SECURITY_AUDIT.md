# BREECE CRM Security Audit

Date: 2026-11-17  
Scope: authentication, authorization, cookies, privacy, reminders, Docker, dependencies, GitHub publication readiness.

## Executive summary

The application has a sound small-project baseline: password hashes are bcrypt-protected, JWTs are HttpOnly-cookie based, OAuth uses state and PKCE, reset tokens are hashed and time-limited, protected resources enforce ownership, Docker ports are localhost-bound, and no secrets or personal-data exports are tracked. The current evidence supports **READY WITH CONDITIONS**, not unrestricted public deployment.

## Checks executed

- `docker compose config`: passed.
- Docker status: `client`, `server`, and healthy `mongodb` running.
- Direct and Vite-proxied `/api/health`: HTTP 200.
- `MONGODB_URI=mongodb://127.0.0.1:27017/breece_crm_test npm test --prefix server`: 9 passed, 0 failed.
- `npm run build --prefix client`: passed.
- `npm audit --prefix server --audit-level=high`: 0 vulnerabilities.
- `npm audit --prefix client --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: passed; tracked-file scan found no `.env`, private key, dump, credential, token, or personal-data export.

## Prioritized findings

| ID | Severity | Finding | Evidence / impact | Minimal remediation and verification |
|---|---|---|---|---|
| SEC-001 | High | Password reset does not invalidate existing sessions. | `server/src/routes/auth.js:119-120` changes the password and issues a new JWT, but previously issued 7-day JWTs remain valid because `server/src/middleware/auth.js` only verifies signature/expiry. A stolen old cookie remains usable after reset. | Add a per-user session/version value to JWTs and increment it on reset; require equality in middleware. Test old-cookie rejection after reset. |
| SEC-002 | Medium | Account erasure is not atomic or retry-safe. | `server/src/routes/privacy.js:46-48` deletes contacts, goals, then the user in separate operations. A process/database failure can leave partial deletion or an orphaned account. | Use a MongoDB transaction where deployment supports replica sets, or implement an idempotent deletion state/retry workflow. Test failure between deletion stages. |
| SEC-003 | Medium | Reminder delivery has a send-time race. | `server/src/services/reminderScheduler.js:17-23` checks status before SMTP delivery, then sends outside the database claim. A concurrent completion/cancellation can still result in an email after the user changes the reminder. | Introduce an explicit atomically claimed `Sending` state and revalidate ownership/status immediately before delivery; test concurrent complete/cancel cases. |
| SEC-004 | Medium | Google-only account deletion lacks a browser fresh-verification flow. | `server/src/routes/privacy.js:41-44` requires a fresh `googleIdToken`, while the React privacy form submits only a password field (`client/src/App.jsx`, `PrivacySettings`). Google-only users cannot complete the intended secure flow from the UI. | Add a dedicated reauthentication flow using Google `prompt=login`/account selection and a short-lived server-side verification result. Test success, cancellation, and mismatch. |
| SEC-005 | Low | Security headers and CSP are not configured by Express. | `server/src/app.js:11-29` configures CORS/body parsing but no CSP, frame, MIME-sniffing, or referrer headers. Deployment protection is therefore delegated entirely to an unverified reverse proxy. | Set a restrictive header policy at the HTTPS reverse proxy (or add a maintained header middleware). Verify headers in production-like smoke tests. |
| SEC-006 | Low | Containers run as the default root user and use a mutable Node major tag. | `server/Dockerfile:1-9` and `client/Dockerfile:1-9` use `node:22-bookworm-slim` without a non-root user or digest pin. Compromise impact and supply-chain reproducibility are weaker than necessary. | Add non-root runtime users and pin reviewed image digests. Rebuild and verify effective UID and health checks. |

## Confirmed controls

- Session cookies are HttpOnly, 7 days, root-scoped, Secure in production, and SameSite Strict; local development uses HTTP with SameSite Lax. CSRF uses a separate readable token/header pair for account deletion.
- Google OAuth uses a short-lived HttpOnly state/PKCE cookie, verifies issuer/audience/email verification, and refuses automatic linking when an email already exists.
- Password reset uses 32 random bytes, stores only SHA-256, expires after 20 minutes, is single-use, and returns a generic unknown-email response.
- Contact, statistics, goals, reminders, export, and deletion routes use authenticated owner scoping. React renders user content as text; reminder HTML escapes user-controlled fields.
- Compose publishes ports only on `127.0.0.1`, excludes `.env` files from build contexts, and preserves the named MongoDB volume.

## Testing gaps and unverified risks

- Dedicated mocked scheduler tests for concurrency, retry/backoff, restart recovery, and no-send-after-cancel are missing; this is a meaningful reliability gap, not evidence of exploitation.
- Dedicated cookie-attribute/session-expiry tests are missing. Existing tests cover authentication, rate limiting, OAuth configuration safety, privacy, CRUD, statistics, goals, and reminders.
- Live Google OAuth, SMTP delivery, HTTPS Secure-cookie behavior, reverse-proxy headers, and production deployment settings were not exercised. No real email was sent.
- MongoDB data was not modified by this audit; tests used the isolated `breece_crm_test` database configured for the test run.

## GitHub and deployment readiness

No tracked environment files, private keys, database dumps, or obvious credentials were found. The working tree contained pre-existing modifications in `server/.env.example` and `server/test/contacts.integration.test.js`; they were not altered by this audit. Before publication, review the staged diff and rotate any secret if a separate history scan or GitHub secret scanner reports one.

## Remediation plan

1. Implement session-version invalidation after password reset (SEC-001).
2. Close the reminder send race and add mocked scheduler tests (SEC-003).
3. Implement and test Google-only deletion reauthentication (SEC-004).
4. Make account erasure atomic/retry-safe, then add failure-injection tests (SEC-002).
5. Apply HTTPS reverse-proxy headers, non-root containers, and image pinning before public exposure (SEC-005/006).

## Resolution update

- SEC-001, SEC-002, SEC-003, and SEC-004 are implemented and covered by the current integration suite.
- SEC-005 is addressed for the Express API and local Vite server with CSP, MIME, referrer, frame, permissions, and opt-in HSTS headers. Production frontend hosting and HTTPS reverse-proxy behavior still require deployment-specific verification.
- SEC-006 is addressed for application containers with the existing Node slim image and non-root `node` user. MongoDB deployment mode and volume were unchanged.
- Cookie attribute regression coverage now verifies local HTTP attributes; production Secure behavior remains deployment-specific.

## Final recommendation

**READY WITH CONDITIONS** for controlled testing and private GitHub publication. Complete HTTPS/reverse-proxy and production frontend-header verification before public deployment.
