import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorBlock, LoadingBlock } from '../../../components/feedback/QueryState'
import { PageHeader } from '../../../components/shared/PageHeader'
import { listSubjects } from '../../classes/api/subjectsService'
import { getErrorMessage } from '../../../utils/errors'
import { todayInMalaysia, toMalaysiaDateInput, toMalaysiaTimeInput } from '../../../utils/format'
import type { TemporaryClassInput } from '../../../types/domain'
import { createTemporaryClass, getTemporaryClass, updateTemporaryClass } from '../api/temporaryClassesService'
import { TemporaryClassForm } from '../components/TemporaryClassForm'

const defaultInput: TemporaryClassInput = {
  subject_id: '',
  name: '',
  class_date: todayInMalaysia(),
  start_time: '14:00',
  end_time: '17:00',
  fee_amount: 0,
}

export function TemporaryClassFormPage() {
  const { temporaryClassId = '' } = useParams()
  const editing = Boolean(temporaryClassId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: listSubjects })
  const existing = useQuery({
    queryKey: ['temporary-class', temporaryClassId],
    queryFn: () => getTemporaryClass(temporaryClassId),
    enabled: editing,
  })
  const mutation = useMutation({
    mutationFn: (input: TemporaryClassInput) => editing
      ? updateTemporaryClass(temporaryClassId, input)
      : createTemporaryClass(input),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['temporary-classes'] })
      navigate(`/temporary-classes/${result.id}`, { replace: true })
    },
  })

  if (subjects.isLoading || (editing && existing.isLoading)) return <LoadingBlock />
  if (subjects.isError) return <ErrorBlock message="科目载入失败。" />
  if (editing && (existing.isError || !existing.data)) return <ErrorBlock message="找不到这个临时班。" />
  if (existing.data?.status === 'ended') return <ErrorBlock message="已结束临时班不能再编辑。" />

  const initialValue = existing.data ? {
    subject_id: existing.data.subject_id,
    name: existing.data.name,
    class_date: toMalaysiaDateInput(existing.data.start_at),
    start_time: toMalaysiaTimeInput(existing.data.start_at),
    end_time: toMalaysiaTimeInput(existing.data.end_at),
    fee_amount: existing.data.fee_amount,
  } : defaultInput

  return (
    <section>
      <PageHeader title={editing ? '编辑临时班' : '建立临时班'} backTo={editing ? `/temporary-classes/${temporaryClassId}` : '/temporary-classes'} backLabel="临时班" />
      <TemporaryClassForm
        key={existing.data?.updated_at ?? 'new'}
        subjects={subjects.data ?? []}
        initialValue={initialValue}
        submitLabel={editing ? '保存临时班' : '建立临时班'}
        isSubmitting={mutation.isPending}
        error={mutation.error ? getErrorMessage(mutation.error, '临时班保存失败。') : ''}
        onSubmit={async (input) => { await mutation.mutateAsync(input) }}
      />
    </section>
  )
}
