# Model Deck Core

Model Deck Core is a local, cross-platform control plane for OpenAI-compatible model providers and reusable personas. It gives Windows, Linux and macOS users one dashboard and one local API without bundling model weights, private credentials or hardware-specific runtimes.

> **Status:** `0.1.0-alpha.3` Core Preview. The remote-provider path is implemented and covered by cross-platform CI. Local inference and media capability packs are roadmap items, not completed features.

## Editions

| Edition | Purpose | Included |
|---|---|---|
| Core Preview (this repository) | Portable foundation for Windows, Linux and macOS | Dashboard, OpenAI-compatible routing, model aliases, personas, local API, platform doctor |
| macOS Full | Existing workstation installation | Core plus locally configured audio, video, MLX/MPS, ComfyUI and virtual-audio workflows |
| Capability packs | Independently installable future modules | Standard llama.cpp, memory, channels, audio/TTS, song, video and virtual microphone |

The existing macOS Full installation is maintained separately. This repository was assembled from a clean allowlist and contains no copied runtime state, model weights, user databases, media, logs or credentials.

## Security defaults

- Controller and dashboard bind to loopback only.
- LAN access is not included in Core Preview.
- The supported launcher creates separate ephemeral controller and browser-session tokens.
- The `/v1/*` local API is disabled until `MODELDECK_API_KEY` is set, then always requires that Bearer token.
- Provider API keys come from environment variables; `providers.json` contains only metadata.
- User configuration and data live outside the installation directory.
- Supported build/start scripts disable framework telemetry; Core performs no application telemetry or automatic model downloads.
- Remote provider URLs must use HTTPS. HTTP is accepted only for loopback development providers.

Do not expose ports 3000 or 8080 through a router, public reverse proxy or container publish rule. See [SECURITY.md](SECURITY.md) before reporting a vulnerability.

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer
- Windows x64, Linux x64, or macOS arm64/x64
- At least one OpenAI-compatible provider for chat

Windows ARM64 may run through an x64 Node installation, but it is not a first-release validation target.

## Quick start

```bash
git clone https://github.com/dongbo314/model-deck.git
cd model-deck
npm ci
npm run build
npm run init
```

Find the generated provider configuration:

```bash
npm run doctor
node bin/modeldeck.mjs config-path
```

Edit `providers.json` using [resources/providers.example.json](resources/providers.example.json) as a reference. Keep the API key out of that file and set the environment variable named by `apiKeyEnv`.

Set the provider credential with a hidden prompt in the terminal that will run Core, then start both local services. Platform-specific examples are in the Windows and Linux guides.

```bash
npm start
```

Open the secure Dashboard URL printed by `npm start`; its fragment carries a one-session token and is removed from the address bar after loading. The optional OpenAI-compatible API uses <http://127.0.0.1:8080/v1> after you explicitly enable it.

Windows PowerShell and Linux-specific notes are in [docs/windows.md](docs/windows.md) and [docs/linux.md](docs/linux.md).

GitHub release ZIP/tar.gz files are source distributions, not prebuilt installers. Extract one archive, then run the same `npm ci && npm run build` steps on the target system. Each release includes a file manifest and `SHA256SUMS`; see [docs/release-process.md](docs/release-process.md).

## Provider configuration

`providers.json` uses public model aliases so clients never need to know an upstream provider's internal model ID.

```json
{
  "schemaVersion": 1,
  "providers": [
    {
      "id": "team",
      "name": "Team gateway",
      "baseUrl": "https://api.example.com/v1",
      "apiKeyEnv": "MODELDECK_PROVIDER_TEAM_KEY",
      "models": [
        {
          "id": "team-chat",
          "upstreamId": "provider-model-id",
          "name": "Team Chat"
        }
      ]
    }
  ]
}
```

The configuration precedence is:

```text
built-in defaults < platform user directories < environment variables
```

Set `MODELDECK_HOME` for a portable or test installation. Fine-grained overrides are `MODELDECK_CONFIG_DIR`, `MODELDECK_DATA_DIR`, `MODELDECK_STATE_DIR` and `MODELDECK_CACHE_DIR`.

## Local API

The local API is disabled by default. Set a strong local token before starting Core:

```bash
read -rsp "Local API token: " MODELDECK_API_KEY && echo
export MODELDECK_API_KEY
```

```bash
curl http://127.0.0.1:8080/v1/models \
  -H "Authorization: Bearer $MODELDECK_API_KEY"

curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer $MODELDECK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "team-chat",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Bearer authentication is mandatory whenever `/v1/*` is enabled. Never place a production credential in a command committed to source control.

The `/api/*` management surface uses a separate random runtime token and is intended only for the bundled dashboard. The Dashboard proxy also requires the browser-session token printed at launch. The launcher does not pass provider credentials or unrelated host secrets to the dashboard process.

## Platform data locations

| Data | Linux | Windows | macOS |
|---|---|---|---|
| Configuration | `$XDG_CONFIG_HOME/modeldeck` | `%APPDATA%\ModelDeck` | `~/Library/Application Support/ModelDeck/config` |
| User data | `$XDG_DATA_HOME/modeldeck` | `%LOCALAPPDATA%\ModelDeck\data` | `~/Library/Application Support/ModelDeck/data` |
| State | `$XDG_STATE_HOME/modeldeck` | `%LOCALAPPDATA%\ModelDeck\state` | `~/Library/Application Support/ModelDeck/state` |
| Cache | `$XDG_CACHE_HOME/modeldeck` | `%LOCALAPPDATA%\ModelDeck\cache` | `~/Library/Caches/ModelDeck` |

Each XDG variable falls back to its standard directory under the user's home folder.

## Capability roadmap

| Pack | Windows | Linux | macOS | Core Preview status |
|---|---|---|---|---|
| Standard llama.cpp | CUDA/Vulkan planned | CUDA/Vulkan planned | Metal planned | Not bundled |
| FTS/vector memory | FTS first | FTS first | FTS first | Planned |
| Channels and timers | Planned | Planned | Planned | Not bundled |
| Audio and TTS | WASAPI backend required | PipeWire/PulseAudio backend required | CoreAudio/MLX optional | Not bundled |
| Song workflows | PyTorch/ffmpeg pack | PyTorch/ffmpeg pack | Existing full-workstation path | Not bundled |
| Video/ComfyUI | CUDA pack | CUDA/ROCm pack | Existing MPS/Metal path | Not bundled |
| Virtual microphone | OS-specific driver integration | PipeWire/JACK integration | Existing CoreAudio path | Not bundled |

“Planned” is not a compatibility claim. A pack becomes supported only after installation, lifecycle, upgrade and real-hardware tests pass on that platform.

## Development

```bash
npm ci
npm run check
npm run build
npm run dev
```

The test suite uses a local fake OpenAI-compatible upstream and temporary directories containing spaces and Chinese characters. It never requires a real credential.

Architecture and extension boundaries are documented in [docs/architecture.md](docs/architecture.md) and [docs/capability-packs.md](docs/capability-packs.md).

## Releases and evidence boundary

A passing source build does not prove a packaged application works. Core releases require:

1. Linux, Windows and macOS CI checks.
2. Full controller and Dashboard smoke tests on all three hosted operating systems.
3. Remote model routing through a fake provider.
4. A secret and personal-path scan.
5. An archive manifest and checksum.

The initial GitHub tag is a source-only developer preview. Signed Windows installers and packaged Linux services are future release gates. npm tarballs are not a supported distribution format.

## License

Model Deck Core is licensed under the [Apache License 2.0](LICENSE). No model weights are included. See [MODEL_LICENSES.md](MODEL_LICENSES.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
