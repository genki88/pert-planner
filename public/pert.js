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

/** 今天（本地時區）。不能用 toISOString —— 那是 UTC，台灣半夜會算成昨天 */
function todayLocalIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
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

/** 里程碑狀態 */
const STATUS = {
  todo: { key: 'todo', label: '未開始' },
  doing: { key: 'doing', label: '進行中' },
  done: { key: 'done', label: '已完成' },
  blocked: { key: 'blocked', label: '卡住了' },
};
const STATUS_ORDER = ['todo', 'doing', 'done', 'blocked'];

/** 兩個日期之間相差幾天（含頭不含尾） */
function daysBetween(a, b) {
  const x = toDayNum(a), y = toDayNum(b);
  return (x === null || y === null) ? null : y - x;
}

/**
 * 主計算。
 * @param {object} project {startDate, dueDate, events:[...]}
 *   事件: {id, name, resp, assigneeId, assigneeName, days, budget, deps:[id],
 *          status, actualStart, actualEnd}
 * @param {object} opts
 *   useActuals: true = 用實際進度推算（實際日期蓋過計畫，往下游順延）
 *   today: 'YYYY-MM-DD'，還沒開始的事情最早也只能從今天算起
 * @returns {object} {events, totals, cycle, order}
 */
function computePert(project, opts) {
  opts = opts || {};
  const useActuals = !!opts.useActuals;

  const events = (project.events || []).map(e => ({
    ...e,
    days: Number(e.days) || 0,
    budget: Number(e.budget) || 0,
    deps: (e.deps || []).slice(),
    status: e.status || (e.done ? 'done' : 'todo'),
  }));

  const { order, cycle, next, byId } = topoSort(events);
  const start = toDayNum(project.startDate);

  // 把日期換算成「距離專案起始日的天數」
  const off = (iso) => {
    const d = toDayNum(iso);
    return (d === null || start === null) ? null : d - start;
  };
  const todayOff = opts.today ? off(opts.today) : null;

  // 這件事實際花了幾天（已填實際起訖就用實際的，否則用計畫的）
  const durOf = (e) => {
    if (useActuals && e.actualStart && e.actualEnd) {
      const n = daysBetween(e.actualStart, e.actualEnd);
      if (n !== null) return Math.max(1, n + 1);
    }
    return e.days;
  };

  // --- 正向計算：最早開始 es、以及後續可以接手的時間點 ef ---
  const es = new Map(events.map(e => [e.id, 0]));
  const ef = new Map(events.map(e => [e.id, 0]));
  for (const id of order) {
    const e = byId.get(id);
    let base = 0;
    for (const d of e.deps) {
      if (!byId.has(d)) continue;
      base = Math.max(base, ef.get(d));
    }
    let s = base;
    if (useActuals) {
      if (e.actualStart && off(e.actualStart) !== null) {
        s = off(e.actualStart);                       // 已經開工 → 釘在實際日期
      } else if (todayOff !== null && e.status !== 'done') {
        s = Math.max(base, todayOff);                 // 還沒開工的，最早也只能是今天
      }
    }
    es.set(id, s);
    const finish = (useActuals && e.actualEnd && off(e.actualEnd) !== null)
      ? off(e.actualEnd) + 1                          // 已完工 → 隔天就能接手
      : s + durOf(e);
    ef.set(id, finish);
  }

  let naturalEnd = 0;
  for (const e of events) naturalEnd = Math.max(naturalEnd, ef.get(e.id));

  const due = toDayNum(project.dueDate);
  const horizon = (due !== null && start !== null) ? (due - start) : naturalEnd;

  // --- 反向計算：最晚須完成 lf ---
  const lf = new Map(events.map(e => [e.id, horizon]));
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const succ = next.get(id) || [];
    if (succ.length === 0) {
      lf.set(id, horizon);
    } else {
      let v = Infinity;
      for (const s of succ) v = Math.min(v, lf.get(s) - durOf(byId.get(s)));
      lf.set(id, v);
    }
  }

  let minSlack = Infinity;
  for (const e of events) {
    const s = lf.get(e.id) - (es.get(e.id) + durOf(e));
    e.slack = s;
    if (!cycle.includes(e.id)) minSlack = Math.min(minSlack, s);
  }
  if (!isFinite(minSlack)) minSlack = 0;

  for (const e of events) {
    e.esOffset = es.get(e.id);
    e.efOffset = ef.get(e.id);
    e.lfOffset = lf.get(e.id);
    e.durUsed = durOf(e);
    e.earliestDate = start !== null ? fromDayNum(start + e.esOffset) : '';
    e.latestDate = start !== null ? fromDayNum(start + e.lfOffset) : '';
    e.finishDate = start !== null ? fromDayNum(start + e.efOffset - 1) : '';
    e.critical = !cycle.includes(e.id) && e.slack === minSlack;
    e.inCycle = cycle.includes(e.id);
    e.done = e.status === 'done';
    // 該開工卻還沒開工
    e.lateToStart = useActuals && todayOff !== null && !e.actualStart
      && e.status !== 'done' && lf.get(e.id) - durOf(e) < todayOff;
  }

  const totals = {
    count: events.length,
    doneCount: events.filter(e => e.status === 'done').length,
    doingCount: events.filter(e => e.status === 'doing').length,
    blockedCount: events.filter(e => e.status === 'blocked').length,
    budget: events.reduce((a, e) => a + e.budget, 0),
    doneBudget: events.filter(e => e.status === 'done').reduce((a, e) => a + e.budget, 0),
    naturalEndDays: naturalEnd,
    horizonDays: horizon,
    naturalEndDate: start !== null ? fromDayNum(start + naturalEnd - 1) : '',
    slackDays: horizon - naturalEnd,
    minSlack,
    overdue: horizon < naturalEnd,
    donePct: events.length ? Math.round(events.filter(e => e.status === 'done').length / events.length * 100) : 0,
  };

  events.sort((a, b) => (a.esOffset - b.esOffset) || String(a.name).localeCompare(String(b.name)));

  return { events, totals, cycle, order };
}

/**
 * 同時算「計畫」與「實際」，並標出每件事落後幾天。
 * plan = 完全照計畫（忽略實際進度）
 * live = 把實際進度算進去（延誤會往下游傳）
 */
function computeBoth(project, today) {
  const plan = computePert(project, { useActuals: false });
  const live = computePert(project, { useActuals: true, today });
  const planById = new Map(plan.events.map(e => [e.id, e]));

  for (const e of live.events) {
    const p = planById.get(e.id);
    e.planStart = p ? p.earliestDate : '';
    e.planFinish = p ? p.finishDate : '';
    e.driftStart = p ? e.esOffset - p.esOffset : 0;
    e.driftFinish = p ? e.efOffset - p.efOffset : 0;
  }
  live.totals.driftDays = live.totals.naturalEndDays - plan.totals.naturalEndDays;
  live.totals.planEndDate = plan.totals.naturalEndDate;
  return { plan, live };
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
  module.exports = {
    computePert, computeBoth, criticalPath, layerize,
    toDayNum, fromDayNum, shortDate, topoSort, daysBetween, todayLocalIso,
    STATUS, STATUS_ORDER,
  };
}
