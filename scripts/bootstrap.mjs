#!/usr/bin/env node
/**
 * 新人引导脚本：克隆仓库后的第一步，一条命令跑通。
 *
 *   node scripts/bootstrap.mjs up
 *
 * 固定次序推进，插队一律不认：
 *   none --装依赖--> installed --铺数据--> seeded
 *
 * 也可分步执行（仍受次序约束，前一步没做就跑下一步会被拒）：
 *   node scripts/bootstrap.mjs install
 *   node scripts/bootstrap.mjs seed
 */
import {
  FRONTEND_DIR,
  installDependencies,
  laySnapshot,
  ok,
  printCounts,
  readState,
  requireStage,
  writeState,
} from './lib.mjs'

function seed() {
  const { stage } = readState()
  if (stage === 'seeded') {
    console.log('数据已铺过，无需重复；日常想回到初始请运行：node scripts/reset.mjs')
    return
  }
  requireStage('installed', '铺数据')
  console.log('\n[2/2] 铺示例数据（同一来源、同一导入管线；导入收尾挂治理工程待处理台账）')
  const { modules, snapshot, token } = laySnapshot('bootstrap')
  writeState('seeded')
  ok(`示例数据已铺好（token ${token}），浏览器打开后会自动采用这份快照。`)
  printCounts(modules, snapshot)
}

function main() {
  const command = process.argv[2] ?? 'up'
  const { stage } = readState()

  if (command === 'install') {
    requireStage('none', '装依赖')
    installDependencies()
    writeState('installed')
    ok(`前端依赖已安装到 ${FRONTEND_DIR}/node_modules，下一步：node scripts/bootstrap.mjs seed`)
    return
  }

  if (command === 'seed') {
    seed()
    return
  }

  if (command === 'up') {
    console.log(`=== 工作台引导（当前进度：${stage}）===`)
    if (stage === 'none') {
      installDependencies()
      writeState('installed')
      ok('依赖安装完成。')
      seed()
      console.log('\n全部就绪：cd frontend && npm run dev，按终端地址打开即可。')
      return
    }
    if (stage === 'installed') {
      seed()
      console.log('\n全部就绪：cd frontend && npm run dev，按终端地址打开即可。')
      return
    }
    console.log('依赖与示例数据均已就绪，直接 cd frontend && npm run dev 即可；')
    console.log('日常开发想回到初始数据：node scripts/reset.mjs')
    return
  }

  console.error(`未知命令：${command}。可用：up（默认）| install | seed`)
  process.exit(2)
}

main()
