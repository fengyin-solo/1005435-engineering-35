/**
 * 工作台起步脚本的共用内核：bootstrap / reset 两个入口都只调这里。
 *
 * 只用 Node 内置模块，不依赖 node_modules，换机器克隆下来就能跑。
 * 所有路径一律从本文件位置反推，不写死任何绝对路径。
 */
import {
  createHash,
} from 'node:crypto'
import {
  spawnSync,
} from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {
  createRequire,
} from 'node:module'
import {
  dirname,
  resolve,
} from 'node:path'
import {
  fileURLToPath,
} from 'node:url'

// ---- 路径：全部相对脚本自身定位，仓库挪到任何目录都能跑 ---------------------

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(SCRIPTS_DIR, '..', '..')
export const FRONTEND_DIR = resolve(REPO_ROOT, 'frontend')
const DATA_DIR = resolve(FRONTEND_DIR, 'src', 'data')
const RUNTIME_DIR = resolve(FRONTEND_DIR, '.workbench')

export const MODULES_JSON = resolve(DATA_DIR, 'modules.json')
/** 唯一的示例数据来源（原始素材），引导铺数据与日常复位都以它为准。 */
export const SEED_SOURCE_JSON = resolve(DATA_DIR, 'seed-source.json')
/** 生成的示例数据成品：前端 src 直接 import 这一份，脚本与页面口径天然一致。 */
export const SEED_BUNDLE_JSON = resolve(DATA_DIR, 'seed-bundle.json')
export const STATE_FILE = resolve(RUNTIME_DIR, 'state.json')

// ---- 状态机：状态只能按固定次序推进，插队一律不认 -------------------------
//
//   EMPTY ──装依赖──▶ DEPS_INSTALLED ──铺数据──▶ SEEDED
//                                              ▲        │
//                                              └─复位────┘
//
// 复位是日常开发动作，只允许在「铺数据完成」之后发生，完成后仍回到 SEEDED。

export const PHASES = /** @type {const} */ (['EMPTY', 'DEPS_INSTALLED', 'SEEDED'])

export const PHASE_RANK = Object.fromEntries(PHASES.map((phase, index) => [phase, index]))

const INITIAL_STATE = {
  phase: 'EMPTY',
  seedVersion: null,
  generations: 0,
  resets: 0,
  ledgerCode: null,
  updatedAt: null,
}

export function loadState() {
  if (!existsSync(STATE_FILE)) {
    return { ...INITIAL_STATE }
  }
  try {
    return { ...INITIAL_STATE, ...JSON.parse(readFileSync(STATE_FILE, 'utf8')) }
  } catch {
    // 状态文件自身损坏属于「上一轮的中间状态」，从空重来，不允许带病往下走。
    return { ...INITIAL_STATE }
  }
}

export function saveState(patch) {
  mkdirSync(RUNTIME_DIR, { recursive: true })
  const next = { ...loadState(), ...patch, updatedAt: new Date().toISOString() }
  writeFileSync(STATE_FILE, JSON.stringify(next, null, 2) + '\n')
  return next
}

/** 要求当前阶段处于固定次序的某一环，次序不够直接拒绝，不允许插队。 */
export function requirePhaseAtLeast(required, state = loadState()) {
  if (PHASE_RANK[state.phase] < PHASE_RANK[required]) {
    throw new ScriptError(
      `步骤被插队：当前阶段为「${state.phase}」，必须先完成「${required}」之前的步骤。\n`
      + `固定次序为：装依赖 → 铺数据 → 复位（仅限日常开发）。新机器请先跑 npm run bootstrap。`,
    )
  }
}

// ---- 输出与退出 -----------------------------------------------------------

export class ScriptError extends Error {}

export function log(step, message) {
  console.log(`[${step}] ${message}`)
}

export function fail(error) {
  const reason = error instanceof Error ? error.message : String(error)
  console.error(`\n✗ ${reason}`)
  process.exit(1)
}

export function runNpm(args, cwd) {
  // npm 在 Windows 上是 npm.cmd，必须走 shell；跨平台统一用 shell 模式。
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    const detail = result.error
      ? `${result.error.code ?? ''} ${result.error.message}`
      : `退出码 ${result.status ?? `被信号 ${result.signal} 终止`}`
    throw new ScriptError(`npm ${args.join(' ')} 执行失败（${detail}）`)
  }
}

/**
 * 装完即验：npm 有跨平台可选依赖漏装的老毛病
 * （https://github.com/npm/cli/issues/4828），进程退出码为 0 不代表依赖真的能用。
 * 这里实际加载一次 vite，缺件立刻补装，绝不带着残缺依赖进入铺数据阶段。
 * 第二次校验若再失败，按 npm 官方建议连同锁文件一起重建。
 */
