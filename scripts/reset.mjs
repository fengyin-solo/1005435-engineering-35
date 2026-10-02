#!/usr/bin/env node
/**
 * 日常开发复位入口：把各业务模块清单条数一次性打回初始。
 *
 *   node scripts/reset.mjs
 *
 * - 与引导脚本共用同一份示例数据来源（src/data/seed.json）和同一套导入管线；
 * - 重新落一份带新 token 的快照，浏览器刷新后检测到 token 变化，
 *   自动整包覆盖 localStorage 里的中间状态，运营概览与各模块重新对齐；
 * - 只在引导（装依赖 + 铺数据）完成后开放；没铺过数据先跑 node scripts/bootstrap.mjs up。
 * - 复位本身可反复执行，复位后阶段仍是 seeded。
 */
import { laySnapshot, ok, printCounts, readState, requireStage, writeState } from './lib.mjs'

function main() {
  const { stage } = readState()
  if (stage !== 'seeded') {
    requireStage('seeded', '复位')
  }
  console.log('=== 复位工作台到初始示例数据 ===')
  const { modules, snapshot, token } = laySnapshot('reset')
  writeState('seeded')
  ok(`已复位（token ${token}）。刷新浏览器后各模块清单条数即回到初始，旧的浏览器中间状态不再采用。`)
  printCounts(modules, snapshot)
}

main()
