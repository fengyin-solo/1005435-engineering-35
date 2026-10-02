/**
 * 示例数据导入管线（同构核心）：
 * Node 引导/复位脚本与浏览器里的应用共用这一份，不允许任何一边再各写一套。
 *
 * 约定：
 * - 每个模块的业务主键取该模块第一个字段（如隐患编号、工程编号）；
 *   同一业务模块导入两次，按业务主键只认一条（upsert，不新增）。
 * - 导入收尾要驱动治理工程台账：每导入一个业务模块，就在治理工程模块挂一条
 *   待处理台账，工程编号即台账主键，重复导入同一模块只挂同一条。
 * - 任何一条数据落成无效值，整批退回（抛 SeedValidationError），不做半条落库。
 *
 * 本文件不含任何文件系统 / 浏览器 API：JSON 由调用方读好后传入。
 * 路径也不在这里出现——谁调用谁用自己的 import.meta.url 定位文件。
 */

export class SeedValidationError extends Error {
  /** @param {string[]} details 逐条退回原因 */
  constructor(details) {
    super(`示例数据校验未通过，共 ${details.length} 处无效值，已整批退回：\n- ${details.join('\n- ')}`)
    this.name = 'SeedValidationError'
    this.details = details
  }
}

const PROJECT_KEY = 'project'
const LEDGER_PREFIX = 'AUTO-LEDGER-'
/** 台账固定挂在治理工程的第一个状态（待批复），因此 pending 恒为 true。 */
const LEDGER_STATUS = '待批复'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function fail(details, message) {
  details.push(message)
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 业务主键值：每个模块的第一个字段。 */
export function naturalKeyValue(meta, row) {
  return String(row[meta.fields[0]] ?? '').trim()
}

/** 某业务模块导入后挂到治理工程台账上的工程编号（台账主键）。 */
export function ledgerCode(moduleKey) {
  return `${LEDGER_PREFIX}${moduleKey.toUpperCase()}`
}

function isValidFieldValue(value) {
  if (typeof value === 'string') {
    return value.trim() !== ''
  }
  if (typeof value === 'boolean') {
    return true
  }
  return isFiniteNumber(value)
}

function validateRowShape(meta, row, details, label) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    fail(details, `${label}：不是一条记录（应为对象）`)
    return
  }
  const status = row.status
  if (typeof status !== 'string' || status.trim() === '') {
    fail(details, `${label}：状态 status 缺失或不是非空字符串`)
  } else if (!meta.statuses.includes(status)) {
    fail(details, `${label}：状态「${status}」不在 ${meta.name} 的合法状态集 ${meta.statuses.join('/')} 内`)
  }
  if (typeof row.pending !== 'boolean') {
    fail(details, `${label}：pending 必须是布尔值`)
  }
  if (typeof row.abnormal !== 'boolean') {
    fail(details, `${label}：abnormal 必须是布尔值`)
  }
  for (const field of meta.fields) {
    if (!Object.prototype.hasOwnProperty.call(row, field)) {
      fail(details, `${label}：缺字段「${field}」`)
    } else if (!isValidFieldValue(row[field])) {
      fail(details, `${label}：字段「${field}」落成了无效值（空值 / 空串 / NaN 一律不认）`)
    }
  }
}

/**
 * 校验整份规范示例数据：模块齐不齐、记录有没有无效值、id / 业务主键有没有重复。
 * 任何一处不过就抛 SeedValidationError（整批退回重填）。
 * @param {Array<object>} modules 模块元数据（modules.json）
 * @param {Record<string, Array>} rows 各模块记录（seed.json）
 */
export function validateCanonical(modules, rows) {
  const details = []
  if (!Array.isArray(modules) || modules.length === 0) {
    throw new SeedValidationError(['模块元数据为空'])
  }
  if (rows === null || typeof rows !== 'object' || Array.isArray(rows)) {
    throw new SeedValidationError(['示例数据不是「模块 -> 记录数组」的结构'])
  }

  const metaKeys = modules.map((meta) => meta.key)
  for (const key of metaKeys) {
    if (!Object.prototype.hasOwnProperty.call(rows, key)) {
      fail(details, `模块「${key}」在示例数据里整组缺失`)
    }
  }
  for (const key of Object.keys(rows)) {
    if (!metaKeys.includes(key)) {
      fail(details, `示例数据里出现了未登记的模块「${key}」`)
    }
  }

  for (const meta of modules) {
    const list = rows[meta.key]
    if (!Array.isArray(list)) {
      continue
    }
    const seenIds = new Set()
    const seenKeys = new Set()
    list.forEach((row, index) => {
      const label = `${meta.name} 第 ${index + 1} 行`
      validateRowShape(meta, row, details, label)
      if (row === null || typeof row !== 'object') {
        return
      }
      if (!Number.isInteger(row.id) || row.id <= 0) {
        fail(details, `${label}：id 必须是正整数`)
      } else if (seenIds.has(row.id)) {
        fail(details, `${label}：id=${row.id} 在${meta.name}内重复`)
      } else {
        seenIds.add(row.id)
      }
      const natural = naturalKeyValue(meta, row)
      if (natural === '') {
        fail(details, `${label}：业务主键「${meta.fields[0]}」为空`)
      } else if (seenKeys.has(natural)) {
        fail(details, `${label}：业务主键「${natural}」在${meta.name}内重复`)
      } else {
        seenKeys.add(natural)
      }
    })
  }

  if (details.length > 0) {
    throw new SeedValidationError(details)
  }
}

