import { useQuery } from '@tanstack/react-query'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { listStudentSchoolExamScores, listStudentTuitionQuizScores } from '../api/gradesService'
import { GradeHistoryContent } from './GradeHistoryContent'

export function StudentGradesSection({ studentId }: { studentId: string }) {
  const schoolScores = useQuery({
    queryKey: ['grades', 'student', studentId, 'school'],
    queryFn: () => listStudentSchoolExamScores(studentId),
  })
  const quizScores = useQuery({
    queryKey: ['grades', 'student', studentId, 'quizzes'],
    queryFn: () => listStudentTuitionQuizScores(studentId),
  })

  return (
    <section className="content-section enrollment-grades" id="student-grades">
      <h2>成绩</h2>
      {(schoolScores.isLoading || quizScores.isLoading) && <LoadingBlock />}
      {(schoolScores.isError || quizScores.isError) && <ErrorBlock message="成绩资料载入失败。" />}
      <GradeHistoryContent
        schoolScores={schoolScores.data ?? []}
        quizScores={quizScores.data ?? []}
        schoolLoading={schoolScores.isLoading}
        quizLoading={quizScores.isLoading}
        showContext
      />
    </section>
  )
}
