-- ============================================================
-- 万能团餐 · Supabase Schema（第一期：核心下单闭环）
-- 在 Supabase 控制台 → SQL Editor 里整段粘贴运行即可。
-- 可重复运行（会先 DROP 再重建，适合试运营阶段刷新数据）。
-- ============================================================

-- ---------- 清理（按依赖倒序）----------
drop table if exists order_items cascade;
drop table if exists orders cascade;
drop table if exists menu_items cascade;
drop table if exists packages cascade;
drop table if exists restaurants cascade;
drop table if exists pickup_points cascade;

-- ---------- 餐厅 ----------
create table restaurants (
  id          text primary key,           -- 'A' / 'B' / 'C'
  name        text not null,
  cuisine     text,
  emoji       text,
  bg          text,                        -- 卡片渐变背景（沿用设计稿）
  status      text not null default 'active',
  sort        int  not null default 0
);

-- ---------- 套餐 ----------
create table packages (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id text not null references restaurants(id) on delete cascade,
  type          text not null default 'fixed',   -- 'grid' 中餐格子 | 'fixed' 固定套餐
  name          text not null,
  description   text,
  price         numeric(10,2) not null,          -- 销售价
  supply_price  numeric(10,2),                   -- 供货价（毛利计算用）
  emoji         text,
  bg            text,
  content       text,                            -- 固定套餐内容描述
  tags          text[] default '{}',
  -- 中餐格子套餐专用：
  meat_n        int default 0,
  veg_n         int default 0,
  meats         text[] default '{}',
  veggies       text[] default '{}',
  sauce         boolean default false,           -- 轻食类是否提供酱料选项
  is_hot        boolean default false,           -- 爆款限量
  active        boolean not null default true
);
create index on packages(restaurant_id);

-- ---------- 每周菜单（哪个套餐在哪天供应 + 当日库存）----------
create table menu_items (
  id          uuid primary key default gen_random_uuid(),
  menu_date   date not null,
  day_label   text not null,               -- '周一'…'周五'
  package_id  uuid not null references packages(id) on delete cascade,
  stock       int  not null default 30,    -- 当日库存上限
  sold        int  not null default 0,     -- 已售（展示用）
  sort        int  not null default 0,
  active      boolean not null default true,
  unique (menu_date, package_id)
);
create index on menu_items(menu_date);

-- ---------- 自提点 ----------
create table pickup_points (
  id        text primary key,              -- 'p1' / 'p2' / 'p3'
  name      text not null,
  address   text,
  time      text,
  parking   text,
  contact   text,
  status    text not null default 'active',
  sort      int  not null default 0
);

-- ---------- 订单 ----------
create table orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      text not null unique,
  code          text not null,             -- 取餐码
  status        text not null default '已付款',
  deliver_type  text not null default 'pickup',   -- pickup | deliver
  pickup_id     text references pickup_points(id),
  address       text,
  unit          text,
  at_door       boolean default false,
  cust_name     text,
  phone         text,
  wechat        text,
  pay_method    text,
  food          numeric(10,2) not null default 0,
  fee           numeric(10,2) not null default 0,
  total         numeric(10,2) not null default 0,
  created_at    timestamptz not null default now()
);
create index on orders(created_at desc);

-- ---------- 订单明细 ----------
create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  menu_date     date,
  day_label     text,
  restaurant_id text references restaurants(id),
  restaurant_name text,
  package_id    uuid references packages(id),
  package_name  text not null,
  emoji         text,
  bg            text,
  opt_str       text,                      -- 选项汇总：荤素 / 辣度 / 主食 / 餐具
  unit_price    numeric(10,2) not null,
  qty           int not null default 1
);
create index on order_items(order_id);
create index on order_items(menu_date);

