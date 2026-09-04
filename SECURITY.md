# Security policy

## Supported versions

Core Preview is pre-release software. Security fixes are applied to the latest tagged preview only.

## Reporting a vulnerability

Use GitHub private vulnerability reporting for this repository. Do not open a public issue containing exploit details, credentials, private endpoints, databases, logs or user content.

Include the affected version, operating system, reproduction steps and impact. Replace all real provider URLs, tokens, prompts and user data with safe fixtures.

## Deployment boundary

Native Core Preview processes are loopback-only. The supported Docker Compose profile listens on wildcard addresses only inside a detected container and publishes both host ports explicitly on `127.0.0.1`. LAN and public-Internet deployment are unsupported. Do not remove the host-loopback prefixes from `compose.yaml`, use host networking, or place Core behind a LAN or public proxy; those configurations are outside the supported security boundary.

The supported launcher protects controller management routes with an ephemeral token shared only with the dashboard process. Its proxy independently requires a browser-session token delivered in a URL fragment and retained only for that browser tab. Treat the secure launch URL and Docker logs containing it as sensitive. The `/v1/*` API is disabled unless `MODELDECK_API_KEY` is set and is never anonymous. Software running as the same operating-system user, or anyone with Docker administrator access, may still inspect local processes, environment variables, logs or browser state; do not run Core inside an account used by untrusted software.
