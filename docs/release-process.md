# Release process

Model Deck Core Preview is distributed as source archives on GitHub and as a prebuilt Core container at [`docker.io/esofk/model-deck`](https://hub.docker.com/r/esofk/model-deck). It is not published to the npm registry and is not a prebuilt native installer.

Every tagged preview release must satisfy these gates:

1. Build and run the full controller plus Dashboard smoke test on hosted Windows, Linux x64/arm64 and macOS runners.
2. Scan the Git allowlist for credentials, private paths, mutable state, media and model files.
3. Audit the dependency lockfile and npm registry signatures.
4. Create ZIP and tar.gz archives directly from the tagged Git tree, with ZIP timestamp metadata normalized to UTC.
5. Generate the per-file manifest through Git export filters so attribute conversions such as the Windows launcher's CRLF line endings are represented exactly.
6. Reconstruct both archives from the tagged Git tree and require byte-for-byte equality, then bind every manifest entry to the same exported tree.
7. Extract the tar.gz into a clean directory, install from `package-lock.json`, rebuild and rerun the full-stack smoke test before publishing the prerelease.
8. Build the Docker image from source on native hosted Linux x64 and arm64 runners, run it as a non-root user with the hardened Compose profile, verify both loopback-only host port mappings, exercise Dashboard-to-controller health and authorization, restart it, and confirm named-volume persistence.
9. Build and push separate immutable `linux/amd64` and `linux/arm64` artifacts with BuildKit provenance and SBOMs, then pull and rerun the full published-artifact checks on their matching native runners before creating any container release tag.
10. Verify the self-hosted Chinese font CSS and common-CJK WOFF2 asset, merge the verified platform digests into one OCI index, and require the release-specific and `alpha` tags to resolve to that same multi-architecture digest.

The release publishes `0.1.0-alpha.6` as the release-specific container tag and moves `alpha` to the newest prerelease. It deliberately does not publish `latest`. The image index supports native `linux/amd64` and `linux/arm64` containers.

The attached provenance records how the image was built, and the SBOM inventories included software. An SBOM is not a vulnerability scan, an exploitability assessment or a security guarantee; vulnerability-management policy remains a separate release and operator responsibility.

The GitHub archives intentionally do not contain `node_modules` or a prebuilt `.next` directory. Users can run `npm ci && npm run build` on the target system, build the Docker image locally with `docker compose up --build -d`, or pull the published image with `docker compose pull` followed by `docker compose up -d`. Signed installers, background services and native capability packs have separate future acceptance gates.
