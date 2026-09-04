# Capability-pack contract

Hardware-heavy features must remain optional. A missing or broken pack must not prevent Core from starting or using remote chat.

Every pack must declare:

- supported operating systems and architectures;
- executable and model discovery rules;
- required ports and network exposure;
- install, update, stop and uninstall behavior;
- data, cache and log directories;
- health and readiness checks;
- cancellation and crash-recovery semantics;
- license and model redistribution status; and
- a sanitized capability response for the dashboard.

The dashboard recognizes three states:

- `available`: installed, ready and safe to operate;
- `planned`: known extension boundary but not shipped; and
- `unavailable`: the pack exists for another platform or a required dependency is missing.

Capability state controls presentation only. Every backend route must still authenticate and validate requests independently.

## Planned packs

1. Standard llama.cpp local inference.
2. FTS memory, with optional vector embeddings.
3. Messaging channels and durable timers.
4. Audio transcription and TTS.
5. Song separation and voice conversion.
6. ComfyUI-based image/video workflows.
7. OS-specific virtual microphone routing.

The macOS Full installation remains separate until each feature can cross this boundary without importing private runtime paths or user data.
