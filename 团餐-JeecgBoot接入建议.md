# 万能团餐 · 用 JeecgBoot 底座落地的接入建议

> 面向「新开对话、把团餐系统在 JeecgBoot 上真正实现」。
> 本文基于对当前仓库 `jeecg-boot/jeecg-boot-module/jeecg-module-scrm` 的真实代码调研，结论是：**团餐所需的基础设施在本仓库已有可复用的成熟模式，不必从零造。**
> 配套：功能规格见 `需求v2-设计文档.md`，交互/视觉以已实现的演示 demo（`order.html` / `admin.html`）为准，数据结构以 `assets/store.js` 为 API 契约蓝本。

---

## ★ 已定决策（2026-06-29）
- **架构**：团餐与 SCRM **平级并行**，共用 JeecgBoot 底座，**不**塞进 scrm 下面。（产品专家 + 本调研一致结论）
- **后端**：Java（Spring Boot + MyBatis-Plus，JeecgBoot 标准栈）。
- **数据库**：复用 JeecgBoot 底座的 **MySQL**，新表前缀 `tc_`，遵循 JeecgBoot 表规范（见第 9 节）。
- **共享基础设施落法**：把 scrm 的 **C 访客鉴权上提到 `jeecg-boot-base-core`**，团餐复用，保证真正平级、不反向依赖 scrm。
- **暂不做**：多租户（单运营方 MVP，`ScrmTenantConfig.ENABLED` 保持关）、Flowable、ChatBI / AI 排餐——留作演进北极星。
- **模块名**：`jeecg-module-tuancan`（= 专家说的 catering，二选一，本文统一用 tuancan）。

## ⚠️ 领域边界（必读，最易踩坑）
团餐是 **B2C 预售团餐市场**，不是 B2B 企业食堂。两份《产品专家建议》在执行细节上反复把它当成"企业团餐承包"，**领域模型会整个跑偏，切勿照抄**：
| ❌ 别用（B2B 食堂模型） | ✅ 实际（B2C 市场，用本文 `tc_*`） |
|---|---|
| 签约企业 + 授信挂账 + 结算周期（`cat_company_customer`） | 个人顾客 `tc_customer`：手机号 / 积分 / 券 / 余额 |
| 订单关联底座 `sys_user`（员工点餐） | C 端顾客用 **X-C-Token** 访客身份，**不走 sys_user** |
| 餐次 早/午/晚 + 后厨排餐采购 | **每周(周一~五)套餐** + 多餐厅供货 + 自提点 |
| 授信/挂账结算 | 个人预付 + 微信/USD + 抵用券 + 积分 |
> "企业签约 + 授信开户"那套只属于官网上**次要的「企业团餐合作」线索**，是第二期的交叉点，不是核心 P0。核心闭环以第 3 节 `tc_*` 表为准。

> **采纳专家的"脚手架"、用本文的"领域"**：多模块拓扑、JeecgEntity 审计字段、代码生成器、`@Transactional` 服务、Spring Event 解耦——这些照专家做；数据表/业务对象一律用 `tc_*`（第 3 节）。
> 注意专家示例代码两处坑：金额比较别用 `.doubleValue()`（用 `BigDecimal.compareTo`）；跨模块事件类**别放 scrm**（见第 2.5 节，放 base-core，否则团餐反向依赖 scrm）。

## 0. 一句话策略
把演示版（静态 H5 + localStorage）落到 JeecgBoot：**后端**新建**与 scrm 平级**的 `jeecg-module-tuancan` 模块（复用上提到 base-core 的 C 访客鉴权 + scrm 的通知编排器/微信配置）；**运营后台**用 JeecgBoot 代码生成器出 CRUD + 少量手写页；**H5 顾客端**单独做消费端 App（推荐 uni-app，一套出 H5 + 微信小程序）。`store.js` 里每个方法 ≈ 一个 `/tuancan/c/**` 接口。

---

