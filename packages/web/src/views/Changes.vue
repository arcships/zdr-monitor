<script setup lang="ts">
import { computed, watchEffect } from "vue"
import { catalog, changes, DIRECTION, LABELS } from "../data"
import { lang, t } from "../i18n"

const providers = new Map(catalog.rows.map((row) => [row.provider_id, row]))
const grouped = computed(() => changes)

const providerName = (id: string) => {
  const provider = providers.get(id)
  return provider ? (lang.value === "en" ? provider.name_en || provider.name : provider.name) : id
}

watchEffect(() => {
  document.title = t("政策变化 · zdr", "Policy changes · zdr")
})
</script>

<template>
  <main class="min-h-0 flex-1 overflow-auto">
    <div class="mx-auto max-w-[58rem] px-3 py-6">
      <header class="border-b border-line pb-4">
        <h1 class="text-[20px] font-medium">{{ t("已确认的政策变化", "Confirmed policy changes") }}</h1>
        <p class="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-fg2">
          {{ t("这里只展示 agent 对前后官方快照完成审阅后确认的变化。抓取 diff 和待审线索不会直接进入时间线。", "Only changes confirmed by an agent after reviewing official before-and-after snapshots appear here. Raw diffs and pending leads are never published directly.") }}
        </p>
      </header>

      <ol v-if="grouped.length" class="divide-y divide-line">
        <li v-for="change in grouped" :key="change.id" class="grid gap-2 py-5 sm:grid-cols-[8rem_1fr]">
          <div>
            <time class="font-mono text-[12px] text-fg2">{{ change.observed_at }}</time>
            <div class="mt-1 text-[11px]" :class="change.direction === 'weakened' ? 'text-bad' : change.direction === 'strengthened' ? 'text-ok' : 'text-fg3'">
              {{ t(...DIRECTION[change.direction]) }}
            </div>
          </div>
          <div>
            <RouterLink :to="`/p/${change.provider}`" class="font-medium">{{ providerName(change.provider) }}</RouterLink>
            <p class="mt-1 text-[13px] leading-relaxed text-fg2">{{ lang === "zh" ? change.summary_zh : change.summary_en }}</p>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-fg3">
              <span v-for="dim in change.dimensions" :key="dim" class="border border-line px-1.5 py-0.5">
                {{ LABELS[dim] ? t(...LABELS[dim]) : dim }}
              </span>
              <span v-if="change.effective_at">{{ t("生效", "Effective") }} {{ change.effective_at }}</span>
              <a :href="change.issue" target="_blank" rel="noopener">{{ t("审阅记录", "Review") }} ↗</a>
            </div>
          </div>
        </li>
      </ol>

      <div v-else class="py-20 text-center">
        <p class="text-[14px] text-fg">{{ t("还没有已确认的政策变化", "No confirmed policy changes yet") }}</p>
        <p class="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-fg3">
          {{ t("监控已经运行；在 agent 完成前后快照审阅之前，我们不会把技术 diff 当作政策变化发布。", "Monitoring is active. We do not publish technical diffs as policy changes before an agent reviews the snapshots.") }}
        </p>
        <RouterLink to="/" class="mt-4 inline-block text-[12px]">{{ t("查看供应商对比", "View comparison") }}</RouterLink>
      </div>
    </div>
  </main>
</template>
