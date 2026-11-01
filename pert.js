/* ============================================================
   PERT 計算引擎 (BSTA-PERT)
   依據 Blair Singer《PERT》手冊 步驟 4-5 的算法：
     EARLIEST DATE = 最早可開始日 = 專案起始日 + 所有前置事件工期總和(取最大路徑)
     LATEST DATE   = 最晚須完成日 = 截止日往回推
     SLACK         = 鬆弛時間 / 彈性時間
   純函式，無副作用，可單獨測試。
   ============================================================ */

/** 以「天」為單位把日期字串(YYYY-MM-DD)轉成數字 */
function toDayNum(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** 天數轉回 YYYY-MM-DD */
function fromDayNum(n) {
  if (n === null || n === undefined || !isFinite(n)) return '';
  const dt = new Date(n * 86400000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 顯示用短日期 8-6 */
function shortDate(iso) {
  if (!iso) return '';
  const p = iso.split('-');
  return `${Number(p[1])}-${Number(p[2])}`;
}

/**
 * 拓樸排序。回傳 {order:[id...], cycle:[id...]}
 * cycle 非空代表有循環相依（A 依賴 B、B 又依賴 A），必須提示使用者。
 */
function topoSort(events) {
  const byId = new Map(events.map(e => [e.id, e]));
  const indeg = new Map(events.map(e => [e.id, 0]));
  const next = new Map(events.map(e => [e.id, []]));

  for (const e of events) {
    for (const d of (e.deps || [])) {
      if (!byId.has(d)) continue;              // 指向不存在的事件 → 忽略
      indeg.set(e.id, indeg.get(e.id) + 1);
      next.get(d).push(e.id);
    }
  }
  const q = events.filter(e => indeg.get(e.id) === 0).map(e => e.id);
  const order = [];
  while (q.length) {
    const id = q.shift();
    order.push(id);
    for (const n of next.get(id)) {
      indeg.set(n, indeg.get(n) - 1);
      if (indeg.get(n) === 0) q.push(n);
    }
  }
  const cycle = events.filter(e => !order.includes(e.id)).map(e => e.id);
  return { order, cycle, next, byId };
}

/**
 * 主計算。
 * @param {object} project {startDate:'YYYY-MM-DD', dueDate:'YYYY-MM-DD'|null, events:[...]}
 * 事件: {id, name, resp, days, budget, deps:[id], done:bool}
 * @returns {object} {events:[...含計算結果], totals:{...}, cycle:[], minSlack}
 */
function computePert(project) {
  const events = (project.events || []).map(e => ({
    ...e,
    days: Number(e.days) || 0,
    budget: Number(e.budget) || 0,
    deps: (e.deps || []).slice(),
  }));

  const { order, cycle, next, byId } = topoSort(events);
  const start = toDayNum(project.startDate);

  // --- 正向計算：最早開始 (es)，以「距離起始日的天數」為單位 ---
  const es = new Map(events.map(e => [e.id, 0]));
  for (const id of order) {
    const e = byId.get(id);
    let v = 0;
    for (const d of e.deps) {
      const p = byId.get(d);
      if (!p) continue;
      v = Math.max(v, es.get(d) + p.days);
    }
    es.set(id, v);
  }

  // 專案自然完成時間 = 所有事件 (es + days) 的最大值
  let naturalEnd = 0;
  for (const e of events) naturalEnd = Math.max(naturalEnd, es.get(e.id) + e.days);

  // 截止日（若有設定）換算成天數位移；沒設定就用自然完成時間
  const due = toDayNum(project.dueDate);
  const horizon = (due !== null && start !== null) ? (due - start) : naturalEnd;

  // --- 反向計算：最晚須完成 (lf) ---
  const lf = new Map(events.map(e => [e.id, horizon]));
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const succ = next.get(id) || [];
    if (succ.length === 0) {
      lf.set(id, horizon);
    } else {
      let v = Infinity;
      for (const s of succ) {
        const se = byId.get(s);
        v = Math.min(v, lf.get(s) - se.days);
      }
      lf.set(id, v);
    }
  }

  // --- 鬆弛時間 ---
  let minSlack = Infinity;
  for (const e of events) {
    const s = lf.get(e.id) - (es.get(e.id) + e.days);
    e.slack = s;
    if (!cycle.includes(e.id)) minSlack = Math.min(minSlack, s);
  }
  if (!isFinite(minSlack)) minSlack = 0;

  for (const e of events) {
    e.esOffset = es.get(e.id);
    e.lfOffset = lf.get(e.id);
    e.earliestDate = start !== null ? fromDayNum(start + e.esOffset) : '';
    e.latestDate = start !== null ? fromDayNum(start + e.lfOffset) : '';
    e.critical = !cycle.includes(e.id) && e.slack === minSlack;
    e.inCycle = cycle.includes(e.id);
  }

  const totals = {
    count: events.length,
    doneCount: events.filter(e => e.done).length,
    budget: events.reduce((a, e) => a + e.budget, 0),
    doneBudget: events.filter(e => e.done).reduce((a, e) => a + e.budget, 0),
    naturalEndDays: naturalEnd,
    horizonDays: horizon,
    naturalEndDate: start !== null ? fromDayNum(start + naturalEnd) : '',
    slackDays: horizon - naturalEnd,
    minSlack,
    overdue: horizon < naturalEnd,       // 截止日比自然完成時間早 → 排不下
  };

  // 依最早日期排序方便閱讀
  events.sort((a, b) => (a.esOffset - b.esOffset) || a.name.localeCompare(b.name));

  return { events, totals, cycle, order };
}

/** 取得要徑（鬆弛時間最小的那一串） */
function criticalPath(computed) {
  return computed.events.filter(e => e.critical).map(e => e.id);
}

/** 把事件分層（同一層 = 可並行），用於畫圖 */
function layerize(events) {
  const byId = new Map(events.map(e => [e.id, e]));
  const depth = new Map();
  function d(id, seen = new Set()) {
    if (depth.has(id)) return depth.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const e = byId.get(id);
    let v = 0;
    for (const p of (e.deps || [])) {
      if (!byId.has(p)) continue;
      v = Math.max(v, d(p, seen) + 1);
    }
    depth.set(id, v);
    return v;
  }
  for (const e of events) d(e.id);
  const layers = [];
  for (const e of events) {
    const k = depth.get(e.id) || 0;
    (layers[k] = layers[k] || []).push(e);
  }
  return layers;
}

if (typeof module !== 'undefined') {
  module.exports = { computePert, criticalPath, layerize, toDayNum, fromDayNum, shortDate, topoSort };
}
