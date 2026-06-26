# 接入 Supabase 后端 · 操作指南（第一期：核心下单闭环）

第一期目标：**H5 从数据库读菜单 → 下真实订单；后台看真实订单 + 导出备餐单。**

整个站点是 GitHub Pages 静态托管，所以用 Supabase（前端可直连的 Postgres 后端）。

---

## 你需要做的（约 5 分钟）

### 1. 创建 Supabase 项目（免费）
1. 打开 https://supabase.com → 用 GitHub 登录 → **New project**
2. 填项目名（如 `tuancan`）、设一个数据库密码、区域选 **West US**（离 Irvine 近）
3. 等项目初始化完成（约 1–2 分钟）

### 2. 建库 + 灌入种子数据
1. 左侧 **SQL Editor** → **New query**
2. 把仓库里 [`supabase/schema.sql`](supabase/schema.sql) **整段**粘贴进去 → **Run**
3. 看到成功提示即可（已建好餐厅/套餐/下周菜单/自提点）

### 3. 把连接信息给我
左侧 **Project Settings → API**，复制两项发我：
- **Project URL**（形如 `https://xxxx.supabase.co`）
- **anon public** key（一长串，`eyJ...`）

> anon key 设计上就是公开的，安全由数据库 RLS 策略保证，可放心贴在对话里 / 提交进仓库。

---

## 我拿到信息后会做的
1. 把 URL + anon key 填进 [`config.js`](config.js)
2. 把 `order.html`（顾客端）和 `admin.html`（后台）接上数据层 [`assets/db.js`](assets/db.js)：
   - 菜单从数据库读
   - 下单写入 `orders` / `order_items`
   - 后台订单列表与备餐单读真实数据
3. 在预览里连你的线上库实测下单闭环，确认无误后 push 上线

---

## ⚠️ 安全（重要）
第一期为了让**无登录**的后台能看订单，数据库暂时允许匿名读取 `orders`。
这意味着：在加访问保护前，知道后台地址的人能看到下单人姓名/电话。

**正式开放给真实顾客前，务必先做第二步「后台加访问保护 + 收紧订单读取权限」**
（即之前列的第 1 项）。我可以紧接着帮你做。

---

## 备注
- 第一期**不含**：取消退余额写库、三单完整导出、餐厅结算、用户账号体系、库存扣减——这些放第二期。
- 数据是按 PRD 的表结构设计的，后续扩展直接加表/字段即可。
