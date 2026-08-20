# 蓝老师补习班：开发交接

更新时间：2026-08-20（Asia/Kuala_Lumpur）

## 唯一本机开发基底

- Windows 本机开发目录固定为 `F:\Codex Projects\小工具开发`。
- 不读取、修改、同步或参考其他磁盘上的旧项目副本。
- GitHub repository：<https://github.com/WB0801/Mr.BlueTuition>
- 生产分支：`main`
- 线上网站：<https://wb0801.github.io/Mr.BlueTuition/>
- Supabase Project URL：`https://ldobzxvxccdowkvwgydt.supabase.co`
- 开始工作前以 `git status`、`git rev-parse HEAD` 与 `git rev-parse origin/main` 确认实际版本，不在交接文档硬编码尚未产生的新提交。

开始开发前必须先阅读 `AGENTS.md`、本文件及用户确认的规格，并执行 `git status`。不要在未获用户明确确认时进入下一 Phase 或扩大 Scope。

## 当前代码状态

仓库已实现至 Phase 8：

1. **Phase 1：基础工程与登录**
   - React、TypeScript、Vite、Supabase 和 GitHub Pages 基础工程。
   - 单一用户登录、受保护路由、首页及 Responsive Web App 布局。
2. **Phase 2：学生、科目、常态班与报读**
   - 学生资料、科目、常态班、报读历史、结束报读、转班及结束班级。
   - 学生姓名必填；学校班级和联系电话选填并以 `NULL` 保存空值。
3. **Phase 3：课表与实际课程**
   - `class_schedule_rules` 是真实课表来源；同班数据库层支持多条并行规则。
   - 按需且幂等地产生 `class_sessions`，支持课表历史、单堂改期、永久改课表、额外课程、单堂停课/恢复和单日全日停课。
   - `classes` 的旧星期和时间字段只是由数据库 transaction 同步的兼容镜像，不能用于产生 Session。
4. **Phase 4：点名与签名**
   - 按 Session 当日有效报读动态产生名单，不保存缺席记录。
   - 支持签名、补签、private Storage 查看、签名作废与修正轨迹。
   - 签名前先写入 IndexedDB；上传失败可保留并重新同步。离线记录区分设备捕获时间和服务器同步时间。
   - 支持同科目的跨班 makeup/extra；已有有效签到的 Session 受到改期和停课保护。
5. **Phase 5：常态班月费与收据**
   - 产生月费快照，查看当月、未缴及历史月费。
   - 支持调整实际金额、缴费、撤销缴费、免收，以及待开/已完成收据处理。
   - 月中转班收费归属、`fee_month` 与 `paid_at`、历史金额快照等规则由 migration/RPC 约束。
   - 设置页提供最近操作记录。
6. **Phase 6：成绩**
   - 学校考试按年份和科目管理，可为有效或有相应科目历史的学生录入成绩。
   - 补习班小测按常态班管理，并按小测日期的有效报读名单录入成绩。
   - 学生及报读详情可查看相关成绩历史。
7. **Phase 7：临时班**
   - 建立、编辑和结束一次性临时班，管理学生报名及一次性缴费。
   - 临时班共用 Session、点名与签名流程。
   - 临时班缴费与常态班月费进入统一待开收据队列。
8. **Phase 8：备份与 PWA**
   - 设置页可下载包含业务表资料、可读 CSV、manifest 与 private 签名文件的完整 ZIP 备份，并在客户端验证备份完整性。
   - 当前只支持备份导出，尚未开放恢复功能。
   - 应用提供 Web App Manifest、Service Worker、安装提示、更新检查/重新载入提示及应用壳离线准备状态。

## UI / UX 改版状态

- **UI Phase 1：品牌基础、共享设计系统与首页体验**：已完成并部署。
- **UI Phase 2：学生、科目与班级管理**：已完成并部署。
- **UI Phase 2 后修正：首页 Header 与返回导航**：已完成并部署；修正基线为 `dc2eaaa`。
- **UI Phase 3：课表、课程、点名、签名及相关工作流**：本轮完成前端重构；包含班级加入学生多选、班级详情层级、学费处理优先排序、课程／点名紧凑界面与跨模块直达。提交与部署结果应以本轮发布记录为准。