/**
 * 校验一次外部导入的批次。id 由系统分配，因此不要求、也不接受外部给 id；
 * 一条不过整批退回。
 * @returns {Array} 规整后的记录（深拷贝，补了 id 占位以外的默认值）
 */
export function validateImportBatch(meta, incoming) {
  const details = []
  if (!Array.isArray(incoming) || incoming.length === 0) {
    throw new SeedValidationError([`${meta.name}：导入内容为空，不予接收`])
  }
  const normalized = incoming.map((row, index) => {
    const label = `${meta.name} 导入第 ${index + 1} 行`
    validateRowShape(meta, row, details, label)
    if (row !== null && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, 'id')) {
      fail(details, `${label}：id 由系统分配，导入数据里不许自带 id`)
    }
    return row
  })
  const seenKeys = new Set()
  normalized.forEach((row, index) => {
    if (row === null || typeof row !== 'object') {
      return
    }
    const natural = naturalKeyValue(meta, row)
    if (natural !== '') {
      if (seenKeys.has(natural)) {
        fail(details, `${meta.name} 导入第 ${index + 1} 行：业务主键「${natural}」在同一批次里重复`)
      }
      seenKeys.add(natural)
    }
  })
  if (details.length > 0) {
    throw new SeedValidationError(details)
  }
  return clone(normalized)
}

function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

/**
 * 把一批记录按业务主键 upsert 进现有清单。
 * 同主键第二次导入 = 更新原条，绝不新增（「走两次导入只挂一条」）。
 * @returns {{ rows: Array, added: number, updated: number }}
 */
export function upsertByNaturalKey(meta, existing, incoming) {
  const rows = [...existing]
  let added = 0
  let updated = 0
  let seq = nextId(rows)
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  for (const raw of incoming) {
    const natural = naturalKeyValue(meta, raw)
    const index = rows.findIndex((row) => naturalKeyValue(meta, row) === natural)
    const base = index >= 0 ? { ...rows[index] } : { id: seq++ }
    for (const field of meta.fields) {
      base[field] = raw[field]
    }
    base.status = raw.status
    // pending 未显式给时按状态推导；abnormal 默认 false。
    base.pending = typeof raw.pending === 'boolean' ? raw.pending : raw.status !== lastStatus
    base.abnormal = typeof raw.abnormal === 'boolean' ? raw.abnormal : false
    if (index >= 0) {
      rows[index] = base
      updated += 1
    } else {
      rows.push(base)
      added += 1
    }
  }
  return { rows, added, updated }
}

/**
 * 导入收尾：为来源模块在治理工程台账上挂一条待处理。
 * 台账主键是固定的工程编号，同一来源模块重复导入只更新这一条。
 * @returns {{ rows: Array, created: boolean }}
 */
export function applyLedger(projectMeta, existing, sourceMeta, date) {
  const code = ledgerCode(sourceMeta.key)
  const ledgerRow = {
    status: LEDGER_STATUS,
    pending: true,
    abnormal: false,
    工程编号: code,
    所属隐患点: `${sourceMeta.name}示例数据导入`,
    工程类型: '导入待处理台账',
    批复日期: date,
    批复金额: 0,
    承建单位: '系统自动挂账',
    完工日期: date,
    工程状态: LEDGER_STATUS,
  }
  const { rows, added } = upsertByNaturalKey(projectMeta, existing, [ledgerRow])
  return { rows, created: added > 0 }
}

/**
 * 跑一遍完整的规范示例数据导入管线：
 * 每个业务模块的示例数据归位，并在治理工程台账挂一条待处理。
 * 幂等：同一份数据跑两遍，结果一模一样（清单条数不变、台账也不重复挂）。
 * @param {Array<object>} modules
 * @param {Record<string, Array>} canonical
 * @param {{ date: string }} options
 */
export function buildSnapshot(modules, canonical, options) {
  validateCanonical(modules, canonical)
  const rows = {}
  for (const meta of modules) {
    rows[meta.key] = clone(canonical[meta.key])
  }
  const projectMeta = modules.find((meta) => meta.key === PROJECT_KEY)
  let projectRows = clone(rows[PROJECT_KEY])
  for (const meta of modules) {
    if (meta.key === PROJECT_KEY) {
      continue
    }
    ;({ rows: projectRows } = applyLedger(projectMeta, projectRows, meta, options.date))
  }
  rows[PROJECT_KEY] = projectRows
  return rows
}

/** FNV-1a 32 位摘要：同一份数据同 nonce 必然同 token，换一次铺/复位就换 token。 */
export function makeToken(rows, nonce) {
  const text = JSON.stringify(rows)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `seed-${(hash >>> 0).toString(16)}-${nonce}`
}

export const SNAPSHOT_PROJECT_KEY = PROJECT_KEY
