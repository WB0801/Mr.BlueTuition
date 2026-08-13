import { requireSupabase } from '../../../lib/requireSupabase'
import type { ClassInput, ClassScheduleRule, ClassStatus, TuitionClass } from '../../../types/domain'
import { todayInMalaysia } from '../../../utils/format'

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
  return applyCurrentSchedule((data ?? []) as unknown as TuitionClass[])
}

export async function getClass(classId: string): Promise<TuitionClass> {
  const { data, error } = await requireSupabase()
    .from('classes')
    .select(classSelection)
    .eq('id', classId)
    .single()

  if (error) throw error
  const [result] = await applyCurrentSchedule([data as unknown as TuitionClass])
  return result
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
    .update({
      subject_id: input.subject_id,
      name: input.name.trim(),
      monthly_fee: Number(input.monthly_fee),
      start_date: input.start_date,
    })
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

async function applyCurrentSchedule(classes: TuitionClass[]): Promise<TuitionClass[]> {
  if (classes.length === 0) return classes

  const { data, error } = await requireSupabase()
    .from('class_schedule_rules')
    .select('*')
    .in('class_id', classes.map((item) => item.id))
    .order('effective_from', { ascending: false })

  if (error) throw error
  const rules = (data ?? []) as ClassScheduleRule[]
  const today = todayInMalaysia()

  return classes.map((tuitionClass) => {
    const classRules = rules.filter((rule) => rule.class_id === tuitionClass.id)
    const summaryRule = classRules.find((rule) => rule.id === tuitionClass.schedule_summary_rule_id)
    const primarySlotId = summaryRule?.schedule_slot_id
    const primaryRules = primarySlotId
      ? classRules.filter((rule) => rule.schedule_slot_id === primarySlotId)
      : classRules
    const current = primaryRules.find((rule) => (
      rule.effective_from <= today && (rule.effective_to === null || rule.effective_to >= today)
    )) ?? summaryRule ?? primaryRules[0]

    return current
      ? {
          ...tuitionClass,
          weekday: current.weekday,
          start_time: current.start_time,
          end_time: current.end_time,
        }
      : tuitionClass
  })
}
