# Security policy

## Supported versions

Core Preview is pre-release software. Security fixes are applied to the latest tagged preview only.

## Reporting a vulnerability

Use GitHub private vulnerability reporting for this repository. Do not open a public issue containing exploit details, credentials, private endpoints, databases, logs or user content.

Include the affected version, operating system, reproduction steps and impact. Replace all real provider URLs, tokens, prompts and user data with safe fixtures.

## Deployment boundary

Core Preview is loopback-only. LAN and public-Internet deployment are unsupported. If you deliberately place it behind a proxy, you are responsible for authentication, TLS, request limits and origin validation; that configuration is outside the supported security boundary.

The supported launcher protects controller management routes with an ephemeral token shared only with the dashboard process. Its proxy independently requires a browser-session token delivered in a URL fragment and retained only for that browser tab. Treat the secure launch URL as sensitive. The `/v1/*` API is disabled unless `MODELDECK_API_KEY` is set and is never anonymous. Software running as the same operating-system user may still inspect local processes or browser state; do not run Core inside an account used by untrusted software.
