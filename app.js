/* ============================================================
   PERT 專案流程 — 介面
   依據 Blair Singer《PERT》手冊的五個步驟設計輸入流程：
     1 倒推建立里程碑事件 → 2 時間排序 → 3 建立相依 → 4 填時間/預算 → 5 自動算最早最晚
   ============================================================ */

/* ---------------- 小工具 ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const money = (n) => Number(n || 0).toLocaleString('zh-TW');
const todayIso = () => new Date().toISOString().slice(0, 10);

function addDays(iso, n) {
  const d = toDayNum(iso);
  return d === null ? '' : fromDayNum(d + n);
}

/* ---------------- 狀態 ---------------- */
const state = {
  view: 'home',       // home | project
  tab: 'quick',       // quick | table | cards | graph | export
  me: null,
  projects: [],
  project: null,
  computed: null,
  quickMode: 'back',  // back = 倒推, fwd = 順推
  quickAnchor: null,  // 倒推時目前問到哪一個事件
  modal: null,
  filterTrack: '',
  showLinks: true,     // 卡片檢視是否畫相依連接線
  toast: '',
};

function recompute() {
  state.computed = state.project ? computePert(state.project) : null;
}

async function reloadProjects() {
  state.projects = await Store.listProjects();
}

async function persist() {
  if (!state.project) return;
  await Store.saveProject(state.project);
  await reloadProjects();
}

function flash(msg) {
  state.toast = msg;
  setTimeout(() => { if (state.toast === msg) { state.toast = ''; render(); } }, 2600);
}

/* ============================================================
   頂部
   ============================================================ */
