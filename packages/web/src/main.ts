import { createApp } from "vue"
import { createRouter, createWebHashHistory } from "vue-router"
import App from "./App.vue"
import Table from "./views/Table.vue"
import Detail from "./views/Detail.vue"
import Changes from "./views/Changes.vue"
import NotFound from "./views/NotFound.vue"
// 字体自带，不走 Google Fonts——少一次外部请求，离线也能用。
// 只引拉丁子集：界面是中英双语，中文回落系统字体，
// 希腊语/西里尔/越南语那几个子集白占 300KB。
import "@fontsource/inter/latin-400.css"
import "@fontsource/inter/latin-500.css"
import "@fontsource/inter/latin-600.css"
import "@fontsource/jetbrains-mono/latin-400.css"
import "@fontsource/jetbrains-mono/latin-500.css"
import "./style.css"

const router = createRouter({
  // GitHub Pages 不支持 SPA rewrite，hash 路由保证详情页刷新也能直接打开。
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: Table },
    // 编码工具专题并回主表了：一页表格 + 分面筛选，老链接直接落到筛好的那一片
    { path: "/coding", redirect: { path: "/", query: { cat: "coding_plan" } } },
    { path: "/changes", component: Changes },
    { path: "/p/:id", component: Detail, props: true },
    { path: "/:pathMatch(.*)*", component: NotFound },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

createApp(App).use(router).mount("#app")
