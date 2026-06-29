# 万能团餐 · 项目交接文档（HANDOFF）

> 更新时间：2026-06-29 ｜ 用途：换一台机器 / 新的开发者（或新的 Claude 会话）无缝接着开发。

---

## 0. 一句话现状
万能团餐 = 面向 Irvine/OC 华人的**预售制团餐**平台（试运营/MVP）。
当前已上线 **3 个纯前端站点**（官网 + 顾客端 H5 + 运营后台），正在做**第一期后端接入**（Supabase，核心下单闭环）——脚手架已就绪，**等创建 Supabase 项目并填配置**。

## 1. 线上地址（GitHub Pages）
| 站点 | 地址 |
|---|---|
| 官网宣传站 | https://sehaha.github.io/tuancan/ |
| 顾客端 H5 | https://sehaha.github.io/tuancan/order.html |
| 运营后台 | https://sehaha.github.io/tuancan/admin.html （首页页脚「合作 → 运营后台」可点进） |

## 2. 仓库 / 部署
- **GitHub**：https://github.com/sehaha/tuancan （**公开**仓库）
- **账号**：`sehaha`，用 **gh CLI** 认证（新机器需重新 `gh auth login`）
- **托管**：GitHub Pages，源 = `main` 分支根目录；`git push` 后约 1 分钟自动更新
- **更新流程**：`git add -A && git commit -m "..." && git push`

## 3. 技术栈与架构
- **官网 `index.html`**：纯静态 HTML/CSS/JS，无构建、无框架。由设计稿 `万能团餐-官网.dc.html` 1:1 落地而来。企业表单是原生 JS（目前只弹 toast，未接接口）。
- **顾客端 / 后台**：`order.html` / `admin.html` 是**自启动的 React 应用**。
  - 关键机制：`support.js`（dc-runtime）会**自动从 unpkg CDN 加载 React 18 UMD**，再解析页面里的 `<x-dc>` 模板渲染。所以 `.dc.html` 文件无需写 React 标签即可独立运行（**依赖联网 + unpkg CDN**）。
  - `order.html` 是 `美食团-H5.dc.html` 的副本；`admin.html` 是 `美食团-后台.dc.html` 的副本（英文名为干净 URL）。**改动需同步源 .dc.html 与副本**（目前是手动 cp，未做构建）。
  - 业务逻辑写在文件底部 `<script type="text/x-dc" data-dc-script>` 里的 `class Component extends DCLogic`：`state` + `renderVals()`，目前数据是内置 mock。
- **后端（进行中）**：Supabase（Postgres + 前端直连）。因为站点是静态托管，选 BaaS。

## 4. 关键文件地图
```
index.html                  官网（生产版，纯静态）
order.html / admin.html     顾客端H5 / 运营后台（dc-runtime React 应用，干净URL入口）
美食团-H5.dc.html            顾客端设计源（order.html 的源）
美食团-后台.dc.html          后台设计源（admin.html 的源）
万能团餐-官网.dc.html        官网设计源（index.html 由它落地）
index.dc.html               设计入口/hub（列出三端，dc-runtime）
support.js                  dc-runtime（自动加载 React 并渲染 <x-dc>）
assets/
  image-slot.js             dc 图片占位组件
  logo-full.png             导航 logo（蓝字，已裁切压缩）
  logo-full-white.png       页脚 logo（白字，深底用）
  logo-neon.png             霓虹 logo（备用，未使用）
  logo-*.png                其它 logo 变体（备份）
  dishes/ restaurants/      官网餐食/餐厅照片（已压缩）
  db.js                     ★ 数据访问层（菜单/下单/订单/备餐单）—— 第一期新增
config.js                   ★ 后端连接配置（待填 SUPABASE_URL + ANON_KEY）
supabase/schema.sql         ★ 建库脚本 + 种子数据（在 Supabase SQL Editor 跑）
SETUP-supabase.md           ★ 后端接入操作指南
screenshots/                设计截图
.claude/launch.json         本地预览服务配置（python http.server :4173）
```
（`uploads/` PRD+VI、`photo/` 原图 **不在 git 里**，见第 8 节）

