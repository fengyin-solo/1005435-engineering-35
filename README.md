# 山地地质灾害隐患巡查与治理工作台

面向隐患点建档、坡体形变与裂缝观测、雨量预警发布、避险搬迁与治理工程验收的山区地质灾害防治工作台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── package.json              仓库根脚本入口：bootstrap / reset / dev / build
├── scripts/
│   ├── bootstrap.mjs         新同学引导：装依赖 → 铺示例数据（固定次序）
│   ├── reset.mjs             日常开发复位：清单条数回到初始
│   └── lib/workbench.mjs     两个入口共用的内核（状态机、校验、导入去重、台账）
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化
│   │   ├── modules.json      模块元数据（唯一登记处，脚本与页面共用）
│   │   ├── seed-source.json  示例数据来源（唯一的一手素材，改这里）
│   │   └── seed-bundle.json  脚本铺好的示例数据成品（页面直接读，勿手改）
│   ├── src/stores/           会话与筛选状态
│   ├── .workbench/           起步脚本的运行期状态（不入库，自动生成）
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 快速开始

新同学克隆下来，在**仓库根目录**一条命令起步（路径不写死，换机器、换克隆目录都一样）：

```bash
npm run bootstrap     # = 装依赖 + 铺示例数据，按固定次序一次跑完
npm run dev
```

- 只依赖 Node >= 18 和 npm，引导脚本自身只用 Node 内置模块，不需要先装别的东西。
- 装依赖会「装完即验」：真正加载一次 vite / rollup / esbuild 的平台原生件，
  遇到跨平台复制 `node_modules` 或 npm 可选依赖漏装（[npm/cli#4828](https://github.com/npm/cli/issues/4828)）
  会自动删装重补、必要时重建 `package-lock.json`，不会把残缺依赖带进下一步。
- 也可以用 `make bootstrap`（复位 `make reset`）。

### 日常开发复位

本地数据被自己改乱、停在上一轮中间状态时：

```bash
npm run reset
```

复位与首次引导**共用同一份示例数据来源和同一条铺数据管线**，跑完后 18 个业务模块
清单条数全部回到初始（每模块 3 条，治理工程为 4 条：3 条示例 + 1 条导入收尾挂账的待处理台账）。
复位会把示例数据版本号推进一代，浏览器页面下次打开或刷新时发现本地版本落后，
会自动把 `localStorage` 里的中间状态整体改铺成新示例，不需要手工清浏览器存储。
运营概览页上也有「复位示例数据」按钮，是同一份数据的页内入口。

### 起步状态机

装依赖、铺数据、复位按固定次序推进，插队一律不认：

```text
EMPTY ──装依赖──▶ DEPS_INSTALLED ──铺数据──▶ SEEDED ──复位──▶ SEEDED
```

没跑过引导直接 `npm run reset` 会被拒绝；引导脚本可重复执行（幂等），已铺过时不会重复挂账、
不会无谓推进版本。推进记录写在 `frontend/.workbench/state.json`（不入库）。

## 启动（手工方式）

```bash
cd frontend
npm install
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

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
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.json`（页面经
  `src/data/modules.ts` 读取）；示例数据一手素材在 `frontend/src/data/seed-source.json`，
  脚本铺好的成品在 `frontend/src/data/seed-bundle.json`。改示例数据只改 `seed-source.json`，
  然后重跑 `npm run bootstrap` 或 `npm run reset`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 条数口径唯一：运营概览与各模块清单都从 `allRows()` 这一份数据读取，计数统一走
  `countRows()`，不会再出现概览数字和模块清单对不上的情况。
- 口径优先级（两处顶上时以此为准）：**`seed-bundle.json` 示例数据版本优先**；浏览器
  `localStorage` 只是工作副本，版本不符（跑过 reset）或整份数据校验无效（损坏、缺模块、
  状态非法、id 撞号、字段落成空串等无效值）时，本地副本一律作废、整体退回重铺。
- 同一个业务模块重复导入只挂一份（以模块为单位去重，第一份生效）；导入收尾会在治理工程
  台账挂一条待处理记录（`PROJ-SEED-LEDGER`），重复收尾幂等、只挂一条。
- 想回到初始数据：仓库根执行 `npm run reset`，或在运营概览页点「复位示例数据」；
  也可以手工清掉浏览器里 `geohazard-patrol:entries` / `geohazard-patrol:seed-version`。
