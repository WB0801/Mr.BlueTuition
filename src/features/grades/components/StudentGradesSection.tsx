import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { listStudentSchoolExamScores, listStudentTuitionQuizScores } from '../api/gradesService'
import { GradeHistoryContent } from './GradeHistoryContent'

export function StudentGradesSection({ studentId }: { studentId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('gradeTab') === 'quiz' ? 'quiz' : 'school'
  const selectTab = (tab: 'school' | 'quiz') => {
    const next = new URLSearchParams(searchParams)
    if (tab === 'quiz') next.set('gradeTab', 'quiz')
    else next.delete('gradeTab')
    setSearchParams(next, { replace: true })
  }
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
      <div className="student-grade-tabs" role="tablist" aria-label="学生成绩类别">
        <button role="tab" aria-selected={activeTab === 'school'} className={activeTab === 'school' ? 'active' : ''} type="button" onClick={() => selectTab('school')}>学校考试</button>
        <button role="tab" aria-selected={activeTab === 'quiz'} className={activeTab === 'quiz' ? 'active' : ''} type="button" onClick={() => selectTab('quiz')}>补习班小测</button>
      </div>
      {(schoolScores.isLoading || quizScores.isLoading) && <LoadingBlock />}
      {(schoolScores.isError || quizScores.isError) && <ErrorBlock message="成绩资料载入失败。" />}
      <GradeHistoryContent
        schoolScores={schoolScores.data ?? []}
        quizScores={quizScores.data ?? []}
        schoolLoading={schoolScores.isLoading}
        quizLoading={quizScores.isLoading}
        showContext
        activeSection={activeTab}
        backLabel="学生"
      />
    </section>
  )
}