function renderNav() {
  const items = [
    { k: 'home', label: '我的專案' },
  ];
  $('#nav').innerHTML = items.map(i =>
    `<a class="topnav__link ${state.view === i.k ? 'is-active' : ''}" href="#" data-act="go" data-view="${i.k}">${i.label}</a>`
  ).join('');

  const name = state.me?.name || '';
  $('#user').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:flex-end;line-height:1.3">
      <span class="topnav__user-name">${esc(name || '（未填姓名）')}</span>
      <span class="topnav__user-role">測試版 · 資料存在這台瀏覽器</span>
    </div>
    <button type="button" class="btn btn--nav btn--sm" data-act="setname">改姓名</button>`;
}

/* ============================================================
   首頁 — 專案清單
   ============================================================ */
function viewHome() {
  const ps = state.projects;
  return `
  <main class="page">
    <h1 class="page__title">PERT 專案流程</h1>
    <p class="page__desc">
      把目標倒推成一連串「已經完成」的里程碑事件，系統自動算出每件事的最早可開始日、最晚須完成日與彈性時間。
    </p>

    <section class="card">
      <div class="card__head">
        <h2 class="card__title">新增專案</h2>
      </div>
      <div class="plist">
        ${HOME_ORDER.map(k => TEMPLATES.find(t => t.key === k)).filter(Boolean).map(t => `
          <button type="button" class="pcard pcard--${t.tone || 'normal'}" data-act="newfrom" data-key="${t.key}">
            ${t.hint ? `<span class="pcard__hint">${esc(t.hint)}</span>` : ''}
            <h3 class="pcard__title">${esc(t.title)}</h3>
            <div class="small muted">${esc(t.desc)}</div>
            <div class="tags">
              ${t.events.length
                ? `<span class="tag">內含 ${t.events.length} 個里程碑</span>`
                : '<span class="tag">從零開始，什麼都還沒有</span>'}
            </div>
          </button>`).join('')}
      </div>
    </section>

    <section class="card">
      <div class="card__head">
        <h2 class="card__title">我的專案</h2>
        <span class="small muted">共 ${ps.length} 個</span>
      </div>
      ${ps.length === 0
        ? `<div class="sub small muted">還沒有專案。上面選一個範本，或用「空白專案」從你自己的目標開始倒推。</div>`
        : `<div class="plist">${ps.map(p => {
            const c = computePert(p);
            const pct = c.totals.count ? Math.round(c.totals.doneCount / c.totals.count * 100) : 0;
            return `
            <button type="button" class="pcard" data-act="open" data-id="${p.id}">
              <h3 class="pcard__title">${esc(p.title || '（未命名專案）')}</h3>
              <div class="small muted">${esc(p.goal || '未填目標')}</div>
              <hr class="sep">
              <div class="row small wrap-tight">
                <span class="badge">${c.totals.count}</span><span class="muted">里程碑</span>
                <span class="right ${pct === 100 ? 'pill pill--green' : 'muted'}">${pct}% 完成</span>
              </div>
              <div class="small muted">${p.startDate ? `${p.startDate} → ${p.dueDate || '未定'}` : '未設日期'}</div>
              <div class="tags">
                <span class="tag">${p.visibility === 'public' ? '公開' : '私人'}</span>
                ${c.totals.overdue ? '<span class="tag tag--warn">排不下</span>' : ''}
                ${c.cycle.length ? '<span class="tag tag--warn">相依循環</span>' : ''}
              </div>
            </button>`;
          }).join('')}</div>`}
    </section>

    <section class="card">
      <h2 class="card__title">這是什麼</h2>
      <div class="sub small">
        <div><b>PERT</b>＝計劃評核術。核心是把一個目標拆成一串「里程碑事件」，每個事件都用<b>過去式</b>寫成「已經發生」的狀態，而不是待辦事項。</div>
        <div>每個里程碑記六件事：<b>事件</b>、<b>責任（誰）</b>、<b>時間（幾天）</b>、<b>預算</b>、<b>最早日期</b>、<b>最晚日期</b>。前四個你填，後兩個系統算。</div>
        <div>最晚減最早 = <b>彈性時間（鬆弛）</b>。彈性為零的那一串就是<b>要徑</b>——那條線一延誤，整個專案就延誤。</div>
      </div>
    </section>
  </main>`;
}

/* ============================================================
   專案頁
   ============================================================ */
function projectHeader() {
  const p = state.project, t = state.computed.totals;
  return `
  <section class="card">
    <div class="card__head">
      <div class="field grow">
        <span class="label">專案名稱</span>
        <input class="input" data-field="title" value="${esc(p.title)}" placeholder="例如：2027 新品上市">
      </div>
      <button type="button" class="btn btn--sm no-print" data-act="go" data-view="home">← 回清單</button>
    </div>

    <div class="field">
      <span class="label">最終目標（用過去式寫，像是已經發生了）</span>
      <input class="input" data-field="goal" value="${esc(p.goal)}" placeholder="例如：新品已經上市並達成首月業績目標">
    </div>

    <div class="row">
      <div class="field">
        <span class="label">專案起始日</span>
        <input class="input" type="date" data-field="startDate" value="${esc(p.startDate)}">
      </div>
      <div class="field">
        <span class="label">截止日（目標完成日）</span>
        <input class="input" type="date" data-field="dueDate" value="${esc(p.dueDate)}">
      </div>
      <div class="field">
        <span class="label">誰可以看</span>
        <select class="select" data-field="visibility">
          <option value="private" ${p.visibility === 'private' ? 'selected' : ''}>私人（只有我）</option>
          <option value="public" ${p.visibility === 'public' ? 'selected' : ''}>公開（同事可讀）</option>
        </select>
      </div>
      <div class="right no-print">
        <button type="button" class="btn btn--sm" data-act="delproject">刪除專案</button>
      </div>
    </div>

    ${!p.startDate ? `<div class="alert alert--warn small">尚未設定<b>專案起始日</b>，所以還算不出最早／最晚日期。填了起始日就會自動算出來。</div>` : ''}
    ${t.overdue ? `<div class="alert alert--error small">
        <b>排不下。</b>所有里程碑的時間加起來最快要 ${t.naturalEndDays} 天（做到 ${t.naturalEndDate}），比截止日還晚 ${t.naturalEndDays - t.horizonDays} 天。
        要嘛延後截止日、要嘛縮短要徑上的工期、要嘛把序列改成並行。
      </div>` : ''}
    ${state.computed.cycle.length ? `<div class="alert alert--error small">
        <b>相依循環。</b>有 ${state.computed.cycle.length} 個事件互相指定對方為前置，形成死結，無法排程。請到「里程碑表格」修正前置事件。
      </div>` : ''}

    <div class="kpis">
      <div class="kpi"><span class="kpi__k">里程碑事件</span><span class="kpi__v">${t.count}</span><span class="kpi__sub">已完成 ${t.doneCount}</span></div>
      <div class="kpi"><span class="kpi__k">最快完成需要</span><span class="kpi__v">${t.naturalEndDays}</span><span class="kpi__sub">天${t.naturalEndDate ? `（${t.naturalEndDate}）` : ''}</span></div>
      <div class="kpi"><span class="kpi__k">整體彈性時間</span><span class="kpi__v ${t.slackDays < 0 ? 'kpi__v--warn' : ''}">${t.slackDays}</span><span class="kpi__sub">天（截止日 − 最快完成）</span></div>
      <div class="kpi"><span class="kpi__k">預算合計</span><span class="kpi__v">${money(t.budget)}</span><span class="kpi__sub">已投入 ${money(t.doneBudget)}</span></div>
      <div class="kpi"><span class="kpi__k">要徑上的事件</span><span class="kpi__v">${state.computed.events.filter(e => e.critical).length}</span><span class="kpi__sub">延誤就會拖累全案</span></div>
    </div>
  </section>`;
}

const TABS = [
  { k: 'quick', label: '① 快速建立' },
  { k: 'table', label: '② 里程碑表格' },
  { k: 'cards', label: '③ 卡片檢視' },
  { k: 'graph', label: '④ 流程圖' },
  { k: 'export', label: '⑤ 匯出／列印' },
];

function viewProject() {
  return `
  <main class="page">
    ${projectHeader()}
    <div class="tabs no-print">
      ${TABS.map(t => `<button type="button" class="tab ${state.tab === t.k ? 'is-on' : ''}" data-act="tab" data-tab="${t.k}">${t.label}</button>`).join('')}
    </div>
    ${state.tab === 'quick' ? paneQuick()
      : state.tab === 'table' ? paneTable()
      : state.tab === 'cards' ? paneCards()
      : state.tab === 'graph' ? paneGraph()
      : paneExport()}
  </main>`;
}

/* ---------------- ① 快速建立 ---------------- */
function paneQuick() {
  const p = state.project;
  const evs = state.computed.events;
  const anchor = p.events.find(e => e.id === state.quickAnchor) || null;
  const back = state.quickMode === 'back';

  const question = back
    ? (anchor
        ? `在「${anchor.name}」發生之前，必須先完成什麼？`
        : (p.goal ? `在「${p.goal}」發生之前，必須先完成什麼？` : '你的最終目標是什麼？先在上面填「最終目標」。'))
    : (anchor ? `「${anchor.name}」完成之後，接下來發生什麼？` : '第一件該完成的事是什麼？');

  // 倒推鏈顯示（依最早日期排序即為時間順序）
  const chain = evs.slice(0, 40);

  return `
  <div class="cols cols--wide">
    <div class="stack">
      <div class="quick">
        <h2 class="quick__q">${esc(question)}</h2>
        <div class="chips">
          <button type="button" class="chip ${back ? 'is-on' : ''}" data-act="qmode" data-mode="back">倒推（從目標往回問）</button>
          <button type="button" class="chip ${!back ? 'is-on' : ''}" data-act="qmode" data-mode="fwd">順推（從頭往後排）</button>
        </div>
        <input class="input" id="qinput" placeholder="用過去式寫，例如：設計圖已完成　（打完按 Enter 繼續下一個）" autocomplete="off">
        <div class="row small muted">
          <span>按 <b>Enter</b> 新增並自動串接相依關係</span>
          <button type="button" class="btn btn--sm right" data-act="qadd">新增</button>
        </div>
        ${anchor ? `<div class="row small">
            <span class="tag">接在：${esc(anchor.name)}</span>
            <button type="button" class="btn btn--sm" data-act="qanchor" data-id="">改成不接任何事件（開新的並行線）</button>
          </div>` : `<div class="small muted">目前沒有接點 — 新增的會是一條新的起點。</div>`}
      </div>

      <div class="card">
        <h2 class="card__title">批次貼上</h2>
        <div class="small muted">一行一個里程碑事件。可直接從紙本或 Excel 貼過來；系統會依照行的順序自動串成一條線。</div>
        <textarea class="input" id="qbulk" rows="6" style="min-height:120px;padding:8px 12px;line-height:1.6"
          placeholder="設計和計劃鳥舍&#10;分配做鳥舍的材料及工具&#10;組裝好鳥舍&#10;安裝鳥舍"></textarea>
        <div class="row">
          <label class="row small"><input type="checkbox" id="qbulkchain" checked> 依行順序自動串接相依</label>
          <button type="button" class="btn btn--primary right" data-act="qbulk">加入這些里程碑</button>
        </div>
      </div>

      <div class="card">
        <h2 class="card__title">怎麼寫才對</h2>
        <div class="sub small">
          <div>✅ <b>「設計圖已完成」</b>　← 過去式、是一個狀態</div>
          <div>❌ 「畫設計圖」　← 這是待辦事項，不是里程碑</div>
          <div class="muted">理由：里程碑要能被明確判定「到了沒有」。寫成動作就沒有終點。</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card__head">
        <h2 class="card__title">目前的流程（依時間排序）</h2>
        <span class="small muted">${evs.length} 個</span>
      </div>
      ${evs.length === 0
        ? '<div class="sub small muted">還沒有里程碑。在左邊輸入第一個。</div>'
        : `<div class="quick__chain">
            ${chain.map((e, i) => `
              <div class="quick__step">
                <span class="quick__num">${i + 1}</span>
                <span class="grow">${esc(e.name)}${e.critical ? ' <span class="tag tag--warn">要徑</span>' : ''}</span>
                <span class="small muted num">${e.days}天</span>
                <button type="button" class="btn btn--sm" data-act="qanchor" data-id="${e.id}" title="接在這個事件前後">接這裡</button>
                <button type="button" class="btn btn--sm" data-act="delevent" data-id="${e.id}">刪</button>
              </div>`).join('')}
            ${evs.length > 40 ? `<div class="small muted">…另有 ${evs.length - 40} 個，請到「里程碑表格」檢視</div>` : ''}
          </div>
          <div class="small muted">下一步：到「② 里程碑表格」填上每件事的負責人、天數與預算。</div>`}
    </div>
  </div>`;
}

/* ---------------- ② 里程碑表格 ---------------- */
function paneTable() {
  const evs = state.computed.events;
  const tracks = [...new Set(state.project.events.map(e => e.track || '其他'))];
  const shown = state.filterTrack ? evs.filter(e => (e.track || '其他') === state.filterTrack) : evs;
  const nameOf = (id) => (state.project.events.find(x => x.id === id)?.name) || '?';

  return `
  <section class="card">
    <div class="card__head">
      <h2 class="card__title">里程碑表格</h2>
      <div class="row no-print">
        <button type="button" class="btn btn--sm btn--primary" data-act="addrow">＋ 新增一列</button>
        <button type="button" class="btn btn--sm" data-act="printtable">🖨 列印表格</button>
      </div>
    </div>

    ${tracks.length > 1 ? `<div class="chips no-print">
      <button type="button" class="chip ${!state.filterTrack ? 'is-on' : ''}" data-act="track" data-t="">全部（${evs.length}）</button>
      ${tracks.map(t => `<button type="button" class="chip ${state.filterTrack === t ? 'is-on' : ''}" data-act="track" data-t="${esc(t)}">${esc(t)}（${evs.filter(e => (e.track || '其他') === t).length}）</button>`).join('')}
    </div>` : ''}

    <div class="small muted">
      灰色欄位是你填的；<span style="color:var(--c-accent);font-weight:700">藍色欄位</span>是系統依相依關係自動算的。
      紅底列＝要徑（彈性最小，不能延誤）。
    </div>

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th style="width:36px" title="已完成">✓</th>
            <th>里程碑事件（過去式）</th>
            <th class="col-mid">責任（誰）</th>
            <th class="col-track">區塊</th>
            <th class="col-narrow">時間(天)</th>
            <th class="col-budget">預算</th>
            <th>前置事件</th>
            <th class="col-narrow">最早日期</th>
            <th class="col-narrow">最晚日期</th>
            <th class="col-narrow">彈性(天)</th>
            <th class="no-print" style="width:44px"></th>
          </tr>
        </thead>
        <tbody>
          ${shown.map(e => `
          <tr class="${e.critical ? 'is-critical' : ''} ${e.done ? 'is-done' : ''}">
            <td><input type="checkbox" data-ev="${e.id}" data-k="done" ${e.done ? 'checked' : ''}></td>
            <td><input class="cell" data-ev="${e.id}" data-k="name" value="${esc(e.name)}" placeholder="例如：設計圖已完成"></td>
            <td><input class="cell" data-ev="${e.id}" data-k="resp" value="${esc(e.resp)}" placeholder="姓名／部門"></td>
            <td>
              <select class="cell" data-ev="${e.id}" data-k="track">
                ${TRACKS.map(t => `<option value="${t}" ${(e.track || '其他') === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </td>
            <td><input class="cell cell--num" type="number" min="0" data-ev="${e.id}" data-k="days" value="${e.days}"></td>
            <td><input class="cell cell--num" type="number" min="0" step="100" data-ev="${e.id}" data-k="budget" value="${e.budget}"></td>
            <td>
              <button type="button" class="btn btn--sm" data-act="deps" data-id="${e.id}" style="max-width:100%;overflow:hidden">
                ${e.deps.length ? esc(e.deps.map(nameOf).join('、')).slice(0, 60) : '＋ 設定前置'}
              </button>
            </td>
            <td class="calc">${e.earliestDate ? shortDate(e.earliestDate) : '—'}</td>
            <td class="calc">${e.latestDate ? shortDate(e.latestDate) : '—'}</td>
            <td class="calc">${e.inCycle ? '循環' : e.slack}</td>
            <td class="no-print"><button type="button" class="btn btn--sm" data-act="delevent" data-id="${e.id}">✕</button></td>
          </tr>`).join('')}
          ${shown.length === 0 ? '<tr><td colspan="11" class="muted">沒有資料。回「① 快速建立」新增里程碑。</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  </section>`;
}

/* ---------------- ③ 卡片檢視 ---------------- */
function paneCards() {
  const evs = state.computed.events;
  const nameOf = (id) => (state.project.events.find(x => x.id === id)?.name) || '?';
  return `
  <section class="card">
    <div class="card__head">
      <h2 class="card__title">里程碑卡片</h2>
      <div class="row small">
        <span class="pill pill--red"><span class="pill__dot"></span>要徑</span>
        <span class="pill pill--green"><span class="pill__dot"></span>已完成</span>
      </div>
    </div>
    <div class="row no-print">
      <button type="button" class="btn btn--primary" data-act="printcards">🖨 列印卡片</button>
      <select class="select" id="cmode" style="min-width:230px">
        <option value="3">一頁 3 張（存檔／發給大家）</option>
        <option value="2">一頁 2 張（開會討論）</option>
        <option value="1">一張一頁 · 放到最大（貼牆用）</option>
      </select>
      <button type="button" class="chip ${state.showLinks ? 'is-on' : ''}" data-act="togglelinks">
        ${state.showLinks ? '✓ 顯示連接線' : '顯示連接線'}
      </button>
      <span class="small muted">共 ${evs.length} 張</span>
    </div>
    <div class="small muted">
      這就是手冊上那張六欄位卡片。箭頭是相依關係——箭頭指過去，代表<b>要先完成前一張，後一張才能開始</b>；
      紅色箭頭是要徑。要貼牆追進度就選「一張一頁」，印出來一張 A4 一個里程碑。
    </div>
  </section>
  <div class="mcards-wrap">
    <svg class="mlines" width="0" height="0" aria-hidden="true"></svg>
    <div class="mcards">
    ${evs.map(e => `
      <article class="mcard ${e.critical ? 'is-critical' : ''} ${e.done ? 'is-done' : ''}" data-id="${e.id}">
        <div class="mcard__name">
          <span>${esc(e.name || '（未命名）')}${e.en ? `<span class="mcard__en">${esc(e.en)}</span>` : ''}</span>
          ${e.critical ? '<span class="tag tag--warn">要徑</span>' : ''}
        </div>
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
        <div class="mcard__foot">
          <span class="tag">${esc(e.track || '其他')}</span>
          ${e.done ? '<span class="pill pill--green"><span class="pill__dot"></span>已完成</span>' : ''}
        </div>
      </article>`).join('')}
    </div>
  </div>
  ${evs.length === 0 ? '<section class="card"><div class="sub small muted">沒有里程碑。</div></section>' : ''}`;
}

/* ---------------- ⑤ 匯出 ---------------- */
function paneExport() {
  const t = state.computed.totals;
  return `
  <section class="card">
    <h2 class="card__title">列印 / 存成 PDF</h2>
    <div class="small muted">印什麼不受你現在在哪個頁籤影響，按哪個就印哪個。</div>
    <div class="row">
      <button type="button" class="btn btn--primary" data-act="printgraph">🖨 PERT 流程圖</button>
      <button type="button" class="btn" data-act="printtable">🖨 里程碑表格</button>
      <button type="button" class="btn" data-act="printcards">🖨 里程碑卡片</button>
      <select class="select" id="cmode" style="min-width:200px">
        <option value="3">卡片：一頁 3 張</option>
        <option value="2">卡片：一頁 2 張</option>
        <option value="1">卡片：一張一頁（貼牆）</option>
      </select>
    </div>
    <div class="small muted">
      流程圖與表格會自動用<b>橫向 A4</b>；卡片用直向。每一頁都會帶上專案名稱、目標、日期與要徑，單獨拿去開會也看得懂。
      流程圖太寬時會自動分段印、左側標出接續的前置事件。
    </div>
    <hr class="sep">
    <h2 class="card__title">下載檔案</h2>
    <div class="row">
      <button type="button" class="btn btn--primary" data-act="csv">CSV（Excel 可直接開）</button>
      <button type="button" class="btn" data-act="svg">流程圖 SVG（向量，可放大印 A1）</button>
      <button type="button" class="btn" data-act="png">流程圖 PNG</button>
      <button type="button" class="btn" data-act="json">JSON（備份／轉移）</button>
    </div>
    <div class="small muted">CSV 已加上 BOM，Excel 開繁體中文不會變亂碼。要貼牆的大圖用 SVG 拿去輸出店最清楚。</div>
    <hr class="sep">
    <h2 class="card__title">匯入</h2>
    <div class="row">
      <input class="input" type="file" id="jsonfile" accept=".json">
      <button type="button" class="btn" data-act="importjson">從 JSON 匯入成新專案</button>
    </div>
    <hr class="sep">
    <div class="sub small">
      <div><b>目前進度</b></div>
      <div>里程碑 ${t.count} 個，已完成 ${t.doneCount} 個。預算合計 ${money(t.budget)}，已投入 ${money(t.doneBudget)}。</div>
      <div>最快完成需 ${t.naturalEndDays} 天${t.naturalEndDate ? `（${t.naturalEndDate}）` : ''}，整體彈性 ${t.slackDays} 天。</div>
    </div>
  </section>`;
}

/* ============================================================
   相依選擇 modal
   ============================================================ */
function renderModal() {
  if (!state.modal) return '';
  if (state.modal.type === 'deps') {
    const e = state.project.events.find(x => x.id === state.modal.id);
    if (!e) return '';
    const q = (state.modal.q || '').trim();
    const others = state.computed.events.filter(x => x.id !== e.id)
      .filter(x => !q || x.name.includes(q));
    return `
    <div style="position:fixed;inset:0;background:rgba(26,38,56,.55);display:flex;align-items:center;justify-content:center;padding:20px;z-index:50">
      <div class="card" style="max-width:640px;width:100%;max-height:85vh;overflow:auto">
        <div class="card__head">
          <h2 class="card__title">「${esc(e.name)}」的前置事件</h2>
          <button type="button" class="btn btn--sm" data-act="closemodal">關閉</button>
        </div>
        <div class="small muted">勾選「必須先完成」的事件。系統會據此重算最早／最晚日期。</div>
        <input class="input" id="depq" placeholder="搜尋事件名稱" value="${esc(q)}">
        <div class="deps" style="flex-direction:column;align-items:stretch;gap:2px">
          ${others.map(o => `
            <label class="quick__step" style="cursor:pointer">
              <input type="checkbox" data-act="deptoggle" data-id="${e.id}" data-dep="${o.id}" ${e.deps.includes(o.id) ? 'checked' : ''}>
              <span class="grow">${esc(o.name)}</span>
              <span class="small muted num">${o.days}天</span>
            </label>`).join('')}
          ${others.length === 0 ? '<div class="small muted">沒有符合的事件。</div>' : ''}
        </div>
      </div>
    </div>`;
  }
  return '';
}

/* ============================================================
   render
   ============================================================ */
function render() {
  renderNav();
  const body = state.view === 'project' && state.project ? viewProject() : viewHome();
  const toast = state.toast
    ? `<div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:60" class="alert alert--ok small">${esc(state.toast)}</div>`
    : '';
  $('#root').innerHTML = body + renderModal() + toast;

  // 卡片檢視：等版面排好後，依實際位置畫連接線
  if (state.view === 'project' && state.tab === 'cards' && state.showLinks) {
    const run = () => { try { drawCardLinks(); } catch (_) {} };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
  }
}

/* 視窗寬度改變 → 卡片重排 → 連接線要重畫 */
let __relinkTimer = null;
window.addEventListener('resize', () => {
  if (state.view !== 'project' || state.tab !== 'cards' || !state.showLinks) return;
  clearTimeout(__relinkTimer);
  __relinkTimer = setTimeout(() => { try { drawCardLinks(); } catch (_) {} }, 120);
});

/* ============================================================
   事件處理
   ============================================================ */
async function openProject(id) {
  state.project = await Store.getProject(id);
  state.view = 'project';
  state.tab = 'quick';
  state.quickAnchor = null;
  state.filterTrack = '';
  recompute();
  render();
}

function lastEventId() {
  const evs = state.computed?.events || [];
  return evs.length ? evs[evs.length - 1].id : null;
}

async function quickAdd(name) {
  name = (name || '').trim();
  if (!name) return;
  const p = state.project;
  const anchor = state.quickAnchor;
  const ev = Store.newEvent({ name, days: 1 });

  if (anchor) {
    if (state.quickMode === 'back') {
      // 倒推：新事件成為 anchor 的前置
      const a = p.events.find(x => x.id === anchor);
      if (a && !a.deps.includes(ev.id)) a.deps.push(ev.id);
      p.events.push(ev);
      state.quickAnchor = ev.id;              // 繼續往前問
    } else {
      // 順推：anchor 成為新事件的前置
      ev.deps = [anchor];
      p.events.push(ev);
      state.quickAnchor = ev.id;
    }
  } else {
    p.events.push(ev);
    state.quickAnchor = ev.id;
  }
  recompute();
  await persist();
  render();
  const inp = $('#qinput');
  if (inp) { inp.value = ''; inp.focus(); }
}

async function bulkAdd(text, chain) {
  const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) return;
  const p = state.project;
  let prev = null;
  for (const line of lines) {
    const ev = Store.newEvent({ name: line, days: 1 });
    if (chain && prev) ev.deps = [prev];
    p.events.push(ev);
    prev = ev.id;
  }
  state.quickAnchor = prev;
  recompute();
  await persist();
  flash(`已加入 ${lines.length} 個里程碑`);
  render();
}

function csvOf() {
  const p = state.project, evs = state.computed.events;
  const nameOf = (id) => (p.events.find(x => x.id === id)?.name) || '';
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [
    ['專案', p.title], ['目標', p.goal], ['起始日', p.startDate], ['截止日', p.dueDate], [],
    ['#', '里程碑事件', '責任', '區塊', '時間(天)', '預算', '前置事件', '最早日期', '最晚日期', '彈性(天)', '要徑', '已完成'],
  ];
  evs.forEach((e, i) => rows.push([
    i + 1, e.name, e.resp, e.track || '其他', e.days, e.budget,
    e.deps.map(nameOf).join('、'), e.earliestDate, e.latestDate, e.slack,
    e.critical ? '是' : '', e.done ? '是' : '',
  ]));
  const t = state.computed.totals;
  rows.push([], ['合計', '', '', '', t.naturalEndDays + ' 天', t.budget]);
  return '\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n');
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;

  if (act === 'go') { ev.preventDefault(); state.view = el.dataset.view; state.project = null; await reloadProjects(); render(); return; }
  if (act === 'open') { await openProject(el.dataset.id); return; }
  if (act === 'tab') { state.tab = el.dataset.tab; render(); return; }
  if (act === 'track') { state.filterTrack = el.dataset.t; render(); return; }
  if (act === 'togglelinks') { state.showLinks = !state.showLinks; render(); return; }

  if (act === 'setname') {
    const n = prompt('你的姓名（會顯示在專案上）', state.me?.name || '');
    if (n !== null) { state.me = await Store.setMyName(n.trim()); render(); }
    return;
  }

  if (act === 'newfrom') {
    const tpl = TEMPLATES.find(t => t.key === el.dataset.key);
    if (!tpl) return;
    const p = Store.fromTemplate(tpl, new Date().getFullYear());
    p.ownerName = state.me?.name || '';
    if (tpl.key === 'blank') { p.startDate = todayIso(); p.dueDate = addDays(todayIso(), 90); }
    await Store.saveProject(p);
    await reloadProjects();
    await openProject(p.id);
    return;
  }

  if (act === 'delproject') {
    if (!confirm('確定刪除這個專案？無法復原。')) return;
    await Store.deleteProject(state.project.id);
    state.project = null; state.view = 'home';
    await reloadProjects(); render(); return;
  }

  if (act === 'qmode') { state.quickMode = el.dataset.mode; render(); $('#qinput')?.focus(); return; }
  if (act === 'qanchor') { state.quickAnchor = el.dataset.id || null; render(); $('#qinput')?.focus(); return; }
  if (act === 'qadd') { await quickAdd($('#qinput')?.value); return; }
  if (act === 'qbulk') { await bulkAdd($('#qbulk')?.value, $('#qbulkchain')?.checked); return; }

  if (act === 'addrow') {
    state.project.events.push(Store.newEvent({ name: '' }));
    recompute(); await persist(); render(); return;
  }

  if (act === 'delevent') {
    const id = el.dataset.id;
    const p = state.project;
    p.events = p.events.filter(e => e.id !== id);
    for (const e of p.events) e.deps = e.deps.filter(d => d !== id);
    if (state.quickAnchor === id) state.quickAnchor = null;
    recompute(); await persist(); render(); return;
  }

  if (act === 'deps') { state.modal = { type: 'deps', id: el.dataset.id, q: '' }; render(); return; }
  if (act === 'closemodal') { state.modal = null; render(); return; }

  if (act === 'csv') { download(`${state.project.title || 'PERT'}.csv`, csvOf(), 'text/csv;charset=utf-8'); return; }
  if (act === 'json') { download(`${state.project.title || 'PERT'}.json`, JSON.stringify(state.project, null, 2), 'application/json'); return; }
  if (act === 'printgraph') { doPrint('graph', graphModeSelected()); return; }
  if (act === 'printtable') { doPrint('table'); return; }
  if (act === 'printcards') { doPrint('cards', cardsPerPageSelected()); return; }
  if (act === 'svg') { downloadSvg(); return; }
  if (act === 'png') { downloadPng(); return; }
  if (act === 'print') { doPrint('graph', graphModeSelected()); return; }   // 舊入口：一律印流程圖

  if (act === 'importjson') {
    const f = $('#jsonfile')?.files?.[0];
    if (!f) { alert('請先選擇 JSON 檔'); return; }
    try {
      const obj = JSON.parse(await f.text());
      const p = Store.newProject({ ...obj, id: Store.uid('p'), title: (obj.title || '匯入專案') + '（匯入）' });
      await Store.saveProject(p);
      await reloadProjects();
      await openProject(p.id);
      flash('匯入完成');
    } catch (err) { alert('匯入失敗：' + err.message); }
    return;
  }
});

