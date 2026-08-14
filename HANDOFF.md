# 跨电脑开发交接

更新时间：2026-08-14（Asia/Kuala_Lumpur）

## 当前状态

- Phase 1：已完成、部署并在电脑、iPad、手机验收通过。
- Phase 2：已完成、部署并在电脑、iPad、手机验收通过。
- Phase 3：已完成、部署并在电脑、iPad、手机验收通过。
- Phase 4：已完成、部署并通过实际验收；离线签名恢复保留现有实现并由自动化测试覆盖，本阶段未人工实测且不作为阻塞项。
- GitHub repository：<https://github.com/WB0801/Mr.BlueTuition>
- 生产分支：`main`
- 最后已验收功能提交：`73c7fd2`（Fix schedule time layout and formatting）
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
5. `202608140005_phase4_attendance_signatures.sql`

这些 migration 已在生产执行，不要编辑旧文件。后续 schema 变化必须新增 migration。

## Phase 3 完成状态

`202608130004_phase3_schedules_sessions.sql` 已于 2026-08-14 在生产执行。执行后的完整性检查结果为学生 3、科目 1、班级 2、报读 3、首条课表规则 2，课表迁移错误 0、断裂报读关系 0。

已实现并实际验收：

- `class_schedule_rules` 与课表历史。
- 根据固定课表按需、滚动且幂等地产生实际 `class_sessions`。
- 今天／本周／历史 Session 基础查看。
- 单次改期与多次改期历史。
- 从某堂开始永久修改未来课表。
- 单堂停课、单堂恢复上课与全日停课（底层状态为 `cancelled`，无理由字段；不做全日恢复）。
- 额外补课 Session。
- 课程时间统一按 Asia/Kuala_Lumpur 显示，并使用 24 小时制的同日时间范围。

Phase 3 不实现签到、签名、学费或成绩。当前 `classes` 的 `weekday`、`start_time`、`end_time` 可迁移成第一条 schedule rule；稳定关系继续使用 `classes.id`。

Phase 3 结构决定：`class_schedule_rules` 是唯一课表真相来源。同班数据库层可有多条并行 weekly schedule slots；当前 UI 仍只维护一条。regular Session 防重复使用 `schedule_rule_id + original_start_at`，不使用整个班级加教学周。`classes` 的旧时间字段由 `schedule_summary_rule_id` 明确指向并通过数据库 transaction 保持一致，只作兼容镜像。

验收还确认：同一堂课程可连续改期且保留完整历史；永久改课表不会覆盖人工调整；停课 Session 留在历史并离开正常点名列表；恢复上课复用原 Session；全日停课会列出并原子停止当天所有尚未停课课程。`completed` Session 的停课／恢复保护由 RPC 状态约束与自动化测试验证，因为 Phase 3 尚无把 Session 标记为 completed 的用户操作。

验收期间建立的额外补课及停课 Session 会按历史保留原则继续存在，不要直接从数据库删除。

## Phase 4 完成状态

Phase 4 已完成实现、production migration、GitHub Pages 发布及实际验收。第 5 份 production migration 已于 2026-08-14 成功执行。

部署后检查确认：学生 3、科目 1、班级 2、报读 3、课表规则 3；三张 Phase 4 表均存在并启用 RLS；`signatures` bucket 为 private、限制 2 MB，具有本人路径 upload/read 两条 policy。

本地实现包括：

- 根据 Session 当日有效 enrollment 动态产生名单；不保存缺席记录。
- iPad 手指／Apple Pencil 签名画布、真实服务端签名时间及补签标记。
- IndexedDB 先行暂存（包括设备 `captured_at`）、失败恢复、重新上传、离页提示与幂等提交；离线记录另存服务器 `synced_at`。
- private `signatures` bucket、仅本人路径可读写、无前端覆盖／删除 policy。
- 有效签到唯一约束、原签名查看、作废记录与修正轨迹。
- 跨班 makeup／extra 学生、原 enrollment 与 source Session 关系、原缺席的补课显示；候选限目标日期仍有效且同科目的其他班学生。
- 已有有效签到的 Session 不能改期或停课；全日停课与签到操作使用 Session row lock 防止竞态。
- 全日停课会保留已有签到的 Session，并原子停掉当天其他可停课程；UI 分开显示两个数量。

实际验收通过：正常名单与签到、iPad 手指／Apple Pencil、清除、补签、私人签名查看、作废修正、正确学生重签、跨班 makeup／extra、不同科目及无效报读候选限制、Phase 3 额外 Session 点名、停课／恢复、已有签到后的改期及停课保护、混合全日停课，以及电脑、iPad、手机主要显示。离线签名恢复未人工实测；用户确认保留现有 IndexedDB 实现并由自动化测试覆盖，不作为 Phase 4 阻塞项。

Phase 4 不包含学费、收据、成绩、临时班或 Phase 5 以后功能。

## 当前待办：Phase 5 尚未开始

Phase 5 目标是常态班月费与全系统统一待开收据。开始前必须取得用户明确确认；不要提前实现成绩、临时班或后续 Phase。

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

现有生产 Supabase 已执行到第 5 份 migration。换电脑本地开发不需要重新执行；后续只有新增 migration 时才先在 Supabase 执行，再发布对应前端。

## GitHub 不会同步的资料

- `.env.local`：故意被 `.gitignore` 排除。需要在新电脑重建；不要用 U 盘明文长期保存，优先从 Supabase Dashboard 重新复制 publishable key。
- GitHub、Supabase、蓝老师网站登录密码及数据库密码：应保存在密码管理器，不进入 repository 或聊天。
- GitHub CLI 和 Supabase Dashboard 的登录状态：新电脑需要重新登录。
- `node_modules`、`dist` 和本机缓存：不会同步，也不需要带走，运行 `pnpm install` / `pnpm build` 可重建。
- 当前旧电脑没有未提交的项目文件；业务数据在 Supabase，不在本机 repository。

新电脑上的 Codex 应先阅读 `AGENTS.md`、`HANDOFF.md` 和原始开发规格，再检查 `git status` 与远程 `main`。Phase 1–4 已完成部署与验收；Phase 5 尚未开始，必须等待用户明确确认。