export function ensureFrontendDeps() {
  const vitePath = resolve(FRONTEND_DIR, 'node_modules', 'vite')
  if (!existsSync(vitePath)) {
    return { installed: false, repaired: false }
  }
  if (loadVite().ok) {
    return { installed: true, repaired: false }
  }
  log('install', '检测到依赖残缺（典型为跨平台复制 node_modules / npm 可选依赖漏装），删装重补……')
  rmSync(resolve(FRONTEND_DIR, 'node_modules'), { recursive: true, force: true })
  runNpm(['install', '--no-audit', '--no-fund'], FRONTEND_DIR)
  if (loadVite().ok) {
    return { installed: true, repaired: true }
  }
  log('install', '仍有缺件，按 npm 可选依赖问题的官方处置重建 package-lock.json ……')
  rmSync(resolve(FRONTEND_DIR, 'package-lock.json'), { force: true })
  rmSync(resolve(FRONTEND_DIR, 'node_modules'), { recursive: true, force: true })
  runNpm(['install', '--no-audit', '--no-fund'], FRONTEND_DIR)
  const probe = loadVite()
  if (!probe.ok) {
    throw new ScriptError(
      '依赖重装并重建锁文件后仍无法加载 vite，请检查 Node 版本（需 >=18）与网络后重跑 npm run bootstrap。\n'
      + `底层原因：${probe.error}`,
    )
  }
  return { installed: true, repaired: true }
}

