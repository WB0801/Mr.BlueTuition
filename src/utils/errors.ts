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
    return '转班日期不能早于旧报读加入日期或新班开始日期。'
  }

  return fallback
}
