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
- Phase 3 起真正课表的 source of truth 是 `class_schedule_rules`；同班可有多条并行规则。`classes.id` 保持稳定，旧星期与时间字段只作为由数据库 transaction 同步的兼容镜像，不能用于生成 Session。
- Phase 3 的课程停止操作在 UI 统一称为「停课」；底层使用 `class_sessions.status = 'cancelled'`，不要求理由、不删除 Session，也不自动建立补课。支持单堂及单一日期全日停课，不做日期范围；单堂停课可恢复上课，必须复用原 Session 并保留时间与改期历史。
- 缺席永远由 Session 当日有效报读名单减去有效签到动态推导，不建立缺席记录；停课 Session 不允许点名。
- 签名图片只存于 private `signatures` Storage bucket。有效签到每生每堂最多一笔；签错只能作废并保留原图、原时间与修正轨迹，不能覆盖或删除。
- 签名确认前先保存到 IndexedDB，再上传 Storage 和调用幂等 RPC；上传失败必须保留本机图片并允许重新同步。
- 在线签到的 `captured_at` 使用可信服务器时间；离线重传分别保留设备捕获 `captured_at` 与服务器 `synced_at`，并在 UI 标示「离线签名」。
- 跨班补课只新增 `makeup_links`，继续引用学生原报读、原缺席 Session 与目标 Session；不得修改正式 enrollment 或把原缺席改成出席。
- 跨班 makeup／extra 候选必须在目标 Session 日期仍有其他班有效 enrollment，且其他班与目标班使用相同 `subject_id`。
- 全日停课必须保护已有有效签到的 Session，同时原子停掉当天其余符合条件的 Session；确认画面分别显示停课与保留堂数。
- 结束班级会同日结束所有当前报读，操作前必须明确显示受影响学生人数。
- 转班只允许相同 `subject_id` 的班级；不同科目必须结束旧报读后新增另一段报读。
- 月中转班的当月月费只属于旧 enrollment，新 enrollment 从下个月开始收费；每月 1 日转班则由新 enrollment 收当月，绝不对同一转班关系重复收取同月常态班月费。
- `monthly_fees.fee_month` 是收费月份，`paid_at` 是服务器实际收款时间，两者不得混用。班级改价不能覆盖已经产生的历史金额快照。
- 已缴月费自动进入待开收据；撤销缴费必须同时清空缴费时间与收据状态，收据完成／恢复必须通过 transaction RPC。
