# 跨电脑开发交接

更新时间：2026-08-13（Asia/Kuala_Lumpur）

## 当前状态

- Phase 1：已完成、部署并在电脑、iPad、手机验收通过。
- Phase 2：已完成、部署并在电脑、iPad、手机验收通过。
- Phase 3：本地实现与自动化验证已完成；生产 migration 已执行且资料完整性检查通过，尚未发布、尚未实际验收。
- GitHub repository：<https://github.com/WB0801/Mr.BlueTuition>
- 生产分支：`main`
- 最后已验收功能提交：`2a42837`（Allow optional student details）
- 线上网站：<https://wb0801.github.io/Mr.BlueTuition/>
- GitHub Pages：由 `.github/workflows/deploy-pages.yml` 在推送 `main` 后自动测试、构建和发布；最近发布成功。
- Supabase Project URL：`https://ldobzxvxccdowkvwgydt.supabase.co`
- Supabase Auth、RLS 与公开注册关闭状态已经过实际验收。
- 生产数据库已有真实使用资料；不要重置、清空或重新建立现有 Supabase 项目。

## 已完成 migrations

生产 Supabase 已依次执行：

1. `202608130001_phase1_auth_foundation.sql`
2. `202608130002_phase2_students_classes_enrollments.sql`
3. `202608130003_optional_student_details.sql`
4. `202608130004_phase3_schedules_sessions.sql`

这些 migration 已在生产执行，不要编辑旧文件。后续 schema 变化必须新增 migration。

## 当前待办：Phase 3 部署与验收

本地新增 migration：

4. `202608130004_phase3_schedules_sessions.sql`（已于 2026-08-14 在生产执行）

生产 migration 已执行成功；检查结果为学生 3、科目 1、班级 2、报读 3、首条课表规则 2，课表迁移错误 0、断裂报读关系 0。下一步是推送含 Phase 3 前端的 `main`，等待 GitHub Pages 发布后进行实际验收。

Phase 3 本地实现只包括：

Phase 3 目标只包括：

- `class_schedule_rules` 与课表历史。
- 根据固定课表按需、滚动且幂等地产生实际 `class_sessions`。
- 今天／本周／历史 Session 基础查看。
- 单次改期与多次改期历史。
- 从某堂开始永久修改未来课表。
- 单堂停课、单堂恢复上课与全日停课（底层状态为 `cancelled`，无理由字段；不做全日恢复）。
- 额外补课 Session。

Phase 3 不实现签到、签名、学费或成绩。当前 `classes` 的 `weekday`、`start_time`、`end_time` 可迁移成第一条 schedule rule；稳定关系继续使用 `classes.id`。

Phase 3 结构决定：`class_schedule_rules` 是唯一课表真相来源。同班数据库层可有多条并行 weekly schedule slots；当前 UI 仍只维护一条。regular Session 防重复使用 `schedule_rule_id + original_start_at`，不使用整个班级加教学周。`classes` 的旧时间字段由 `schedule_summary_rule_id` 明确指向并通过数据库 transaction 保持一致，只作兼容镜像。

## 新 Windows 电脑开始步骤

1. 安装 Git、Node.js 22 LTS 和 GitHub CLI。
2. Clone 并进入项目：

```powershell
git clone https://github.com/WB0801/Mr.BlueTuition.git
Set-Location Mr.BlueTuition
```

3. 启用 repository 指定的 pnpm：

```powershell
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
```

4. 建立本机配置：

```powershell
Copy-Item .env.example .env.local
```

在 `.env.local` 填入 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_PUBLISHABLE_KEY`。Project URL 已记录在上方；publishable key 可从 Supabase Dashboard 的 **Connect → React → Vite** 重新复制。

5. 验证并启动：

```powershell
pnpm lint
pnpm test
pnpm build
pnpm dev
```

6. 需要推送或检查部署时运行 `gh auth login`，再确认 `gh auth status`。

现有生产 Supabase 已执行全部 migration。换电脑本地开发不需要重新执行它们；只有新增 migration 时才先在 Supabase 执行，再发布对应前端。

## GitHub 不会同步的资料

- `.env.local`：故意被 `.gitignore` 排除。需要在新电脑重建；不要用 U 盘明文长期保存，优先从 Supabase Dashboard 重新复制 publishable key。
- GitHub、Supabase、蓝老师网站登录密码及数据库密码：应保存在密码管理器，不进入 repository 或聊天。
- GitHub CLI 和 Supabase Dashboard 的登录状态：新电脑需要重新登录。
- `node_modules`、`dist` 和本机缓存：不会同步，也不需要带走，运行 `pnpm install` / `pnpm build` 可重建。
- 当前旧电脑没有未提交的项目文件；业务数据在 Supabase，不在本机 repository。

新电脑上的 Codex 应先阅读 `AGENTS.md`、`HANDOFF.md` 和原始开发规格，再检查 `git status` 与远程 `main`。Phase 3 尚待生产 migration、发布和实际验收；不要开始 Phase 4。
