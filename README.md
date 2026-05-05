# 世界资讯 + AI 资产影响分析 MVP

局域网可用的简易 Web：聚合 **RSS、可选 Finnhub 要闻、FRED 宏观快照**（服务端去重与缓存）；英文标题/摘要可批量译为中文并列展示。点击一条资讯后由服务端调用 **OpenAI 兼容 API**，输出情绪倾向、影响链路推演及 A 股/美股可能映射等。**不构成投资建议。**

## 环境要求

- Node.js 18+（推荐当前 LTS）
- 可访问所选大模型 API 的网络环境

## 配置

1. 复制环境变量模板：

   ```bash
   copy .env.example .env.local
   ```

2. 编辑 `.env.local`：
   - **必填（AI 分析与翻译）**：`OPENAI_API_KEY`；可选 `OPENAI_BASE_URL`、`OPENAI_MODEL`。
   - **可选**：`FINNHUB_API_KEY`（Finnhub 综合要闻）、`FRED_API_KEY`（FRED 宏观序列快照）。

## 本地开发（仅本机）

```bash
npm install
npm run dev
```

浏览器打开：<http://localhost:3001>

## 局域网访问（同 WiFi 手机/其他电脑）

1. 在本机启动（监听所有网卡）：

   ```bash
   npm run dev:lan
   ```

2. 查询本机在局域网中的 IPv4 地址（Windows）：

   ```bash
   ipconfig
   ```

   在输出中找到当前使用的网络适配器下的 **IPv4 地址**，例如 `192.168.1.23`。

3. 在同一局域网的其他设备浏览器中访问：

   `http://<你的IPv4>:3001`  
   例如：`http://192.168.1.23:3001`

4. **Windows 防火墙**：若无法访问，可为端口 **3001** 添加入站允许规则，或在首次访问时按提示允许 Node/Next 通过防火墙。

### 开发模式「一直刷新中」或控制台 HMR / 字体 403

Next.js 16 开发环境会校验部分 `/_next` 资源来源：`localhost` 与 `127.0.0.1` 被视为不同站点。若你用 **`npm run dev:lan`** 却打开 **`http://127.0.0.1:3001`**，或用 **手机访问局域网 IP**，可能被拦截。

已在 [`next.config.ts`](next.config.ts) 中默认加入 `allowedDevOrigins: ['127.0.0.1']`。若手机访问仍异常，在 `.env.local` 增加：

`NEXT_DEV_ALLOWED_ORIGINS=你的电脑IPv4`（多个用英文逗号分隔），然后**重启** `npm run dev` / `npm run dev:lan`。

也可统一只用 **`http://localhost:3001`**（本机）访问，避免混用地址。

## 生产构建（可选）

```bash
npm run build
npm run start:lan
```

监听 `0.0.0.0:3001`，适合本机验收；公网前建议前面加 **Nginx / Caddy** 做 HTTPS 与反代。

---

## 部署（可以，且必须用带 Node 的运行环境）

本项目有 **服务端 API**（`/api/news` 拉 RSS、`/api/analyze` 调大模型），**不能**当成纯静态站点丢到「只托管 HTML」的空间里，需要能跑 Node 的环境。

### 方式一：自带服务器 / VPS（通用）

1. 安装 Node.js 20+，clone 项目到服务器。
2. 配置环境变量（与本地相同，可用 `export` 或 systemd `Environment=`）：
   - `OPENAI_API_KEY`（必填）
   - `OPENAI_BASE_URL`、`OPENAI_MODEL`（可选）
   - `FINNHUB_API_KEY`、`FRED_API_KEY`（可选，与本地一致）
3. 构建并启动：

   ```bash
   npm ci
   npm run build
   npm run start:lan
   ```

4. 防火墙放行 **3001**，或用 Nginx 反代到 `127.0.0.1:3001` 并配置 TLS 证书。

### 方式二：Docker

需本机已安装 Docker。在项目根目录：

