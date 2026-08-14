import { useQuery } from '@tanstack/react-query'
import type { EnrollmentDetails } from '../../../types/domain'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { listEnrollmentTuitionQuizScores, listStudentSchoolExamScores } from '../api/gradesService'
import { GradeHistoryContent } from './GradeHistoryContent'

export function EnrollmentGradesSection({ enrollment }: { enrollment: EnrollmentDetails }) {
  const subjectId = enrollment.class?.subject_id ?? ''
  const schoolScores = useQuery({
    queryKey: ['grades', 'student', enrollment.student_id, 'subject', subjectId],
    queryFn: () => listStudentSchoolExamScores(enrollment.student_id, subjectId),
    enabled: Boolean(subjectId),
  })
  const quizScores = useQuery({
    queryKey: ['grades', 'enrollment', enrollment.id, 'quizzes'],
    queryFn: () => listEnrollmentTuitionQuizScores(enrollment.id),
  })
  return (
    <section className="content-section enrollment-grades" id="enrollment-grades">
      <h2>成绩</h2>
      {(schoolScores.isLoading || quizScores.isLoading) && <LoadingBlock />}
      {(schoolScores.isError || quizScores.isError) && <ErrorBlock message="成绩资料载入失败。" />}

      <GradeHistoryContent
        schoolScores={schoolScores.data ?? []}
        quizScores={quizScores.data ?? []}
        schoolLoading={schoolScores.isLoading}
        quizLoading={quizScores.isLoading}
        quizEmptyMessage="这段报读目前没有小测成绩。"
      />
    </section>
  )
}
