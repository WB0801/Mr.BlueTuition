# 蓝老师补习班：长期开发规则

本文件适用于整个 repository。开始任何开发前，先阅读本文件、`HANDOFF.md` 和用户确认的开发规格。

## 产品原则

- 项目名称固定为「蓝老师补习班」。
- 这是蓝老师单人使用、轻量、长期使用的系统，不建立 Admin、Teacher、Staff、家长或学生角色。
- UI 保持 plain、干净、快速、易读；主要操作尽量在 2–3 次点击内完成。
- 不建立复杂 Dashboard、ERP 式菜单、无用统计或规格外功能。
- 不自行扩充 Scope。严格按既定 Phase 开发，不提前实现后续 Phase。
- 每个 Phase 完成后必须停止，等待实际部署与验收通过后才能进入下一 Phase。

## 技术与安全

- 技术栈固定为 React、TypeScript、Vite、Supabase、GitHub Pages；使用 Responsive Web Design。
- 前端只使用 Supabase publishable key；绝不提交或暴露 Secret Key、Service Role Key、数据库密码或用户密码。
- 所有业务表继续使用 `owner_id` 和 RLS，只允许当前登录用户访问。
- 数据关系使用 UUID；绝不使用学生姓名或班级名称作为关系主键。
- Supabase schema 必须通过 `supabase/migrations/` 内的 SQL migrations 管理，并随 repository 提交。
- 已在生产环境执行的 migration 不改写；修正必须新增下一份 migration。
- 历史资料优先结束、归档或作废，不轻易删除。转班必须结束旧报读并建立新报读。

## 工程与验证

- Supabase 查询集中在 feature service/API 层，不散落到所有组件。
- 保持功能模块拆分，避免巨型组件与一次全量读取。
- 电脑、iPad、手机使用同一套 Responsive Web App。
- 任何 Phase 发布前至少运行 `pnpm lint`、`pnpm test` 和 `pnpm build`。
- 数据库 migration 应包含必要约束、RLS、权限和关键操作的原子 transaction/RPC。
- 先执行生产 migration，再发布依赖该 schema 的前端；实际验收通过后才算完成。

## 当前特别决定

- 学生只有姓名必填；学校班级和联系电话选填，空值存为 `NULL`。
- 转班日期是新班生效日；旧报读 `end_date` 是转班日期前一天。
- 常态班当前固定星期、开始时间、结束时间保存在 `classes`；Phase 3 可迁移为第一条 `class_schedule_rules`，`classes.id` 保持稳定。
- 结束班级会同日结束所有当前报读，操作前必须明确显示受影响学生人数。
