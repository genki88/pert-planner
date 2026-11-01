/* ============================================================
   流程圖佈局與繪製（畫面與列印共用同一套）
   ============================================================ */
const GEO = { NW: 164, NH: 50, GX: 56, GY: 18, PAD: 20 };

function graphLayout(evs) {
  const { NW, NH, GX, GY, PAD } = GEO;
  const layers = layerize(evs);
  const pos = new Map();
  layers.forEach((layer, li) => layer.forEach((e, i) => {
    pos.set(e.id, { x: PAD + li * (NW + GX), y: PAD + i * (NH + GY), layer: li });
  }));
  const maxRows = Math.max(1, ...layers.map(l => l.length));
  return {
    layers, pos,
    W: PAD * 2 + layers.length * (NW + GX) - GX,
    H: PAD * 2 + maxRows * (NH + GY) - GY,
  };
}

/**
 * 產生 SVG。opt.fromLayer / opt.toLayer 可只畫其中幾欄（分頁列印用）。
 * 跨頁進來的相依會畫成左側短箭頭並標出前置事件名稱。
 */
function graphSvgMarkup(evs, lay, opt = {}) {
  const { NW, NH, GX, PAD } = GEO;
  const from = opt.fromLayer || 0;
  const to = opt.toLayer == null ? lay.layers.length : opt.toLayer;
  const sliced = from > 0 || to < lay.layers.length;
  const stub = sliced ? 84 : 0;

  const byId = new Map(evs.map(e => [e.id, e]));
  const inSlice = (id) => {
    const p = lay.pos.get(id);
    return p && p.layer >= from && p.layer < to;
  };
  const mine = evs.filter(e => inSlice(e.id));

  const sliceLeft = PAD + from * (NW + GX);
  const viewX = sliceLeft - PAD - stub;
  const lastRight = PAD + (to - 1) * (NW + GX) + NW;
  const viewW = lastRight + PAD - viewX;
  const viewH = lay.H;

  const parts = [];

  // 連線
  for (const e of mine) {
    const b = lay.pos.get(e.id);
    const outside = [];
    for (const d of e.deps) {
      if (!lay.pos.has(d)) continue;
      if (!inSlice(d)) { outside.push(d); continue; }
      const a = lay.pos.get(d);
      const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2;
      const mid = (x1 + x2) / 2;
      const crit = byId.get(d)?.critical && e.critical;
      parts.push(`<path class="gedge ${crit ? 'is-critical' : ''}" d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}" marker-end="url(#ah)"/>`);
    }
    // 從前面幾頁延續過來的相依
    if (outside.length) {
      const y = b.y + NH / 2;
      const sx = b.x - 46;
      parts.push(`<path class="gedge is-carry" d="M${sx},${y} L${b.x},${y}" marker-end="url(#ah)"/>`);
      const names = outside.map(d => byId.get(d)?.name || '').filter(Boolean);
      const lbl = names.join('、');
      parts.push(`<text class="gt-carry" x="${sx - 4}" y="${y + 3}" text-anchor="end">${esc(lbl.length > 9 ? lbl.slice(0, 9) + '…' : lbl)} ▸</text>`);
    }
  }

  // 節點
  for (const e of mine) {
    const p = lay.pos.get(e.id);
    const nm = e.name || '（未命名）';
    const l1 = nm.length > 13 ? nm.slice(0, 13) : nm;
    const l2 = nm.length > 13 ? (nm.length > 26 ? nm.slice(13, 25) + '…' : nm.slice(13)) : '';
    const meta = `${e.days}天${e.resp ? ' · ' + esc(e.resp.slice(0, 6)) : ''}`
      + ` · ${e.earliestDate ? shortDate(e.earliestDate) : ''}${e.latestDate ? '｜' + shortDate(e.latestDate) : ''}`;
    parts.push(`<g class="gnode ${e.critical ? 'is-critical' : ''} ${e.done ? 'is-done' : ''}" transform="translate(${p.x},${p.y})">
      <rect width="${NW}" height="${NH}" rx="6"></rect>
      <text class="gt-name" x="8" y="16">${esc(l1)}</text>
      ${l2 ? `<text class="gt-name" x="8" y="29">${esc(l2)}</text>` : ''}
      <text class="gt-meta" x="8" y="${NH - 8}">${meta}</text>
      <title>${esc(nm)}\n責任：${esc(e.resp) || '—'}\n時間：${e.days} 天　預算：${money(e.budget)}\n最早：${e.earliestDate || '—'}　最晚：${e.latestDate || '—'}\n彈性：${e.slack} 天</title>
    </g>`);
  }

  const sizeAttr = opt.fluid
    ? `width="100%" height="auto" preserveAspectRatio="xMidYMid meet"`
    : `width="${viewW}" height="${viewH}"`;

  return `<svg ${sizeAttr} viewBox="${viewX} 0 ${viewW} ${viewH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,0 L8,4 L0,8 z" fill="#9AA8BC"></path>
      </marker>
    </defs>
    ${parts.join('')}
  </svg>`;
}

