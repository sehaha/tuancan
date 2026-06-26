// ============================================================
// 万能团餐 · 数据访问层（第一期：核心下单闭环）
// 依赖：config.js（SUPABASE_URL / SUPABASE_ANON_KEY）+ supabase-js v2
// 暴露全局 window.DB：
//   DB.configured           是否已填写后端配置
//   DB.ready                Promise，resolve 后 client 可用
//   DB.fetchMenuData()      -> { days, menu }（结构与 H5 现有 this.menu 对齐）
//   DB.createOrder(payload) -> 保存的订单对象
//   DB.fetchOrders()        -> 订单列表（含明细）
//   DB.fetchPrepSheet(date) -> 某日备餐汇总（后台导出用）
// ============================================================
(function () {
  "use strict";

  var URL = window.SUPABASE_URL || "";
  var KEY = window.SUPABASE_ANON_KEY || "";
  var configured = !!(URL && KEY);

  var sb = null;

  // 动态加载 supabase-js v2（UMD）
  function loadSupabase() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.onload = resolve;
      s.onerror = function () { reject(new Error("加载 supabase-js 失败")); };
      document.head.appendChild(s);
    });
  }

  var ready = !configured
    ? Promise.reject(new Error("后端未配置：请在 config.js 填写 SUPABASE_URL 与 SUPABASE_ANON_KEY"))
    : loadSupabase().then(function () {
        sb = window.supabase.createClient(URL, KEY);
        return sb;
      });

  // ---------- 工具 ----------
  function fmtDate(iso) {
    // '2026-06-29' -> '6/29'
    var p = String(iso).split("-");
    if (p.length < 3) return iso;
    return parseInt(p[1], 10) + "/" + parseInt(p[2], 10);
  }
  function money(n) { return "$" + Number(n).toFixed(2); }
  function genOrderNo() { return "MST-2" + (Math.floor(Math.random() * 900000) + 100000); }
  function genCode() { return String(1000 + Math.floor(Math.random() * 9000)); }

  // ---------- 菜单 ----------
  // 返回 { days:[{day,date}], menu:{ '周一':{date, rests:[{id,name,cuisine,emoji,bg,packages:[...]}]} } }
  // package 字段映射为 H5 现有命名：desc / meatN / vegN，并附 menuId(唯一)、packageId(真实)、menuDate
  function fetchMenuData() {
    return ready.then(function () {
      return sb
        .from("menu_items")
        .select(
          "id, menu_date, day_label, stock, sold, sort, active," +
          "packages:package_id ( id, restaurant_id, type, name, description, price, emoji, bg, content, tags, meat_n, veg_n, meats, veggies, sauce, is_hot, active," +
          "restaurants:restaurant_id ( id, name, cuisine, emoji, bg, sort ) )"
        )
        .eq("active", true)
        .order("menu_date", { ascending: true })
        .order("sort", { ascending: true })
        .then(function (res) {
          if (res.error) throw res.error;
          var rows = (res.data || []).filter(function (r) { return r.packages && r.packages.active !== false; });

          var daysOrder = [];   // 保持 menu_date 顺序
          var seenDate = {};
          var menu = {};

          rows.forEach(function (r) {
            var pk = r.packages;
            var rest = pk.restaurants || {};
            var dayLabel = r.day_label;

            if (!seenDate[dayLabel]) {
              seenDate[dayLabel] = true;
              daysOrder.push({ day: dayLabel, date: fmtDate(r.menu_date), _d: r.menu_date });
              menu[dayLabel] = { date: fmtDate(r.menu_date), rests: [], _restIndex: {} };
            }
            var dayObj = menu[dayLabel];

            var restId = rest.id || pk.restaurant_id;
            var restEntry = dayObj._restIndex[restId];
            if (!restEntry) {
              restEntry = {
                id: restId, name: rest.name, cuisine: rest.cuisine,
                emoji: rest.emoji, bg: rest.bg, _sort: rest.sort || 0, packages: []
              };
              dayObj._restIndex[restId] = restEntry;
              dayObj.rests.push(restEntry);
            }

            restEntry.packages.push({
              id: r.id,                 // 当日唯一（menu_item id）→ 供 pkgById 使用
              packageId: pk.id,         // 真实套餐 id（下单写库用）
              menuItemId: r.id,
              menuDate: r.menu_date,
              restId: restId,
              type: pk.type,
              name: pk.name,
              desc: pk.description,
              content: pk.content,
              price: Number(pk.price),
              emoji: pk.emoji,
              bg: pk.bg,
              tags: pk.tags || [],
              meats: pk.meats || [],
              veggies: pk.veggies || [],
              meatN: pk.meat_n || 0,
              vegN: pk.veg_n || 0,
              sauce: !!pk.sauce,
              stock: r.stock,
              sold: r.sold
            });
          });

          // 每天内餐厅按 sort 排序，爆款(sort=-1)已靠前
          daysOrder.forEach(function (d) {
            var dm = menu[d.day];
            dm.rests.sort(function (a, b) { return a._sort - b._sort; });
            dm.rests.forEach(function (re) { delete re._sort; });
            delete dm._restIndex;
          });
          daysOrder.forEach(function (d) { delete d._d; });

          return { days: daysOrder, menu: menu };
        });
    });
  }

  // ---------- 下单 ----------
  // payload: { items:[{menuDate, dayLabel, restId, restName, packageId, name, emoji, bg, optStr, price, qty}],
  //            deliverType, pickupId, address, unit, atDoor, name, phone, wechat, payMethod, food, fee, total }
  function createOrder(payload) {
    return ready.then(function () {
      var orderNo = genOrderNo();
      var code = genCode();
      var orderRow = {
        order_no: orderNo, code: code, status: "已付款",
        deliver_type: payload.deliverType || "pickup",
        pickup_id: payload.deliverType === "deliver" ? null : (payload.pickupId || null),
        address: payload.address || null, unit: payload.unit || null,
        at_door: !!payload.atDoor,
        cust_name: payload.name || null, phone: payload.phone || null, wechat: payload.wechat || null,
        pay_method: payload.payMethod || null,
        food: payload.food || 0, fee: payload.fee || 0, total: payload.total || 0
      };
      return sb.from("orders").insert(orderRow).select().single().then(function (res) {
        if (res.error) throw res.error;
        var order = res.data;
        var items = (payload.items || []).map(function (c) {
          return {
            order_id: order.id,
            menu_date: c.menuDate || null,
            day_label: c.dayLabel || c.day || null,
            restaurant_id: c.restId || null,
            restaurant_name: c.restName || null,
            package_id: c.packageId || null,
            package_name: c.name,
            emoji: c.emoji || null, bg: c.bg || null,
            opt_str: c.optStr || null,
            unit_price: c.price, qty: c.qty
          };
        });
        return sb.from("order_items").insert(items).then(function (r2) {
          if (r2.error) throw r2.error;
          // 返回 H5 风格订单对象
          return {
            id: order.id, orderNo: order.order_no, code: order.code, status: order.status,
            createdAt: "刚刚",
            deliverType: order.deliver_type, pickup: order.pickup_id,
            address: order.address, unit: order.unit,
            items: (payload.items || []).map(function (c) {
              return { name: c.name, restName: c.restName, day: c.dayLabel || c.day,
                       emoji: c.emoji, bg: c.bg, optStr: c.optStr, price: c.price, qty: c.qty };
            }),
            food: order.food, fee: order.fee, total: order.total
          };
        });
      });
    });
  }

  // ---------- 订单列表（后台 / 我的订单）----------
  function fetchOrders() {
    return ready.then(function () {
      return sb.from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false })
        .then(function (res) {
          if (res.error) throw res.error;
          return (res.data || []).map(function (o) {
            return {
              id: o.id, orderNo: o.order_no, code: o.code, status: o.status,
              createdAt: o.created_at, deliverType: o.deliver_type, pickup: o.pickup_id,
              address: o.address, unit: o.unit,
              custName: o.cust_name, phone: o.phone,
              food: Number(o.food), fee: Number(o.fee), total: Number(o.total),
              items: (o.order_items || []).map(function (i) {
                return { name: i.package_name, restName: i.restaurant_name, day: i.day_label,
                         menuDate: i.menu_date, restId: i.restaurant_id,
                         emoji: i.emoji, bg: i.bg, optStr: i.opt_str,
                         price: Number(i.unit_price), qty: i.qty };
              })
            };
          });
        });
    });
  }

  // ---------- 备餐单汇总（后台导出）----------
  // 返回 [{ menuDate, restName, packageName, qty }]，按餐厅+套餐合计
  function fetchPrepSheet(menuDate) {
    return ready.then(function () {
      var q = sb.from("order_items").select("menu_date, restaurant_name, package_name, qty");
      if (menuDate) q = q.eq("menu_date", menuDate);
      return q.then(function (res) {
        if (res.error) throw res.error;
        var agg = {};
        (res.data || []).forEach(function (i) {
          var k = (i.menu_date || "") + "|" + (i.restaurant_name || "") + "|" + i.package_name;
          if (!agg[k]) agg[k] = { menuDate: i.menu_date, restName: i.restaurant_name, packageName: i.package_name, qty: 0 };
          agg[k].qty += i.qty;
        });
        return Object.keys(agg).map(function (k) { return agg[k]; })
          .sort(function (a, b) { return (a.restName || "").localeCompare(b.restName || ""); });
      });
    });
  }

  window.DB = {
    configured: configured,
    ready: ready,
    fetchMenuData: fetchMenuData,
    createOrder: createOrder,
    fetchOrders: fetchOrders,
    fetchPrepSheet: fetchPrepSheet,
    _money: money
  };
})();
