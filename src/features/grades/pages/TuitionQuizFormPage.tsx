import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { getErrorMessage } from '../../../utils/errors'
import { todayInMalaysia } from '../../../utils/format'
import { listClasses } from '../../classes/api/classesService'
import { createTuitionQuiz, type TuitionQuizInput } from '../api/gradesService'

export function TuitionQuizFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => listClasses() })
  const [form, setForm] = useState<TuitionQuizInput>({
    class_id: searchParams.get('classId') ?? '',
    name: '',
    quiz_date: todayInMalaysia(),
    max_score: 20,
  })
  const [error, setError] = useState('')
  const create = useMutation({
    mutationFn: () => createTuitionQuiz(form),
    onSuccess: (quiz) => navigate(`/grades/quizzes/${quiz.id}`, { replace: true }),
    onError: (caughtError) => setError(getErrorMessage(caughtError, '新增小测失败，请重试。')),
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try { await create.mutateAsync() } catch { /* mutation displays the error */ }
  }

  if (classes.isLoading) return <LoadingBlock />
  if (classes.isError) return <ErrorBlock message="班级载入失败。" />

  return (
    <section>
      <PageHeader title="新增补习班小测" backTo="/grades/quizzes" backLabel="补习班小测" />
      {classes.data?.length === 0 ? <EmptyBlock message="目前没有常态班。" /> : (
        <form className="form-card" onSubmit={handleSubmit}>
          <label className="field">
            <span>班级</span>
            <select value={form.class_id} onChange={(event) => setForm({ ...form, class_id: event.target.value })} required>
              <option value="">请选择班级</option>
              {classes.data?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>小测名称</span>
            <input value={form.name} maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：Depreciation" required />
          </label>
          <div className="form-grid">
            <label className="field">
              <span>日期</span>
              <input type="date" value={form.quiz_date} onChange={(event) => setForm({ ...form, quiz_date: event.target.value })} required />
            </label>
            <label className="field">
              <span>满分</span>
              <input type="number" min="0.01" step="any" value={form.max_score} onChange={(event) => setForm({ ...form, max_score: Number(event.target.value) })} required />
            </label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions"><button className="button button-primary" type="submit" disabled={create.isPending}>{create.isPending ? '新增中…' : '新增小测并录入成绩'}</button></div>
        </form>
      )}
    </section>
  )
}