/* checkbox / select / input 變更 */
document.addEventListener('change', async (ev) => {
  const t = ev.target;

  if (t.dataset.act === 'deptoggle') {
    const e = state.project.events.find(x => x.id === t.dataset.id);
    if (!e) return;
    const dep = t.dataset.dep;
    e.deps = t.checked ? [...new Set([...e.deps, dep])] : e.deps.filter(d => d !== dep);
    recompute(); await persist(); render(); return;
  }

  if (t.dataset.field) {
    state.project[t.dataset.field] = t.value;
    recompute(); await persist(); render(); return;
  }

  if (t.dataset.ev) {
    const e = state.project.events.find(x => x.id === t.dataset.ev);
    if (!e) return;
    const k = t.dataset.k;
    e[k] = (k === 'done') ? t.checked : (k === 'days' || k === 'budget') ? Number(t.value) || 0 : t.value;
    recompute(); await persist();
    // 名稱／責任等文字欄位不整頁重繪，避免打字時失焦
    if (k === 'days' || k === 'budget' || k === 'done' || k === 'track') render();
    return;
  }
});

/* 文字欄位：離開才重繪（保持輸入順暢） */
document.addEventListener('blur', (ev) => {
  const t = ev.target;
  if (t.dataset && (t.dataset.ev || t.dataset.field)) { recompute(); render(); }
}, true);

/* Enter 送出 */
document.addEventListener('keydown', async (ev) => {
  if (ev.key !== 'Enter') return;
  if (ev.target.id === 'qinput') { ev.preventDefault(); await quickAdd(ev.target.value); }
  if (ev.target.id === 'depq') { ev.preventDefault(); }
});

/* 搜尋前置事件 */
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'depq' && state.modal) {
    state.modal.q = ev.target.value;
    render();
    const i = $('#depq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }
});

/* ============================================================
   啟動
   ============================================================ */
(async function init() {
  state.me = await Store.me();
  await reloadProjects();
  recompute();
  render();
})();