/* ============================================================
   卡片之間的連接線
   純幾何函式（可單獨測試）＋ 依實際版面計算的繪製函式。
   ============================================================ */

/**
 * 算出兩張卡片之間的連接線路徑。
 * a, b = {left, right, top, h}（相對於外框的座標）
 * W = 外框寬度；EXT = 轉折時往外推的距離
 * 同一排 → 直接水平過去；換行／折返 → 走兩排之間的空隙繞過去。
 */
function cardLinkPath(a, b, W, EXT) {
  EXT = EXT || 10;
  const ay = Math.round(a.top + a.h / 2);
  const by = Math.round(b.top + b.h / 2);
  const sameRow = Math.abs(a.top - b.top) < 8;

  if (sameRow && b.left >= a.right) {
    return Math.abs(ay - by) < 3
      ? `M${a.right},${ay} H${b.left}`
      : `M${a.right},${ay} H${Math.round((a.right + b.left) / 2)} V${by} H${b.left}`;
  }

  const down = b.top >= a.top;
  const laneY = down
    ? Math.round((a.top + a.h + b.top) / 2)
    : Math.round((b.top + b.h + a.top) / 2);
  const xr = Math.min(W - 6, a.right + EXT);
  const xl = Math.max(6, b.left - EXT);
  return `M${a.right},${ay} H${xr} V${laneY} H${xl} V${by} H${b.left}`;
}

/** 讀出目前畫面上每張卡片的位置，把連接線畫到卡片底下的 SVG */
function drawCardLinks() {
  const wrap = document.querySelector('.mcards-wrap');
  const svg = wrap && wrap.querySelector('.mlines');
  if (!wrap || !svg || !state.computed) return;

  const base = wrap.getBoundingClientRect();
  const W = Math.round(base.width);
  const H = Math.round(base.height);
  if (!W || !H) return;

  const box = new Map();
  for (const el of wrap.querySelectorAll('.mcard[data-id]')) {
    const r = el.getBoundingClientRect();
    box.set(el.dataset.id, {
      left: Math.round(r.left - base.left),
      right: Math.round(r.right - base.left),
      top: Math.round(r.top - base.top),
      h: Math.round(r.height),
    });
  }

  const byId = new Map(state.computed.events.map(e => [e.id, e]));
  const paths = [];
  for (const e of state.computed.events) {
    const b = box.get(e.id);
    if (!b) continue;
    for (const d of (e.deps || [])) {
      const a = box.get(d);
      if (!a) continue;
      const crit = byId.get(d)?.critical && e.critical;
      paths.push(`<path class="mline ${crit ? 'is-critical' : ''}" d="${cardLinkPath(a, b, W)}" marker-end="url(#mah)"/>`);
    }
  }

  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `<defs>
      <marker id="mah" viewBox="0 0 9 9" refX="8" refY="4.5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0,0 L9,4.5 L0,9 z" fill="#5B6068"></path>
      </marker>
      <marker id="mahc" viewBox="0 0 9 9" refX="8" refY="4.5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0,0 L9,4.5 L0,9 z" fill="#C0362C"></path>
      </marker>
    </defs>${paths.join('')}`;
  // 要徑的箭頭換成紅色
  for (const p of svg.querySelectorAll('.mline.is-critical')) p.setAttribute('marker-end', 'url(#mahc)');
  svg.dataset.count = String(paths.length);
}

