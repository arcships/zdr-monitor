<script setup lang="ts">
import { computed, ref, watch, watchEffect } from "vue"
import { useRoute, useRouter } from "vue-router"
import { ChevronRight } from "lucide-vue-next"
import { detail, QUESTIONS, BOOLEAN_DIMS, CHANNEL, DIRECTION, KIND, LABELS, hostOf, type Detail } from "../data"
import { t, pick, lang } from "../i18n"
import Mark from "../components/Mark.vue"
import { logo, logoStyle } from "../logos"
import CopyQuote from "../components/CopyQuote.vue"

/** 原文证据按 1、2、3 列出来：判定自己绑的那句排第一，每条 point 自带的原文跟在后面。
 *  台账的地基是原文，不是我们的复述——所以原文占主位，我们写的话退到下面当解说。 */
function quotesOf(evidence: any) {
  const out: Array<{ text: string; source?: { url: string; channel: string } }> = []
  if (evidence?.quote) out.push({ text: evidence.quote, source: evidence.source })
  for (const pt of evidence?.points ?? []) if (pt.quote) out.push({ text: pt.quote, source: pt.source })
  return out
}
/** 解说。point 的正文就是解说本身；一条都没有时回落到受控词表生成的那句结论。 */
function notesOf(evidence: any): string[] {
  const list = (evidence?.points ?? [])
    .map((pt: any) => (lang.value === "zh" && pt.text_zh) || pt.text)
    .filter(Boolean)
  return list.length ? list : [((lang.value === "zh" ? evidence?.summary : evidence?.summary_en) || evidence?.summary || "")].filter(Boolean)
}

const hasEvidence = (evidence: any) => !!(evidence?.points?.length || evidence?.quote)

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const data = ref<Detail | null>(null)
const loading = ref(true)
const tab = ref(0)
const open = ref<Set<string>>(new Set())

// 详情按需拉——它占全量数据的 94%，不该为首页 5 个 ✓/✗ 一起下载
watch(
  () => props.id,
  async (id) => {
    loading.value = true
    open.value = new Set()
    data.value = await detail(id)
    // 对比表里点的是某一个版本，不是这家的第一个版本。没有 ?v= 才落回第一个。
    const wanted = data.value?.tiers.findIndex((x) => x.id === route.query.v) ?? -1
    tab.value = wanted >= 0 ? wanted : 0
    loading.value = false
  },
  { immediate: true },
)

const tier = computed(() => data.value?.tiers[tab.value])
const dims = computed(() => data.value?.dimensions ?? [])
const sourceGroups = computed(() => {
  const groups = new Map<
    string,
    { id: string; name: string; name_en: string; tiers: Detail["tiers"]; sources: Detail["sources"] }
  >()
  for (const source of data.value?.sources ?? []) {
    let group = groups.get(source.line_id)
    if (!group) {
      group = {
        id: source.line_id,
        name: source.line,
        name_en: source.line_en,
        tiers: data.value?.tiers.filter((x) => x.line_id === source.line_id) ?? [],
        sources: [],
      }
      groups.set(source.line_id, group)
    }
    group.sources.push(source)
  }
  return [...groups.values()]
})

watch(
  () => route.query.v,
  (wanted) => {
    const index = data.value?.tiers.findIndex((x) => x.id === wanted) ?? -1
    if (index >= 0) tab.value = index
  },
)

// 切版本时把 ?v= 写回地址栏，这样详情页的链接贴给别人打开的是同一个版本
function selectTab(i: number) {
  tab.value = i
  const v = data.value?.tiers[i]?.id
  if (v) router.replace({ query: { ...route.query, v } })
}

function toggle(d: string) {
  const next = new Set(open.value)
  next.has(d) ? next.delete(d) : next.add(d)
  open.value = next
}