-- ============================================================
-- 行级安全（RLS）
-- 第一期：菜单类只读公开；订单允许匿名下单。
-- ⚠️ 注意：orders/order_items 暂时允许匿名读取，是为了让无登录的
--   运营后台能看到订单。正式开放给真实顾客前，请先给后台加鉴权
--   （见 SETUP 文档"安全"一节），否则任何人都能读到下单人姓名/电话。
-- ============================================================
alter table restaurants   enable row level security;
alter table packages      enable row level security;
alter table menu_items    enable row level security;
alter table pickup_points enable row level security;
alter table orders        enable row level security;
alter table order_items   enable row level security;

create policy "menu read"     on restaurants   for select using (true);
create policy "pkg read"      on packages      for select using (true);
create policy "menuitem read" on menu_items    for select using (true);
create policy "pickup read"   on pickup_points for select using (true);

create policy "order read"    on orders        for select using (true);
create policy "order insert"  on orders        for insert with check (true);
create policy "oi read"       on order_items   for select using (true);
create policy "oi insert"     on order_items   for insert with check (true);

-- ============================================================
-- 种子数据（3 家餐厅 + 套餐 + 下周一~周五菜单 + 自提点）
-- 日期：2026-06-29(周一) ~ 2026-07-03(周五)
-- ============================================================

insert into restaurants (id, name, cuisine, emoji, bg, sort) values
 ('A','家常小馆','家常中餐','🥘','linear-gradient(135deg,#F6D8C3,#EFC2A6)',1),
 ('B','元气便当','日式便当','🍙','linear-gradient(135deg,#CFE0F2,#AFC9EC)',2),
 ('C','轻盈轻食','健康轻食','🥗','linear-gradient(135deg,#D5EAD2,#B6D9B0)',3);

-- 餐厅 A：中餐格子套餐
insert into packages (restaurant_id,type,name,description,price,supply_price,emoji,bg,tags,meat_n,veg_n,meats,veggies) values
 ('A','grid','一荤一素套餐','1 荤 1 素 + 米饭，经典家常',12.99,8,'🍚','linear-gradient(135deg,#FBE3CE,#F4C9A8)','{不辣}',1,1,'{宫保鸡丁,红烧牛腩,鱼香肉丝}','{番茄炒蛋,蒜蓉西兰花,干煸四季豆}'),
 ('A','grid','两荤一素套餐','2 荤 1 素 + 米饭，吃得满足',15.99,10,'🍱','linear-gradient(135deg,#F7D6B8,#EFBE97)','{人气}',2,1,'{宫保鸡丁,红烧牛腩,鱼香肉丝}','{番茄炒蛋,蒜蓉西兰花,干煸四季豆}'),
 ('A','grid','两荤两素套餐','2 荤 2 素 + 米饭，营养均衡',17.99,11,'🍛','linear-gradient(135deg,#F4CDA6,#E9B488)','{家庭餐}',2,2,'{宫保鸡丁,红烧牛腩,鱼香肉丝}','{番茄炒蛋,蒜蓉西兰花,干煸四季豆}');

-- 餐厅 B：日式便当（固定套餐）
insert into packages (restaurant_id,type,name,description,price,supply_price,emoji,bg,tags,content) values
 ('B','fixed','A 套餐 · 照烧鸡便当','照烧鸡腿 + 玉子烧 + 时蔬',13.99,9,'🍗','linear-gradient(135deg,#FBE6C8,#F3CFA0)','{微辣}','照烧鸡腿、玉子烧、时令蔬菜、白饭'),
 ('B','fixed','B 套餐 · 牛肉饭便当','洋葱牛肉 + 温泉蛋 + 海苔',15.99,11,'🥩','linear-gradient(135deg,#E9CFBE,#D9B49C)','{人气}','洋葱牛肉、温泉蛋、海苔、白饭'),
 ('B','fixed','C 套餐 · 三文鱼便当','香煎三文鱼 + 牛油果 + 糙米',17.99,13,'🍣','linear-gradient(135deg,#F6CFC9,#EBAEA6)','{高蛋白}','香煎三文鱼、牛油果、糙米饭、味噌汤');

