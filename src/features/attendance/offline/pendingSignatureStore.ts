const DATABASE_NAME = 'lan-laoshi-tuition-attendance'
const DATABASE_VERSION = 1
const STORE_NAME = 'pending-signatures'

export interface PendingSignature {
  id: string
  ownerId: string
  sessionId: string
  studentId: string
  signaturePath: string
  signature: Blob
  capturedAt: string
  wasOffline: boolean
}

export async function savePendingSignature(item: PendingSignature): Promise<void> {
  const database = await openDatabase()
  await runRequest(database, 'readwrite', (store) => store.put(item))
}

export async function findPendingSignature(
  ownerId: string,
  sessionId: string,
  studentId: string,
): Promise<PendingSignature | null> {
  const database = await openDatabase()
  const items = await runRequest<PendingSignature[]>(database, 'readonly', (store) => store.getAll())
  return items.find((item) => (
    item.ownerId === ownerId
    && item.sessionId === sessionId
    && item.studentId === studentId
  )) ?? null
}

export async function removePendingSignature(id: string): Promise<void> {
  const database = await openDatabase()
  await runRequest(database, 'readwrite', (store) => store.delete(id))
}

function openDatabase(): Promise<IDBDatabase> {
  if (!window.indexedDB) {
    return Promise.reject(new Error('此浏览器无法使用签名暂存功能。'))
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法开启签名暂存空间。'))
  })
}

function runRequest<T = IDBValidKey>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = action(transaction.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('签名暂存失败。'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('签名暂存失败。'))
    }
  })
}
