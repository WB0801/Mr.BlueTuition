const steps = ['考试资料', '录入成绩', '检查保存']

export function GradeFlowSteps({ current, kind = '考试' }: { current: 1 | 2 | 3; kind?: '考试' | '小测' }) {
  const labels = kind === '小测' ? ['小测资料', ...steps.slice(1)] : steps
  return (
    <ol className="grade-flow-steps" aria-label={`新增${kind}步骤`}>
      {labels.map((label, index) => (
        <li className={index + 1 <= current ? 'active' : ''} aria-current={index + 1 === current ? 'step' : undefined} key={label}>
          <span>{index + 1}</span>{label}
        </li>
      ))}
    </ol>
  )
}
