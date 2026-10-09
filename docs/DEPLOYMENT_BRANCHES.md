# Branch and CI release process

- `develop`: daily development integration. Run JS lint/test/Next Web/static build, Rust tests/clippy and P2P native checks. The Linux installer job in `ci.yml` is skipped here.
- `staging`: release-candidate integration branch, initially created from the then-current `develop`. Merge a reviewed `develop -> staging` PR when candidate builds are needed. Installer workflow builds **Windows NSIS** and **Linux Debian** as downloadable GitHub Actions artifacts.
- `main`: release/production branch. Merge promoted staging commits when ready. Installer workflow builds the same formats on updates; GitHub Actions artifacts are not automatically public releases.
- `build-desktop.yml` runs only for pushes and PRs **targeting staging or main**, plus manually dispatched runs (when available from default branch). It does not run for regular develop PRs/pushes.
- `ci.yml` keeps fast verification on feature branches/develop; the optional Linux .deb package smoke-test only runs on staging/main PR/push.

## Render/Neon integration

Backend is hosted separately. Backend implementation resides in `tanku3080/battle-hub`. The packaged desktop contacts the URL from `BATTLE_HUB_API_BASE_URL`; the default is `http://localhost:8080` in debug builds and `https://battle-hub.onrender.com` in packaged release builds. An explicit environment override takes precedence.

The FE retries selected idempotent API GET requests and probes `/api/health` during Render Free cold starts before sending login/refresh exactly once. Replaying single-use refresh tokens after an ambiguous response risks invalidating login. It does not replay publish, transfer-grant or other side-effecting application POST requests.

Backend process restart preserves PostgreSQL metadata and hashed access/refresh token records, but ephemeral P2P addresses/grants/receipts disappear. Peers renew leases while running. Starting the Hub does not open TCP ports on remote peer computers or provide NAT relay. The app currently keeps tokens in memory; a client process restart may still require login.

## Branch ownership

- FE develop → staging → main. Release packages are made only from staging or main, not all feature/develop branches.
- BE develop → main. Render Oregon's development Web Service tracks BE develop; Neon is in Singapore, introducing inter-region DB latency. The database name must be verified independently of the Neon project name.
- Do not check Windows/Linux installer workflow results during ordinary development unless expressly requested. The release build jobs remain configured for staging/main.
