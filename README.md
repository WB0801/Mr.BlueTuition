# 蓝老师补习班

单人使用的私人补习班管理系统。当前代码完成 Phase 1 基础工程，不包含 Phase 2 及之后的业务功能。

## 本地启动

1. 复制 `.env.example` 为 `.env.local`。
2. 填入 Supabase Project URL 和前端可公开使用的 publishable key。
3. 在 Supabase 执行 `supabase/migrations/202608130001_phase1_auth_foundation.sql`。
4. 在 Supabase Authentication 建立蓝老师的 Email + Password 账户，并关闭公开注册。
5. 运行：

```bash
pnpm install
pnpm dev
```

不要把 Supabase Secret Key 或旧版 Service Role Key 放入 `.env.local`、前端代码或 GitHub Secrets。前端只使用 publishable key。

## 验证

```bash
pnpm lint
pnpm test
pnpm build
```

## GitHub Pages

仓库需要在 Settings → Pages 中选择 GitHub Actions，并建立以下 repository secrets：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

应用使用 Hash Router，适合 GitHub Pages 静态托管和子页面刷新。
