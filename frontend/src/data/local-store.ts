import bundle from './seed-bundle.json'
import type { EntryRow, SeedBundle } from './types'

// 示例数据成品：由仓库根的起步脚本从 seed-source.json 铺好，前端只读这一份。
const SEED = bundle as unknown as SeedBundle

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'geohazard-patrol:entries'
const VERSION_KEY = 'geohazard-patrol:seed-version'

// 口径优先级（两处顶上时以此为准，写清不打哑谜）：
// 1. seed-bundle.json 是唯一示例数据来源，版本号由引导/复位脚本推进；
// 2. localStorage 只是浏览器里的工作副本，版本对得上且整份数据校验有效时才生效；
// 3. 版本落后（跑过 reset）或数据损坏、落成无效值，浏览器副本一律作废，
//    整体退回改铺示例数据，不存在「一半新一半旧」的中间态。
export const SEED_PRIORITY_RULE =
  '示例数据版本（seed-bundle.json）优先：浏览器本地副本版本不符或校验无效时整体退回重铺'
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isValidRow(meta: SeedBundle['modules'][number], row: unknown): row is EntryRow {
  if (typeof row !== 'object' || row === null) {
    return false
  }
  const candidate = row as Record<string, unknown>
  if (typeof candidate.id !== 'number' || !Number.isInteger(candidate.id) || candidate.id <= 0) {
    return false
  }
  if (typeof candidate.status !== 'string' || !meta.statuses.includes(candidate.status)) {
    return false
  }
  if (typeof candidate.pending !== 'boolean' || typeof candidate.abnormal !== 'boolean') {
    return false
  }
  // 落成无效值（空串 / 纯空白 / null / NaN / 缺字段）的一律不认，退回重铺。
  return meta.fields.every((field) => {
    const value = candidate[field]
    return typeof value === 'string'
      ? value.trim() !== ''
      : typeof value === 'number' && Number.isFinite(value)
  })
}

function isValidDataset(dataset: unknown): dataset is Record<string, EntryRow[]> {
  if (typeof dataset !== 'object' || dataset === null) {
    return false
  }
  const candidate = dataset as Record<string, unknown>
  for (const meta of SEED.modules) {
    const rows = candidate[meta.key]
    if (!Array.isArray(rows) || rows.length === 0 || !rows.every((row) => isValidRow(meta, row))) {
      return false
    }
    const ids = new Set(rows.map((row) => (row as EntryRow).id))
    if (ids.size !== rows.length) {
      return false
    }
  }
  return true
}

function seedSnapshot(): Record<string, EntryRow[]> {
  return clone(SEED.rows)
}

function persist(dataset: Record<string, EntryRow[]>): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dataset))
  window.localStorage.setItem(VERSION_KEY, SEED.version)
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = seedSnapshot()
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const version = window.localStorage.getItem(VERSION_KEY)
  const raw = window.localStorage.getItem(STORAGE_KEY)

  if (version !== SEED.version) {
    // 本机数据停在上一轮（或还从没铺过）：按优先级整体改铺新版本。
    persist(fallback)
    return fallback
  }

  try {
    const parsed = JSON.parse(raw ?? 'null') as unknown
    if (!isValidDataset(parsed)) {
      // 示例数据落成无效值的，浏览器副本同样一律退回重铺。
      persist(fallback)
      return fallback
    }
    return parsed
  } catch {
    persist(fallback)
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

// 多处读取条数统一走这一个函数：运营概览与各模块清单取的都是 allRows() 同一份。
export function countRows(key: string): number {
  return listRows(key).length
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  persist(next)
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED.rows[key] ?? [])
  saveRows(key, rows)
  return rows
}

// 日常开发复位的页内入口：整份数据退回当前版本的示例数据。
export function resetAllRows(): Record<string, EntryRow[]> {
  const rows = seedSnapshot()
  cache = rows
  persist(rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

export function seedVersion(): string {
  return SEED.version
}
