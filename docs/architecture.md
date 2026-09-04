# Architecture

Model Deck Core has four boundaries:

```text
Browser dashboard
      |
      | same-origin dashboard proxy
      v
Next.js server -----> Core controller ----> OpenAI-compatible HTTPS providers
                           |
                           | ephemeral management token
      |
      +----> platform user configuration and persona data
      |
      +----> future capability-pack contract
```

## Dashboard

The Next.js dashboard is a working surface, not the final security boundary. Browser requests use a narrow same-origin proxy and must include a second ephemeral browser-session token delivered in the launch URL fragment. The launcher gives the proxy a distinct controller management token but removes configured provider credentials and unrelated host secrets from the dashboard process. The dashboard reads runtime capabilities from the controller and never infers host features from the browser operating system.

All primary panels stay mounted while the user changes tabs, so an active chat request is cancelled only by an explicit Stop action or by closing the page.

## Controller

The controller uses Node's built-in HTTP server. Native launches bind directly to loopback. The supported Docker launcher may bind inside its isolated container while Compose publishes only to the host loopback; the Dashboard still connects to the controller over the container's loopback interface. Its responsibilities are:

- validating provider metadata;
- mapping public model aliases to upstream model identifiers;
- injecting an optional persona system prompt;
- forwarding OpenAI-compatible chat requests without logging credentials;
- storing persona definitions outside the installation directory; and
- publishing an explicit capability document.

Remote HTTP providers are rejected. Loopback HTTP providers are allowed for testing or a locally managed gateway.

## Configuration and secrets

Provider metadata is JSON. Credentials are read only from environment variables named by `apiKeyEnv`. Configuration files never contain API keys. Management routes require a separate random runtime token. `/v1/*` is disabled unless `MODELDECK_API_KEY` is set and always requires that Bearer token when enabled.

`MODELDECK_HOME` provides deterministic portable paths for CI and development. Normal installations follow XDG, Windows AppData and macOS Application Support conventions.

## Process lifecycle

The cross-platform CLI owns the controller and dashboard as direct child processes. It does not scan the operating-system process table, send signals to negative process groups or reuse PID files from unrelated processes.

Formal service installers will be added only when their stop, upgrade and rollback behavior is covered on the target operating system.

## Evidence boundary

Core CI proves source installation, unit/integration tests, build and controller behavior on hosted runners. It does not prove GPU performance, driver installation, audio routing or third-party provider availability.
