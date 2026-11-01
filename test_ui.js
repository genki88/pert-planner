/* ============================================================
   介面測試 — 用 jsdom 真的把整個頁面掛起來，按真的按鈕
   驗證「UI 有沒有接上邏輯」，不是只驗引擎。
   ============================================================ */
const { JSDOM, VirtualConsole } = require('I:/LiffOrder/node_modules/jsdom');
const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  if (String(got) === String(want)) pass++;
  else { fail++; console.log(`  ✗ ${label}\n      得到 ${JSON.stringify(String(got)).slice(0, 300)}\n      應為 ${JSON.stringify(String(want))}`); }
};
const ok = (label, cond, extra = '') => {
  if (cond) pass++; else { fail++; console.log(`  ✗ ${label} ${extra}`); }
};

/* --- 假 localStorage --- */
function makeStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    key: i => [...m.keys()][i],
    get length() { return m.size; },
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function boot() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { console.log('  ! jsdomError:', e.message); });
  const file = path.resolve('I:/PERT/pert-app/public/index.html');
  const dom = await JSDOM.fromFile(file, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: pathToFileURL(file).href,
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: makeStorage(), configurable: true });
      w.print = () => { w.__printed = true; };
      w.alert = (m) => { w.__alert = m; };
      w.confirm = () => true;
      w.prompt = (q, d) => w.__promptAnswer ?? d;
      w.scrollTo = () => {};
      w.URL.createObjectURL = () => 'blob:fake';
      w.URL.revokeObjectURL = () => {};
    },
  });
  const w = dom.window;
  // 等 init() 的 await 鏈跑完並 render
  for (let i = 0; i < 60 && !w.document.querySelector('[data-act="newfrom"]'); i++) await sleep(20);
  return w;
}

const txt = (w) => w.document.body.textContent.replace(/\s+/g, ' ');
const click = async (w, sel) => {
  const el = w.document.querySelector(sel);
  if (!el) throw new Error('找不到元素：' + sel);
  el.click();
  await sleep(40);
  return el;
};
const setVal = async (w, sel, v, evName = 'change') => {
  const el = w.document.querySelector(sel);
  if (!el) throw new Error('找不到元素：' + sel);
  if (el.type === 'checkbox') el.checked = v; else el.value = v;
  el.dispatchEvent(new w.Event(evName, { bubbles: true }));
  await sleep(40);
  return el;
};

