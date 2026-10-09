# Desktop client version gate

Battle Hub already provides `GET /api/client/version` with `latestVersion`, `minimumVersion`, `releaseNotes`, `downloads`, and `updaterManifestUrl`.

- At desktop startup the Rust command `client_version` loads metadata. The UI compares this package version against minimum/latest.
- Below minimum: forced update dialog blocks use of the old app. Between minimum and latest: dismissible recommendation. Current or newer: no dialog.
- `downloads` must contain an HTTPS URL for the target OS; an invalid URL is not opened.
- This phase is a **download-and-install update notification**, not an automatic installer. Native auto-install needs Tauri Updater, signed updates, trusted public key and correctly published manifests. Never download and execute unsigned binaries.
- Set the version fields and download URL environment variables on Render when a tested installer is released. Do not advance `minimumVersion` before the required package is available.
- A connectivity failure does not forcibly disable offline editing; it displays a dismissible warning. This is not a security kill switch when offline.
