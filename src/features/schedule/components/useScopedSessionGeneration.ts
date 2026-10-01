import { useQuery } from '@tanstack/react-query'
import { todayInMalaysia } from '../../../utils/format'
import { ensureRollingSessions } from '../api/scheduleService'

export function useScopedSessionGeneration(enabled: boolean) {
  const date = todayInMalaysia()
  return useQuery({ queryKey: ['context-session-generation', date], queryFn: async () => { await ensureRollingSessions(date); return true }, enabled, staleTime: Infinity, refetchOnWindowFocus: false })
}
