import { supabase } from './supabase'

export function requireSupabase() {
  if (!supabase) throw new Error('尚未配置 Supabase。')
  return supabase
}
