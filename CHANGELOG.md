# Changelog

## Unreleased

- Added a complete Simplified Chinese Dashboard with a persistent Chinese/English language selector.
- Localized built-in capability, persona, accessibility, status and error text while preserving user-supplied names and model output.
- Distinguished missing or rejected Dashboard sessions from genuine controller outages instead of reporting every failure as `Controller offline`.
- Added stable, non-sensitive Dashboard proxy error codes and stopped returning raw controller connection errors to the browser.
- Built the Dashboard with Webpack content-hashed assets so replacing a container cannot leave the browser running stale Dashboard code.

## 0.1.0-alpha.5

- Published the first Docker Hub Core image at `docker.io/esofk/model-deck` for `linux/amd64`.
- Added the release-specific `0.1.0-alpha.5` tag and moving `alpha` tag without publishing `latest`.
- Made `docker compose pull` followed by `docker compose up -d` the default deployment path while retaining source builds through `docker compose up --build -d`.
- Added BuildKit provenance and an SBOM to the published image, plus a post-publish pull and runtime revalidation by immutable digest.
- Clarified that an SBOM is a component inventory, not a vulnerability scan or security guarantee.

## 0.1.0-alpha.4

- Added a complete Simplified Chinese README and Chinese Docker deployment guide.
- Added a source-built, non-root Docker Compose preview for Windows and Linux x64 hosts.
- Kept native launches loopback-only while permitting verified container-only wildcard listeners behind explicit host-loopback port mappings.
- Added end-to-end container health, authorization, hardening and named-volume persistence checks to CI and release gates.

## 0.1.0-alpha.3

- Generated the release manifest through Git export filters, including the CRLF Windows launcher produced by Git attributes.
- Added verification that the manifest and byte-for-byte reproducible ZIP and tar.gz archives all derive from the tagged Git tree.
- Normalized ZIP timestamp metadata to UTC so the source archive is reproducible across time zones.

## 0.1.0-alpha.2

- Normalized public release paths on Windows before enforcing the exact source allowlist.
- Validated full-stack startup and shutdown on hosted Windows, Linux and macOS runners.
- Added clean source-archive reconstruction, SHA-256 checksums and a per-file manifest.

## 0.1.0-alpha.1

- Created a clean cross-platform Core repository independent of the macOS Full runtime.
- Added loopback-only OpenAI-compatible routing with environment-based credentials.
- Added a responsive dashboard, model aliases and persona management.
- Added platform-standard user directories and a cross-platform CLI doctor.
- Added Linux, Windows and macOS CI coverage.
- Declared audio, song, video, MLX/MPS, ComfyUI and virtual microphone as future capability packs.
