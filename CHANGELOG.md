# Changelog

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
