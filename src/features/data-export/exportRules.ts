import { toMalaysiaDateInput } from '../../utils/format'

export type ExportDetail = 'attendance' | 'quizzes' | 'school' | 'fees'
export interface ExportOptions {
  classKeys: string[]
  history: boolean
  details: ExportDetail[]
  start: string
  end: string
}
export interface ExportClass { key: string; id: string; kind: 'regular' | 'temporary'; name: string; status: string }
export type ExportCell = string | number | null
export interface ExportSheet { name: string; headers: string[]; rows: ExportCell[][] }
export interface ExportData { sheets: ExportSheet[]; range: string; dateScope: string; exportedAt: string; fileName: string }
export class ExportPreparationError extends Error {}
export function exportErrorMessage(error: unknown, fallback: string) {
  return error instanceof ExportPreparationError ? error.message : fallback
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value
}
export function validateExportOptions(options: ExportOptions) {
  if (!options.classKeys.length || options.classKeys.some(k=>!/^(regular|temporary):[\w-]+$/.test(k))) throw new ExportPreparationError('请选择班级。')
  if (options.details.some(d=>!['attendance','quizzes','school','fees'].includes(d))) throw new ExportPreparationError('导出项目无效。')
  if ((options.start || options.end) && (!validDate(options.start) || !validDate(options.end) || options.start > options.end)) throw new ExportPreparationError('请填写有效的开始和结束日期，开始不可晚于结束。')
}
export function exportDateIncluded(date: string, range: Pick<ExportOptions,'start'|'end'>) {
  return (!range.start || date >= range.start) && (!range.end || date <= range.end)
}
export function exportMonthIncluded(month: string, range: Pick<ExportOptions,'start'|'end'>) {
  return (!range.start || month.slice(0,7) >= range.start.slice(0,7)) && (!range.end || month.slice(0,7) <= range.end.slice(0,7))
}
export function exportFileName(range: string, at: Date) {
  const safe = Array.from(range).map(c=>c.charCodeAt(0)<32||/[<>:"/\\|?*]/.test(c)?'_':c).join('').slice(0,80).trim().replace(/[. ]+$/g,'') || '所选班级'
  return `导出资料-${safe}-${toMalaysiaDateInput(at.toISOString())}.xlsx`
}
