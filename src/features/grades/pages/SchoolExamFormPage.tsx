import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { getErrorMessage } from '../../../utils/errors'
import { todayInMalaysia } from '../../../utils/format'
import { listSubjects } from '../../classes/api/subjectsService'
import { createSchoolExam, type SchoolExamInput } from '../api/gradesService'
import { GradeFlowSteps } from '../components/GradeFlowSteps'

export function SchoolExamFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: listSubjects })
  const [form, setForm] = useState<SchoolExamInput>({
    subject_id: '',
    year: Number(todayInMalaysia().slice(0, 4)),
    exam_date: todayInMalaysia(),
    name: '',
    max_score: 100,
  })
  const [error, setError] = useState('')
  const create = useMutation({
    mutationFn: () => createSchoolExam(form),
    onSuccess: (exam) => navigate(`/grades/school/${exam.id}`, { replace: true, state: { ...(location.state as object ?? {}), gradeFlow: true } }),
    onError: (caughtError) => setError(getErrorMessage(caughtError, '新增学校考试失败，请重试。')),
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (Number(form.exam_date.slice(0, 4)) !== form.year) {
      setError('考试年份必须与考试日期的年份一致。')
      return
    }
    try { await create.mutateAsync() } catch { /* mutation displays the error */ }
  }

  if (subjects.isLoading) return <LoadingBlock />
  if (subjects.isError) return <ErrorBlock message="科目载入失败。" />

  return (
    <section>
      <PageHeader title="新增学校考试" backTo="/grades/school" backLabel="学校考试" />
      <GradeFlowSteps current={1} />
      {subjects.data?.length === 0 ? <EmptyBlock message="请先在班级模块新增科目。" /> : (
        <form className="form-card" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="field">
              <span>科目</span>
              <select value={form.subject_id} onChange={(event) => setForm({ ...form, subject_id: event.target.value })} required>
                <option value="">请选择科目</option>
                {subjects.data?.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>年份</span>
              <input type="number" min="2000" max="2200" value={form.year} onChange={(event) => setForm({ ...form, year: Number(event.target.value) })} required />
            </label>
          </div>
          <label className="field">
            <span>考试名称</span>
            <input value={form.name} maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：第二次段考" required />
          </label>
          <div className="form-grid">
            <label className="field">
              <span>考试日期</span>
              <input
                type="date"
                value={form.exam_date}
                onChange={(event) => setForm({
                  ...form,
                  exam_date: event.target.value,
                  year: Number(event.target.value.slice(0, 4)),
                })}
                required
              />
            </label>
            <label className="field">
              <span>满分</span>
              <input type="number" min="0.01" step="any" value={form.max_score} onChange={(event) => setForm({ ...form, max_score: Number(event.target.value) })} required />
            </label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions"><button className="button button-primary" type="submit" disabled={create.isPending}>{create.isPending ? '新增中…' : '新增考试'}</button></div>
        </form>
      )}
    </section>
  )
}