## 1. 复用清单（本仓库已有，直接接）
| 团餐需要 | 仓库已有 | 位置 |
|---|---|---|
| H5 顾客端登录/鉴权 | C 端访客 Token（`X-C-Token` JWT） | `scrm/auth/CTokenUtil`、`CVisitorTokenFilter`、`CVisitorContext`、`config/CVisitorFilterConfig`，白名单在 `base-core` 的 `ShiroConfig`（`/scrm/c/** = anon`） |
| 客户端接口写法 | `@RequestMapping("/scrm/c/...")` + `Result.OK` | `scrm/card/controller/ScrmCardClientController` |
| 订单/套餐基型 | `scrm_order` / `ScrmPackage` | `scrm/billing/**` |
| 功能8 服务号/站内提醒 | `NotifyOrchestrator` + `OaTemplateMsgChannel` / `InAppNotifyChannel` / `WebSocketNotifyChannel` | `scrm/notify/**` |
| 功能4 微信支付 / 未来小程序 | 公众号 `WxMpConfiguration`、小程序 `WxMaConfiguration` | `scrm/config/**` |
| 多商户隔离 | `TenantContext` + `ScrmBTenantInterceptor` + `ScrmTenantConfig.ENABLED` | `scrm/config/**` |
| 定时任务（积分过期/提醒重试） | Quartz 任务样板 `ScrmNotifyRetryJob` | `scrm/notify/**` |
| 后台 CRUD 页 | JeecgBoot 代码生成器 + `resources/sql` 菜单脚本 | scrm 各 `*.sql` |

---

## 2. 模块落点（已定：平级并行）
新建 `jeecg-boot-module/jeecg-module-tuancan`，**与 `jeecg-module-scrm` 平级**，包结构沿用 scrm 习惯：
```
org.jeecg.modules.tuancan
  restaurant/  pkg/  menu/  pickup/  delivery/       # 菜单域（后台 CRUD，代码生成）
  order/                                             # 下单闭环
  customer/                                          # C端用户
  voucher/  points/  checkin/  referral/             # 营销域
  review/                                            # 评价
  notify/                                            # 团餐通知事件（复用 scrm 编排器）
  client/                                            # /tuancan/c/** 客户端接口
  config/                                            # 订餐模式、C 过滤器注册
```
接入步骤（Java）：
1. 在 `jeecg-boot-module/pom.xml` 注册新模块；新模块 `pom.xml` 继承父工程、依赖 `jeecg-boot-base-core`。
2. 让启动模块（`jeecg-system-start` / 单体启动那个）依赖 `jeecg-module-tuancan`，使其被组件扫描（包名在 `org.jeecg.modules.*` 下即可被扫到）。
3. Mapper extends `BaseMapper`、Service extends `ServiceImpl`、实体 extends `JeecgEntity`（MyBatis-Plus 标准）。

**C 端鉴权（关键，保证真正平级）**：把 `CTokenUtil / CVisitorTokenFilter / CVisitorContext / CVisitorInfo` 这 4 个类**从 scrm 上提到 `jeecg-boot-base-core`**，做成通用「C 访客鉴权」。scrm 与 tuancan 各自注册自己的 `FilterRegistrationBean`（scrm `/scrm/c/**`、团餐 `/tuancan/c/**`），并在 `base-core` 的 `ShiroConfig` 各放行一行 `anon`。
> 这样团餐**不依赖 scrm 模块**，两者只共享 base-core——这才是"平级"。若图快可让 tuancan 临时依赖 scrm 复用这 4 个类，但会留下反向耦合，不建议长留。

## 2.5 与 SCRM 的集成缝（Spring Event，低耦合）
平级 ≠ 孤岛。"黄金交叉点"（SCRM 名片获客 → 线索转化 → 团餐为企业开户）用 **Spring `ApplicationEvent`** 打通（scrm 已有 `ScrmTrackEvent` 先例）。采纳专家方案，但**修正一处依赖方向**：
- **事件类放 `jeecg-boot-base-core`**（如 `LeadConvertedEvent`），不要放 scrm。否则 tuancan 的监听器要 `import org.jeecg.modules.scrm.*` → **团餐反向依赖 scrm，破坏平级**。
- 数据流**单向**：scrm 发布 → tuancan `@EventListener` 订阅自动开户；两边都只依赖 base-core 的事件类，互不 import 对方模块。
- 共享只到「底座对象」（sys_user 后台账号、组织、字典、权限、Quartz、通知编排器），**业务对象（线索 vs 餐单/顾客）各自闭环**，不互相伸手查表。
- 形态参考（伪代码）：scrm `applicationEventPublisher.publishEvent(new LeadConvertedEvent(this, leadId, companyName))`；tuancan 监听后建 `tc_company`（企业团餐合作账户，第二期）。注意这属于 B2B 交叉点，**不影响 P0 的 B2C 个人下单闭环**。

---

