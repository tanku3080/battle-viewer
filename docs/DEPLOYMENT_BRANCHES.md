# Branch and CI release process

- `develop`: daily development integration. Run JS lint/test/Next Web/static build, Rust tests/clippy and P2P native checks. The Linux installer job in `ci.yml` is skipped here.
- `staging`: release-candidate integration branch, initially created from the then-current `develop`. Merge a reviewed `develop -> staging` PR when candidate builds are needed. Installer workflow builds **Windows NSIS** and **Linux Debian** as downloadable GitHub Actions artifacts.
- `main`: release/production branch. Merge promoted staging commits when ready. Installer workflow builds the same formats on updates; GitHub Actions artifacts are not automatically public releases.
- `build-desktop.yml` runs only for pushes and PRs **targeting staging or main**, plus manually dispatched runs (when available from default branch). It does not run for regular develop PRs/pushes.
- `ci.yml` keeps fast verification on feature branches/develop; the optional Linux .deb package smoke-test only runs on staging/main PR/push.

## Render/Neon integration

Backend is hosted separately. Backend implementation resides in `tanku3080/battle-hub`. The packaged desktop contacts the URL from `BATTLE_HUB_API_BASE_URL`; without it, default remains `http://localhost:8080`. A deployment URL cannot be embedded until Render service creation.

The FE retries selected idempotent API GET requests and authentication login/refresh during Render Free cold starts. It does not replay publish, transfer-grant or other side-effecting application POST requests.

Backend process restart preserves PostgreSQL metadata and hashed access/refresh token records, but ephemeral P2P addresses/grants/receipts disappear. Peers renew leases while running. Starting the Hub does not open TCP ports on remote peer computers or provide NAT relay. The app currently keeps tokens in memory; a client process restart may still require login.
