import { scoreProgressLabel, type ScoreProgressData } from '../gradeOverview'

export function ScoreProgress({ progress, compact = false }: { progress: ScoreProgressData; compact?: boolean }) {
  return (
    <span className={`score-progress ${compact ? 'score-progress-compact' : ''}`}>
      <strong>{progress.recorded} / {progress.total}</strong>
      <span className={`score-status score-status-${progress.status}`}>{scoreProgressLabel(progress)}</span>
    </span>
  )
}
