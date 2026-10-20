import { readAllPages } from './readAllPages'
it('continues short pages until empty and does not repeat offsets', async () => {
  const rows = Array.from({ length: 1205 }, (_, n) => ({ id: String(n) })), offsets: number[] = []
  const result = await readAllPages(async from => { offsets.push(from); return rows.slice(from, from + 137) })
  expect(result).toHaveLength(1205); expect(offsets).toEqual([0, 137, 274, 411, 548, 685, 822, 959, 1096, 1205])
})
it('rejects a repeated page rather than silently returning incomplete or duplicate records', async () => {
  await expect(readAllPages(async () => [{ id: 'same' }])).rejects.toThrow('分页资料已变化')
})
it('aborts before another read rather than returning a partially complete list', async () => {
  const controller = new AbortController(); let reads = 0
  await expect(readAllPages(async () => { reads++; controller.abort(); return [{ id: 'a' }] }, controller.signal)).rejects.toThrow()
  expect(reads).toBe(1)
})
