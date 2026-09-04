# Model Deck Core

[English](README.md) | [简体中文](README.zh-CN.md)

Model Deck Core 是面向 OpenAI 兼容模型提供商和可复用角色的本地跨平台控制中心。Windows、Linux 和 macOS 用户可以通过统一的控制面板和本地 API 使用模型服务，而无须在程序中捆绑模型权重、私有凭据或特定硬件运行时。

> **当前状态：** `0.1.0-alpha.5` 核心预览版。远程模型提供商链路和可直接拉取的 Docker Compose 部署已经实现，并通过 CI 验证。首个 Docker Hub 镜像仅支持 `linux/amd64`；本地推理和媒体能力包仍在路线图中，尚未作为已完成功能提供。

## 版本划分

| 版本 | 用途 | 包含内容 |
|---|---|---|
| 核心预览版（本仓库） | 面向 Windows、Linux 和 macOS 的可移植基础版本 | 控制面板、OpenAI 兼容路由、模型别名、角色、本地 API、平台诊断工具 |
| macOS 完整版 | 现有工作站安装版本 | 核心功能，以及已在本地配置的音频、视频、MLX/MPS、ComfyUI 和虚拟音频工作流 |
| 能力包 | 后续独立安装的模块 | 标准 llama.cpp、记忆、渠道、音频/TTS、歌曲、视频和虚拟麦克风 |

现有 macOS 完整版将独立维护。本仓库依据明确的文件白名单整理，不包含从现有环境复制的运行状态、模型权重、用户数据库、媒体文件、日志或凭据。

## 默认安全策略

- 原生运行的控制器和控制面板仅监听本机回环地址。
- 受支持的 Docker 配置只在容器内部使用通配监听，并将两个宿主机端口明确发布到 `127.0.0.1`。
- 核心预览版不提供局域网访问。
- 受支持的启动器会分别生成临时控制器令牌和浏览器会话令牌。
- `/v1/*` 本地 API 默认关闭；只有设置 `MODELDECK_API_KEY` 后才会启用，并且始终要求使用该 Bearer 令牌。
- 模型提供商 API 密钥从环境变量读取；`providers.json` 只保存元数据。
- 用户配置和数据保存在安装目录之外。
- 受支持的构建和启动脚本会关闭框架遥测；Core 本身不进行应用遥测，也不会自动下载模型。
- 远程模型提供商 URL 必须使用 HTTPS；只有本机回环开发服务可以使用 HTTP。

请勿通过路由器、反向代理或非回环容器端口发布规则，将 3000 或 8080 端口暴露到局域网或公网。报告安全漏洞前请阅读 [SECURITY.md](SECURITY.md)。

## 系统要求

- Windows x64、Linux x64，或 macOS arm64/x64
- 至少一个用于对话的 OpenAI 兼容模型提供商

源码安装需要 Node.js 22.13 或更高版本，以及 npm 10 或更高版本。也可以在 Windows x64 上使用 Engine 28.0 或更高版本的 Docker Desktop，或在 Linux x64 上使用 Docker Engine 28.3.3 或更高版本，并配合 Docker Compose v2；当前预览容器以 `linux/amd64` 运行。

Windows ARM64 或许可以通过 x64 版 Node.js 运行，但它不是首发版本的验证目标。

## 快速开始

```bash
git clone https://github.com/dongbo314/model-deck.git
cd model-deck
npm ci
npm run build
npm run init
```

查找生成的模型提供商配置文件：

```bash
npm run doctor
node bin/modeldeck.mjs config-path
```

参考 [resources/providers.example.json](resources/providers.example.json) 编辑 `providers.json`。不要将 API 密钥写入该文件；请设置 `apiKeyEnv` 所指定的环境变量。

在准备运行 Core 的终端中，通过隐藏输入方式设置模型提供商凭据，然后启动两个本地服务。Windows 和 Linux 指南中提供了对应平台的示例。

```bash
npm start
```