```bash
docker build -t news-impact-mvp .
docker run --rm -p 3001:3001 ^
  -e OPENAI_API_KEY=你的密钥 ^
  -e OPENAI_BASE_URL=https://api.openai.com/v1 ^
  -e OPENAI_MODEL=gpt-4o-mini ^
  news-impact-mvp
```

Linux/macOS 可把 `^` 换成行尾 `\`。镜像内已 `output: "standalone"`，`PORT=3001`、`HOSTNAME=0.0.0.0`。

### 方式三：Vercel 等 Serverless

可将仓库关联 [Vercel](https://vercel.com) 导入项目，在控制台配置同样的环境变量。

**注意**：无服务器函数有**执行时间上限**（免费档往往约 10–60 秒级）。首次请求 `/api/news` 会并行抓取多路海外 RSS，若在目标地区网络较慢，可能偶发超时；可换 Pro 档、或改用境外构建机/自有 VPS 更稳。

### 方式四：Cloudflare Pages（Next.js 适配）

本项目已改为 **OpenNext Cloudflare 适配器**（Next.js 16 推荐）：

- API Route 已声明 `runtime = "edge"`
- 已移除 Node `crypto` 依赖，改为 Edge 兼容 ID 生成
- 已提供脚本：`npm run build:cf`
- 已包含 [`open-next.config.ts`](open-next.config.ts) 与 [`wrangler.jsonc`](wrangler.jsonc)

Cloudflare 构建/部署常用命令：

- 本地预览：`npm run preview:cf`
- 构建：`npm run build:cf`
- 部署：`npm run deploy:cf`

在 Cloudflare Pages 项目里配置环境变量（Production/Preview）：

- `OPENAI_API_KEY`（必填）
- `OPENAI_BASE_URL`、`OPENAI_MODEL`（可选）
- `FINNHUB_API_KEY`、`FRED_API_KEY`（可选）

说明：本地 Docker/VPS 仍可继续用 `npm run build` + `output: "standalone"`；Cloudflare 构建由 OpenNext 适配器处理。`wrangler.jsonc` 里的 `name`、R2 bucket 名可按需改成你自己的命名。

### 部署后自检

- 浏览器打开：`https://你的域名/`（或 `http://服务器IP:3001`）
- 直接访问：`/api/news`，应返回 JSON 列表

### GitHub Actions（CI + VPS 自动部署）

仓库已包含：

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml)：每次 push / PR 自动执行 `npm ci`、`npm run lint`、`npm run build`
- [`.github/workflows/deploy-vps.yml`](.github/workflows/deploy-vps.yml)：`main` 分支更新后自动 SSH 到 VPS，执行拉取并 `docker compose up -d --build`

首次在 VPS 初始化可用：

```bash
chmod +x scripts/vps-bootstrap.sh
./scripts/vps-bootstrap.sh <你的仓库HTTPS地址> /opt/news-impact-mvp
```

自动部署前，请在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 添加：

- `VPS_HOST`：VPS 公网 IP 或域名
- `VPS_USER`：SSH 用户名（如 `root` 或部署专用用户）
- `VPS_SSH_KEY`：私钥全文（PEM/OpenSSH）
- `VPS_PORT`：可选，默认 `22`
- `VPS_APP_DIR`：可选，默认 `/opt/news-impact-mvp`

部署工作流会在服务器执行：

```bash
cd $VPS_APP_DIR
git fetch --all --prune
git checkout main
git reset --hard origin/main
docker compose -f docker-compose.prod.yml up -d --build
```

## API 说明

- `GET /api/news`：新闻列表；`GET /api/news?refresh=1` 强制绕过服务端短缓存并重新拉取 RSS。
- `POST /api/analyze`：请求体 JSON 包含 `title`（必填），可选 `summary`、`link`、`contentSnippet`。返回 `{ analysis }` 或错误信息。

## 免责声明

本工具输出由大模型基于公开新闻文本生成，可能存在错误、遗漏或过时信息，**不构成任何形式的投资建议**。使用请遵守当地法律法规与新闻源使用条款。
