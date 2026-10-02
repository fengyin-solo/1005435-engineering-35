import bundle from './seed-bundle.json'
import type { ModuleMeta } from './types'

// 模块元数据的唯一登记处是 data/modules.json，由起步脚本和页面共用：
// 脚本拿它校验示例数据，页面拿它渲染清单，两处口径不会再各说各话。
export const MODULES = bundle.modules as unknown as ModuleMeta[]

export const MODULE_BY_KEY: Map<string, ModuleMeta> = new Map(
  MODULES.map((item) => [item.key, item]),
)
