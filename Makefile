.PHONY: bootstrap seed reset install frontend build

# 新人一条命令：装依赖 + 铺示例数据（固定次序，脚本自己防插队）
bootstrap:
	node scripts/bootstrap.mjs up

seed:
	node scripts/bootstrap.mjs seed

# 日常开发复位：各模块清单条数回到初始
reset:
	node scripts/reset.mjs

install:
	cd frontend && npm install

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build
