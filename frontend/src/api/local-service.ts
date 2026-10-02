import canonicalSeed from '@/data/seed.json'
import {
  applyLedger,
  ledgerCode,
  SeedValidationError,
  upsertByNaturalKey,
  validateCanonical,
  validateImportBatch,
} from '@/data/seed-core'
import { MODULE_BY_KEY, MODULES } from '@/data/modules'
import { countRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export type ImportSummary = {
  ok: boolean
  message: string
  totals: { modules: number; added: number; updated: number; ledgerCreated: number }
}

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

/**
 * 导入一个业务模块的数据：走与引导脚本完全相同的管线。
 * - 全部记录先校验，任何一条落成无效值 → 整批退回，一条都不写；
 * - 按业务主键 upsert：同一模块连导两次只认一条（新增 0、更新 N）；
 * - 导入收尾在治理工程台账挂一条待处理，同模块重复导入仍只挂同一条；
 *   治理工程模块本身的导入不产生挂账。
 */
export function importModuleRows(key: string, incoming: unknown): ImportSummary {
  const meta = moduleMeta(key)
  let normalized: EntryRow[]
  try {
    normalized = validateImportBatch(meta, incoming)
  } catch (error) {
    if (error instanceof SeedValidationError) {
      return rejected(error)
    }
    throw error
  }

  const { rows, added, updated } = upsertByNaturalKey(meta, listRows(key), normalized)
  let ledgerCreated = 0
  if (meta.key !== 'project') {
    const today = new Date().toISOString().slice(0, 10)
    const ledger = applyLedger(moduleMeta('project'), listRows('project'), meta, today)
    saveRows('project', ledger.rows)
    ledgerCreated = ledger.created ? 1 : 0
  }
  saveRows(key, rows)
  return {
    ok: true,
    message:
      `${meta.name}导入完成：新增 ${added} 条、更新 ${updated} 条；治理工程台账` +
      (ledgerCreated > 0
        ? `新增待处理 1 条（${ledgerCode(key)}）`
        : `仍只挂 1 条（${ledgerCode(key)}），未重复挂账`),
    totals: { modules: 1, added, updated, ledgerCreated },
  }
}

/** 一次性导入全部示例数据：任何一处无效值整批退回重填，绝不含糊写一半。 */
export function importSeedData(): ImportSummary {
  const canonical = canonicalSeed as Record<string, EntryRow[]>
  try {
    validateCanonical(MODULES, canonical)
  } catch (error) {
    if (error instanceof SeedValidationError) {
      return rejected(error)
    }
    throw error
  }

  const today = new Date().toISOString().slice(0, 10)
  const projectMeta = moduleMeta('project')
  let added = 0
  let updated = 0
  let ledgerCreated = 0

  // 先归位各业务模块示例数据，治理工程最后收口（示例数据 + 每模块一条待处理台账）。
  for (const meta of MODULES) {
    if (meta.key === 'project') {
      continue
    }
    const result = upsertByNaturalKey(meta, listRows(meta.key), canonical[meta.key])
    saveRows(meta.key, result.rows)
    added += result.added
    updated += result.updated
  }
  let projectRows = upsertByNaturalKey(projectMeta, listRows('project'), canonical.project).rows
  for (const meta of MODULES) {
    if (meta.key === 'project') {
      continue
    }
    const ledger = applyLedger(projectMeta, projectRows, meta, today)
    projectRows = ledger.rows
    if (ledger.created) {
      ledgerCreated += 1
    }
  }
  saveRows('project', projectRows)

  return {
    ok: true,
    message:
      `全部 ${MODULES.length} 个模块示例数据导入完成：新增 ${added} 条、更新 ${updated} 条；` +
      `治理工程台账新增待处理 ${ledgerCreated} 条，同一模块重复导入不会重复挂账。`,
    totals: { modules: MODULES.length, added, updated, ledgerCreated },
  }
}

function rejected(error: SeedValidationError): ImportSummary {
  return {
    ok: false,
    message: error.message,
    totals: { modules: 0, added: 0, updated: 0, ledgerCreated: 0 },
  }
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: '﻿' + lines.join('\n') }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const modules = MODULES.map((meta) => {
    const entries = listRows(meta.key)
    return {
      name: meta.name,
      created: countRows(meta.key),
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
