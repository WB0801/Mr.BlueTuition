import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { listStudentSchoolExamScores, listStudentTuitionQuizScores } from '../api/gradesService'
import { GradeHistoryContent } from './GradeHistoryContent'
import { StudentQuizRewards } from './StudentQuizRewards'
import { useRecordParams } from '../../../components/contextual/contextDataState'
import { RecordDetailFrame } from '../../../components/contextual/RecordDetailFrame'
import { ContextLink } from '../../../components/navigation/ContextLink'
import { formatDate } from '../../../utils/format'

export function StudentGradesSection({ studentId, embedded = false, active = true }: { studentId: string; embedded?: boolean; active?: boolean }) {
  const { get, set } = useRecordParams('grades')
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (embedded ? get('tab') : searchParams.get('gradeTab')) === 'quiz' ? 'quiz' : 'school'
  const selectTab = (tab: 'school' | 'quiz') => {
    if (embedded) { set('tab', tab === 'quiz' ? 'quiz' : ''); return }
    const next = new URLSearchParams(searchParams)
    if (tab === 'quiz') next.set('gradeTab', 'quiz')
    else next.delete('gradeTab')
    setSearchParams(next, { replace: true })
  }
  const schoolScores = useQuery({
    queryKey: ['grades', 'student', studentId, 'school'],
    queryFn: () => listStudentSchoolExamScores(studentId),
    enabled: active,
    staleTime: embedded ? Infinity : 0,
  })
  const quizScores = useQuery({
    queryKey: ['grades', 'student', studentId, 'quizzes'],
    queryFn: () => listStudentTuitionQuizScores(studentId),
    enabled: active,
    staleTime: embedded ? Infinity : 0,
  })
  const record = embedded ? get('record') : ''
  const [kind, scoreId] = record.split(':')
  const selectedSchool = kind === 'school' ? schoolScores.data?.find(score => score.id === scoreId) : undefined
  const selectedQuiz = kind === 'quiz' ? quizScores.data?.find(score => score.id === scoreId) : undefined
  const entity = selectedSchool?.exam ?? selectedQuiz?.quiz
  const score = selectedSchool ?? selectedQuiz

  return (
    <section className="content-section enrollment-grades" id="student-grades">
      <div hidden={Boolean(record)}>
      <h2>考试与成绩</h2>
      <div className="student-grade-tabs" role="tablist" aria-label="学生成绩类别">
        <button role="tab" aria-selected={activeTab === 'school'} className={activeTab === 'school' ? 'active' : ''} type="button" onClick={() => selectTab('school')}>学校考试</button>
        <button role="tab" aria-selected={activeTab === 'quiz'} className={activeTab === 'quiz' ? 'active' : ''} type="button" onClick={() => selectTab('quiz')}>补习班小测</button>
      </div>
      {(schoolScores.isLoading || quizScores.isLoading) && <LoadingBlock />}
      {(schoolScores.isError || quizScores.isError) && <ErrorBlock message="成绩资料载入失败。" />}
      {(schoolScores.isError || quizScores.isError) && <button type="button" className="button button-secondary" onClick={() => void (schoolScores.isError ? schoolScores.refetch() : quizScores.refetch())}>重试</button>}
      <GradeHistoryContent
        schoolScores={schoolScores.data ?? []}
        quizScores={quizScores.data ?? []}
        schoolLoading={schoolScores.isLoading}
        quizLoading={quizScores.isLoading}
        schoolError={schoolScores.isError}
        quizError={quizScores.isError}
        showContext
        activeSection={activeTab}
        backLabel="学生"
        onSelect={embedded ? (kind, id) => set('record', `${kind}:${id}`, true) : undefined}
      />
      {activeTab === 'quiz' && <StudentQuizRewards studentId={studentId} active={active} />}
      </div>
      {record && <RecordDetailFrame title={entity?.name ?? '成绩详情'} backLabel="成绩列表" onBack={() => set('record', '', true)}>
        {(schoolScores.isLoading || quizScores.isLoading) && <LoadingBlock />}
        {(schoolScores.isError || quizScores.isError) && <ErrorBlock message="成绩资料载入失败。" />}
        {schoolScores.isSuccess && quizScores.isSuccess && !score && <ErrorBlock message="此学生范围内找不到这笔成绩。" />}
        {score && entity && <><dl className="details-card"><div><dt>日期</dt><dd>{formatDate(selectedSchool?.exam?.exam_date ?? selectedQuiz?.quiz?.quiz_date)}</dd></div><div><dt>成绩</dt><dd>{score.score} / {entity.max_score}</dd></div></dl>
          <ContextLink className="button button-secondary" backLabel="学生" to={selectedSchool ? `/grades/school/${entity.id}` : `/grades/quizzes/${entity.id}`}>成绩录入与管理</ContextLink>
        </>}
      </RecordDetailFrame>}
    </section>
  )
}
