# Third-party notices

Core Preview does not include model weights, llama.cpp, MLX, ComfyUI, Python environments, audio/video engines, virtual-audio drivers or the private macOS Full runtime.

Runtime JavaScript dependencies are installed from npm and retain their upstream licenses:

| Component | License | Source |
|---|---|---|
| Next.js | MIT | <https://github.com/vercel/next.js> |
| React and React DOM | MIT | <https://github.com/facebook/react> |

Development dependencies are listed in `package-lock.json`. Binary distributions must generate a complete dependency license report and SBOM from the exact release artifact.