/* ---------------- ④ 流程圖 ---------------- */
function paneGraph() {
  const evs = state.computed.events;
  if (!evs.length) return '<section class="card"><div class="sub small muted">沒有里程碑可畫。</div></section>';

  const lay = graphLayout(evs);
  const cols = lay.layers.length;
  const wide = lay.W > 1500;

  return `
  <section class="card">
    <div class="card__head">
      <h2 class="card__title">PERT 流程圖</h2>
      <div class="row small">
        <span class="pill pill--red"><span class="pill__dot"></span>要徑</span>
        <span class="pill pill--green"><span class="pill__dot"></span>已完成</span>
      </div>
    </div>

    <div class="row no-print">
      <button type="button" class="btn btn--primary" data-act="printgraph">🖨 列印這張流程圖</button>
      <select class="select" id="gmode" style="min-width:210px">
        <option value="auto" ${wide ? '' : 'selected'}>縮成一頁（橫向 A4）</option>
        <option value="split" ${wide ? 'selected' : ''}>原尺寸分頁（每頁 4 欄）</option>
      </select>
      <button type="button" class="btn" data-act="svg">下載 SVG（原尺寸向量）</button>
      <button type="button" class="btn" data-act="png">下載 PNG</button>
    </div>

    ${wide ? `<div class="alert alert--warn small no-print">
      這張圖有 ${cols} 欄、寬 ${lay.W}px。縮成一頁的話字會很小，已預設選「原尺寸分頁」——會印成 ${Math.ceil(cols / 4)} 張，接得起來。
      要貼牆的大圖建議「下載 SVG」拿去輸出店印 A1／A2。
    </div>` : ''}

    <div class="small muted">由左到右＝時間順序，同一欄＝可以並行。框內第二行是「天數 · 負責人 · 最早日｜最晚日」。滑過節點看完整資料。</div>
    <div class="graph-wrap">${graphSvgMarkup(evs, lay)}</div>
  </section>`;
}

/* ============================================================
   列印 — 不受目前在哪個頁籤影響
   把要印的內容寫進 #printarea，列印時只顯示它。
   ============================================================ */
function printHeader(subtitle) {
  const p = state.project, t = state.computed.totals;
  const crit = state.computed.events.filter(e => e.critical).map(e => e.name);
  return `
  <div class="pr-head">
    <div class="pr-title">${esc(p.title || '未命名專案')}<span class="pr-kind">${esc(subtitle)}</span></div>
    ${p.goal ? `<div class="pr-goal">目標：${esc(p.goal)}</div>` : ''}
    <div class="pr-meta">
      ${p.startDate ? `起始 ${p.startDate}` : '未設起始日'}
      ${p.dueDate ? `　截止 ${p.dueDate}` : ''}
      　里程碑 ${t.count} 個（已完成 ${t.doneCount}）
      　最快完成 ${t.naturalEndDays} 天${t.naturalEndDate ? `（${t.naturalEndDate}）` : ''}
      　整體彈性 ${t.slackDays} 天
      　預算 ${money(t.budget)}
    </div>
    ${crit.length ? `<div class="pr-crit"><b>要徑（不能延誤）：</b>${esc(crit.join(' → '))}</div>` : ''}
    <div class="pr-legend">
      <span class="pr-lg pr-lg--crit">要徑</span>
      <span class="pr-lg pr-lg--done">已完成</span>
      <span class="pr-lg">框內：事件名稱／天數 · 負責人 · 最早日｜最晚日</span>
      <span class="pr-when">列印於 ${new Date().toLocaleDateString('zh-TW')}</span>
    </div>
  </div>`;
}

