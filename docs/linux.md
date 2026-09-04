# Linux Core Preview

## Supported target

Linux x64 or arm64 with Node.js 22.13 or newer. The first local-inference target will be Linux x64 with NVIDIA CUDA, but Core Preview itself requires no GPU. The published Docker image provides native `linux/amd64` and `linux/arm64` variants.

## Setup

```bash
git clone https://github.com/dongbo314/model-deck.git
cd model-deck
npm ci
npm run build
npm run init
node bin/modeldeck.mjs config-path
```

Edit the generated `providers.json`, then set the credential for the current shell:

```bash
read -rsp "Provider API key: " MODELDECK_PROVIDER_TEAM_KEY && echo
export MODELDECK_PROVIDER_TEAM_KEY
npm start
```

The hidden prompt keeps the key out of shell history. The environment variable still contains plaintext for the lifetime of the process, so use a dedicated trusted user account and close the shell after use.

Open the secure Dashboard URL printed by `npm start`.

Core Preview does not install a systemd service, firewall rule, GPU runtime or audio service. Closing the terminal stops both child processes. A user-level systemd unit will be added after packaged upgrade and rollback tests exist.
