import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { useAuth } from '../../auth/authContext'
import { getErrorMessage } from '../../../utils/errors'
import { createSubject, listSubjects, updateSubject } from '../api/subjectsService'

export function SubjectsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState('')
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: listSubjects })
  const create = useMutation({
    mutationFn: () => createSubject(user!.id, newName),
    onSuccess: async () => {
      setNewName('')
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['subjects'] })
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '新增科目失败，请重试。')),
  })
  const update = useMutation({
    mutationFn: () => updateSubject(editingId, editingName),
    onSuccess: async () => {
      setEditingId('')
      setEditingName('')
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['subjects'] })
      await queryClient.invalidateQueries({ queryKey: ['classes'] })
    },
    onError: (caughtError) => setError(getErrorMessage(caughtError, '修改科目失败，请重试。')),
  })

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try { await create.mutateAsync() } catch { /* mutation displays the error */ }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try { await update.mutateAsync() } catch { /* mutation displays the error */ }
  }

  return (
    <section>
      <PageHeader title="科目" backTo="/classes" backLabel="班级" />
      <form className="compact-form horizontal-form" onSubmit={handleCreate}>
        <label className="field grow-field">
          <span>新增科目</span>
          <input value={newName} onChange={(event) => setNewName(event.target.value)} required maxLength={80} placeholder="例如：会计学" />
        </label>
        <button className="button button-primary" type="submit" disabled={create.isPending}>新增</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {subjects.isLoading && <LoadingBlock />}
      {subjects.isError && <ErrorBlock message="科目资料载入失败。" />}
      {subjects.data?.length === 0 && <EmptyBlock message="还没有科目。" />}
      <div className="record-list">
        {subjects.data?.map((subject) => (
          <div className="record-card static-card" key={subject.id}>
            {editingId === subject.id ? (
              <form className="inline-edit-form" onSubmit={handleUpdate}>
                <input value={editingName} onChange={(event) => setEditingName(event.target.value)} required maxLength={80} autoFocus />
                <button className="button button-primary button-small" type="submit" disabled={update.isPending}>保存</button>
                <button className="button button-text button-small" type="button" onClick={() => setEditingId('')}>取消</button>
              </form>
            ) : (
              <>
                <strong>{subject.name}</strong>
                <button
                  className="button button-text button-small"
                  type="button"
                  onClick={() => {
                    setEditingId(subject.id)
                    setEditingName(subject.name)
                  }}
                >
                  编辑
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
