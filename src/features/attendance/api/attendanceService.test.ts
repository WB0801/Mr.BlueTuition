import { addSessionGuests } from './attendanceService'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), enrollment: vi.fn() }))
vi.mock('../../../lib/requireSupabase', () => ({ requireSupabase: () => ({
  rpc: mocks.rpc,
  from: () => ({ select: () => ({ eq: (_key: string, id: string) => ({ single: () => mocks.enrollment(id) }) }) }),
}) }))
const request = (id: string, sourceSessionId = `absent-${id}`) => ({ enrollmentId: `enrollment-${id}`, studentId: id, studentName: id, linkType: 'makeup' as const, sourceSessionId })
beforeEach(() => {
  mocks.rpc.mockReset().mockImplementation(async (name, args) => name === 'list_makeup_source_sessions'
    ? { data: [{ session_id: `absent-${args.p_source_enrollment_id.replace('enrollment-', '')}` }, { session_id: 'shared' }], error: null }
    : { data: { id: 'link' }, error: null })
  mocks.enrollment.mockReset().mockImplementation(async (id) => ({ data: { student_id: id.replace('enrollment-', '') }, error: null }))
})
it('sends original enrollment and source per person, collecting partial outcomes', async () => {
  const normal = mocks.rpc.getMockImplementation()!
  mocks.rpc.mockImplementation(async (name, args) => name === 'add_session_guest' && args.p_source_enrollment_id === 'enrollment-b'
    ? { data: null, error: new Error('资格已改变') } : name === 'get_session_attendance_roster' ? { data: [], error: null } : normal(name, args))
  const results = await addSessionGuests('target', ['a', 'b', 'c'].map((id) => request(id)))
  expect(results.map((item) => item.success)).toEqual([true, false, true])
  for (const id of ['a', 'b', 'c']) expect(mocks.rpc).toHaveBeenCalledWith('add_session_guest', { p_target_session_id: 'target', p_source_enrollment_id: `enrollment-${id}`, p_link_type: 'makeup', p_source_session_id: `absent-${id}` })
})
it('revalidates each enrollment and shared source before writes, excluding changed qualifications', async () => {
  const normal = mocks.rpc.getMockImplementation()!
  mocks.rpc.mockImplementation(async (name, args) => name === 'list_makeup_source_sessions' && args.p_source_enrollment_id === 'enrollment-b' ? { data: [], error: null } : normal(name, args))
  const results = await addSessionGuests('target', [request('a', 'shared'), request('b', 'shared'), { ...request('c', 'shared'), studentId: 'wrong-student' }])
  expect(results.map((item) => item.success)).toEqual([true, false, false])
  expect(mocks.rpc.mock.calls.filter(([name]) => name === 'add_session_guest')).toHaveLength(1)
  expect(results[1].error).toContain('原缺席课程')
  expect(results[2].error).toContain('报读')
})
it('distinguishes preflight read failure from an uncertain committed response', async () => {
  mocks.enrollment.mockRejectedValue(new Error('unavailable'))
  const result = await addSessionGuests('target', [request('a')])
  expect(result[0]).toMatchObject({ success: false })
  expect(result[0].uncertain).not.toBe(true)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it.each([true, false])('verifies lost RPC responses, roster readable: %s', async (readable) => {
  const normal = mocks.rpc.getMockImplementation()!
  mocks.rpc.mockImplementation(async (name, args) => name === 'add_session_guest' ? { data: null, error: new Error('Network response lost') }
    : name === 'get_session_attendance_roster' ? { data: [{ student_id: 'a', participation_type: 'makeup', source_session_id: 'absent-a' }], error: readable ? null : new Error('unavailable') } : normal(name, args))
  const result = await addSessionGuests('target', [request('a')])
  expect(result[0].success).toBe(readable)
  if (!readable) expect(result[0].uncertain).toBe(true)
})
it('rejects duplicates or missing sources without duplicate writes', async () => {
  const results = await addSessionGuests('target', [request('a'), request('a'), { ...request('b'), sourceSessionId: null }])
  expect(results.map((item) => item.success)).toEqual([true, false, false])
  expect(mocks.rpc.mock.calls.filter(([name]) => name === 'add_session_guest')).toHaveLength(1)
})
it('rechecks a previously uncertain retry before resubmitting or reading changed source eligibility', async () => {
  const normal = mocks.rpc.getMockImplementation()!
  mocks.rpc.mockImplementation(async (name, args) => name === 'get_session_attendance_roster'
    ? { data: [{ student_id: 'a', participation_type: 'makeup', source_session_id: 'absent-a' }], error: null }
    : name === 'list_makeup_source_sessions' ? { data: [], error: null } : normal(name, args))
  const result = await addSessionGuests('target', [{ ...request('a'), verifyBeforeRetry: true }])
  expect(result[0].success).toBe(true)
  expect(mocks.enrollment).not.toHaveBeenCalled()
  expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(['get_session_attendance_roster'])
})
it('keeps an uncertain retry pending if the target roster is still unavailable, without writing', async () => {
  const normal = mocks.rpc.getMockImplementation()!
  mocks.rpc.mockImplementation(async (name, args) => name === 'get_session_attendance_roster' ? { data: null, error: new Error('unavailable') } : normal(name, args))
  const result = await addSessionGuests('target', [{ ...request('a'), verifyBeforeRetry: true }])
  expect(result[0]).toMatchObject({ success: false, uncertain: true })
  expect(mocks.rpc.mock.calls.filter(([name]) => name === 'add_session_guest')).toHaveLength(0)
})
