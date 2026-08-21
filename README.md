# 蓝老师补习班

蓝老师单人使用的轻量补习班管理系统，提供电脑、iPad 和手机共用的 Responsive Web App。功能开发 Phase 1–8 与正式 UI Phase 1–5 均已完成。

## 主要功能

- 学生资料、科目、常态班、报读历史、转班与结束班级
- 固定课表、实际课程、改期、额外课程、停课与恢复
- 动态点名名单、签名、离线暂存、作废修正及跨班补课
- 常态班月费、缴费状态及统一待开收据队列
- 学校考试、补习班小测及学生成绩历史
- 临时班、报名、点名、一次性缴费与收据
- 完整 ZIP 资料与签名备份导出（暂不支持恢复）
- 可安装 PWA、Service Worker、应用更新提示及应用壳离线准备

## 技术栈

- React 19、TypeScript、Vite
- Supabase Auth、Postgres、RLS、RPC 和 private Storage
- TanStack Query、Vitest、Testing Library、ESLint
- GitHub Pages、GitHub Actions、vite-plugin-pwa

数据库 schema 由 `supabase/migrations/` 管理。前端只使用 Supabase publishable key，禁止提交 Secret Key、Service Role Key、数据库密码或用户密码。

## 本地开发

需要 Git、Node.js 22 LTS、Corepack 和 pnpm。Windows 项目目录为 `F:\Codex Projects\小工具开发`。

```powershell
Set-Location 'F:\Codex Projects\小工具开发'
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

`.env.local` 需要：

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

`.env.local` 已由 `.gitignore` 排除，不应提交。

## 验证

```powershell
pnpm lint
pnpm test
pnpm build
```

三项检查都必须通过后才能发布。

## GitHub Pages 与 PWA

推送 `main` 后，`.github/workflows/deploy-pages.yml` 会依次安装锁定依赖、运行 lint、测试、生产构建，并在全部成功后部署 GitHub Pages。仓库需要配置以下 GitHub Actions secrets：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

应用使用 Hash Router，适合 GitHub Pages 子路径。生产构建会生成 Web App Manifest 和 Service Worker，可安装为 PWA，并在新版本可用时提示更新。PWA 的离线能力不代表所有依赖 Supabase 的业务操作都能离线完成。

详细开发规则与交接信息见 [AGENTS.md](AGENTS.md) 和 [HANDOFF.md](HANDOFF.md)。