watchEffect(() => {
  document.title = data.value ? `${data.value.name} · zdr` : "zdr"
})
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto">
    <div class="max-w-[58rem] px-3 py-5">
      <div v-if="loading" class="space-y-2">
        <div class="h-6 w-40 animate-pulse bg-surface" />
        <div class="h-44 animate-pulse bg-surface" />
      </div>

      <template v-else-if="data && tier">
        <RouterLink to="/" class="text-[12px] text-fg2">← {{ t("对比表", "Comparison") }}</RouterLink>

        <div class="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            v-if="logo(data.id)"
            class="logo size-[18px] translate-y-[3px] text-fg"
            :style="logoStyle(data.id)"
          />
          <h2 class="-ml-1 text-[20px] font-medium leading-tight">{{ pick(data, "name") }}</h2>
          <span class="font-mono text-[11.5px] text-fg3">{{ data.id }}</span>
          <!-- 聚合网关/转售商的结论要打折扣看：真正处理数据的是上游厂商，
               网关自己的承诺盖不住上游。所以这个标签得摆在名字旁边。 -->
          <span v-if="data.kind" class="font-mono text-[11.5px] text-fg2">{{ KIND[data.kind] ? t(...KIND[data.kind]) : data.kind }}</span>
          <a v-if="data.homepage" :href="data.homepage" target="_blank" rel="noopener" class="text-[11.5px] text-fg2">
            {{ t("官网", "Website") }} ↗
          </a>
          <a v-if="data.doc" :href="data.doc" target="_blank" rel="noopener" class="text-[11.5px] text-fg2">
            {{ t("主政策页", "Primary policy") }} ↗
          </a>
          <!-- 采购最先问的两个问题：数据存哪、跟谁签。签约主体挂在产品线上而不是公司上——
               同一家的国内站和国际站是不同法人，所以它跟着当前档位走。 -->
          <span v-if="tier.entity" class="text-[11.5px] text-fg2">
            {{ t("签约主体", "Contracting entity") }} · {{ tier.entity }}
          </span>
        </div>

        <!-- 档位条款可能完全相反（火山企业版承诺不留存、个人版授权训练），必须分开看 -->
        <div v-if="data.tiers.length > 1" class="mt-4 flex flex-wrap gap-4 border-b border-line text-[12.5px]">
          <button
            v-for="(tr, i) in data.tiers"
            :key="tr.id"
            class="-mb-px border-b-2 pb-2 transition-colors"
            :class="i === tab ? 'border-brand text-fg' : 'border-transparent text-fg2 hover:text-fg'"
            :title="pick(tr, 'tier_full') || undefined"
            @click="selectTab(i)"
          >
            <span>{{ pick(tr, "line") }}</span>
            <span v-if="pick(tr, 'tier')" class="ml-1 text-fg3">· {{ pick(tr, "tier") }}</span>
          </button>
        </div>

        <!-- 五个答案先一眼看完；依据默认折叠，否则五段 100-200 字的说明堆成一堵墙 -->
        <dl class="mt-5 border-t border-line">
          <template v-for="d in dims" :key="d">
            <div
              class="grid grid-cols-1 items-baseline gap-x-3 gap-y-1 border-b border-line py-2.5 sm:grid-cols-[9.5rem_1fr]"
              :class="hasEvidence(tier.evidence[d]) && 'cursor-pointer hover:bg-surface/60'"
              @click="hasEvidence(tier.evidence[d]) && toggle(d)"
            >
              <dt class="text-[12.5px] text-fg2">{{ QUESTIONS[d] ? t(...QUESTIONS[d]) : d }}</dt>
              <dd class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span class="flex items-baseline gap-2">
                  <Mark v-if="BOOLEAN_DIMS.has(d)" :dim="d" :mark="tier.cells[d]?.mark" />
                  <b class="text-[13.5px] font-medium">{{ pick(tier.evidence[d], "summary") || pick(tier.cells[d], "terse") }}</b>
                </span>

                <!-- 不展开也要看得出「凭什么」：来源在哪、几条依据。
                     只给一个「依据 ▸」等于让人盲点 -->
                <a
                  v-if="tier.evidence[d]?.source"
                  :href="tier.evidence[d]!.source!.url"
                  target="_blank"
                  rel="noopener"
                  class="text-[11.5px] text-fg3"
                  :title="tier.evidence[d]!.source!.url"
                  @click.stop
                >
                  {{ CHANNEL[tier.evidence[d]!.source!.channel] ? t(...CHANNEL[tier.evidence[d]!.source!.channel]) : tier.evidence[d]!.source!.channel }}
                  · {{ hostOf(tier.evidence[d]!.source!.url) }} ↗
                </a>
                <span v-else class="text-[11.5px] text-fg3">{{ t("无绑定原文", "No anchored source") }}</span>

                <span
                  v-if="hasEvidence(tier.evidence[d])"
                  class="ml-auto flex shrink-0 items-center gap-0.5 text-[11.5px] text-fg3"
                >
                  <ChevronRight class="size-3 transition-transform" :class="open.has(d) && 'rotate-90'" />
                  {{ t("依据", "Evidence") }}
                  <span v-if="tier.evidence[d]?.points?.length" class="font-mono">{{ tier.evidence[d]!.points!.length }}</span>
                </span>
              </dd>
            </div>

            <div v-if="open.has(d)" class="border-b border-line bg-surface/60 px-0 py-3" @click.stop>
              <!-- 原文摘录是这个台账的地基：结论不能只给 URL，要给到具体哪一句。
                   编号是为了让解说能指名道姓地引用第几条。 -->
              <ol v-if="quotesOf(tier.evidence[d]).length" class="space-y-2.5">
                <li v-for="(q, i) in quotesOf(tier.evidence[d])" :key="i" class="grid grid-cols-[1.3rem_1fr] gap-x-1">
                  <span class="pt-[3px] font-mono text-[11px] text-fg3">{{ i + 1 }}</span>
                  <div class="group relative min-w-0">
                    <blockquote class="quote">{{ q.text }}</blockquote>
                    <CopyQuote :text="q.text" />
                    <a
                      v-if="q.source"
                      :href="q.source.url"
                      target="_blank"
                      rel="noopener"
                      class="mt-1 inline-flex max-w-full items-baseline gap-2 text-[11.5px]"
                      :title="q.source.url"
                    >
                      <span class="shrink-0 border border-line px-1.5 text-fg3 no-underline">
                        {{ CHANNEL[q.source.channel] ? t(...CHANNEL[q.source.channel]) : q.source.channel }}
                      </span>
                      <span class="truncate font-mono">{{ hostOf(q.source.url) }}</span>
                    </a>
                  </div>
                </li>
              </ol>

              <!-- 解说在原文下面：读者先看到厂商自己怎么说，再看到我们怎么读它 -->
              <div v-if="notesOf(tier.evidence[d]).length" :class="quotesOf(tier.evidence[d]).length ? 'mt-3 border-t border-line pt-2.5' : ''">
                <p
                  v-for="(note, i) in notesOf(tier.evidence[d])"
                  :key="i"
                  class="text-[12.5px] leading-[1.75] text-fg2"
                  :class="i ? 'mt-1.5' : ''"
                >{{ note }}</p>
              </div>
            </div>
          </template>
        </dl>

        <p v-if="pick(tier, 'tier_full')" class="mt-4 text-[11.5px] leading-relaxed text-fg3">{{ pick(tier, "tier_full") }}</p>

        <section v-if="data.changes.length" class="mt-7">
          <div class="mb-2 flex items-baseline justify-between gap-3">
            <h3 class="text-[11px] uppercase tracking-wide text-fg2">
              {{ t("已确认的政策变化", "Confirmed policy changes") }}
              <span class="ml-1 font-mono text-fg3">{{ data.changes.length }}</span>
            </h3>
            <RouterLink to="/changes" class="text-[11px] text-fg3">{{ t("全部变化", "All changes") }} →</RouterLink>
          </div>
          <ol class="border-t border-line">
            <li v-for="change in data.changes" :key="change.id" class="grid gap-1 border-b border-line py-3 sm:grid-cols-[7.5rem_1fr]">
              <div>
                <time class="font-mono text-[11px] text-fg3">{{ change.observed_at }}</time>
                <p class="text-[11px]" :class="change.direction === 'weakened' ? 'text-bad' : change.direction === 'strengthened' ? 'text-ok' : 'text-fg3'">
                  {{ t(...DIRECTION[change.direction]) }}
                </p>
              </div>
              <div>
                <p class="text-[12.5px] leading-relaxed text-fg2">{{ lang === "zh" ? change.summary_zh : change.summary_en }}</p>
                <div class="mt-1 flex flex-wrap gap-2 text-[10.5px] text-fg3">
                  <span v-for="dim in change.dimensions" :key="dim">{{ LABELS[dim] ? t(...LABELS[dim]) : dim }}</span>
                  <a :href="change.issue" target="_blank" rel="noopener">{{ t("审阅", "Review") }} ↗</a>
                </div>
              </div>
            </li>
          </ol>
        </section>

        <!-- 被监控的文档清单。判定只引用其中几份，证据条目里会提到别的
             （「产品协议 §12.8」），不列出来就没法照着查证 -->
        <section v-if="data.sources.length" class="mt-7">
          <h3 class="mb-2 text-[11px] uppercase tracking-wide text-fg2">
            {{ t("被监控的文档", "Monitored documents") }}
            <span class="ml-1 font-mono text-fg3">{{ data.sources.length }}</span>
          </h3>
          <div v-for="group in sourceGroups" :key="group.id" class="mb-4 last:mb-0">
            <h4 class="mb-1 flex flex-wrap items-baseline gap-x-2 text-[12px] font-medium">
              <span>{{ pick(group, "name") }}</span>
              <span v-for="item in group.tiers" :key="item.id" class="font-mono text-[10.5px] font-normal text-fg3">
                {{ pick(item, "tier") }}
              </span>
            </h4>
            <ol class="border-t border-line">
              <li
                v-for="(s, i) in group.sources"
                :key="s.url"
                class="grid grid-cols-[1.4rem_1fr] items-baseline gap-x-2 border-b border-line py-2 text-[11.5px] sm:grid-cols-[1.4rem_6.5rem_1fr]"
              >
                <span class="font-mono text-fg3">{{ i + 1 }}</span>
                <span class="text-fg3">
                  {{ CHANNEL[s.channel] ? t(...CHANNEL[s.channel]) : s.channel }}
                  <!-- 查清原因后仍与主来源冲突的官方表述，标出来 -->
                  <span v-if="s.tier === 'contradiction'" class="ml-1 text-brand">{{ t("分歧", "conflict") }}</span>
                </span>
                <div class="col-start-2 min-w-0 sm:col-start-3">
                  <a :href="s.url" target="_blank" rel="noopener" class="block truncate font-mono" :title="pick(s, 'note') || s.url">
                    {{ s.url.replace(/^https?:\/\//, "") }}
                  </a>
                  <p class="mt-0.5 font-mono text-[10px] text-fg3">
                    <!-- 抓取异常不在界面上露出：那是 CI 和 agent 的事，读者要的是
                         「这条结论依据的原文是什么时候的」。抓取失败不动快照，
                         这里始终是最后一份成功抓到的原文的日期。 -->
                    <template v-if="s.snapshot_at">{{ t("原文最后变化于", "Text last changed") }} {{ s.snapshot_at }}</template>
                    <template v-else>{{ t("等待首份快照", "Awaiting first snapshot") }}</template>
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>
      </template>

      <div v-else class="py-20 text-fg2">
        <p class="mb-3">{{ t("没有这家供应商", "Provider not found") }}</p>
        <RouterLink to="/">{{ t("返回对比表", "Back") }}</RouterLink>
      </div>
    </div>
  </div>
</template>
