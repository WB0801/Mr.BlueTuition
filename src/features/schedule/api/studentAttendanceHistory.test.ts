import { listStudentAttendanceHistoryPage, loadStudentAttendanceScope } from './scheduleService'

type Row = Record<string, unknown>
const mocked = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  calls: [] as Array<{ table: string; operations: Array<{ name: string; args: unknown[] }> }>,
  rpc: vi.fn(),
}))

vi.mock('../../../lib/requireSupabase', () => ({
  requireSupabase: () => ({
    rpc: mocked.rpc,
    from(table: string) {
      const operations: Array<{ name: string; args: unknown[] }> = []
      mocked.calls.push({ table, operations })
      const builder: Record<string, unknown> = {}
      for (const name of ['select', 'eq', 'neq', 'gte', 'lt', 'in', 'order', 'limit', 'range', 'or']) {
        builder[name] = (...args: unknown[]) => { operations.push({ name, args }); return builder }
      }
      builder.then = (resolve: (value: unknown) => unknown) => {
        let rows = [...(mocked.tables[table] ?? [])]
        const compare = (column: string, left: unknown, right: unknown) => column === 'current_start_at'
          ? Date.parse(String(left)) - Date.parse(String(right))
          : String(left).localeCompare(String(right))
        for (const { name, args } of operations) {
          const [column, value] = args as [string, unknown]
          if (name === 'eq') rows = rows.filter((row) => row[column] === value)
          if (name === 'neq') rows = rows.filter((row) => row[column] !== value)
          if (name === 'in') rows = rows.filter((row) => (value as unknown[]).includes(row[column]))
          if (name === 'gte') rows = rows.filter((row) => compare(column, row[column], value) >= 0)
          if (name === 'lt') rows = rows.filter((row) => compare(column, row[column], value) < 0)
          if (name === 'or') {
            const match = /^current_start_at\.lt\.([^,]+),and\(current_start_at\.eq\.([^,]+),id\.lt\.([^)]+)\)$/.exec(String(column))
            if (!match) throw new Error('Unexpected cursor filter')
            rows = rows.filter((row) => compare('current_start_at', row.current_start_at, match[1]) < 0 || (compare('current_start_at', row.current_start_at, match[2]) === 0 && compare('id', row.id, match[3]) < 0))
          }
        }
        for (const { name, args } of [...operations].reverse()) {
          if (name !== 'order') continue
          const [column, options] = args as [string, { ascending: boolean }]
          rows.sort((left, right) => compare(column, left[column], right[column]) * (options.ascending ? 1 : -1))
        }
        const range = operations.find((operation) => operation.name === 'range')
        const limit = operations.find((operation) => operation.name === 'limit')
        if (range) rows = rows.slice(Number(range.args[0]), Number(range.args[1]) + 1)
        if (limit) rows = rows.slice(0, Number(limit.args[0]))
        return resolve({ data: rows, error: null })
      }
      return builder
    },
  }),
}))

const session = (id: string, classId: string | null, startAt: string, temporaryClassId: string | null = null): Row => ({
  id, class_id: classId, temporary_class_id: temporaryClassId, current_start_at: startAt, status: 'scheduled',
})

beforeEach(() => {
  mocked.calls.length = 0
  mocked.rpc.mockReset().mockResolvedValue({ error: null })
  mocked.tables = { enrollments: [], temporary_class_enrollments: [], makeup_links: [], class_sessions: [] }
})