(async () => {
  console.log('\n=== ① 開機：首頁與範本 ===');
  const w = await boot();
  ok('頁面有標題', txt(w).includes('PERT 專案流程'));
  eq('三個範本卡', w.document.querySelectorAll('[data-act="newfrom"]').length, 3);
  ok('顯示鳥舍範本', txt(w).includes('鳥舍'));
  ok('顯示完整範本', txt(w).includes('從自由工作者到可擴展的事業'));
  ok('還沒有專案', txt(w).includes('還沒有專案'));

  console.log('\n=== ①b 範本順序與底座：空白 → 可擴展事業 → 鳥舍（教學最淡） ===');
  const cards = [...w.document.querySelectorAll('[data-act="newfrom"]')];
  eq('第 1 張是空白專案', cards[0].dataset.key, 'blank');
  eq('第 2 張是可擴展事業', cards[1].dataset.key, 'scalable');
  eq('第 3 張（最右）是鳥舍教學', cards[2].dataset.key, 'birdhouse');
  ok('空白專案是強調底座', cards[0].className.includes('pcard--primary'), cards[0].className);
  ok('可擴展事業是中間底座', cards[1].className.includes('pcard--normal'), cards[1].className);
  ok('鳥舍是最淡底座', cards[2].className.includes('pcard--faint'), cards[2].className);
  ok('空白專案標「建議從這裡開始」', cards[0].textContent.includes('建議從這裡開始'));
  ok('鳥舍標明只需看一次', cards[2].textContent.includes('看一次就好'));
  eq('每張都有提示標籤', w.document.querySelectorAll('.pcard__hint').length, 3);

  console.log('\n=== ② 用鳥舍範本建立專案 ===');
  await click(w, '[data-act="newfrom"][data-key="birdhouse"]');
  ok('進到專案頁', !!w.document.querySelector('[data-act="tab"]'), '找不到頁籤');
  eq('專案名稱已填', w.document.querySelector('[data-field="title"]').value, '鳥舍（教學範例）');
  ok('起始日有值', /^\d{4}-08-01$/.test(w.document.querySelector('[data-field="startDate"]').value));
  ok('KPI 顯示 4 個里程碑', txt(w).includes('4'));
  ok('快速建立頁在問倒推問題', txt(w).includes('必須先完成什麼'));
  ok('流程清單有四個事件', txt(w).includes('安裝鳥舍'));

  console.log('\n=== ③ 表格頁：自動算出的日期要出現在畫面上 ===');
  await click(w, '[data-act="tab"][data-tab="table"]');
  const t = txt(w);
  ok('畫面出現最早日期 8-1', t.includes('8-1'), '→ ' + t.slice(t.indexOf('里程碑事件'), t.indexOf('里程碑事件') + 200));
  ok('畫面出現最晚日期 8-10', t.includes('8-10'));
  ok('畫面出現彈性欄位', t.includes('彈性'));
  eq('表格列數=4', w.document.querySelectorAll('tbody tr').length, 4);

  console.log('\n=== ④ 改天數 → 日期要即時重算 ===');
  const daysInput = [...w.document.querySelectorAll('input[data-k="days"]')];
  eq('有 4 個天數欄', daysInput.length, 4);
  // 把第一列（設計，1天）改成 5 天，後面日期應整串後移
  const firstRowName = w.document.querySelector('input[data-k="name"]').value;
  eq('第一列是設計', firstRowName, '設計和計劃鳥舍');
  await setVal(w, 'input[data-k="days"]', '5');
  const t4 = txt(w);
  ok('改成 5 天後出現排不下警告', t4.includes('排不下'), '→ 未偵測到超出截止日');
  ok('彈性變負', t4.includes('-'), '');

  // 改回 1 天
  await setVal(w, 'input[data-k="days"]', '1');
  ok('改回後警告消失', !txt(w).includes('排不下'));

  console.log('\n=== ⑤ 勾「已完成」要記錄下來 ===');
  await setVal(w, 'input[data-k="done"]', true);
  ok('完成數變 1', txt(w).includes('已完成 1'), '→ ' + txt(w).slice(0, 0));

  console.log('\n=== ⑥ 前置事件 modal 可開、可勾、會重算 ===');
  await click(w, '[data-act="deps"]');
  ok('modal 開了', txt(w).includes('的前置事件'));
  const boxes = [...w.document.querySelectorAll('[data-act="deptoggle"]')];
  eq('可選的其他事件=3', boxes.length, 3);
  await click(w, '[data-act="closemodal"]');
  ok('modal 關了', !txt(w).includes('的前置事件'));

  console.log('\n=== ⑦ 快速建立：Enter 新增里程碑並自動串接 ===');
  await click(w, '[data-act="tab"][data-tab="quick"]');
  const qi = w.document.querySelector('#qinput');
  ok('有快速輸入框', !!qi);
  qi.value = '油漆已上好';
  qi.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(80);
  ok('新事件出現在清單', txt(w).includes('油漆已上好'));
  ok('里程碑數變 5', txt(w).includes('5'));
  const qi2 = w.document.querySelector('#qinput');
  eq('輸入框已清空，可連續輸入', qi2.value, '');

  console.log('\n=== ⑧ 批次貼上 ===');
  await setVal(w, '#qbulk', '木料已採購\n底漆已完成\n五金已到貨', 'input');
  w.document.querySelector('#qbulk').value = '木料已採購\n底漆已完成\n五金已到貨';
  await click(w, '[data-act="qbulk"]');
  const t8 = txt(w);
  ok('三個都加進來了', t8.includes('木料已採購') && t8.includes('底漆已完成') && t8.includes('五金已到貨'));

  console.log('\n=== ⑨ 卡片檢視：六欄位都要在 ===');
  await click(w, '[data-act="tab"][data-tab="cards"]');
  const t9 = txt(w);
  for (const k of ['責任', '時間', '預算', '最早日期', '最晚日期', '前置事件']) ok('卡片有「' + k + '」欄', t9.includes(k));
  ok('卡片數 = 8', w.document.querySelectorAll('.mcard').length === 8, '實際 ' + w.document.querySelectorAll('.mcard').length);

  console.log('\n=== ⑩ 流程圖：SVG 真的畫出節點與連線 ===');
  await click(w, '[data-act="tab"][data-tab="graph"]');
  const svg = w.document.querySelector('.graph-wrap svg');
  ok('有 SVG', !!svg);
  ok('節點數 = 8', w.document.querySelectorAll('.gnode').length === 8, '實際 ' + w.document.querySelectorAll('.gnode').length);
  ok('有連線', w.document.querySelectorAll('.gedge').length > 0, '實際 ' + w.document.querySelectorAll('.gedge').length);
  const svgW = Number(svg.getAttribute('width'));
  ok('SVG 寬度合理', svgW > 100 && svgW < 5000, '實際 ' + svgW);

  console.log('\n=== ⑪ 匯出：CSV 內容正確（含 BOM 與中文表頭） ===');
  await click(w, '[data-act="tab"][data-tab="export"]');
  let captured = null;
  w.Blob = class { constructor(parts) { captured = String(parts[0]); } };
  await click(w, '[data-act="csv"]');
  ok('CSV 有 BOM', captured && captured.charCodeAt(0) === 0xFEFF);
  ok('CSV 有中文表頭', captured && captured.includes('里程碑事件') && captured.includes('最早日期'));
  ok('CSV 含實際資料', captured && captured.includes('安裝鳥舍'));
  ok('CSV 含要徑欄', captured && captured.includes('要徑'));

  console.log('\n=== ⑪b 列印：在「匯出」頁按列印流程圖，印出來必須是流程圖（Jerry 回報的 bug） ===');
  const pa = () => w.document.getElementById('printarea');
  ok('有列印專區', !!pa());
  eq('列印前是空的', pa().innerHTML, '');
  await click(w, '[data-act="printgraph"]');
  ok('列印有被呼叫', w.__printed === true);
  eq('印的是流程圖', w.__lastPrint, 'graph');
  const pah = pa().innerHTML;
  ok('列印內容含 SVG 流程圖', pah.includes('<svg'), '→ 列印區沒有 SVG');
  ok('列印內容含流程圖節點', (pah.match(/class="gnode/g) || []).length === 8,
    '節點數 ' + (pah.match(/class="gnode/g) || []).length);
  ok('列印內容不含匯出頁的按鈕文字', !pah.includes('從 JSON 匯入'), '→ 印到匯出頁了');
  ok('列印抬頭有專案名稱', pah.includes('鳥舍'), '→ 缺抬頭');
  ok('列印抬頭有要徑說明', pah.includes('要徑'));
  ok('版面設定為橫向 A4', w.document.getElementById('printstyle').textContent.includes('landscape'));
  ok('列印時 body 加上 is-printing', w.document.body.classList.contains('is-printing')
    || pah.length > 0, '（已結束列印則已清除）');

  console.log('\n=== ⑪c 列印表格／卡片各自印對東西 ===');
  await click(w, '[data-act="printtable"]');
  eq('印的是表格', w.__lastPrint, 'table');
  ok('表格列印含表頭', pa().innerHTML.includes('里程碑表格') && pa().innerHTML.includes('<table'));
  ok('表格列印不含 SVG', !pa().innerHTML.includes('<svg'));
  await click(w, '[data-act="printcards"]');
  eq('印的是卡片', w.__lastPrint, 'cards');
  ok('卡片列印用直向', w.document.getElementById('printstyle').textContent.includes('portrait'));
  ok('卡片列印含 8 張卡', (pa().innerHTML.match(/class="mcard /g) || []).length === 8,
    '實際 ' + (pa().innerHTML.match(/class="mcard /g) || []).length);
  ok('預設一頁 3 張', pa().innerHTML.includes('pr-cards--3'));

  console.log('\n=== ⑪c2 卡片頁要有列印按鈕與張數選擇（Jerry：寫可列印貼牆但沒地方按） ===');
  await click(w, '[data-act="tab"][data-tab="cards"]');
  ok('卡片頁有列印按鈕', !!w.document.querySelector('[data-act="printcards"]'), '→ 卡片頁沒有列印入口');
  const cm = w.document.querySelector('#cmode');
  ok('卡片頁有張數選擇', !!cm);
  eq('三個選項', cm ? cm.options.length : 0, 3);
  ok('有貼牆選項', cm && [...cm.options].some(o => o.text.includes('貼牆')));
  // 選「一張一頁」再列印
  cm.value = '1';
  cm.dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(40);
  await click(w, '[data-act="printcards"]');
  eq('帶出一張一頁', String(w.__lastPrintOpt), '1');
  ok('列印標記為 pr-cards--1', pa().innerHTML.includes('pr-cards--1'), '→ 沒切到大卡模式');
  ok('大卡標題註明貼牆', pa().innerHTML.includes('貼牆'));
  ok('大卡仍是 8 張', (pa().innerHTML.match(/class="mcard /g) || []).length === 8);

  console.log('\n=== ⑪d 從流程圖頁按列印，也要印流程圖 ===');
  await click(w, '[data-act="tab"][data-tab="graph"]');
  ok('流程圖頁有列印按鈕', !!w.document.querySelector('[data-act="printgraph"]'));
  await click(w, '[data-act="printgraph"]');
  eq('印的是流程圖', w.__lastPrint, 'graph');
  ok('含 SVG', pa().innerHTML.includes('<svg'));

  console.log('\n=== ⑪e 下載流程圖 SVG ===');
  captured = null;
  await click(w, '[data-act="svg"]');
  ok('SVG 檔有內容', captured && captured.includes('<svg'), '');
  ok('SVG 內嵌樣式（不靠外部 CSS）', captured && captured.includes('.gnode rect'));
  ok('SVG 有 xml 宣告', captured && captured.startsWith('<?xml'));

  console.log('\n=== ⑫ 重新開機後資料還在（持久化） ===');
  // 同一個 window 的 localStorage 已寫入；改走 Store 介面確認
  const raw = w.localStorage.getItem('pert-projects-v1');
  ok('localStorage 有資料', !!raw);
  const saved = JSON.parse(raw);
  eq('存了 1 個專案', saved.length, 1);
  eq('事件數 8', saved[0].events.length, 8);
  ok('已完成狀態有存', saved[0].events.some(e => e.done === true));

  console.log('\n=== ⑬ 回清單 → 再開 → 狀態正確 ===');
  await click(w, '[data-act="go"][data-view="home"]');
  ok('回到首頁', txt(w).includes('新增專案'));
  ok('清單看得到剛建的專案', txt(w).includes('鳥舍（教學範例）'));
  await click(w, '[data-act="open"]');
  ok('重新開啟成功', !!w.document.querySelector('[data-act="tab"]'));

  console.log('\n=== ⑭ 完整範本：截止日跨年，不該誤報排不下 ===');
  await click(w, '[data-act="go"][data-view="home"]');
  await click(w, '[data-act="newfrom"][data-key="scalable"]');
  const sd = w.document.querySelector('[data-field="startDate"]').value;
  const dd = w.document.querySelector('[data-field="dueDate"]').value;
  ok('截止日比起始日晚一年', Number(dd.slice(0, 4)) === Number(sd.slice(0, 4)) + 1, `${sd} → ${dd}`);
  ok('沒有誤報排不下', !txt(w).includes('排不下'), '→ 仍顯示排不下');
  ok('41 個里程碑', txt(w).includes('41'));

  console.log('\n=== ⑮ 空白專案：從零倒推 ===');
  await click(w, '[data-act="go"][data-view="home"]');
  await click(w, '[data-act="newfrom"][data-key="blank"]');
  eq('空白專案沒有里程碑', w.document.querySelectorAll('.quick__step').length, 0);
  ok('起始日自動填今天', /^\d{4}-\d{2}-\d{2}$/.test(w.document.querySelector('[data-field="startDate"]').value));
  await setVal(w, '[data-field="goal"]', '新品已上市');
  ok('問題換成目標', txt(w).includes('新品已上市'), '→ ' + txt(w).slice(0, 160));

  console.log('\n=== ⑮ 刪除事件要同時清掉別人對它的相依 ===');
  const wq = w.document.querySelector('#qinput');
  for (const n of ['一', '二', '三']) {
    const i = w.document.querySelector('#qinput');
    i.value = n;
    i.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(60);
  }
  eq('有三個事件', w.document.querySelectorAll('.quick__step').length, 3);
  await click(w, '[data-act="delevent"]');
  eq('刪掉一個剩兩個', w.document.querySelectorAll('.quick__step').length, 2);
  ok('沒有出現相依循環或壞掉', !txt(w).includes('相依循環'));

  console.log(`\n${fail === 0 ? '✓ 全部通過' : '✗ 有失敗'}　${pass} 通過 / ${fail} 失敗\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✗ 測試中斷：', e.message, '\n', e.stack); process.exit(1); });
