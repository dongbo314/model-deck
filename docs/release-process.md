# Release process

Model Deck Core Preview is distributed from GitHub as source archives. It is not published to the npm registry and is not a prebuilt installer.

Every tagged preview release must satisfy these gates:

1. Build and run the full controller plus Dashboard smoke test on hosted Windows, Linux and macOS runners.
2. Scan the Git allowlist for credentials, private paths, mutable state, media and model files.
3. Audit the dependency lockfile and npm registry signatures.
4. Create ZIP and tar.gz archives directly from the tagged Git tree, with ZIP timestamp metadata normalized to UTC.
5. Generate the per-file manifest through Git export filters so attribute conversions such as the Windows launcher's CRLF line endings are represented exactly.
6. Reconstruct both archives from the tagged Git tree and require byte-for-byte equality, then bind every manifest entry to the same exported tree.
7. Extract the tar.gz into a clean directory, install from `package-lock.json`, rebuild and rerun the full-stack smoke test before publishing the prerelease.
8. Build the Docker image from source on hosted Linux, run it as a non-root user with the hardened Compose profile, verify both loopback-only host port mappings, exercise Dashboard-to-controller health and authorization, restart it, and confirm named-volume persistence.

The archives intentionally do not contain `node_modules` or a prebuilt `.next` directory. Users can run `npm ci && npm run build` on the target system, or build the Docker image locally with Docker Compose. No prebuilt container image is currently published. Signed installers, background services and native capability packs have separate future acceptance gates.
