<script setup lang="ts">
import { watchEffect } from "vue"
import { t } from "../i18n"
watchEffect(() => { document.title = t("页面不存在 · zdr", "Not found · zdr") })
</script>

<template>
  <main class="grid min-h-0 flex-1 place-items-center px-3 text-center">
    <div>
      <p class="font-mono text-[12px] text-fg3">404</p>
      <h1 class="mt-2 text-[18px] font-medium">{{ t("页面不存在", "Page not found") }}</h1>
      <RouterLink to="/" class="mt-4 inline-block text-[12px]">{{ t("返回对比表", "Back to comparison") }}</RouterLink>
    </div>
  </main>
</template>
