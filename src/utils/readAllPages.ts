/** Continue after short server-capped pages; only an empty page proves completion. */
export async function readAllPages<T extends { id: string }>(read: (from: number, to: number) => Promise<T[]>, signal?: AbortSignal): Promise<T[]> {
  const records: T[] = [], ids = new Set<string>()
  while (true) {
    signal?.throwIfAborted()
    const page = await read(records.length, records.length + 199)
    signal?.throwIfAborted()
    if (page.length === 0) return records
    for (const item of page) {
      if (!item.id || ids.has(item.id)) throw new Error('分页资料已变化，请重试。')
      ids.add(item.id); records.push(item)
    }
  }
}
