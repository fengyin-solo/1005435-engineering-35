# 山地地质灾害隐患巡查与治理工作台

面向隐患点建档、坡体形变与裂缝观测、雨量预警发布、避险搬迁与治理工程验收的山区地质灾害防治工作台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动（新人第一步，一条命令）

克隆后不用手工 `npm install`、也不用去清浏览器存储，在仓库根目录跑：

```bash
make bootstrap          # 等价于 node scripts/bootstrap.mjs up
```

它按**固定次序**做两件事，插队（跳过前一步直接跑下一步）会被脚本拒绝：

1. 装依赖：`frontend/` 有 lockfile 用 `npm ci`，没有就 `npm install`；
2. 铺示例数据：读取唯一示例数据来源 `frontend/src/data/seed.json`，经
   `frontend/src/data/seed-core.js` 这套导入管线生成快照
   `frontend/src/data/seed.snapshot.json`（本地文件，不入库）。

然后启动前端：

```bash
cd frontend
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。
首次打开会自动采用脚本铺好的快照：各业务模块清单条数回到初始，运营概览与业务模块
天然对得上，不用手工折腾浏览器存储。

分步命令（仍受次序约束）：

```bash
node scripts/bootstrap.mjs install   # 仅装依赖（none -> installed）
node scripts/bootstrap.mjs seed      # 仅铺数据（installed -> seeded）
node scripts/bootstrap.mjs up        # 默认：按当前进度补齐剩余步骤
```

脚本路径全部相对脚本自身位置解析，从任何目录调用、克隆到任何盘符都能跑，不钉死绝对路径。

## 日常开发复位

数据玩乱了，一条命令回到初始（各模块清单条数、运营概览全部复位）：

```bash
make reset              # 等价于 node scripts/reset.mjs
```

复位与引导共用同一份示例数据来源和同一套导入管线，只是重新生成一份带新 token 的快照；
浏览器刷新后发现 token 变化，会整包丢弃 localStorage 里的中间状态、采用新快照。
复位可反复执行，阶段保持在「已铺数据」。

生产构建：

```bash
cd frontend
npm run build
```

## 数据来源与口径优先级

- **唯一示例数据来源**：`frontend/src/data/seed.json`；模块元数据在
  `frontend/src/data/modules.json`。引导脚本、复位脚本（Node）和浏览器应用都只认这两份，
  不再各写一份。
- **同构导入管线**：`frontend/src/data/seed-core.js` 同时被脚本和应用引用，
  导入、去重、台账挂账、校验规则只有一份实现。
- 当浏览器 `localStorage` 与脚本铺好的快照两处口径顶上时，**以脚本快照为准**，
  token 对不上就整包覆盖浏览器数据（规则实现在 `frontend/src/data/local-store.ts`）。
- 条数口径只有一份：模块页表底、运营概览、脚本打印都走数据层缓存
  （`allRows() / countRows()`），不存在两套数字。

### 导入约定

- 每个模块按**业务主键**（该模块第一个字段，如隐患编号、工程编号）upsert；
  同一条业务模块的数据走两次导入，只认一条（第二次为更新，不新增）。
- 导入收尾驱动**治理工程台账**：每导入一个业务模块，治理工程里就挂一条
  待处理台账（工程编号 `AUTO-LEDGER-<模块>`）；同一模块重复导入仍只挂这一条。
- 任何一条记录落成无效值（空值 / 空串 / NaN、非法状态、主键缺失、id 重复等），
  **整批退回**，一条都不写，并逐条列出退回原因。

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 隐患点建档 | `hazard` | 隐患点 | 隐患编号、所在乡镇、灾害类型 |
| 边坡形变 | `slope` | 边坡观测点 | 测点编号、所属隐患点、监测方式 |
| 裂缝观测 | `crack` | 裂缝观测记录 | 裂缝编号、所属隐患点、裂缝走向 |
| 雨量站网 | `rain` | 雨量站 | 站号、站点名称、所属流域 |
| 预警发布 | `warning` | 预警信息 | 预警编号、发布对象、预警级别 |
| 群测群防巡查 | `patrol` | 巡查记录 | 巡查编号、所属隐患点、巡查人 |
| 避险搬迁 | `relocate` | 搬迁安置单 | 搬迁编号、所属隐患点、涉及户数 |
| 避险场所 | `refuge` | 避险场所 | 场所编号、场所名称、可容纳人数 |
| 应急演练 | `drill` | 应急演练 | 演练编号、演练主题、参演队伍 |
| 治理工程 | `project` | 治理工程 | 工程编号、所属隐患点、工程类型 |
| 削坡减载 | `cutting` | 削坡工序 | 工序编号、所属工程、削坡方量 |
| 支挡结构 | `wall` | 支挡结构 | 结构编号、所属工程、结构形式 |
| 排水系统 | `drainage` | 排水设施 | 排水编号、所属工程、排水形式 |
| 警示标识 | `signboard` | 警示标识 | 标识编号、所属隐患点、标识类别 |
| 险情上报 | `report` | 险情上报单 | 上报编号、所属隐患点、险情类别 |
| 专家会商 | `consult` | 专家会商 | 会商编号、会商主题、参会专家 |
| 隐患核销 | `clearance` | 核销单 | 核销编号、所属隐患点、核销依据 |
| 受威胁对象 | `threat` | 受威胁对象 | 对象编号、所属隐患点、对象类型 |

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 想回到初始数据：仓库根目录 `make reset`（或 `node scripts/reset.mjs`）；
  单个模块也可调用 `resetModule(模块)`。运营概览页另有「导入示例数据」按钮，
  走同一套导入管线（去重、台账挂账、无效值整批退回）。