function buildPrintGraph(mode) {
  const evs = state.computed.events;
  if (!evs.length) return '<div class="pr-page">沒有里程碑可畫。</div>';
  const lay = graphLayout(evs);
  const COLS = 4;

  if (mode !== 'split' || lay.layers.length <= COLS) {
    return `<div class="pr-page">
      ${printHeader('PERT 流程圖')}
      <div class="pr-graph pr-graph--fit">${graphSvgMarkup(evs, lay, { fluid: true })}</div>
    </div>`;
  }

  const pages = [];
  const total = Math.ceil(lay.layers.length / COLS);
  for (let i = 0; i < total; i++) {
    const from = i * COLS;
    const to = Math.min(lay.layers.length, from + COLS);
    pages.push(`<div class="pr-page">
      ${printHeader(`PERT 流程圖（第 ${i + 1} / ${total} 段）`)}
      ${i > 0 ? '<div class="pr-cont">◂ 左側箭頭上的名稱＝接續前一段的前置事件</div>' : ''}
      <div class="pr-graph pr-graph--fit">${graphSvgMarkup(evs, lay, { fromLayer: from, toLayer: to, fluid: true })}</div>
    </div>`);
  }
  return pages.join('');
}

function buildPrintTable() {
  const evs = state.computed.events;
  const nameOf = (id) => (state.project.events.find(x => x.id === id)?.name) || '';
  return `<div class="pr-page">
    ${printHeader('里程碑表格')}
    <table class="table pr-table">
      <thead><tr>
        <th>#</th><th>里程碑事件</th><th>責任</th><th>區塊</th><th>天數</th><th>預算</th>
        <th>前置事件</th><th>最早日期</th><th>最晚日期</th><th>彈性</th><th>完成</th>
      </tr></thead>
      <tbody>
        ${evs.map((e, i) => `<tr class="${e.critical ? 'is-critical' : ''}">
          <td>${i + 1}</td><td>${esc(e.name)}</td><td>${esc(e.resp)}</td><td>${esc(e.track || '其他')}</td>
          <td class="num">${e.days}</td><td class="num">${e.budget ? money(e.budget) : ''}</td>
          <td class="small">${esc(e.deps.map(nameOf).join('、'))}</td>
          <td class="num">${e.earliestDate || ''}</td><td class="num">${e.latestDate || ''}</td>
          <td class="num">${e.inCycle ? '循環' : e.slack}</td><td>${e.done ? '✓' : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function buildPrintCards(per) {
  const evs = state.computed.events;
  const nameOf = (id) => (state.project.events.find(x => x.id === id)?.name) || '';
  const n = per || 3;
  return `<div class="pr-page pr-cards pr-cards--${n}">
    ${printHeader(n === 1 ? '里程碑卡片（一張一頁，貼牆用）' : `里程碑卡片（一頁 ${n} 張）`)}
    <div class="mcards">
      ${evs.map(e => `<article class="mcard ${e.critical ? 'is-critical' : ''} ${e.done ? 'is-done' : ''}">
        <div class="mcard__name"><span>${esc(e.name || '（未命名）')}</span>${e.critical ? '<span class="tag tag--warn">要徑</span>' : ''}</div>
        <div class="mcard__grid">
          <div class="mcard__cell"><span class="mcard__k">責任</span><span class="mcard__v">${esc(e.resp) || '—'}</span></div>
          <div class="mcard__cell"><span class="mcard__k">時間</span><span class="mcard__v">${e.days} 天</span></div>
          <div class="mcard__cell"><span class="mcard__k">預算</span><span class="mcard__v">${e.budget ? money(e.budget) : '—'}</span></div>
          <div class="mcard__cell"><span class="mcard__k">彈性時間</span><span class="mcard__v">${e.inCycle ? '循環' : e.slack + ' 天'}</span></div>
          <div class="mcard__cell"><span class="mcard__k">最早日期</span><span class="mcard__v mcard__v--calc">${e.earliestDate || '—'}</span></div>
          <div class="mcard__cell"><span class="mcard__k">最晚日期</span><span class="mcard__v mcard__v--calc">${e.latestDate || '—'}</span></div>
          <div class="mcard__cell mcard__cell--full" style="border-bottom:none">
            <span class="mcard__k">前置事件</span>
            <span class="mcard__v small">${e.deps.length ? esc(e.deps.map(nameOf).join('、')) : '（起點，無前置）'}</span>
          </div>
        </div>
      </article>`).join('')}
    </div>
  </div>`;
}

/** kind: graph | table | cards ；opt: 流程圖=auto|split，卡片=每頁張數 */
function doPrint(kind, opt) {
  const pa = document.getElementById('printarea');
  const ps = document.getElementById('printstyle');
  if (!pa || !ps) return;

  const landscape = (kind === 'graph' || kind === 'table');
  ps.textContent = `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 9mm; }`;

  pa.innerHTML = kind === 'graph' ? buildPrintGraph(opt)
    : kind === 'table' ? buildPrintTable()
    : buildPrintCards(Number(opt) || 3);

  document.body.classList.add('is-printing');
  window.__lastPrint = kind;                      // 供測試驗證
  window.__lastPrintOpt = opt;
  const cleanup = () => {
    document.body.classList.remove('is-printing');
    pa.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(cleanup, 1500);                      // 保險：有些瀏覽器不發 afterprint
}

function cardsPerPageSelected() {
  const sel = document.getElementById('cmode');
  return sel ? Number(sel.value) : 3;
}

function graphModeSelected() {
  const sel = document.getElementById('gmode');
  if (sel) return sel.value;
  const lay = state.computed?.events?.length ? graphLayout(state.computed.events) : null;
  return (lay && lay.W > 1500) ? 'split' : 'auto';
}

/** 下載流程圖 SVG（原尺寸向量，可拿去輸出店放大） */
function downloadSvg() {
  const evs = state.computed.events;
  if (!evs.length) return;
  const lay = graphLayout(evs);
  const inner = graphSvgMarkup(evs, lay);
  const css = `
    .gnode rect{fill:#fff;stroke:#1A1D21;stroke-width:1.5}
    .gnode.is-critical rect{stroke:#C0362C;stroke-width:2.5;fill:#FBE3DF}
    .gnode.is-done rect{fill:#E7F1EA;stroke:#2F7A4B}
    .gnode text{font-family:'Noto Sans TC',sans-serif;fill:#1A1D21}
    .gt-name{font-size:11px;font-weight:700}
    .gt-meta{font-size:9px;fill:#5B6068}
    .gedge{stroke:#9AA8BC;stroke-width:1.4;fill:none}
    .gedge.is-critical{stroke:#C0362C;stroke-width:2.2}
    .gt-carry{font-size:8px;fill:#5B6068;font-family:'Noto Sans TC',sans-serif}`;
  const svg = inner.replace('<defs>', `<style>${css}</style><defs>`);
  download(`${state.project.title || 'PERT'}_流程圖.svg`,
    '<?xml version="1.0" encoding="UTF-8"?>\n' + svg, 'image/svg+xml;charset=utf-8');
}

/** 下載 PNG（把 SVG 畫到 canvas，2 倍解析度） */
function downloadPng() {
  const evs = state.computed.events;
  if (!evs.length) return;
  const lay = graphLayout(evs);
  const svgEl = document.querySelector('.graph-wrap svg');
  if (!svgEl || !document.createElement('canvas').getContext) { alert('這個瀏覽器無法轉 PNG，請改用「下載 SVG」。'); return; }
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('width', lay.W);
  clone.setAttribute('height', lay.H);
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = `
    .gnode rect{fill:#fff;stroke:#1A1D21;stroke-width:1.5}
    .gnode.is-critical rect{stroke:#C0362C;stroke-width:2.5;fill:#FBE3DF}
    .gnode.is-done rect{fill:#E7F1EA;stroke:#2F7A4B}
    .gnode text{font-family:'Noto Sans TC',sans-serif;fill:#1A1D21}
    .gt-name{font-size:11px;font-weight:700}
    .gt-meta{font-size:9px;fill:#5B6068}
    .gedge{stroke:#9AA8BC;stroke-width:1.4;fill:none}
    .gedge.is-critical{stroke:#C0362C;stroke-width:2.2}`;
  clone.insertBefore(styleEl, clone.firstChild);
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  const scale = 2;
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = lay.W * scale; c.height = lay.H * scale;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.drawImage(img, 0, 0);
    c.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${state.project.title || 'PERT'}_流程圖.png`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }, 'image/png');
  };
  img.onerror = () => alert('轉 PNG 失敗，請改用「下載 SVG」。');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
}

/* 供 Node 測試使用（瀏覽器不會進這段） */
if (typeof module !== 'undefined') {
  module.exports = { cardLinkPath, graphLayout, GEO };
}
