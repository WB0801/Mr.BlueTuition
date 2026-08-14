interface DatabaseErrorLike {
  code?: string
  message?: string
}

export function getErrorMessage(error: unknown, fallback = '操作失败，请稍后重试。') {
  const databaseError = error as DatabaseErrorLike

  if (databaseError?.code === '23505') {
    return '这笔资料已经存在，请检查后重试。'
  }

  if (databaseError?.message?.includes('Join date cannot be before class start date')) {
    return '加入日期不能早于班级开始日期。'
  }

  if (databaseError?.message?.includes('End date cannot be before')) {
    return '结束日期不能早于开始或加入日期。'
  }

  if (databaseError?.message?.includes('Invalid transfer date')) {
    return '转班日期必须晚于旧报读加入日期，也不能早于新班开始日期。'
  }

  if (databaseError?.message?.includes('Transfer classes must have the same subject')) {
    return '转班只适用于相同科目的班级；不同科目请结束旧报读后新增报读。'
  }

  if (databaseError?.message?.includes('Transfer month already has a processed old enrollment fee')) {
    return '旧班在转班月份已有处理过的学费，请先处理该笔学费后再转班。'
  }

  if (databaseError?.message?.includes('Only unpaid monthly fees can be changed')) {
    return '只有未缴的学费可以修改本月金额。'
  }

  if (databaseError?.message?.includes('Final monthly fee cannot be waived')) {
    return '这笔结束月份学费已经处理，不能标记为不再追缴。'
  }

  if (databaseError?.message?.includes('Only the final month of an ended enrollment can be waived')) {
    return '只有已结束报读的最后一个月份可以标记为不再追缴。'
  }

  return fallback
}
