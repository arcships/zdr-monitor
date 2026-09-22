<script setup lang="ts">
import { computed } from "vue"
import { good, type Mark } from "../data"

const props = defineProps<{ dim: string; mark?: Mark }>()
const g = computed(() => good(props.dim, props.mark))
</script>

<template>
  <span class="mk" :class="g === true ? 'y' : g === false ? 'n' : 'u'">{{ g === true ? "✓" : "✗" }}</span>
</template>
