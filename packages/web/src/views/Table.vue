<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import { catalog, good, LABELS, WIDTHS, BOOLEAN_DIMS, MODE, MODE_SHORT, type Row } from "../data"
import { t, pick } from "../i18n"
import Mark from "../components/Mark.vue"
import { logo, logoStyle } from "../logos"
import { apply, counts, parse, toQuery, activeCount, type Selection } from "../facets"
import Facets from "../components/Facets.vue"

const router = useRouter()
const route = useRoute()
const q = ref(typeof route.query.q === "string" ? route.query.q : "")
const sel = ref<Selection>(parse(route.query))
// 排序也进地址栏：截图链接得能原样复现，别人点开不是另一个顺序
const sortDim = ref<string | null>(typeof route.query.sort === "string" ? route.query.sort : null)
const asc = ref(route.query.dir !== "desc")
const box = ref<HTMLInputElement>()

// 筛选状态全写进地址栏：一条链接就能把「企业版 + 可零保留」发给同事。
watch([sel, q, sortDim, asc], () => {
  const query: Record<string, string> = { ...toQuery(sel.value) }
  if (q.value.trim()) query.q = q.value.trim()
  if (sortDim.value) {
    query.sort = sortDim.value
    if (!asc.value) query.dir = "desc"
  }
  if (typeof route.query.v === "string") query.v = route.query.v
  router.replace({ query })
}, { deep: true })
// 浏览器前进后退也要能回到当时那套筛选
watch(() => route.query, (query) => {
  if (route.path !== "/") return
  sel.value = parse(query)
  const next = typeof query.q === "string" ? query.q : ""
  if (next !== q.value.trim()) q.value = next
  sortDim.value = typeof query.sort === "string" ? query.sort : null
  asc.value = query.dir !== "desc"
})

onMounted(() => window.addEventListener("keydown", hotkey))
onUnmounted(() => window.removeEventListener("keydown", hotkey))
function hotkey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault()
    box.value?.focus()
  } else if (e.key === "Escape" && document.activeElement === box.value) {
    q.value = ""
    box.value?.blur()
  }
}

const dims = catalog.dimensions
const all = catalog.rows
const rowsFiltered = computed(() => apply(all, sel.value, q.value))
const tally = computed(() => counts(all, sel.value, q.value))
const active = computed(() => activeCount(sel.value))

const rows = computed<Row[]>(() => {
  const list = rowsFiltered.value
  if (!sortDim.value) return list
  const d = sortDim.value
  // 供应商列按名字排，中文按拼音
  if (d === "name")
    return [...list].sort((a, b) =>
      asc.value ? a.name.localeCompare(b.name, "zh") : b.name.localeCompare(a.name, "zh"),
    )
  return [...list].sort(
    (a, b) => (asc.value ? rank(d, a) - rank(d, b) : rank(d, b) - rank(d, a)) || a.name.localeCompare(b.name, "zh"),
  )
})

// 勾选过的那些档次里，有多少家公司、多少条承诺——筛完就知道这一片的底细
const summary = computed(() => {
  const list = rowsFiltered.value
  return {
    companies: new Set(list.map((r) => r.company)).size,
    plans: list.length,
    noTraining: list.filter((r) => r.cells.training?.mark === "yes").length,
    zdr: list.filter((r) => r.cells.zdr?.mark === "yes").length,
  }
})

function toggle(key: string, v: string) {
  const picked = sel.value[key] ?? []
  sel.value = { ...sel.value, [key]: picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v] }
}
const clearGroup = (key: string) => (sel.value = { ...sel.value, [key]: [] })
const clearAll = () => {
  sel.value = parse({})
  q.value = ""
}

const href = (r: Row) => ({ path: `/p/${r.company}`, query: { v: r.id } })

// 把「对用户有利」排前面，未披露垫底
function rank(dim: string, r: Row) {
  const g = good(dim, r.cells[dim]?.mark)
  return g === true ? 0 : g === false ? 1 : 2
}