这里的「UI Phase 3」只代表现有功能的界面与导航重构，不是上方功能开发的「Phase 3：课表与实际课程」，也没有新增或修改数据库结构、业务规则或 migration。

不要继续开发 UI Phase 4、功能 Phase 9 或其他新功能，除非用户明确确认新的开发规格。

## 已知部署与验收记录

- 功能 Phase 1–8 已在 production 正式部署，并由用户完成人工验收。
- UI Phase 1、UI Phase 2 及 UI Phase 2 后修正已在 GitHub Pages 部署。
- 正式启用前的测试业务资料清理已由用户确认完成；系统现用于录入真实资料。后续 UI 浏览器验收不得建立、修改或删除 production 业务资料。
- IndexedDB 离线签名恢复继续由自动化测试覆盖；签名、收费、转班、停课等原有业务规则不得因 UI 改版而改变。

## 数据库 migrations

`supabase/migrations/` 内现有 migration 必须按文件名顺序保留：

1. `202608130001_phase1_auth_foundation.sql`
2. `202608130002_phase2_students_classes_enrollments.sql`
3. `202608130003_optional_student_details.sql`
4. `202608130004_phase3_schedules_sessions.sql`
5. `202608140005_phase4_attendance_signatures.sql`
6. `202608140006_phase5_monthly_fees_receipts.sql`
7. `202608140007_phase6_grades.sql`
8. `202608140008_phase7_temporary_classes.sql`

Phase 8 没有新增业务 schema migration；对应完整性审计位于 `supabase/checks/phase8_integrity_audit.sql`。

功能 Phase 1–8 的 production migration 已执行并完成验收。本轮 UI 改版不需要、也不得重新执行旧 migration。生产数据库已有真实资料，不得重置、清空或重建；已执行的 migration 不得改写，未来若经用户确认需要 schema 修正，必须新增 migration。

所有业务表继续使用 `owner_id` 和 RLS。前端只使用 Supabase publishable key；Secret Key、Service Role Key、数据库密码和用户密码不得进入 repository、前端或聊天。

## 关键业务与架构约定

- 数据关系一律使用 UUID，不以学生姓名或班级名称作为主键。
- 历史资料优先结束、归档、作废或保留，不轻易删除。
- 转班必须结束旧报读并建立新报读，只允许相同 `subject_id`；转班日是新班生效日，旧报读结束日是前一天。
- 单堂停课底层使用 `class_sessions.status = 'cancelled'`，不删除 Session；恢复时复用原 Session 并保留改期历史。
- 缺席由有效报读名单减去有效签到动态推导；停课 Session 不允许点名。
- 有效签到每生每堂最多一笔。签错只能作废，不能覆盖或删除原签名。
- 收费、收据、转班、停课、签到等关键多步骤操作使用数据库 transaction/RPC 保持原子性。
- Supabase 查询集中在 feature service/API 层，避免散落组件；保持模块拆分和按需读取。
- 电脑、iPad、手机共用同一套 Responsive Web App。

## 本地开发

环境要求：Git、Node.js 22 LTS、Corepack，以及 repository 指定的 pnpm 版本。

```powershell
Set-Location 'F:\Codex Projects\小工具开发'
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
```

复制 `.env.example` 为 `.env.local`，只填写：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

`.env.local`、登录状态、密码、`node_modules`、`dist` 和本机缓存不会提交到 Git。启动开发服务器：

```powershell
pnpm dev
```

## 测试与发布

每次发布前必须全部通过：

```powershell
pnpm lint
pnpm test
pnpm build
```

GitHub Pages 由 `.github/workflows/deploy-pages.yml` 在推送 `main` 后执行 lint、测试、构建和部署。仓库需要配置：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

应用使用 Hash Router，Vite 会按 `VITE_BASE_PATH` 生成适合 GitHub Pages 子路径的构建与 PWA 资源。任何 migration 必须先于依赖该 schema 的前端发布。
