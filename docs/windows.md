# Windows Core Preview

## Supported target

Windows 11 x64 with Node.js 22.13 or newer. Windows ARM64 is not a first-release validation target.

## Setup in PowerShell

```powershell
git clone https://github.com/dongbo314/model-deck.git
Set-Location model-deck
npm ci
npm run build
npm run init
node .\bin\modeldeck.mjs config-path
```

Edit the generated `providers.json`, then set the credential in the same PowerShell session:

```powershell
$providerSecret = Read-Host "Provider API key" -AsSecureString
$env:MODELDECK_PROVIDER_TEAM_KEY = [System.Net.NetworkCredential]::new('', $providerSecret).Password
npm start
```

The prompt keeps the key out of PowerShell history. The environment variable still contains plaintext for the lifetime of the process, so use a dedicated trusted Windows account and close the terminal after use.

Open the secure Dashboard URL printed by `npm start`.

Core Preview does not install a Windows service, firewall rule, virtual-audio driver or GPU runtime. Closing the terminal stops both child processes. A signed installer and current-user service wrapper are future release gates.
