import { recordStudentView } from './recentStudentViews'
beforeEach(() => localStorage.clear())
it('stores only IDs, deduplicates by latest visit, and isolates owners', () => {
  recordStudentView('owner-a', 'student-a')
  recordStudentView('owner-a', 'student-b')
  recordStudentView('owner-a', 'student-a')
  recordStudentView('owner-b', 'student-c')
  expect(JSON.parse(localStorage.getItem('recent-students-v1:owner-a')!)).toEqual(['student-a', 'student-b'])
  expect(JSON.parse(localStorage.getItem('recent-students-v1:owner-b')!)).toEqual(['student-c'])
})
it('survives malformed storage, caps recent IDs, and tolerates disabled storage', () => {
  localStorage.setItem('recent-students-v1:owner', 'broken')
  for (let i = 0; i < 15; i++) recordStudentView('owner', `student-${i}`)
  expect(JSON.parse(localStorage.getItem('recent-students-v1:owner')!)).toHaveLength(12)
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
  expect(() => recordStudentView('owner', 'student-a')).not.toThrow()
  spy.mockRestore()
})