## 5. 已完成
1. **官网首页**：设计稿落地为纯静态 `index.html`，真实图片、响应式、企业表单（前端校验+toast）。
2. **Logo**：用 `logo-full` 清晰版——导航蓝字、页脚白字版（从 logo-full 派生）。
3. **三端上线**：GitHub 仓库 + Pages；H5/后台用干净 URL `order.html` / `admin.html`，官网按钮已指向它们。
4. **第一期后端脚手架**：`supabase/schema.sql`（餐厅/套餐/每周菜单/自提点/订单/明细 + RLS + 种子）、`assets/db.js`（数据层）、`config.js`、`SETUP-supabase.md`。

## 6. 下一步（按顺序）
### 第一期 · 核心下单闭环（进行中，卡在"创建项目"）
1. **【需用户】** 创建 Supabase 项目 → SQL Editor 跑 `supabase/schema.sql` → 复制 **Project URL + anon public key**。
2. 把上面两项填进 `config.js`。
3. 把 `order.html` / `admin.html` 接上 `assets/db.js`：
   - H5：`buildMenu()` 改为从 `DB.fetchMenuData()` 异步读；`payNow()` 改为 `DB.createOrder()` 写库。
   - 后台：订单列表 / 明日备餐汇总改为 `DB.fetchOrders()` / `DB.fetchPrepSheet()`。
   - 注意两个 app 都要在 `<head>` 引入 `config.js` 和 `assets/db.js`（在 support.js 之前），并把改动同步回 `.dc.html` 源。
4. 在预览里连线上库**实测**：选菜→下单→后台看到真实订单→导出备餐单。
### 紧接着 · 安全（强烈建议）
5. 后台加访问保护（口令/Supabase Auth），并把 `orders/order_items` 的匿名 SELECT 收紧——否则订单姓名/电话对所有人可见。
### 第二期（暂缓）
取消退余额写库、三单完整导出、餐厅结算、用户账号体系、库存扣减、去 CDN 依赖（React 本地化）。

## 7. 本地开发怎么跑
```bash
cd tuancan
python3 -m http.server 4173
# 浏览器打开：
#   http://localhost:4173/index.html
#   http://localhost:4173/order.html
#   http://localhost:4173/admin.html
```
（顾客端/后台需要联网，会从 unpkg 拉 React。）

## 8. 不在 git 里的本地文件（迁移时要单独带）
`.gitignore` 排除了它们（含商业资料，公开仓库不放）：
- `uploads/` — **PRD（`万能团餐-prd.md`）**、VI 手册 PDF、初版素材
- `photo/` — 原始照片（官网用的已压缩进 `assets/`）
- `PRD设计开发项目.zip`、`.image-slots.state.json`、`.thumbnail`、`.DS_Store`
- `.claude/launch.json`（本地预览配置，无敏感信息）

## 9. Claude 记忆 & 对话记录位置
- **记忆**（项目长期上下文，Claude 会话自动加载）：`~/.claude/projects/-Users-daddy-Projects-tuancan/memory/`（`MEMORY.md` + `tuancan-frontend-stack.md` 等）
- **对话转录**：`~/.claude/projects/-Users-daddy-Projects-tuancan/*.jsonl`（大的那个是主开发会话）
- 迁移到新机：若新机器用户名也是 `daddy` 且项目放在 `/Users/daddy/Projects/tuancan`，把上面整个目录还原过去，Claude 会自动接上记忆。否则路径会变（见交接包 README）。

## 10. 陷阱备忘
- `.dc.html` 文件名是中文（含连字符），URL 需编码；干净入口用了 `order.html`/`admin.html`。
- `order/admin.html` 是 `.dc.html` 的副本，**改一处要同步另一处**。
- React 走 unpkg CDN：离线或 unpkg 受限会白屏。
- `config.js` 里的 **anon key 是公开的**（安全靠 RLS），可提交；**service_role key 绝不能进前端/仓库**。
- Pages 部署有 ~1 分钟延迟，且偶尔需强刷。