-- 餐厅 C：健康轻食（固定套餐，带酱料选项）
insert into packages (restaurant_id,type,name,description,price,supply_price,emoji,bg,tags,content,sauce) values
 ('C','fixed','鸡胸肉健康碗','低脂鸡胸 + 蔬菜 + 糙米',13.99,9,'🥗','linear-gradient(135deg,#D9EBCE,#BFDCAE)','{高蛋白,轻食}','香煎鸡胸、综合蔬菜、糙米饭、和风酱',true),
 ('C','fixed','牛肉沙拉','嫩煎牛肉 + 时蔬沙拉',15.99,11,'🥙','linear-gradient(135deg,#E7E0C4,#D6CCA0)','{高蛋白}','嫩煎牛肉、罗马生菜、樱桃番茄、油醋汁',true),
 ('C','fixed','素食能量碗','鹰嘴豆 + 藜麦 + 牛油果',12.99,8,'🫛','linear-gradient(135deg,#D2E9D9,#B0D6BC)','{素食}','鹰嘴豆、藜麦、牛油果、烤蔬菜、芝麻酱',true);

-- 爆款限量（挂在餐厅 A 名下）
insert into packages (restaurant_id,type,name,description,price,supply_price,emoji,bg,tags,content,is_hot) values
 ('A','fixed','周三烤鸭饭日','限量 50 份 · 现片烤鸭 + 卤汁饭',16.99,11,'🦆','linear-gradient(135deg,#F3C0A0,#E59B6E)','{爆款,限量}','现片烤鸭、黄瓜葱丝、甜面酱、卤汁饭',true),
 ('A','fixed','周五酸菜鱼饭日','限量 40 份 · 酸辣开胃巴沙鱼',15.99,10,'🐟','linear-gradient(135deg,#F6D7B0,#EEBA7E)','{爆款,限量,微辣}','酸菜巴沙鱼片、黄豆芽、米饭',true);

-- 自提点
insert into pickup_points (id,name,address,time,parking,contact,sort) values
 ('p1','自提点 A · Irvine Spectrum 商务楼','100 Spectrum Center Dr, Irvine','12:00–13:00','地库 P1 免费停车 30 分钟','Lisa (949) 555-0101',1),
 ('p2','自提点 B · Diamond Plaza','2700 Alton Pkwy, Irvine','12:00–13:00','地面停车场，靠奶茶店入口','Kevin (949) 555-0102',2),
 ('p3','自提点 C · Northpark 社区门口','5365 Portola Pkwy, Irvine','18:00–19:00','路边临停 10 分钟','Amy (949) 555-0103',3);

-- 每周菜单：周一~周五 × 每家常规套餐（非爆款），库存与已售给个演示值
do $$
declare
  d record;
  p record;
  i int;
begin
  for d in
    select * from (values
      (date '2026-06-29','周一',1),
      (date '2026-06-30','周二',2),
      (date '2026-07-01','周三',3),
      (date '2026-07-02','周四',4),
      (date '2026-07-03','周五',5)
    ) as t(menu_date, day_label, idx)
  loop
    i := 0;
    for p in select * from packages where is_hot = false order by restaurant_id, price loop
      insert into menu_items (menu_date, day_label, package_id, stock, sold, sort)
      values (d.menu_date, d.day_label, p.id, 30, 6 + ((d.idx*3 + i*5) % 18), i);
      i := i + 1;
    end loop;
  end loop;

  -- 爆款：周三烤鸭、周五酸菜鱼
  insert into menu_items (menu_date, day_label, package_id, stock, sold, sort)
  select date '2026-07-01','周三', id, 50, 36, -1 from packages where name='周三烤鸭饭日';
  insert into menu_items (menu_date, day_label, package_id, stock, sold, sort)
  select date '2026-07-03','周五', id, 40, 21, -1 from packages where name='周五酸菜鱼饭日';
end $$;
