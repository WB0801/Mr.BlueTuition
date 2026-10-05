export function parseTemporaryPaymentAmount(input: string): number {
  const text = input.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Invalid temporary class payment amount')
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount < 0 || amount > 99999999.99) throw new Error('Invalid temporary class payment amount')
  return amount
}

export function temporaryPaymentAmountError(error: unknown): string {
  const detail = error as { code?: string; message?: string }
  if (detail?.code === 'PGRST202' || detail?.code === '42883') return '金额修改尚未启用，请先安装对应数据库更新。原有缴费功能不受影响。'
  if (detail?.message?.includes('Only unpaid temporary class payments can be changed')) return '这笔费用状态已更新，请刷新后核对；已缴费用须先撤销缴费。'
  if (detail?.message?.includes('Active temporary class not found')) return '临时班已结束或不可操作，请刷新后核对。'
  if (detail?.message?.includes('Invalid temporary class payment amount')) return '请输入正确金额，最多两位小数。'
  return '金额保存失败，请重试。'
}
