# 蓝老师补习班

单人使用的私人补习班管理系统。当前代码完成 Phase 1 基础工程与 Phase 2 学生、科目、常态班、报读关系，不包含 Phase 3 及之后的业务功能。

## 全新 Windows 电脑

需要先安装：

- [Git](https://git-scm.com/download/win)
- [Node.js 22 LTS](https://nodejs.org/)
- [GitHub CLI](https://cli.github.com/)（只在需要推送或检查部署时使用）

Clone 项目：

```powershell
git clone https://github.com/WB0801/Mr.BlueTuition.git
Set-Location Mr.BlueTuition
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
```

## 本地配置与启动

1. 复制 `.env.example` 为 `.env.local`。
2. 填入 Supabase Project URL 和前端可公开使用的 publishable key。
3. 运行：

```powershell
pnpm dev
```

不要把 Supabase Secret Key 或旧版 Service Role Key 放入 `.env.local`、前端代码或 GitHub Secrets。前端只使用 publishable key。

现有生产 Supabase 已完成所有 migrations。换电脑继续开发时不要重新执行旧 migrations；只有重建全新 Supabase 项目时，才按文件名顺序执行 `supabase/migrations/` 内全部 SQL，并建立唯一登录账号、关闭公开注册。

## 验证

```powershell
pnpm lint
pnpm test
pnpm build
```

## GitHub Pages

仓库需要在 Settings → Pages 中选择 GitHub Actions，并建立以下 repository secrets：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

应用使用 Hash Router，适合 GitHub Pages 静态托管和子页面刷新。

推送到 `main` 后，GitHub Actions 会自动测试、构建并发布。生产 migration 必须先于依赖它的前端执行。

## 当前范围

- Phase 1：登录、基础路由、首页、GitHub Pages 部署
- Phase 2：学生、科目、常态班、报读与历史关系

Session、点名、学费、收据、成绩、临时班、备份与 PWA 仍属于后续 Phase。

跨电脑继续开发前请阅读 [AGENTS.md](AGENTS.md) 和 [HANDOFF.md](HANDOFF.md)。