function loadVite() {
  try {
    // 只 require('vite') 入口还不够：rollup / esbuild 的平台原生二进制是懒加载的，
    // 跨平台拷 node_modules 时入口能加载、真正一构建就炸，这里把原生件都探一遍。
    requireFrom('vite')

    const { arch, platform } = process
    const rollupCandidates = platform === 'win32'
      ? [`${platform}-${arch}-msvc`]
      : platform === 'darwin'
        ? [`${platform}-${arch}`]
        : [`${platform}-${arch}-gnu`, `${platform}-${arch}-musl`]
    const rollupOk = rollupCandidates.some((key) => {
      try {
        requireFrom(`@rollup/rollup-${key}/package.json`)
        return true
      } catch {
        return false
      }
    })
    if (!rollupOk) {
      throw new Error(`缺少 @rollup/rollup-${rollupCandidates[0]} 等平台原生绑定`)
    }

    // esbuild 原生二进制：能真正取到可执行路径才算数。
    const esbuild = requireFrom('esbuild')
    if (typeof esbuild.transformSync !== 'function') {
      throw new Error('esbuild 原生二进制不可用')
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

const requireFrom = createRequire(resolve(FRONTEND_DIR, '__bootstrap__.cjs'))

// ---- 示例数据：校验、导入去重、治理台账挂账 -------------------------------

export const LEDGER_MODULE = 'project'
export const LEDGER_CODE = 'PROJ-SEED-LEDGER'
export const LEDGER_MARK = '示例数据导入收尾'
const LEDGER_ID = 9001

/**
 * 校验示例数据。落成无效值的一律退回：脚本层直接报错退出、不写成品，
 * 逼着把 seed-source.json 改对再重跑（前端层则会丢弃坏数据重新播种）。
 */
export function validateDataset(modules, rowsByModule) {
  const problems = []
  const moduleKeys = new Set()

  for (const meta of modules) {
    if (!meta || typeof meta.key !== 'string' || !meta.key.trim()) {
      problems.push('存在缺少 key 的模块定义')
      continue
    }
    if (moduleKeys.has(meta.key)) {
      problems.push(`模块「${meta.key}」在 modules.json 里重复登记`)
    }
    moduleKeys.add(meta.key)

    for (const field of ['name', 'entity', 'fields', 'statuses']) {
      const value = meta[field]
      const ok = Array.isArray(value)
        ? value.length > 0 && value.every((item) => typeof item === 'string' && item.trim() !== '')
        : typeof value === 'string' && value.trim() !== ''
      if (!ok) {
        problems.push(`模块「${meta.key}」的 ${field} 为空或类型不对`)
      }
    }
  }

  for (const key of Object.keys(rowsByModule)) {
    if (!moduleKeys.has(key)) {
      problems.push(`示例数据里出现了未登记的模块「${key}」，数据无处落账`)
    }
  }

  for (const meta of modules) {
    const rows = rowsByModule[meta.key]
    if (!Array.isArray(rows)) {
      problems.push(`模块「${meta.key}」没有示例数据清单`)
      continue
    }
    const ids = new Set()
    rows.forEach((row, index) => {
      const where = `模块「${meta.key}」第 ${index + 1} 条`
      if (typeof row?.id !== 'number' || !Number.isInteger(row.id) || row.id <= 0) {
        problems.push(`${where} 的 id 不是正整数`)
      } else if (ids.has(row.id)) {
        problems.push(`${where} 的 id=${row.id} 与同模块其他记录撞号`)
      }
      ids.add(row?.id)

      if (typeof row?.status !== 'string' || !meta.statuses.includes(row.status)) {
        problems.push(`${where}（id=${row?.id}）的状态「${row?.status}」不在 ${meta.statuses.join('/')} 之中`)
      }
      if (typeof row?.pending !== 'boolean') problems.push(`${where}（id=${row?.id}）的 pending 不是布尔值`)
      if (typeof row?.abnormal !== 'boolean') problems.push(`${where}（id=${row?.id}）的 abnormal 不是布尔值`)

      // 空串、null、undefined、纯空白都算无效值；数字型业务字段允许有限数值。
      for (const field of meta.fields) {
        const value = row?.[field]
        const valid = typeof value === 'string'
          ? value.trim() !== ''
          : typeof value === 'number' && Number.isFinite(value)
        if (!valid) {
          problems.push(`${where}（id=${row?.id}）的字段「${field}」落成了无效值`)
        }
      }
    })
  }

  if (problems.length > 0) {
    throw new ScriptError(
      `示例数据校验未通过，共 ${problems.length} 处，已退回不写盘，请改好 seed-source.json 重跑：\n - `
      + problems.join('\n - '),
    )
  }
}

/**
 * 把一份模块数据导入总表。同一业务模块只认第一次：走两次导入，清单里只挂一份，
 * 重复的那份直接跳过并计数，不做合并、不覆盖。
 */
export function importModuleRows(dataset, key, rows, seenModules) {
  if (seenModules.has(key)) {
    return { duplicated: true }
  }
  seenModules.add(key)
  dataset[key] = rows
  return { duplicated: false }
}

/** 导入收尾：给治理工程台账挂一条待处理记录；重复收尾幂等，只挂一条。 */
export function attachGovernanceLedger(dataset, modules) {
  const meta = modules.find((item) => item.key === LEDGER_MODULE)
  const rows = dataset[LEDGER_MODULE] ?? []
  if (rows.some((row) => row['工程编号'] === LEDGER_CODE)) {
    return { attached: false }
  }
  rows.push({
    id: LEDGER_ID,
    status: meta.statuses[0],
    pending: true,
    abnormal: false,
    工程编号: LEDGER_CODE,
    所属隐患点: '全量隐患点',
    工程类型: '台账核对',
    批复日期: '2026-09-18',
    批复金额: '待核定',
    承建单位: '工作台治理组',
    完工日期: '待定',
    工程状态: meta.statuses[0],
    台账事项: `${LEDGER_MARK}，待核对挂账`,
  })
  dataset[LEDGER_MODULE] = rows
  return { attached: true }
}

export function hashDataset(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12)
}

/**
 * 铺数据（同时服务 bootstrap 首次铺底与 reset 复位）：
 * 从同一份 seed-source.json 逐模块导入 → 校验 → 导入收尾挂治理台账 → 写成品。
 */
export function buildSeedBundle({ generation }) {
  const modules = JSON.parse(readFileSync(MODULES_JSON, 'utf8'))
  const source = JSON.parse(readFileSync(SEED_SOURCE_JSON, 'utf8'))

  const dataset = {}
  const seenModules = new Set()
  let duplicated = 0

  // 固定按模块登记顺序导入，结果稳定可复现。
  for (const meta of modules) {
    const result = importModuleRows(dataset, meta.key, source[meta.key] ?? [], seenModules)
    if (result.duplicated) duplicated += 1
  }
  // 来源里若有未登记模块，校验阶段会拦下；这里不悄悄丢弃。

  const ledger = attachGovernanceLedger(dataset, modules)
  validateDataset(modules, dataset)

  const sourceHash = hashDataset({ modules, source })
  const version = `${sourceHash}-g${generation}`
  const bundle = {
    version,
    sourceHash,
    generation,
    ledgerCode: LEDGER_CODE,
    modules,
    rows: dataset,
  }
  writeFileSync(SEED_BUNDLE_JSON, JSON.stringify(bundle, null, 2) + '\n')
  return { bundle, duplicated, ledgerAttached: ledger.attached }
}

export function countRows(bundle) {
  const totals = {}
  let total = 0
  for (const meta of bundle.modules) {
    const count = (bundle.rows[meta.key] ?? []).length
    totals[meta.key] = count
    total += count
  }
  return { totals, total }
}
