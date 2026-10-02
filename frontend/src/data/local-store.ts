import canonicalSeed from './seed.json'
import { buildSnapshot } from './seed-core'
import { MODULES } from './modules'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'geohazard-patrol:entries'
const TOKEN_KEY = 'geohazard-patrol:seed-token'

// 口径优先级（两处来源顶上时按此为准，改动请同步 README）：
//   1) 脚本铺好的快照 seed.snapshot.json（引导/复位脚本产物）——最高优先；
//   2) 浏览器 localStorage 里、token 与当前快照一致的数据——日常改动；
//   3) 由规范示例数据 seed.json 现场构建的基线——兜底。
// token 对不上（说明刚跑过铺数据/复位），localStorage 里的中间状态整包退回基线，
// 运营概览与各业务模块因此重新对齐，不用手工清存储。

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// 内存基线：由唯一规范示例数据来源经同一套导入管线构建，
// 与引导脚本落盘的快照结构完全一致（含治理工程台账待处理挂账）。
const baselineRows: Record<string, EntryRow[]> = buildSnapshot(
  MODULES,
  canonicalSeed as Record<string, EntryRow[]>,
  { date: today() },
)

// 引导/复位脚本落盘的快照（存在才引入）；它的 token 与内存基线不同时，
// 以脚本快照为准并整包覆盖 localStorage。
const snapshotModules = import.meta.glob('./seed.snapshot.json', { eager: true }) as Record<
  string,
  { default: { token: string; rows: Record<string, EntryRow[]> } }
>
const snapshotEntry = Object.values(snapshotModules)[0]?.default ?? null
const seedToken: string = snapshotEntry?.token ?? 'canonical-baseline'
const seedRows: Record<string, EntryRow[]> = snapshotEntry?.rows ?? baselineRows

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Record<string, EntryRow[]> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return clone(seedRows)
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  const savedToken = window.localStorage.getItem(TOKEN_KEY)
  if (!raw || savedToken !== seedToken) {
    // 首次打开，或脚本刚铺过/复位过：以当前示例快照为准，旧中间状态不认。
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedRows))
    window.localStorage.setItem(TOKEN_KEY, seedToken)
    return clone(seedRows)
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...clone(seedRows), ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedRows))
    window.localStorage.setItem(TOKEN_KEY, seedToken)
    return clone(seedRows)
  }
}

// 唯一缓存：模块清单、运营概览、导入去重都读这一份，保证多处读取条数一致。
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

/** 统一条数口径：概览卡片、模块表底、校验脚本都走这里。 */
export function countRows(key: string): number {
  return listRows(key).length
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    window.localStorage.setItem(TOKEN_KEY, seedToken)
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(seedRows[key] ?? [])
  saveRows(key, rows)
  return rows
}

/** 一次性把所有模块复位回示例初始条数，复位后缓存同步刷新。 */
export function resetAllRows(): Record<string, EntryRow[]> {
  const rows = clone(seedRows)
  cache = rows
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
    window.localStorage.setItem(TOKEN_KEY, seedToken)
  }
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
