<script setup lang="ts">
import { useDark, useToggle } from "@vueuse/core"
import { Moon, Sun } from "lucide-vue-next"
import { catalog } from "./data"
import { lang, t, toggleLang } from "./i18n"

const isDark = useDark()
const toggle = useToggle(isDark)
const providers = new Set(catalog.rows.map((r) => r.provider_id)).size
const builtAt = catalog.generated_at.slice(0, 10)
</script>

<template>
  <!-- 整页不滚动，滚动交给表格容器 -->
  <div class="flex h-full flex-col">
    <header class="flex h-[var(--header-h)] shrink-0 items-center justify-between gap-2 border-b border-line px-3">
      <div class="flex min-w-0 flex-1 items-baseline gap-3">
        <RouterLink to="/" class="font-mono text-[15px] font-medium tracking-tight no-underline">zdr</RouterLink>
        <nav class="flex items-center gap-3 text-[12px] text-fg2">
          <RouterLink to="/" class="nav-link">{{ t("对比", "Compare") }}</RouterLink>
          <RouterLink to="/changes" class="nav-link">{{ t("变化", "Changes") }}</RouterLink>
        </nav>
      </div>

      <div class="flex shrink-0 items-center gap-3">
        <span class="hidden font-mono text-[12px] text-fg3 lg:inline" :title="t('构建日期不等于所有来源最后抓取时间；单份来源状态见详情页', 'Build date is not the last fetch time for every source; see provider details for per-source status')">
          {{ providers }} {{ t("家", "providers") }} · {{ t("构建", "build") }} {{ builtAt }}
        </span>
        <button
          class="font-mono text-[12px] text-fg2 transition-colors hover:text-fg"
          @click="toggleLang()"
          :aria-label="t('Switch to English', '切换到中文')"
        >{{ lang === "zh" ? "EN" : "中" }}</button>
        <button
          class="grid size-6 place-items-center text-fg2 transition-colors hover:text-fg"
          @click="toggle()"
          :aria-label="t('切换主题', 'Toggle theme')"
        >
          <component :is="isDark ? Sun : Moon" class="size-4" />
        </button>
      </div>
    </header>

    <RouterView />
  </div>
</template>
