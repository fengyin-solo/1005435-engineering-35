#!/usr/bin/env node
/**
 * 新同学起步引导：一条命令完成「装依赖 → 铺示例数据」。
 *
 *   npm run bootstrap
 *
 * 次序是写死的：没装完依赖绝不铺数据；已经铺过再跑会校验当前数据并幂等收尾，
 * 不会重复挂台账。跳过任何一步插队执行，一律不认。
 */
import {
  buildSeedBundle,
  countRows,
  ensureFrontendDeps,
  fail,
  FRONTEND_DIR,
  LEDGER_MODULE,
  loadState,
  log,
  PHASES,
  requirePhaseAtLeast,
  runNpm,
  saveState,
  ScriptError,
  SEED_BUNDLE_JSON,
} from './lib/workbench.mjs'

async function main() {
  let state = loadState()
  log('bootstrap', `当前阶段：${state.phase}（固定次序：${PHASES.join(' → ')}）`)

  // 第一步：装依赖。没装齐就装、装残了就补；这一步没成功绝不进入铺数据。
  log('install', '检查前端依赖（node_modules / vite）……')
  let deps = ensureFrontendDeps()
  if (!deps.installed) {
    log('install', '依赖未装齐，执行 npm install ……')
    runNpm(['install', '--no-audit', '--no-fund'], FRONTEND_DIR)
    // 装完再验：缺件 / 锁文件跨平台漏包时由校验器自动补装、重建锁文件。
    deps = ensureFrontendDeps()
  } else if (deps.repaired) {
    log('install', '残缺依赖已补装完成')
  } else {
    log('install', '依赖已就位，跳过安装')
  }
  if (!deps.installed) {
    throw new ScriptError('依赖安装后仍不可用，停止推进，铺数据步骤不予执行')
  }
  if (state.phase !== 'DEPS_INSTALLED' && state.phase !== 'SEEDED') {
    state = saveState({ phase: 'DEPS_INSTALLED' })
  }

  // 第二步：铺示例数据。依赖没装完时上面就会抛错，走不到这里。
  requirePhaseAtLeast('DEPS_INSTALLED', state)
  log('seed', '从共用示例数据来源导入并校验（同模块重复导入只挂一份）……')
  // 引导幂等：已经铺过就沿用同一代（内容相同、版本号不变，不会无谓冲掉浏览器数据）；
  // 版本号前进只由 npm run reset 触发。
  const generation = state.phase === 'SEEDED'
    ? (state.generations ?? 1)
    : (state.generations ?? 0) + 1
  const { bundle, duplicated, ledgerAttached } = buildSeedBundle({ generation })
  const { totals, total } = countRows(bundle)

  state = saveState({
    phase: 'SEEDED',
    seedVersion: bundle.version,
    generations: generation,
    ledgerCode: bundle.ledgerCode,
  })

  log('seed', `示例数据成品已生成：${SEED_BUNDLE_JSON}`)
  log('seed', `版本 ${bundle.version}；导入清单总条数 ${total}`)
  if (duplicated > 0) {
    log('seed', `识别并跳过 ${duplicated} 个重复导入的模块（每个模块只保留第一份）`)
  }
  log(
    'seed',
    ledgerAttached
      ? `导入收尾：治理工程「${LEDGER_MODULE}」台账已挂 1 条待处理（${bundle.ledgerCode}）`
      : `导入收尾：治理工程台账中待处理记录已存在，不重复挂账`,
  )
  log('seed', `各模块初始条数：${JSON.stringify(totals)}`)

  console.log('\n✓ 起步完成。接下来：\n  npm run dev      启动工作台（浏览器打开后自动使用这份示例数据）\n  npm run reset    日常开发复位，清单条数回到上面的初始值')
}

main().catch(fail)