it('queries old courses from historical enrollment, ended temporary registration and makeup target without scanning unrelated classes', async () => {
  mocked.tables.enrollments = [{ id: 'enroll-old', student_id: 'student-a', class_id: 'class-old', join_date: '2024-01-01', end_date: '2024-01-31' }]
  mocked.tables.temporary_class_enrollments = [{ id: 'temporary-old', student_id: 'student-a', temporary_class_id: 'temporary-a', status: 'ended' }]
  mocked.tables.makeup_links = [{ id: 'makeup-old', student_id: 'student-a', target_session_id: 'makeup-target' }]
  mocked.tables.class_sessions = [
    ...Array.from({ length: 350 }, (_, index) => session('unrelated-' + index, 'other-class', '2026-01-01T00:00:00+00:00')),
    session('regular-old', 'class-old', '2024-01-10T06:00:00+00:00'),
    session('temporary-old', null, '2024-01-09T06:00:00+00:00', 'temporary-a'),
    session('makeup-target', 'another-class', '2024-01-08T06:00:00+00:00'),
    session('outside-enrollment', 'class-old', '2024-02-01T06:00:00+00:00'),
  ]
  const scope = await loadStudentAttendanceScope('student-a')
  const page = await listStudentAttendanceHistoryPage(null, scope, '2026-09-29')
  expect(page.sessions.map((item) => item.id)).toEqual(['regular-old', 'temporary-old', 'makeup-target'])
  expect(page.nextCursor).toBeNull()
  expect(mocked.calls.filter((call) => call.table === 'class_sessions')).toHaveLength(3)
  expect(mocked.rpc).toHaveBeenCalledTimes(1)
})

it('continues after 100 relevant courses using a stable cursor without regenerating or duplicating sessions', async () => {
  mocked.tables.enrollments = [{ id: 'enroll-a', student_id: 'student-a', class_id: 'class-a', join_date: '2024-01-01', end_date: null }]
  mocked.tables.class_sessions = Array.from({ length: 105 }, (_, index) => session('session-' + String(105 - index).padStart(3, '0'), 'class-a', '2024-01-10T06:00:00+00:00'))
  const scope = await loadStudentAttendanceScope('student-a')
  const first = await listStudentAttendanceHistoryPage(null, scope, '2026-09-29')
  const second = await listStudentAttendanceHistoryPage(first.nextCursor, scope, '2026-09-29')
  expect(first.sessions).toHaveLength(100)
  expect(first.nextCursor).not.toBeNull()
  expect(second.sessions).toHaveLength(5)
  expect(second.nextCursor).toBeNull()
  expect(new Set([...first.sessions, ...second.sessions].map((item) => item.id)).size).toBe(105)
  expect(mocked.rpc).toHaveBeenCalledTimes(1)
})

it('does not silently truncate participation sources after the default Supabase row limit', async () => {
  mocked.tables.makeup_links = Array.from({ length: 501 }, (_, index) => ({
    id: 'link-' + String(index).padStart(4, '0'), student_id: 'student-a', target_session_id: 'session-' + index,
  }))
  const scope = await loadStudentAttendanceScope('student-a')
  expect(scope.makeupSessionIds).toHaveLength(501)
  expect(mocked.calls.filter((call) => call.table === 'makeup_links')).toHaveLength(2)
})

it('uses Malaysia calendar boundaries, excludes stopped sessions, and deduplicates overlapping participation sources', async () => {
  mocked.tables.enrollments = [{ id: 'enroll-a', student_id: 'student-a', class_id: 'class-a', join_date: '2024-01-01', end_date: '2024-01-01' }]
  mocked.tables.makeup_links = [{ id: 'link-a', student_id: 'student-a', target_session_id: 'same-session' }]
  mocked.tables.class_sessions = [
    session('before-local-date', 'class-a', '2023-12-31T15:59:00Z'),
    session('same-session', 'class-a', '2023-12-31T16:00:00Z'),
    session('end-local-date', 'class-a', '2024-01-01T15:59:00Z'),
    session('after-local-date', 'class-a', '2024-01-01T16:00:00Z'),
    { ...session('stopped', 'class-a', '2024-01-01T06:00:00Z'), status: 'cancelled' },
  ]
  const scope = await loadStudentAttendanceScope('student-a')
  const page = await listStudentAttendanceHistoryPage(null, scope, '2026-09-29')
  expect(page.sessions.map((item) => item.id)).toEqual(['end-local-date', 'same-session'])
})
