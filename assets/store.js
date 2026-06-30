/* =====================================================================
 * 万能团餐 · 二期功能 前端演示数据层 (store.js)
 * ---------------------------------------------------------------------
 * 用 localStorage 模拟后端，字段刻意对齐未来 Supabase 表，方便将来切换。
 * 覆盖：用户身份 / 抵用券 / 积分 / 签到 / 评论 / 裂变 / 站内消息(模拟服务号)。
 * 全局入口：window.Store
 * ===================================================================== */
(function () {
  'use strict';
  var KEY = 'tc_demo_v2';
  var DAY = 86400000;

  // ---- 可调业务参数（来自《需求v2-设计文档》已确认默认值）----
  var CONFIG = {
    pointsPerDollar: 10,        // 实付 $1 = 10 积分
    pointsExpireMonths: 12,     // 积分滚动 12 个月过期
    checkin: {
      daily: 5,                 // 每日签到 +5
      streakBonus: { 7: 50, 15: 120 },   // 连签里程碑
      cumulativeBonus: { 30: 200 }       // 累计里程碑
    },
    referral: { inviter: 200, invitee: 100 } // 推荐人 / 新人
  };

  // ---------- 工具 ----------
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function nowTs() { return new Date().getTime(); }
  function uid(p) { return (p || 'id') + '_' + nowTs().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function addMonths(ts, m) { var d = new Date(ts); d.setMonth(d.getMonth() + m); return d.getTime(); }
  function genCode(n) { var s = ''; for (var i = 0; i < (n || 4); i++) s += Math.floor(Math.random() * 10); return s; }
  function genInvite() { var c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

  // ---------- 持久化 ----------
  function blank() {
    return {
      user: null,            // {phone, nick, joinedAt, inviteCode, invitedBy}
      points: { ledger: [] },// ledger: [{id, type:'earn'|'spend'|'expire', amount, reason, ts, expireAt?}]
      vouchers: [],          // 见 seedVouchers()
      checkin: { last: null, streak: 0, total: 0, days: [] },
      reviews: [],           // {id, orderNo, restName, foodStar, restStar, text, photo, ts}
      referral: { invitees: [] }, // [{phone, status:'pending'|'done', ts}]
      notifications: [],     // {id, type, title, body, ts, read}
      orderingMode: { mode: 'week', days: ['周一', '周二', '周三', '周四', '周五'] }, // 订餐模式（后台可配，H5 据此显示可订日）
      seeded: false
    };
  }
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') return s; } catch (e) {}
    return blank();
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  var S = load();
  function commit() { save(S); }

  // ---------- 种子券（演示用：模拟海螺升学返利等业务导入的券）----------
  function seedVouchers() {
    var t0 = nowTs();
    return [
      { id: uid('vc'), code: 'HAILUO20', title: '海螺升学返利 · 满$30减$5', source: '海螺升学返利', type: 'full_reduce', amount: 5, threshold: 30, scope: 'all', validTo: t0 + 30 * DAY, status: 'unused' },
      { id: uid('vc'), code: 'NEW10', title: '新用户 · 直减$3', source: '系统活动', type: 'direct', amount: 3, threshold: 0, scope: 'all', validTo: t0 + 14 * DAY, status: 'unused' },
      { id: uid('vc'), code: 'LIGHT15', title: '轻盈轻食 · 满$25减$4', source: '系统活动', type: 'full_reduce', amount: 4, threshold: 25, scope: 'rest', scopeVal: '轻盈轻食', validTo: t0 + 20 * DAY, status: 'unused' }
    ];
  }
  // 外部业务导入券的钩子（海螺升学等将来对接此入口）
  function importVouchers(list) {
    (list || []).forEach(function (v) {
      v.id = v.id || uid('vc'); v.status = v.status || 'unused';
      v.scope = v.scope || 'all'; S.vouchers.push(v);
    });
    commit();
  }

  function ensureSeed() {
    if (S.seeded) return;
    S.vouchers = seedVouchers();
    S.notifications = [
      { id: uid('nt'), type: 'welcome', title: '欢迎加入万能团餐 🎉', body: '完成首单得积分，每日签到领奖励，邀请好友双方各得积分。', ts: nowTs(), read: false }
    ];
    S.seeded = true; commit();
  }
  ensureSeed();

  // ---------- 积分 ----------
  function expireOldPoints() {
    var now = nowTs(), changed = false;
    S.points.ledger.forEach(function (e) {
      if (e.type === 'earn' && !e.expired && e.expireAt && e.expireAt <= now) {
        e.expired = true;
        S.points.ledger.push({ id: uid('pt'), type: 'expire', amount: -e.remain != null ? -(e.remain) : -e.amount, reason: '积分过期', ts: now });
        changed = true;
      }
    });
    if (changed) commit();
  }
  function pointsBalance() {
    expireOldPoints();
    return S.points.ledger.reduce(function (a, e) { return a + e.amount; }, 0);
  }
  function earnPoints(amount, reason) {
    amount = Math.round(amount);
    if (amount <= 0) return 0;
    S.points.ledger.unshift({ id: uid('pt'), type: 'earn', amount: amount, reason: reason || '获得积分', ts: nowTs(), expireAt: addMonths(nowTs(), CONFIG.pointsExpireMonths) });
    commit();
    notify('points', '积分到账 +' + amount, (reason || '') + '，当前 ' + pointsBalance() + ' 积分');
    return amount;
  }
  function spendPoints(amount, reason) {
    amount = Math.round(amount);
    if (amount <= 0) return false;
    if (pointsBalance() < amount) return false;
    S.points.ledger.unshift({ id: uid('pt'), type: 'spend', amount: -amount, reason: reason || '积分兑换', ts: nowTs() });
    commit();
    return true;
  }
  function soonExpire() {
    expireOldPoints();
    var now = nowTs(), soon = now + 30 * DAY, sum = 0, at = null;
    S.points.ledger.forEach(function (e) {
      if (e.type === 'earn' && !e.expired && e.expireAt && e.expireAt <= soon) { sum += e.amount; at = at ? Math.min(at, e.expireAt) : e.expireAt; }
    });
    return sum > 0 ? { amount: sum, at: at } : null;
  }

  // ---------- 用户身份（手机号免验证）----------
  function currentUser() { return S.user; }
  function login(phone, nick) {
    if (!phone) return null;
    if (!S.user) {
      S.user = { phone: phone, nick: nick || ('用户' + phone.slice(-4)), joinedAt: nowTs(), inviteCode: genInvite(), invitedBy: null };
      commit();
      // 处理待结算的邀请（若本机此前点过邀请链接）
      applyPendingInvite(phone);
    } else {
      S.user.phone = phone; if (nick) S.user.nick = nick; commit();
    }
    return S.user;
  }
  function logout() { S.user = null; commit(); }

  // ---------- 抵用券 ----------
  function claimByCode(code) {
    code = (code || '').trim().toUpperCase();
    if (!code) return { ok: false, msg: '请输入券码' };
    if (S.vouchers.find(function (v) { return v.code === code; })) return { ok: false, msg: '该券已在你的卡包' };
    // 演示：几个可领取的码
    var pool = {
      'WELCOME5': { title: '欢迎券 · 直减$5', source: '系统活动', type: 'direct', amount: 5, threshold: 0, scope: 'all' },
      'DUCK2': { title: '烤鸭日 · 满$15减$2', source: '系统活动', type: 'full_reduce', amount: 2, threshold: 15, scope: 'all' }
    };
    var def = pool[code];
    if (!def) return { ok: false, msg: '券码无效或已过期' };
    def.id = uid('vc'); def.code = code; def.status = 'unused'; def.validTo = nowTs() + 14 * DAY;
    S.vouchers.push(def); commit();
    return { ok: true, msg: '已领取：' + def.title };
  }
  function availableVouchers(foodAmount, restNames) {
    var now = nowTs();
    return S.vouchers.filter(function (v) {
      if (v.status !== 'unused') return false;
      if (v.validTo && v.validTo < now) return false;
      if (v.threshold && foodAmount < v.threshold) return false;
      if (v.scope === 'rest' && v.scopeVal && (!restNames || restNames.indexOf(v.scopeVal) < 0)) return false;
      return true;
    });
  }
  function voucherDiscount(v, foodAmount) {
    if (!v) return 0;
    var d = 0;
    if (v.type === 'direct') d = v.amount;
    else if (v.type === 'full_reduce') d = (foodAmount >= (v.threshold || 0)) ? v.amount : 0;
    else if (v.type === 'percent') d = foodAmount * (v.amount / 100);
    return Math.min(d, foodAmount);
  }
  function redeemVoucher(id) {
    var v = S.vouchers.find(function (x) { return x.id === id; });
    if (v) { v.status = 'used'; v.usedAt = nowTs(); commit(); }
  }
  function allVouchers() { expireVouchers(); return S.vouchers.slice(); }
  function expireVouchers() {
    var now = nowTs(), ch = false;
    S.vouchers.forEach(function (v) { if (v.status === 'unused' && v.validTo && v.validTo < now) { v.status = 'expired'; ch = true; } });
    if (ch) commit();
  }

  // ---------- 签到 ----------
  function checkinStatus() {
    var c = S.checkin, today = dayStr();
    return { signedToday: c.last === today, streak: c.streak, total: c.total, days: c.days.slice(-14) };
  }
  function doCheckin() {
    var c = S.checkin, today = dayStr();
    if (c.last === today) return { ok: false, msg: '今天已签到', gained: 0 };
    var yest = dayStr(new Date(nowTs() - DAY));
    c.streak = (c.last === yest) ? c.streak + 1 : 1;
    c.total += 1; c.last = today; c.days.push(today);
    var gained = CONFIG.checkin.daily, bonusMsg = [];
    earnPoints(gained, '每日签到');
    if (CONFIG.checkin.streakBonus[c.streak]) { var b = CONFIG.checkin.streakBonus[c.streak]; earnPoints(b, '连续签到 ' + c.streak + ' 天奖励'); gained += b; bonusMsg.push('连签' + c.streak + '天 +' + b); }
    if (CONFIG.checkin.cumulativeBonus[c.total]) { var cb = CONFIG.checkin.cumulativeBonus[c.total]; earnPoints(cb, '累计签到 ' + c.total + ' 天奖励'); gained += cb; bonusMsg.push('累计' + c.total + '天 +' + cb); }
    commit();
    return { ok: true, gained: gained, streak: c.streak, total: c.total, msg: '签到成功 +' + gained + (bonusMsg.length ? '（' + bonusMsg.join('，') + '）' : '') };
  }

  // ---------- 评论（绑定订单，初期仅后台可见）----------
  function addReview(r) {
    r.id = uid('rv'); r.ts = nowTs();
    S.reviews.unshift(r); commit();
    return r;
  }
  function reviewsOfOrder(orderNo) { return S.reviews.filter(function (r) { return r.orderNo === orderNo; }); }
  function allReviews() { return S.reviews.slice(); }

  // ---------- 裂变 ----------
  function inviteCode() { return S.user ? S.user.inviteCode : null; }
  function inviteLink() { var base = location.origin + location.pathname; return base + '?inv=' + (inviteCode() || ''); }
  function captureInviteFromUrl() {
    try {
      var m = location.search.match(/[?&]inv=([A-Z0-9]+)/i);
      if (m && m[1]) localStorage.setItem('tc_pending_inv', m[1].toUpperCase());
    } catch (e) {}
  }
  function applyPendingInvite(phone) {
    var code = localStorage.getItem('tc_pending_inv');
    if (!code || !S.user) return;
    if (S.user.inviteCode === code) return; // 不能邀请自己
    S.user.invitedBy = code;
    // 新人获得新人积分（首单完成时再发推荐人积分——见 completeReferralOnOrder）
    earnPoints(CONFIG.referral.invitee, '受邀新用户奖励');
    localStorage.removeItem('tc_pending_inv'); commit();
  }
  function completeReferralOnFirstOrder() {
    // 演示：新人完成首单时，给“推荐人”计一笔（本机模拟，记录到 referral.invitees）
    if (S.user && S.user.invitedBy && !S.user._referralDone) {
      S.user._referralDone = true;
      S.referral.invitees.push({ phone: S.user.phone, status: 'done', ts: nowTs(), reward: CONFIG.referral.inviter });
      commit();
    }
  }
  function referralStats() {
    return { code: inviteCode(), count: S.referral.invitees.length, totalReward: S.referral.invitees.reduce(function (a, x) { return a + (x.reward || 0); }, 0), invitees: S.referral.invitees.slice() };
  }

  // ---------- 站内消息（模拟服务号模板消息）----------
  function notify(type, title, body) {
    S.notifications.unshift({ id: uid('nt'), type: type, title: title, body: body, ts: nowTs(), read: false });
    commit();
  }
  function notifications() { return S.notifications.slice(); }
  function unreadCount() { return S.notifications.filter(function (n) { return !n.read; }).length; }
  function markAllRead() { S.notifications.forEach(function (n) { n.read = true; }); commit(); }

  // ---------- 订单后处理（下单成功调用：发积分、核销券、首单裂变、提醒）----------
  function onOrderPaid(o) {
    // o: {orderNo, total, voucherId?, items:[{day}], pickupName?}
    var earned = Math.round((o.total || 0) * CONFIG.pointsPerDollar);
    if (earned > 0) earnPoints(earned, '订单消费 ' + (o.orderNo || ''));
    if (o.voucherId) redeemVoucher(o.voucherId);
    completeReferralOnFirstOrder();
    notify('order', '下单成功 · 取餐码 ' + (o.code || ''), '订单 ' + (o.orderNo || '') + ' 已支付，记得按时取餐~');
    return { earned: earned };
  }

  // ---------- 订餐模式（后台配置，H5 据此显示可订日）----------
  var ALL_DAYS = ['周一', '周二', '周三', '周四', '周五'];
  var MODE_PRESETS = {
    week: { label: '整周（周一~周五）', days: ['周一', '周二', '周三', '周四', '周五'] },
    mwf: { label: '周一三五', days: ['周一', '周三', '周五'] },
    tt: { label: '周二四', days: ['周二', '周四'] },
    single: { label: '单天可订', days: ['周一', '周二', '周三', '周四', '周五'] }
  };
  function getOrderingMode() {
    if (!S.orderingMode) S.orderingMode = { mode: 'week', days: ALL_DAYS.slice() };
    return S.orderingMode;
  }
  function setOrderingMode(mode, days) {
    if (mode !== 'custom' && MODE_PRESETS[mode]) days = MODE_PRESETS[mode].days.slice();
    S.orderingMode = { mode: mode, days: (days && days.length) ? days : ALL_DAYS.slice() };
    commit();
    notify('system', '订餐模式已更新', '当前可订：' + S.orderingMode.days.join('、'));
    return S.orderingMode;
  }
  function enabledDays() { return getOrderingMode().days.slice(); }

  // 进入页面即捕获邀请码
  captureInviteFromUrl();

  // ---------- 对外 API ----------
  window.Store = {
    CONFIG: CONFIG,
    // 身份
    currentUser: currentUser, login: login, logout: logout,
    // 积分
    pointsBalance: pointsBalance, earnPoints: earnPoints, spendPoints: spendPoints,
    pointsLedger: function () { expireOldPoints(); return S.points.ledger.slice(); }, soonExpire: soonExpire,
    // 券
    allVouchers: allVouchers, availableVouchers: availableVouchers, voucherDiscount: voucherDiscount,
    claimByCode: claimByCode, redeemVoucher: redeemVoucher, importVouchers: importVouchers,
    // 签到
    checkinStatus: checkinStatus, doCheckin: doCheckin,
    // 评论
    addReview: addReview, reviewsOfOrder: reviewsOfOrder, allReviews: allReviews,
    // 裂变
    inviteCode: inviteCode, inviteLink: inviteLink, referralStats: referralStats,
    // 消息
    notify: notify, notifications: notifications, unreadCount: unreadCount, markAllRead: markAllRead,
    // 订单后处理
    onOrderPaid: onOrderPaid,
    // 订餐模式
    getOrderingMode: getOrderingMode, setOrderingMode: setOrderingMode, enabledDays: enabledDays,
    MODE_PRESETS: MODE_PRESETS, ALL_DAYS: ALL_DAYS,
    // 调试：重置演示数据
    _reset: function () { S = blank(); ensureSeed(); commit(); }
  };
})();
