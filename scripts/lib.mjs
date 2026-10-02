/**
 * 引导脚本 / 复位脚本共用库（Node ESM）。
 *
 * 所有路径都由本文件自身的位置推导（scripts/ 固定与 frontend/ 同级），
 * 从仓库里任意目录调用、或换一台机器克隆到别的盘符都能跑，不依赖 cwd、不写死绝对路径。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SeedValidationError,
  buildSnapshot,
  makeToken,
} from '../frontend/src/data/seed-core.js'

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(SCRIPT_DIR, '..')
export const FRONTEND_DIR = resolve(REPO_ROOT, 'frontend')
export const MODULES_JSON = resolve(FRONTEND_DIR, 'src/data/modules.json')
export const SEED_JSON = resolve(FRONTEND_DIR, 'src/data/seed.json')
export const SNAPSHOT_JSON = resolve(FRONTEND_DIR, 'src/data/seed.snapshot.json')
export const STATE_JSON = resolve(REPO_ROOT, '.bootstrap-state.json')

// 固定次序：none --install--> installed --seed--> seeded；复位只在 seeded 之后开放。
export const STAGES = /** @type {const} */ (['none', 'installed', 'seeded'])

export function fail(message, code = 1) {
  console.error(`✗ ${message}`)
  process.exit(code)
}

export function ok(message) {
  console.log(`✓ ${message}`)
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function readState() {
  try {
    const state = readJson(STATE_JSON)
    if (state && STAGES.includes(state.stage)) {
      return state
    }
  } catch {
    /* 首次运行视为 none */
  }
  return { stage: 'none', updatedAt: null }
}

export function writeState(stage) {
  writeFileSync(
    STATE_JSON,
    JSON.stringify({ stage, updatedAt: new Date().toISOString() }, null, 2) + '\n',
  )
}

/** 校验当前阶段，插队（跳过前置阶段）一律不认。 */
export function requireStage(expected, action) {
  const { stage } = readState()
  if (stage !== expected) {
    fail(`当前进度为「${stage}」，不能执行「${action}」：请按 装依赖 → 铺数据 → 复位 的固定次序推进。`)
  }
}

export function loadCanonical() {
  const modules = readJson(MODULES_JSON).modules
  const rows = readJson(SEED_JSON)
  return { modules, rows }
}

/** 跑同构导入管线并把快照落盘；示例数据里任何无效值都会在这里整批退回。 */
export function laySnapshot(reason) {
  const { modules, rows: canonical } = loadCanonical()
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  let snapshot
  try {
    snapshot = buildSnapshot(modules, canonical, { date })
  } catch (error) {
    if (error instanceof SeedValidationError) {
      fail(`示例数据存在无效值，已整批退回，未铺任何数据。请修正 src/data/seed.json 后重跑：\n${error.message}`)
    }
    throw error
  }
  const nonce = `${reason}-${now.toISOString().replace(/[:.]/g, '-')}`
  const token = makeToken(snapshot, nonce)
  mkdirSync(dirname(SNAPSHOT_JSON), { recursive: true })
  writeFileSync(
    SNAPSHOT_JSON,
    JSON.stringify({ token, generatedAt: now.toISOString(), reason, rows: snapshot }, null, 2) + '\n',
  )
  return { modules, snapshot, token }
}

/** 安装前端依赖：有 lockfile 用 npm ci（可复现），否则 npm install。 */
export function installDependencies() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const hasLock = exists(resolve(FRONTEND_DIR, 'package-lock.json'))
  const args = hasLock ? ['ci'] : ['install']
  console.log(`\n[1/2] 安装前端依赖（npm ${args.join(' ')}）`)
  const result = spawnSync(npm, args, { cwd: FRONTEND_DIR, stdio: 'inherit' })
  if (result.status !== 0) {
    fail('依赖安装失败，请按上面的 npm 输出排查后重试本命令（不会跳过铺数据继续）。')
  }
}

function exists(file) {
  return existsSync(file)
}

export function printCounts(modules, snapshot) {
  console.log('\n各业务模块初始清单条数（与运营概览同源）：')
  let total = 0
  for (const meta of modules) {
    const count = (snapshot[meta.key] ?? []).length
    total += count
    console.log(`  ${meta.name.padEnd(8, '　')} ${count} 条`)
  }
  console.log(`  登记总量合计：${total} 条`)
}
