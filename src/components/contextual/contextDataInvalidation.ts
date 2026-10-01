import type { InvalidateQueryFilters, QueryClient } from '@tanstack/react-query'

const installed = new WeakSet<QueryClient>()

/** Connect retained views to the application's existing successful-write invalidations.
 * This also covers directly awaited score saves (which are not Query mutations).
 * Hidden reads are marked stale, not fetched. Guest retry drafts are never invalidated.
 */
export function installContextDataInvalidation(client: QueryClient) {
  if (installed.has(client)) return
  installed.add(client)
  const invalidate = client.invalidateQueries.bind(client)
  client.invalidateQueries = async (filters, options) => {
    const root = filters?.queryKey?.[0]
    const enrollmentChange = root === 'enrollments' || root === 'enrollment'
    const classChange = root === 'classes' || root === 'class'
    const studentChange = root === 'students' || root === 'student'
    const attendanceChange = enrollmentChange || classChange || ['attendance', 'session', 'sessions', 'schedule-rules', 'temporary-class', 'temporary-classes'].includes(String(root))
    const gradeChange = enrollmentChange || classChange || ['school-exam', 'school-exams', 'tuition-quiz', 'tuition-quizzes'].includes(String(root))
    const dependencies: InvalidateQueryFilters = {
      refetchType: 'none',
      predicate: query => {
        const [family, section] = query.queryKey
        if (studentChange || classChange) {
          // These reads embed identity metadata. Do not invalidate either fee
          // generator (including the legacy enrollment ensure key) for an edit.
          if (family === 'monthly-fees' && section !== 'ensure') return true
          if (['pending-receipts', 'receipt-queue', 'receipt-payment-target', 'enrollments', 'grades', 'quiz-rewards', 'school-exam', 'tuition-quiz'].includes(String(family))) return true
          if (family === 'attendance' && ['roster', 'cross-class-candidates', 'makeup-sources'].includes(String(query.queryKey[2]))) return true
          if (family === 'temporary-class' && query.queryKey[2] === 'enrollments') return true
          if (family === 'temporary-classes' && section === 'student') return true
        }
        if (enrollmentChange) {
          if (family === 'monthly-fees-generation' || family === 'monthly-fees') return true
        }
        if (attendanceChange) {
          if (family === 'sessions' || family === 'session') return true
          if (family === 'attendance' && (section === 'student-history-scope' || query.queryKey[2] === 'roster')) return true
          if (family === 'temporary-classes' && section === 'student') return true
        }
        if (gradeChange && ((family === 'grades' && section === 'student') || (family === 'tuition-quizzes' && section === 'overview'))) return true
        if (studentChange && family === 'student') return true
        if (classChange && family === 'class') return true
        return false
      },
    }
    // An earlier read cannot turn the now-stale snapshot fresh again when it arrives.
    await client.cancelQueries(dependencies)
    await invalidate(dependencies)
    await invalidate(filters, options)
  }
}

// Only class creation needs rolling generation: schedule-change RPCs already
// generate their affected range, and signing/stopping/renaming must not repeat it.
export function invalidateContextClassCreation(client: QueryClient) {
  return client.invalidateQueries({ queryKey: ['context-session-generation'], refetchType: 'none' })
}
