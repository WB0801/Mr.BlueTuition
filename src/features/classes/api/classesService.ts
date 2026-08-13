import { requireSupabase } from '../../../lib/requireSupabase'
import type { ClassInput, ClassStatus, TuitionClass } from '../../../types/domain'

const classSelection = '*, subject:subjects(id,name)'

export async function listClasses(status?: ClassStatus): Promise<TuitionClass[]> {
  let query = requireSupabase()
    .from('classes')
    .select(classSelection)
    .order('start_date', { ascending: false })
    .order('name')

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as TuitionClass[]
}

export async function getClass(classId: string): Promise<TuitionClass> {
  const { data, error } = await requireSupabase()
    .from('classes')
    .select(classSelection)
    .eq('id', classId)
    .single()

  if (error) throw error
  return data as unknown as TuitionClass
}

export async function createClass(ownerId: string, input: ClassInput): Promise<TuitionClass> {
  const { data, error } = await requireSupabase()
    .from('classes')
    .insert({ owner_id: ownerId, ...normalizeClassInput(input) })
    .select(classSelection)
    .single()

  if (error) throw error
  return data as unknown as TuitionClass
}

export async function updateClass(classId: string, input: ClassInput): Promise<TuitionClass> {
  const { data, error } = await requireSupabase()
    .from('classes')
    .update(normalizeClassInput(input))
    .eq('id', classId)
    .select(classSelection)
    .single()

  if (error) throw error
  return data as unknown as TuitionClass
}

export async function endClass(classId: string, endDate: string): Promise<void> {
  const { error } = await requireSupabase().rpc('end_class', {
    p_class_id: classId,
    p_end_date: endDate,
  })
  if (error) throw error
}

function normalizeClassInput(input: ClassInput) {
  return {
    ...input,
    name: input.name.trim(),
    monthly_fee: Number(input.monthly_fee),
  }
}
