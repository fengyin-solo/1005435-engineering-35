#!/usr/bin/env node
/**
 * 日常开发复位：把示例数据重新铺回初始状态，并推进数据版本。
 *
 *   npm run reset
 *
 * 前置条件：引导脚本已跑完「装依赖 → 铺数据」。没铺过数据就来复位属于插队，
 * 一律拒绝。复位后 seed-bundle.json 的版本号前进一代，前端页面下次打开
 * （或刷新）时发现 localStorage 里停在上一轮的中间状态，会自动整体改铺这份。
 */
import {
  buildSeedBundle,
  countRows,
  fail,
  LEDGER_MODULE,
  loadState,
  log,
  requirePhaseAtLeast,
  saveState,
} from './lib/workbench.mjs'

async function main() {
  const before = loadState()
  // 复位必须排在铺数据之后：新克隆的机器 EMPTY/DEPS_INSTALLED 阶段直接拒绝。
  requirePhaseAtLeast('SEEDED', before)

  log('reset', `当前阶段：${before.phase}，数据版本 ${before.seedVersion ?? '无'}，开始复位……`)

  // 复位与首次铺底共用同一条铺数据管线、同一份 seed-source.json。
  const generation = (before.generations ?? 0) + 1
  const { bundle, ledgerAttached } = buildSeedBundle({ generation })
  const { totals, total } = countRows(bundle)

  const state = saveState({
    phase: 'SEEDED',
    seedVersion: bundle.version,
    generations: generation,
    resets: (before.resets ?? 0) + 1,
    ledgerCode: bundle.ledgerCode,
  })

  log('reset', `示例数据已重新铺好，版本推进为 ${bundle.version}`)
  log('reset', `各业务模块清单条数已回到初始，登记总量 ${total}`)
  log(
    'reset',
    ledgerAttached
      ? `治理工程「${LEDGER_MODULE}」台账挂 1 条待处理（${bundle.ledgerCode}）`
      : `治理工程台账待处理记录保持 1 条（${bundle.ledgerCode}），未重复挂账`,
  )
  log('reset', `各模块初始条数：${JSON.stringify(totals)}`)
  log('reset', `累计复位 ${state.resets} 次。刷新浏览器页面即可看到复位结果（旧的本地中间状态会被自动改铺）`)
}

main().catch(fail)
