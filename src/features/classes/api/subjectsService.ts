import { requireSupabase } from '../../../lib/requireSupabase'
import type { Subject } from '../../../types/domain'

export async function listSubjects(): Promise<Subject[]> {
  const { data, error } = await requireSupabase().from('subjects').select('*').order('name')
  if (error) throw error
  return (data ?? []) as Subject[]
}

export async function createSubject(ownerId: string, name: string): Promise<Subject> {
  const { data, error } = await requireSupabase()
    .from('subjects')
    .insert({ owner_id: ownerId, name: name.trim() })
    .select('*')
    .single()

  if (error) throw error
  return data as Subject
}

export async function updateSubject(subjectId: string, name: string): Promise<Subject> {
  const { data, error } = await requireSupabase()
    .from('subjects')
    .update({ name: name.trim() })
    .eq('id', subjectId)
    .select('*')
    .single()

  if (error) throw error
  return data as Subject
}