打开 `npm start` 输出的安全控制面板 URL。URL 片段中携带一次性会话令牌，页面加载后会从地址栏中移除。显式启用可选的 OpenAI 兼容 API 后，可以通过 <http://127.0.0.1:8080/v1> 访问。

Windows PowerShell 和 Linux 的具体说明分别见 [docs/windows.md](docs/windows.md) 和 [docs/linux.md](docs/linux.md)。

GitHub Release 中的 ZIP 和 tar.gz 文件是源码发行包，而不是预编译安装程序。解压后，需要在目标系统上执行同样的 `npm ci && npm run build` 步骤。每个版本均包含文件清单和 `SHA256SUMS`；详情见 [docs/release-process.md](docs/release-process.md)。

## Docker Compose 预览版

Docker Compose 配置默认使用已经发布到 Docker Hub 的 [`docker.io/esofk/model-deck`](https://hub.docker.com/r/esofk/model-deck) 镜像。在 Linux 或 macOS 中，先复制已被 Git 忽略的环境变量模板，并将权限限制为仅当前用户可读写；只添加模型提供商配置所引用的凭据，然后拉取镜像并启动服务。所有 Windows 场景（包括操作 Windows 文件的 Git Bash 和 WSL）都应使用完整 Docker 中文指南中的 PowerShell 与 NTFS ACL 操作。

```bash
cp packaging/docker/modeldeck.env.example modeldeck.env
chmod 600 modeldeck.env
docker compose pull
docker compose up -d
docker compose logs --tail=50 model-deck
```

当前版本的固定标签是 `0.1.0-alpha.5`；浮动标签 `alpha` 始终指向最新预览版。项目有意不发布 `latest` 标签。首个公开镜像仅支持 `linux/amd64`。如果希望使用当前检出的源码自行构建，请改用 `docker compose up --build -d`。

打开日志中最后一条 `Model Deck Core dashboard:` URL。该 URL 及包含它的日志都应视为敏感信息。

首次启动会在命名卷中创建空的模型提供商配置。将它复制到当前目录，参考 [resources/providers.example.json](resources/providers.example.json) 编辑，再复制回容器并重启：

```bash
docker compose cp model-deck:/var/lib/modeldeck/config/providers.json ./providers.json
# 编辑 providers.json，但不要在其中写入凭据。
docker compose cp ./providers.json model-deck:/var/lib/modeldeck/config/providers.json
docker compose restart model-deck
docker compose logs --tail=50 model-deck
```

3000 和 8080 端口只会发布到宿主机的 `127.0.0.1`。请勿改成不带地址限定的 `3000:3000` 或 `8080:8080`。如果不需要本地 API，可以删除 8080 的端口映射。首个容器预览版支持远程 HTTPS 模型提供商；`host.docker.internal` 等宿主机本地 HTTP 运行时尚未作为受支持的模型目标提供。

数据备份、升级、停止和故障排查见 [Docker 中文指南](docs/docker.zh-CN.md)，英文版本见 [docs/docker.md](docs/docker.md)。

## 模型提供商配置

`providers.json` 使用公开模型别名，因此客户端无须知道上游提供商的内部模型 ID。

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

配置优先级如下：

```text
内置默认值 < 平台用户目录 < 环境变量
```

如需便携式或测试安装，可设置 `MODELDECK_HOME`。更细粒度的覆盖变量包括 `MODELDECK_CONFIG_DIR`、`MODELDECK_DATA_DIR`、`MODELDECK_STATE_DIR` 和 `MODELDECK_CACHE_DIR`。

## 本地 API

本地 API 默认关闭。启动 Core 前，请设置一个强度足够的本地令牌：

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

启用 `/v1/*` 后，Bearer 身份验证始终是必需的。切勿将生产环境凭据写入会提交到源码仓库的命令中。

`/api/*` 管理接口使用独立的随机运行时令牌，仅供随附的控制面板使用。控制面板代理还要求启动时输出的浏览器会话令牌。启动器不会把模型提供商凭据或其他无关的宿主机秘密传递给控制面板进程。

## 各平台数据目录

| 数据 | Linux | Windows | macOS |
|---|---|---|---|
| 配置 | `$XDG_CONFIG_HOME/modeldeck` | `%APPDATA%\ModelDeck` | `~/Library/Application Support/ModelDeck/config` |
| 用户数据 | `$XDG_DATA_HOME/modeldeck` | `%LOCALAPPDATA%\ModelDeck\data` | `~/Library/Application Support/ModelDeck/data` |
| 状态 | `$XDG_STATE_HOME/modeldeck` | `%LOCALAPPDATA%\ModelDeck\state` | `~/Library/Application Support/ModelDeck/state` |
| 缓存 | `$XDG_CACHE_HOME/modeldeck` | `%LOCALAPPDATA%\ModelDeck\cache` | `~/Library/Caches/ModelDeck` |

如果未设置 XDG 环境变量，将使用用户主目录下对应的标准目录。

## 能力包路线图

| 能力包 | Windows | Linux | macOS | 核心预览版状态 |
|---|---|---|---|---|
| 标准 llama.cpp | 计划支持 CUDA/Vulkan | 计划支持 CUDA/Vulkan | 计划支持 Metal | 未捆绑 |
| FTS/向量记忆 | 优先支持 FTS | 优先支持 FTS | 优先支持 FTS | 计划中 |
| 渠道和定时器 | 计划中 | 计划中 | 计划中 | 未捆绑 |
| 音频和 TTS | 需要 WASAPI 后端 | 需要 PipeWire/PulseAudio 后端 | 可选 CoreAudio/MLX | 未捆绑 |
| 歌曲工作流 | PyTorch/ffmpeg 能力包 | PyTorch/ffmpeg 能力包 | 现有完整工作站链路 | 未捆绑 |
| 视频/ComfyUI | CUDA 能力包 | CUDA/ROCm 能力包 | 现有 MPS/Metal 链路 | 未捆绑 |
| 虚拟麦克风 | 操作系统专用驱动集成 | PipeWire/JACK 集成 | 现有 CoreAudio 链路 | 未捆绑 |

“计划中”并不代表已经兼容。只有当某个能力包通过对应平台的安装、生命周期、升级和真实硬件测试后，才会被标记为受支持。

## 开发

```bash
npm ci
npm run check
npm run build
npm run dev
```

测试套件使用本地模拟的 OpenAI 兼容上游服务，以及路径中包含空格和中文字符的临时目录；测试不需要任何真实凭据。

架构和扩展边界见 [docs/architecture.md](docs/architecture.md) 与 [docs/capability-packs.md](docs/capability-packs.md)。

## 发布与证据边界

源码构建通过并不能证明打包后的应用可以正常工作。Core 版本发布要求：

1. Linux、Windows 和 macOS CI 检查通过。
2. 在三个托管操作系统上完成控制器和控制面板的全链路冒烟测试。
3. 通过模拟模型提供商验证远程模型路由。
4. 完成秘密信息和个人路径扫描。
5. 提供发行包文件清单和校验和。
6. 在托管 Linux 环境中完成基于源码构建的非 root Docker Compose 冒烟测试，包括健康状态、回环端口发布和数据卷持久化检查。
7. 发布带有 BuildKit provenance（构建来源证明）和 SBOM（软件物料清单）的 `linux/amd64` 镜像；发布后不依赖可变标签，而是按不可变镜像摘要（digest）重新拉取并完成运行复验。

GitHub 附件仍是仅包含源码的开发者预览包，Docker Hub 则提供预构建的 Core 容器镜像。provenance 和 SBOM 可以提升构建可追溯性，但 SBOM 只是组件清单，不等同于漏洞扫描，也不是安全保证。签名的 Windows 安装程序和打包后的 Linux 服务仍属于后续发布门槛。npm tarball 不是受支持的分发格式。

## 许可证

Model Deck Core 采用 [Apache License 2.0](LICENSE) 授权，不包含任何模型权重。相关说明见 [MODEL_LICENSES.md](MODEL_LICENSES.md) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
