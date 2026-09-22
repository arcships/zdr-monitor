<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue"
import { t } from "../i18n"
import { FACETS, type Selection } from "../facets"

const props = defineProps<{ sel: Selection; tally: Record<string, Record<string, number>> }>()
const emit = defineEmits<{ toggle: [key: string, v: string]; clearGroup: [key: string] }>()

// 一次只开一个，开着的那个再点一下收起来
const open = ref<string | null>(null)
const root = ref<HTMLElement>()

onMounted(() => document.addEventListener("click", outside, true))
onUnmounted(() => document.removeEventListener("click", outside, true))
const outside = (e: MouseEvent) => {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = null
}

/** 收起来的时候按钮上要能看出勾了什么——只写个数字，还得点开才知道勾的是哪档 */
function chosen(key: string): string {
  const picked = props.sel[key] ?? []
  if (!picked.length) return ""
  const facet = FACETS.find((f) => f.key === key)!
  const labels = picked.map((v) => {
    const o = facet.options.find((x) => x.v === v)
    return o ? t(...o.label) : v
  })
  return labels.length <= 2 ? labels.join(" · ") : `${labels[0]} +${labels.length - 1}`
}
</script>

<template>
  <div ref="root" class="flex flex-wrap items-center gap-1">
    <div v-for="f in FACETS" :key="f.key" class="relative">
      <button
        class="flex h-7 items-center gap-1 px-2 transition-colors"
        :class="(sel[f.key] ?? []).length ? 'text-fg' : 'text-fg2 hover:text-fg'"
        @click="open = open === f.key ? null : f.key"
      >
        <span>{{ t(...f.label) }}</span>
        <span v-if="chosen(f.key)" class="max-w-[10rem] truncate text-brand">{{ chosen(f.key) }}</span>
        <span class="text-fg3">{{ open === f.key ? "▴" : "▾" }}</span>
      </button>

      <div
        v-if="open === f.key"
        class="absolute left-0 top-[30px] z-20 min-w-[12rem] border border-line bg-bg py-1 shadow-[0_6px_24px_-12px_rgba(0,0,0,0.5)]"
      >
        <label
          v-for="o in f.options"
          :key="o.v"
          class="flex cursor-pointer items-center gap-2 px-2.5 py-1 text-[12px] leading-5 hover:bg-surface"
          :class="tally[f.key]?.[o.v] ? 'text-fg2' : 'text-fg3'"
        >
          <input
            type="checkbox"
            class="size-[13px] shrink-0 accent-brand"
            :checked="(sel[f.key] ?? []).includes(o.v)"
            @change="emit('toggle', f.key, o.v)"
          />
          <span class="min-w-0 flex-1 truncate">{{ t(...o.label) }}</span>
          <span class="font-mono text-[11px] text-fg3">{{ tally[f.key]?.[o.v] ?? 0 }}</span>
        </label>
        <button
          v-if="(sel[f.key] ?? []).length"
          class="mt-1 w-full border-t border-line px-2.5 pb-0.5 pt-1.5 text-left text-[11px] text-fg3 hover:text-fg"
          @click="emit('clearGroup', f.key)"
        >
          {{ t("取消这一组", "Clear this group") }}
        </button>
      </div>
    </div>
  </div>
</template>
