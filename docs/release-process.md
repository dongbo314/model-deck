# Release process

Model Deck Core Preview is distributed from GitHub as source archives. It is not published to the npm registry and is not a prebuilt installer.

Every tagged preview release must satisfy these gates:

1. Build and run the full controller plus Dashboard smoke test on hosted Windows, Linux and macOS runners.
2. Scan the Git allowlist for credentials, private paths, mutable state, media and model files.
3. Audit the dependency lockfile and npm registry signatures.
4. Create ZIP and tar.gz archives directly from the tagged Git tree, with ZIP timestamp metadata normalized to UTC.
5. Generate the per-file manifest from exported archive bytes so Git attribute conversions such as the Windows launcher's CRLF line endings are represented exactly.
6. Verify the checksum set and every file in both archives against the manifest.
7. Extract the tar.gz into a clean directory, install from `package-lock.json`, rebuild and rerun the full-stack smoke test before publishing the prerelease.

The archives intentionally do not contain `node_modules` or a prebuilt `.next` directory. Users need Node.js and npm and must run `npm ci && npm run build` on the target system. Signed installers, background services and native capability packs have separate future acceptance gates.
