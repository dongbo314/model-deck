# Third-party notices

Core Preview does not include model weights, llama.cpp, MLX, ComfyUI, Python environments, audio/video engines, virtual-audio drivers or the private macOS Full runtime.

Runtime dependencies and bundled assets are installed from npm and retain their upstream licenses:

| Component | License | Source |
|---|---|---|
| Next.js | MIT | <https://github.com/vercel/next.js> |
| React and React DOM | MIT | <https://github.com/facebook/react> |
| Noto Sans SC via Fontsource | OFL-1.1 | <https://github.com/fontsource/font-files> |

The bundled Noto Sans SC web font is Copyright Google Inc. and remains available under the SIL Open Font License 1.1. The installed production package retains the complete license text and is included in the container SBOM.

Development dependencies are listed in `package-lock.json`. Binary distributions must generate a complete dependency license report and SBOM from the exact release artifact.
