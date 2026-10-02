.PHONY: bootstrap setup reset install frontend build

# 新同学起步：装依赖 + 铺示例数据（固定次序，脚本内部把关）
bootstrap setup:
	node scripts/bootstrap.mjs

# 日常开发复位：清单条数回到初始
reset:
	node scripts/reset.mjs

install:
	cd frontend && npm install

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build
