# Docker Compose deployment

The Docker profile is a Core Preview deployment for Windows x64 with Docker Desktop and Linux x64/arm64 with Docker Engine. The published [`docker.io/esofk/model-deck`](https://hub.docker.com/r/esofk/model-deck) index contains native Linux `amd64` and `arm64` variants; Compose selects the matching architecture automatically.

## Prerequisites

- Docker Desktop with Engine 28.0 or newer on Windows, or Docker Engine 28.3.3 or newer on Linux
- Docker Compose v2 (`docker compose`, not the legacy `docker-compose` command)
- A remote HTTPS OpenAI-compatible provider

## Image tags and release evidence

| Tag | Meaning |
|---|---|
| `0.1.0-alpha.6` | Release-specific tag for this preview |
| `alpha` | Moving tag for the newest alpha preview |
| `latest` | Deliberately not published |

The checked-in Compose file defaults to `docker.io/esofk/model-deck:0.1.0-alpha.6`. Prefer this release-specific tag for repeatable deployments; use `alpha` only when intentionally following the newest preview.

The release workflow builds each architecture on a native hosted runner with BuildKit provenance and an SBOM. It pulls and exercises each platform artifact by immutable digest before merging them into the release index. Provenance records build origin and the SBOM inventories included software; an SBOM is not a vulnerability scan, exploitability assessment or security guarantee.

## Start

From the repository root, create the ignored runtime environment file:

```bash
cp packaging/docker/modeldeck.env.example modeldeck.env
chmod 600 modeldeck.env
```

On PowerShell, the equivalent command is:

```powershell
Copy-Item packaging/docker/modeldeck.env.example modeldeck.env
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls.exe modeldeck.env /inheritance:r /grant:r "${identity}:(M)"
```

Add only the provider credential variables named by `apiKeyEnv` in your provider configuration. Optionally set `MODELDECK_API_KEY` to enable the local OpenAI-compatible API. Never commit `modeldeck.env`. The Unix mode or Windows ACL protects against ordinary accounts, but a Docker or machine administrator can still inspect the values.

Pull and start the published container:

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=50 model-deck
```

Wait until the service is `healthy`, then open the last `Model Deck Core dashboard:` URL printed in the log. The URL contains a browser-session token in its fragment. Treat the URL and logs as sensitive.

## Configure providers

The first start initializes `/var/lib/modeldeck/config/providers.json` in the `modeldeck-data` named volume. Copy it out, edit only metadata, copy it back, and restart:

```bash
docker compose cp model-deck:/var/lib/modeldeck/config/providers.json ./providers.json
# Edit providers.json using resources/providers.example.json as a reference.
docker compose cp ./providers.json model-deck:/var/lib/modeldeck/config/providers.json
docker compose restart model-deck
docker compose logs --tail=50 model-deck
```

Provider keys belong in `modeldeck.env`, not in `providers.json`. Restart after changing `providers.json`. After changing `modeldeck.env`, recreate the container so Compose reloads it:

```bash
docker compose up -d --force-recreate
docker compose logs --tail=50 model-deck
```

Each restart or recreation creates a new Dashboard session URL.

## Build from source

To build the image from the current checkout instead of pulling the published image, use:

```bash
docker compose up --build -d
docker compose ps
```

This is the supported development and source-audit path. It does not prove that the independently published Docker Hub artifact has the same digest; that artifact is verified separately by digest in the release workflow.

## Data and backup

Configuration, personas, state and cache live under `/var/lib/modeldeck` in a named volume. `docker compose down` removes the container and network but preserves that volume.

Create a backup before an upgrade:

```bash
docker compose stop model-deck
docker compose cp model-deck:/var/lib/modeldeck ../modeldeck-backup
```

Stopping first avoids copying files while they are changing. Run `docker compose start model-deck` after a backup if you are not immediately upgrading. The backup can contain private provider endpoints, personas and user data. Store it as sensitive data.

To update to a newer published preview, back up the data first, update the Git checkout so its Compose file selects the intended release, then run:

```bash
git pull --ff-only
docker compose pull
docker compose up -d
docker compose ps
```

If you intentionally maintain a source-built deployment, use `docker compose up --build -d` after updating the checkout instead.

`docker compose down --volumes` permanently deletes the Model Deck named volume. Use it only when you intentionally want to erase all container configuration and data.

## Security boundary

The container runs as the non-root `node` user with a read-only root filesystem, all Linux capabilities dropped, and `no-new-privileges` enabled. Application persistence is limited to the named data volume; two explicit temporary filesystems support runtime scratch data.

The application listens on `0.0.0.0` only inside a detected container. Compose publishes ports with explicit loopback mappings:

```yaml
ports:
  - "127.0.0.1:3000:3000"
  - "127.0.0.1:8080:8080"
```

Do not remove the `127.0.0.1` prefixes, use host networking, or place the service behind a public or LAN reverse proxy. Remove the 8080 mapping if no local client needs the OpenAI-compatible API.

Docker Desktop must use Engine 28.0 or newer because older Engine releases had a localhost port-publishing limitation that could make those ports reachable from the same layer-2 network. Linux deployments require Engine 28.3.3 or newer because that release also fixed a loopback publication issue after a firewalld reload; see the [Docker Engine 28 release notes](https://docs.docker.com/engine/release-notes/28/).

Anyone with Docker administrator access can inspect container environment variables and logs. Do not treat Docker as a secret boundary from a local administrator.

## Preview limitations

- The supported image targets are `linux/amd64` and `linux/arm64`.
- Remote provider URLs must use HTTPS.
- Host-local HTTP providers such as `http://host.docker.internal:*` are rejected in this preview.
- GPU inference, audio/video, MLX/MPS, ComfyUI and virtual microphone integrations are not included.
- The Docker Hub image is published with BuildKit provenance and an SBOM, but it is not currently signed. The SBOM is not a vulnerability scan.
- Hosted Linux CI is not a substitute for a manual acceptance run on every Windows Docker Desktop or Linux distribution combination.

## Troubleshooting

Inspect status and recent logs:

```bash
docker compose ps
docker compose logs --tail=200 model-deck
```

Rebuild after changing source files:

```bash
docker compose up --build -d
```

If the container is unhealthy, confirm that ports 3000 and 8080 are free and that `modeldeck.env` exists. The health check exercises the Dashboard and its internal connection to the controller.

The Dashboard bundles its own Noto Sans SC web font. If Chinese still appears as hexadecimal boxes after upgrading, confirm that the running image is `0.1.0-alpha.6`, force-refresh the page, and check that `/_next/static/media/noto-sans-sc-*.woff2` requests succeed. Installing fonts inside the container does not change fonts available to a host browser.
