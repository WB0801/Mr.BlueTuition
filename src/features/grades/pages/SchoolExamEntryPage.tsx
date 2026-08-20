import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { formatDate } from '../../../utils/format'
import { getClass } from '../../classes/api/classesService'
import { GradeEntryTable } from '../components/GradeEntryTable'
import { getSchoolExam, listSchoolExamRoster, listSchoolExamScores, saveSchoolExamScores } from '../api/gradesService'

export function SchoolExamEntryPage() {
  const { examId = '', classId = '' } = useParams()
  const queryClient = useQueryClient()
  const exam = useQuery({ queryKey: ['school-exam', examId], queryFn: () => getSchoolExam(examId) })
  const tuitionClass = useQuery({ queryKey: ['class', classId], queryFn: () => getClass(classId) })
  const roster = useQuery({
    queryKey: ['school-exam', examId, 'roster', classId],
    queryFn: () => listSchoolExamRoster(examId, classId),
  })
  const scores = useQuery({ queryKey: ['school-exam', examId, 'scores'], queryFn: () => listSchoolExamScores(examId) })

  if (exam.isLoading || tuitionClass.isLoading || roster.isLoading || scores.isLoading) return <LoadingBlock />
  if (exam.isError || !exam.data || tuitionClass.isError || !tuitionClass.data || roster.isError || scores.isError) {
    return <ErrorBlock message="考试成绩名单载入失败。" />
  }
  if (tuitionClass.data.subject_id !== exam.data.subject_id) return <ErrorBlock message="这个班级不属于该考试科目。" />

  const initialScores = Object.fromEntries((scores.data ?? []).map((score) => [score.student_id, score.score]))

  return (
    <section>
      <PageHeader title={exam.data.name} backTo={`/grades/school/${examId}`} backLabel="考试详情" />
      <p className="grade-context">{formatDate(exam.data.exam_date)} · {exam.data.subject?.name} · 满分 {exam.data.max_score}</p>
      <h2 className="grade-entry-class-title"><ContextLink backLabel="成绩" to={`/classes/${classId}`}>{tuitionClass.data.name}</ContextLink></h2>
      {roster.data?.length === 0 ? <EmptyBlock message="这个班级目前没有可录入该科目成绩的学生。" /> : (
        <GradeEntryTable
          key={`${examId}-${classId}`}
          rows={roster.data ?? []}
          initialScores={initialScores}
          maxScore={exam.data.max_score}
          onSave={async (payload) => {
            await saveSchoolExamScores(examId, payload)
            await queryClient.invalidateQueries({ queryKey: ['school-exam', examId, 'scores'] })
          }}
        />
      )}
    </section>
  )
}
