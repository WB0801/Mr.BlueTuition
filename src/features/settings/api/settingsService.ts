import { requireSupabase } from '../../../lib/requireSupabase'

export interface ActivityLogEntry {
  id: string
  action_type: string
  entity_type: string
  entity_id: string | null
  description: string
  created_at: string
}

export async function getRecentActivityLogs(): Promise<ActivityLogEntry[]> {
  const { data, error } = await requireSupabase()
    .from('activity_logs')
    .select('id, action_type, entity_type, entity_id, description, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as ActivityLogEntry[]
}