## 3. 数据模型（新表，建议前缀 `tc_`；与 `store.js` 一一对应）
| 表 | 对应 store.js | 关键字段 |
|---|---|---|
| `tc_restaurant` | 餐厅 | name, cuisine, contact, settle_mode, status |
| `tc_package` | 套餐 | restaurant_id, type(grid/fixed), name, price, supply_price, stock, tags, meat_n, veg_n |
| `tc_dish_option` | 荤/素/主食选项 | restaurant_id, kind, name, spicy, status |
| `tc_weekly_menu` | 每周菜单 | menu_date, day_name, restaurant_id, package_id, stock, status |
| `tc_pickup_point` / `tc_delivery_zone` | 自提点 / 配送区域 | name, address, time, fee, status |
| `tc_customer` | user | phone, nick, invite_code, invited_by, balance（**= C 访客身份**） |
| `tc_order` | orders | order_no, customer_id, deliver_type, pickup_id, food, fee, discount, voucher_id, total, points_earned, pay_channel, status |
| `tc_order_item` | order.items | order_id, package_id, day_name, options_json, price, qty |
| `tc_voucher` + `tc_voucher_batch` | vouchers | code, title, source, type, amount, threshold, scope, valid_to, status, customer_id；batch 支持外部业务（海螺升学）批量导入 |
| `tc_points_ledger` | points.ledger | customer_id, type(earn/spend/expire), amount, reason, expire_at |
| `tc_checkin_log` | checkin | customer_id, checkin_date, streak, total |
| `tc_review` | reviews | order_no, restaurant_id, food_star, rest_star, content, photo_url, customer_id |
| `tc_referral` | referral | inviter_id, invitee_id, status, reward, ts |
| `tc_notification` | notifications | customer_id, type, title, body, read（或直接复用 scrm 通知日志） |
| `tc_order_mode` | orderingMode | tenant/merchant, mode, enabled_days（功能5） |

> 因为 `store.js` 当初就是按"对齐未来表结构"设计的，这步基本是**字段平移**。

---

## 4. 八大功能 → JeecgBoot 实现映射
| # | 功能 | 后端做法 | 复用点 |
|---|---|---|---|
| 1 | 抵用券 | voucher service + 批量导入接口；下单时校验门槛/范围、核销 | 标准 service |
| 2 | 积分 | points_ledger 流水；过期用 **Quartz 任务**扫 expire_at | 参考 `ScrmNotifyRetryJob` |
| 3 | 签到 | checkin service 算连签/累计，发积分 | — |
| 4 | 支付(USD/微信) | `tc_order.pay_channel`；微信支付用 wx-java-pay；美元用 Stripe（海外主体） | `WxMpConfiguration`、`scrm_order.payChannel` 已有先例 |
| 5 | 订餐模式 | `tc_order_mode` 配置；菜单接口只返回开放日 | 配置表 |
| 6 | 评论 | review 绑定 `order_no` 为凭据；后台按餐厅聚合 | 标准 CRUD + 聚合查询 |
| 7 | 裂变 | invite_code/链接；新人首单完成触发双方发积分 | — |
| 8 | 服务号/站内提醒 | 定义团餐通知事件（下单/截单/可取餐/邀评/积分到账），投递走编排器 | **`NotifyOrchestrator` + `OaTemplateMsgChannel` 直接复用** |

---

## 5. 前端两端
- **运营后台**：用 JeecgBoot 自带的 **jeecgboot-vue3（Ant Design Vue）**。
  - 餐厅/套餐/菜品/自提点/区域/券/用户等 → **代码生成器**一键出列表+表单。
  - 数据看板、每周菜单编排、备餐单/分拣单/配送单导出、订餐模式开关、评论聚合 → **手写 Vue 页**，视觉照 `admin.html` 演示。
- **H5 顾客端**：**不是** jeecg 后台，是独立消费端。
  - 推荐 **uni-app（Vue 语法）→ 一套代码出 H5 + 微信小程序**，契合华人微信场景 + 功能8 服务号/小程序提醒。
  - 退而求其次：Vant H5 先上；或暂时沿用现有 `order.html` 静态站，把 `store.js` 换成 `axios` 调 `/tuancan/c/**`。
  - 交互/视觉照已实现的 `order.html` 演示。

---

## 6. 落地阶段（建议顺序）
- **P0 地基**：建表 + 代码生成后台 CRUD（餐厅/套餐/菜品/菜单/自提点/区域）+ C 访客鉴权 + 菜单接口 + 下单/订单（核心闭环）。
- **P1 交易增强**：抵用券(1) + 积分(2) + 微信支付(4)。
- **P2 增长**：签到(3) + 评论(6) + 裂变(7)。
- **P3 触达**：服务号提醒(8，复用编排器) + 订餐模式(5) + 小程序端。
- 全程：后台导出（备餐/分拣/配送单）随相关阶段补。

