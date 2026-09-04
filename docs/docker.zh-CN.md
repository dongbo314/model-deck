# Docker Compose 部署

Docker 配置是面向 Windows x64 Docker Desktop 和 Linux x64 Docker Engine 的核心预览部署方式。它会以 Linux `amd64` 容器运行已经发布的 [`docker.io/esofk/model-deck`](https://hub.docker.com/r/esofk/model-deck) 镜像。首个镜像版本不支持 `linux/arm64`。

## 前置条件

- Windows 使用 Engine 28.0 或更高版本的 Docker Desktop；Linux 使用 Docker Engine 28.3.3 或更高版本
- Docker Compose v2（使用 `docker compose`，而不是旧版 `docker-compose`）
- 一个远程 HTTPS OpenAI 兼容模型提供商

## 镜像标签与发布证据

| 标签 | 含义 |
|---|---|
| `0.1.0-alpha.5` | 当前预览版的固定版本标签 |
| `alpha` | 始终指向最新 alpha 预览版的浮动标签 |
| `latest` | 有意不发布 |

仓库中的 Compose 文件默认使用 `docker.io/esofk/model-deck:0.1.0-alpha.5`。需要可重复部署时应优先使用固定版本标签；只有在明确希望自动跟随最新预览版时，才使用 `alpha`。

发布流水线会为镜像生成 BuildKit provenance（构建来源证明）和 SBOM（软件物料清单）。推送完成后，CI 会按照不可变的镜像摘要（digest）拉取已发布产物，并针对这个确定产物重新执行容器检查，而不是只信任可能变化的标签。provenance 用于记录构建来源，SBOM 用于列出镜像所含软件；SBOM 不等于漏洞扫描、可利用性评估或安全保证。

## 启动

在仓库根目录创建已被 Git 忽略的运行环境文件：

```bash
cp packaging/docker/modeldeck.env.example modeldeck.env
chmod 600 modeldeck.env
```

PowerShell 中的等价命令是：

```powershell
Copy-Item packaging/docker/modeldeck.env.example modeldeck.env
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls.exe modeldeck.env /inheritance:r /grant:r "${identity}:(M)"
```

只添加模型提供商配置中 `apiKeyEnv` 指定的凭据变量。如需启用本地 OpenAI 兼容 API，可以设置 `MODELDECK_API_KEY`。切勿提交 `modeldeck.env`。Unix 文件模式或 Windows ACL 可以防止普通账号读取，但 Docker 管理员或计算机管理员仍可检查这些值。

拉取并启动已发布的容器：

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=50 model-deck
```

等待服务状态变为 `healthy`，然后打开日志中最后一条 `Model Deck Core dashboard:` URL。URL 片段中包含浏览器会话令牌，应将该 URL 和日志视为敏感信息。

## 配置模型提供商

首次启动会在 `modeldeck-data` 命名卷中初始化 `/var/lib/modeldeck/config/providers.json`。将文件复制出来，只编辑元数据，再复制回去并重启：

```bash
docker compose cp model-deck:/var/lib/modeldeck/config/providers.json ./providers.json
# 参考 resources/providers.example.json 编辑 providers.json。
docker compose cp ./providers.json model-deck:/var/lib/modeldeck/config/providers.json
docker compose restart model-deck
docker compose logs --tail=50 model-deck
```

模型提供商密钥应放在 `modeldeck.env` 中，而不是 `providers.json` 中。修改 `providers.json` 后需要重启。修改 `modeldeck.env` 后，需要重新创建容器，Compose 才会载入新环境变量：

```bash
docker compose up -d --force-recreate
docker compose logs --tail=50 model-deck
```

每次重启或重新创建容器都会生成新的控制面板会话 URL。

## 从源码构建

如果希望使用当前检出的源码自行构建，而不是拉取已发布镜像，请执行：

```bash
docker compose up --build -d
docker compose ps
```

这是受支持的开发和源码审查路径，但它不能证明 Docker Hub 上独立发布的产物具有相同摘要；发布流水线会另外按 digest 对远端产物进行复验。

## 数据与备份

配置、角色、状态和缓存都保存在命名卷的 `/var/lib/modeldeck` 下。`docker compose down` 会删除容器和网络，但保留该数据卷。

升级前先创建备份：

```bash
docker compose stop model-deck
docker compose cp model-deck:/var/lib/modeldeck ../modeldeck-backup
```

先停止服务可以避免复制过程中相关文件仍在变化。如果备份后不立即升级，请执行 `docker compose start model-deck`。备份可能包含私有模型提供商地址、角色和用户数据，请按敏感数据保管。

升级到较新的公开预览版时，请先备份数据，再更新 Git 工作副本，让 Compose 文件选中目标版本，然后执行：

```bash
git pull --ff-only
docker compose pull
docker compose up -d
docker compose ps
```

如果有意维护从源码构建的部署，请在更新工作副本后改用 `docker compose up --build -d`。

`docker compose down --volumes` 会永久删除 Model Deck 命名卷。只有在确实要清除全部容器配置和数据时才能使用。

## 安全边界

容器使用非 root 的 `node` 用户运行，根文件系统只读，移除全部 Linux capabilities，并启用 `no-new-privileges`。应用持久化写入仅限命名数据卷；另外提供两个显式临时文件系统用于运行时临时数据。

应用只会在检测到容器环境时，于容器内部监听 `0.0.0.0`。Compose 使用明确的回环映射发布端口：

```yaml
ports:
  - "127.0.0.1:3000:3000"
  - "127.0.0.1:8080:8080"
```

请勿删除 `127.0.0.1` 前缀、使用 host 网络，或通过公网/局域网反向代理暴露服务。如果没有本地客户端需要 OpenAI 兼容 API，可以删除 8080 的映射。

Windows Docker Desktop 必须使用 Engine 28.0 或更高版本，因为旧版 Engine 存在 localhost 端口发布限制，同一二层网络内的其他主机可能访问这些端口。Linux 部署要求 Engine 28.3.3 或更高版本；该版本还修复了 firewalld 重载后回环端口可能被外部访问的问题，详见 [Docker Engine 28 发行说明](https://docs.docker.com/engine/release-notes/28/)。

拥有 Docker 管理员权限的人可以检查容器环境变量和日志。不要把 Docker 当成针对本机管理员的秘密隔离边界。

## 预览版限制

- 受支持的镜像目标是 `linux/amd64`。
- 远程模型提供商 URL 必须使用 HTTPS。
- 当前预览版会拒绝 `http://host.docker.internal:*` 等运行在宿主机上的 HTTP 服务。
- 不包含 GPU 推理、音视频、MLX/MPS、ComfyUI 或虚拟麦克风集成。
- Docker Hub 镜像会随附 BuildKit provenance 和 SBOM，但目前尚未签名；SBOM 不等于漏洞扫描。
- 托管 Linux CI 不能代替每一种 Windows Docker Desktop 或 Linux 发行版组合上的人工验收。

## 故障排查

检查状态和近期日志：

```bash
docker compose ps
docker compose logs --tail=200 model-deck
```

修改源码后重新构建：

```bash
docker compose up --build -d
```

如果容器状态为不健康，请确认 3000 和 8080 端口没有被占用，并且 `modeldeck.env` 已存在。健康检查会同时验证控制面板及其到控制器的内部连接。
