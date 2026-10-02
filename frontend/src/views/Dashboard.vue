<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。条数与各模块清单同一份来源。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" :disabled="importing" @click="importSamples">
          {{ importing ? '导入中…' : '导入示例数据' }}
        </button>
        <button class="btn" type="button" @click="refresh">重新统计</button>
      </div>
    </header>
    <p v-if="importMessage" class="import-result" :class="{ 'error-text': !importOk }">
      {{ importMessage }}
    </p>
    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>
    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td>{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>
    <footer class="page-foot">
      <span>数据保存在本机浏览器里；跑过铺数据/复位脚本后刷新页面会自动对齐到最新示例快照。</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { importSeedData, loadOverview } from '@/api/local-service'
import type { OverviewResult } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const importing = ref(false)
const importMessage = ref('')
const importOk = ref(true)

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
}

// 与引导脚本同一套导入管线：同一模块导两次只认一条；治理工程台账每模块只挂一条待处理。
function importSamples() {
  importing.value = true
  try {
    const result = importSeedData()
    importOk.value = result.ok
    importMessage.value = result.message
    refresh()
  } finally {
    importing.value = false
  }
}

onMounted(refresh)
</script>

<style scoped>
.import-result {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #f0f7ff;
  border: 1px solid #b9d6f5;
  white-space: pre-wrap;
  line-height: 1.6;
}
</style>
