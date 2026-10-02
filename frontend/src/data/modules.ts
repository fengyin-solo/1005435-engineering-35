import modulesJson from './modules.json'
import type { ModuleMeta } from './types'

// 模块元数据只有一份来源：modules.json。
// 引导脚本 / 复位脚本（Node）通过同一个 JSON 文件读取，浏览器里也读它。
// JSON 推导成带可选键的联合类型，这里按约定结构收窄。
export const MODULES: ModuleMeta[] = modulesJson.modules as unknown as ModuleMeta[]

export const MODULE_BY_KEY: Map<string, ModuleMeta> = new Map(
  MODULES.map((item) => [item.key, item]),
)
