interface QueryStateProps {
  message?: string
}

export function LoadingBlock({ message = '载入中…' }: QueryStateProps) {
  return <div className="state-block" aria-live="polite">{message}</div>
}

export function ErrorBlock({ message = '资料载入失败，请刷新后重试。' }: QueryStateProps) {
  return <div className="state-block state-error" role="alert">{message}</div>
}

export function EmptyBlock({ message }: Required<QueryStateProps>) {
  return <div className="state-block">{message}</div>
}