// 点一次升、再点降、第三次取消，不留下回不到默认顺序的状态
function sortBy(d: string) {
  if (d !== "name" && !BOOLEAN_DIMS.has(d)) return
  if (sortDim.value !== d) {
    sortDim.value = d
    asc.value = true
  } else if (asc.value) asc.value = false
  else sortDim.value = null
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- 筛选就是一排下拉，不占表格的宽度；勾了什么直接写在按钮上 -->
    <div class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-1.5 text-[12px] text-fg2">
      <input
        ref="box"
        v-model="q"
        :placeholder="t('搜索  ⌘K', 'Search  ⌘K')"
        class="h-7 w-44 border border-line bg-transparent px-2 text-[12px] outline-none placeholder:text-fg3 focus:border-fg3"
      />
      <Facets :sel="sel" :tally="tally" @toggle="toggle" @clear-group="clearGroup" />
      <button v-if="active || q" class="text-fg3 underline underline-offset-2 hover:text-fg" @click="clearAll">
        {{ t("清除", "Clear") }}
      </button>

      <!-- 筛完这一片是什么样，直接给数，不用自己去数表格 -->
      <span class="ml-auto flex items-center gap-3 font-mono text-[11px] text-fg3">
        <span>{{ summary.companies }} {{ t("家", "vendors") }}</span>
        <span>{{ summary.plans }} {{ t("档", "plans") }}</span>
        <span class="text-ok">{{ summary.noTraining }} {{ t("不训练", "no-training") }}</span>
        <span class="text-ok">{{ summary.zdr }} {{ t("零保留", "ZDR") }}</span>
        <span class="hidden items-center gap-3 lg:flex">
          <span class="flex items-center gap-1.5"><b class="mk y">✓</b> {{ t("有承诺", "Committed") }}</span>
          <span class="flex items-center gap-1.5"><b class="mk n">✗</b> {{ t("无承诺", "Not committed") }}</span>
        </span>
      </span>
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      <table>
        <colgroup>
          <col style="width: 280px" />
          <col v-for="d in dims" :key="d" :style="{ width: WIDTHS[d] }" />
        </colgroup>
        <thead>
          <tr>
            <th class="sortable" :class="sortDim === 'name' && 'text-fg'" @click="sortBy('name')">
              {{ t("供应商 / 版本", "Provider / plan") }}
              <span v-if="sortDim === 'name'" class="text-brand">{{ asc ? "↑" : "↓" }}</span>
            </th>
            <th
              v-for="d in dims"
              :key="d"
              :class="[BOOLEAN_DIMS.has(d) && 'sortable', sortDim === d && 'text-fg']"
              @click="sortBy(d)"
            >
              {{ LABELS[d] ? t(...LABELS[d]) : d }}
              <span v-if="sortDim === d" class="text-brand">{{ asc ? "↑" : "↓" }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td :colspan="dims.length + 1" class="!h-32 text-center">
              {{ t("没有匹配的供应商", "No matching providers") }}
              <button class="ml-2 underline" @click="clearAll">{{ t("清除筛选", "Clear") }}</button>
            </td>
          </tr>
          <tr
            v-for="r in rows"
            :key="r.id"
            class="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
            tabindex="0"
            @click="router.push(href(r))"
            @keydown.enter="router.push(href(r))"
            @keydown.space.prevent="router.push(href(r))"
          >
            <td>
              <!-- 每行自己说清楚是谁。同一家重复 3-7 次是故意的：对比表不分组，
                   版本之间的关系在详情页里看。 -->
              <span
                v-if="logo(r.provider_id, r.company)"
                class="logo size-[14px] translate-y-[2px] text-fg"
                :style="logoStyle(r.provider_id, r.company)"
              />
              <span class="ml-2 font-medium">{{ pick(r, "name") }}</span>
              <span class="ml-[22px] mt-0.5 block font-mono text-[11px] text-fg3">{{ pick(r, "tier") }}</span>
            </td>
            <td v-for="d in dims" :key="d">
              <Mark v-if="BOOLEAN_DIMS.has(d)" :dim="d" :mark="r.cells[d]?.mark" />
              <!-- 标出怎么达成：默认就有 vs 要申请、合同禁止 vs 默认不训练，
                   对采购是两回事，不能只给一个记号 -->
              <span
                v-if="d === 'zdr' && r.cells[d]?.mode"
                class="ml-1 font-mono text-[11px] text-fg3"
                :title="MODE[r.cells[d]!.mode!] ? t(...MODE[r.cells[d]!.mode!]) : ''"
              >{{ MODE_SHORT[r.cells[d]!.mode!] ? t(...MODE_SHORT[r.cells[d]!.mode!]) : r.cells[d]!.mode }}</span>
              <span v-if="r.cells[d]?.terse" :class="BOOLEAN_DIMS.has(d) && 'ml-1'">{{ pick(r.cells[d], "terse") }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
