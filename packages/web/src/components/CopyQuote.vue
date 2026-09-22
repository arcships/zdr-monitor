<script setup lang="ts">
import { ref } from "vue"
import { Check, Copy } from "lucide-vue-next"

const props = defineProps<{ text: string }>()
const done = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text)
    done.value = true
    setTimeout(() => (done.value = false), 1600)
  } catch {
    // 剪贴板被拒就静默失败，不弹错误打断阅读
  }
}
</script>

<template>
  <button
    class="absolute right-2 top-2 grid size-6 place-items-center border border-line bg-bg text-fg3 opacity-0 transition-all hover:text-fg group-hover:opacity-100"
    :title="done ? '已复制' : '复制原文'"
    @click="copy"
  >
    <component :is="done ? Check : Copy" class="size-3" :class="done && 'text-ok'" />
  </button>
</template>