---

## 7. 关键决策（已定 / 待定）
1. ✅ **团餐与 SCRM 的关系** → **平级并行 + C 鉴权上提 base-core**（已定）。
2. ⏳ **H5 客户端技术选型**：uni-app(H5+小程序，推荐) / Vant 纯 H5 / 维持静态站接 API。（新对话可后定，先做后端）
3. ✅ **是否多商户** → 单运营方 MVP，**暂不启用多租户**（`ScrmTenantConfig.ENABLED=false`；表里保留 `tenant_id` 列备用）。
4. ⏳ **微信支付主体 / 美元收款**：有无微信支付商户号；美元是否走 Stripe。（P1 再定，先用占位 payChannel）
5. ✅ **C 端用户表** → 新建 `tc_customer`（独立团餐顾客身份，走 C 访客 Token），与 scrm 访客解耦，必要时通过集成缝同步。

---

## 9. 数据库规范（复用 JeecgBoot 底座 MySQL）
建表遵循 JeecgBoot/MyBatis-Plus 习惯，DDL + 菜单 SQL 放 `jeecg-module-tuancan/src/main/resources/sql/`（照 scrm 的 `*.sql` 体例），在底座库手动执行。
- **库/字符集**：复用 JeecgBoot 同一个 MySQL 库；`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`。
- **主键/基础列**：实体 extends `JeecgEntity`，对应每张 `tc_*` 表都含底座标准列：
  `id varchar(32)`（雪花/ASSIGN_ID）、`create_by`、`create_time`、`update_by`、`update_time`、`sys_org_code`。业务表再加 `del_flag tinyint default 0`（软删，参考 `ScrmOrder.delFlag`）、`tenant_id int null`（备用，当前不启多租户）。
- **命名**：表 `tc_` 前缀、列 snake_case（与第 3 节一致）。
- **类型约定**：金额 `decimal(10,2)`（实体用 `BigDecimal`，参考 `scrm_order.amount`）；积分 `int`；时间 `datetime`；选项快照 `tc_order_item.options_json` 用 `json`/`text`；状态用短字符串枚举（`UNPAID/PAID/CANCELLED`，照 `scrm_order.status`）。
- **索引**：`tc_order(order_no UNIQUE, customer_id, status)`、`tc_customer(phone UNIQUE, invite_code)`、`tc_voucher(customer_id, status)`、`tc_points_ledger(customer_id, expire_at)`、`tc_weekly_menu(menu_date, restaurant_id)`、`tc_review(order_no, restaurant_id)`。
- **后台菜单**：新增管理页要写 `sys_permission` 菜单 SQL（照 scrm 的 `scrm-menu*.sql`），否则后台左栏看不到。
- **代码生成器**：建好 `tc_*` 表后，用 JeecgBoot 在线代码生成器按表生成 entity/mapper/service/controller/vue（CRUD 页）；C 端接口与积分/券/签到等带业务逻辑的部分手写。
- **演进**：表里预留 `tenant_id` 但当前不启多租户；将来卖给多家时打开 `ScrmTenantConfig.ENABLED` + 加租户拦截器即可，不用改表。

## 8. 可直接粘进新对话的启动语
> 我要在 JeecgBoot（本仓库 `jeecg-boot`）上用 **Java + 底座 MySQL** 实现"万能团餐"系统，架构**与 scrm 平级**。规格见 `../tuancan-design/project/tuancan/需求v2-设计文档.md`，交互照 `order.html`/`admin.html`，数据结构以 `assets/store.js` 为 API 契约蓝本，接入策略与已定决策见 `团餐-JeecgBoot接入建议.md`（第 ★ 节）。请先读这几份，然后从 P0 开始：①把 scrm 的 C 访客鉴权（`CTokenUtil`/`CVisitorTokenFilter`/`CVisitorContext`/`CVisitorInfo`）上提到 `jeecg-boot-base-core` 做成通用 C 鉴权；②新建平级模块 `jeecg-module-tuancan` 并注册到工程；③按第 3、9 节写 `tc_*` 建表 SQL（JeecgEntity 规范、utf8mb4、`tc_` 前缀）；④搭出 `/tuancan/c/**` 菜单查询 + 下单接口跑通核心闭环。多租户/Flowable/支付暂不做。
