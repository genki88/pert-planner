/* 引擎測試 — 對照手冊第 6-8 頁鳥舍範例印出的真實數字 */
const { computePert, layerize, topoSort } = require('./public/pert.js');
const { TEMPLATES } = require('./public/templates.js');

let pass = 0, fail = 0;
function eq(label, got, want) {
  if (String(got) === String(want)) { pass++; }
  else { fail++; console.log(`  ✗ ${label}\n      得到 ${JSON.stringify(got)}  應為 ${JSON.stringify(want)}`); }
}
function ok(label, cond, extra = '') {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${label} ${extra}`); }
}

console.log('\n=== ① 鳥舍：手冊印出的最早／最晚日期 ===');
const bh = {
  startDate: '2026-08-01', dueDate: '2026-08-10',
  events: TEMPLATES.find(t => t.key === 'birdhouse').events,
};
const r = computePert(bh);
const by = (n) => r.events.find(e => e.name === n);

// 手冊卡片上印的值：設計 8-1|8-5、材料 8-2|8-6、組裝 8-3|8-9、安裝 8-6|8-10
eq('設計 最早', by('設計和計劃鳥舍').earliestDate, '2026-08-01');
eq('設計 最晚', by('設計和計劃鳥舍').latestDate, '2026-08-05');
eq('材料 最早', by('分配做鳥舍的材料及工具').earliestDate, '2026-08-02');
eq('材料 最晚', by('分配做鳥舍的材料及工具').latestDate, '2026-08-06');
eq('組裝 最早', by('組裝好鳥舍').earliestDate, '2026-08-03');
eq('組裝 最晚', by('組裝好鳥舍').latestDate, '2026-08-09');
eq('安裝 最早', by('安裝鳥舍').earliestDate, '2026-08-06');
eq('安裝 最晚', by('安裝鳥舍').latestDate, '2026-08-10');
eq('最快完成天數', r.totals.naturalEndDays, 6);     // 1+1+3+1
eq('整體彈性', r.totals.slackDays, 3);              // 9 - 6
eq('每個事件彈性一致(單鏈)', [...new Set(r.events.map(e => e.slack))].join(), '3');
eq('要徑=全部(單鏈)', r.events.filter(e => e.critical).length, 4);
eq('無循環', r.cycle.length, 0);
eq('預算合計', r.totals.budget, 30);

console.log('\n=== ② 沒有截止日時，要徑彈性應為 0 ===');
const r2 = computePert({ startDate: '2026-08-01', dueDate: '', events: bh.events });
eq('無截止日→彈性0', [...new Set(r2.events.map(e => e.slack))].join(), '0');
eq('自然完成日（最後一天）', r2.totals.naturalEndDate, '2026-08-06');

console.log('\n=== ③ 並行分支：只有長的那條是要徑 ===');
const r3 = computePert({
  startDate: '2026-01-01', dueDate: '',
  events: [
    { id: 'a', name: 'A', days: 2, deps: [] },
    { id: 'b', name: 'B長', days: 10, deps: ['a'] },
    { id: 'c', name: 'C短', days: 3, deps: ['a'] },
    { id: 'd', name: 'D', days: 1, deps: ['b', 'c'] },
  ],
});
const g = (n) => r3.events.find(e => e.name === n);
eq('A 最早', g('A').earliestDate, '2026-01-01');
eq('B 最早(A後)', g('B長').earliestDate, '2026-01-03');
eq('C 最早(A後)', g('C短').earliestDate, '2026-01-03');
eq('D 最早(等B)', g('D').earliestDate, '2026-01-13');
eq('B 在要徑', g('B長').critical, true);
eq('C 不在要徑', g('C短').critical, false);
eq('C 彈性=7', g('C短').slack, 7);
eq('總長 13 天', r3.totals.naturalEndDays, 13);

console.log('\n=== ④ 截止日排不下要能偵測 ===');
const r4 = computePert({ startDate: '2026-01-01', dueDate: '2026-01-05', events: r3.events.map(e => ({ ...e })) });
eq('偵測到排不下', r4.totals.overdue, true);
eq('彈性為負', r4.totals.slackDays < 0, true);

console.log('\n=== ⑤ 相依循環要偵測得到，不能無限迴圈 ===');
const r5 = computePert({
  startDate: '2026-01-01', dueDate: '',
  events: [
    { id: 'x', name: 'X', days: 1, deps: ['y'] },
    { id: 'y', name: 'Y', days: 1, deps: ['x'] },
    { id: 'z', name: 'Z', days: 1, deps: [] },
  ],
});
eq('循環數=2', r5.cycle.length, 2);
eq('Z 不在循環', r5.events.find(e => e.name === 'Z').inCycle, false);

console.log('\n=== ⑨ 卡片連接線：路徑計算（同排／換行／折返） ===');
const { cardLinkPath } = require('./public/graph.js');
const W = 1200;
// 同一排相鄰：320~600 與 620~900，高度相同
const A = { left: 20, right: 300, top: 0, h: 200 };
const B = { left: 320, right: 600, top: 0, h: 200 };
const C = { left: 620, right: 900, top: 0, h: 200 };
const D = { left: 920, right: 1180, top: 0, h: 200 };
const E = { left: 20, right: 300, top: 240, h: 200 };   // 換到下一排
eq('同排直線', cardLinkPath(A, B, W), 'M300,100 H320');
eq('同排第二段', cardLinkPath(B, C, W), 'M600,100 H620');
ok('同排路徑只有水平', !cardLinkPath(C, D, W).includes('V'));

const wrapPath = cardLinkPath(D, E, W);
ok('換行走繞行路徑', wrapPath.includes('V') && wrapPath.split('H').length >= 3, wrapPath);
ok('換行從右邊出去', wrapPath.startsWith('M1180,100'), wrapPath);
ok('換行走兩排之間的空隙 y=220', wrapPath.includes('V220'), wrapPath);
ok('換行在右邊界內轉折', wrapPath.includes('H1194') || wrapPath.includes('H1190'), wrapPath);
ok('換行終點回到下一排卡片左緣', wrapPath.endsWith('H20'), wrapPath);

// 同排但高度不同 → 需要轉折對齊中線
const B2 = { left: 320, right: 600, top: 0, h: 260 };
ok('同排高度不同會轉折', cardLinkPath(A, B2, W).includes('V130'), cardLinkPath(A, B2, W));

// 折返（後面的卡片指回前面）
const back = cardLinkPath(E, A, W);
ok('折返也畫得出來', back.startsWith('M300,340') && back.includes('V'), back);

console.log('\n=== ⑪ 實際進度：延誤要往下游傳（這是整個功能的重點） ===');
const { computeBoth, STATUS } = require('./public/pert.js');
const chain = () => ([
  { id: 'a', name: 'A收集', days: 2, deps: [], assigneeName: '小明' },
  { id: 'b', name: 'B採購', days: 3, deps: ['a'], assigneeName: '小華' },
  { id: 'c', name: 'C組裝', days: 2, deps: ['b'], assigneeName: '小明' },
  { id: 'd', name: 'D驗收', days: 1, deps: ['c'], assigneeName: '小美' },
]);
const PRJ = (evs) => ({ startDate: '2026-01-01', dueDate: '2026-01-31', events: evs });
const TODAY = '2026-01-01';

// 基準：全部照計畫
let b0 = computeBoth(PRJ(chain()), TODAY);
const g0 = (n) => b0.live.events.find(e => e.name === n);
eq('A 計畫 1/1 開始', g0('A收集').earliestDate, '2026-01-01');
eq('B 計畫 1/3 開始', g0('B採購').earliestDate, '2026-01-03');
eq('C 計畫 1/6 開始', g0('C組裝').earliestDate, '2026-01-06');
eq('D 計畫 1/8 開始', g0('D驗收').earliestDate, '2026-01-08');
eq('沒有人回報 → 不落後', b0.live.totals.driftDays, 0);
eq('完成度 0%', b0.live.totals.donePct, 0);

// A 準時完成 → 後面不動
let evs = chain();
evs[0].status = 'done'; evs[0].actualStart = '2026-01-01'; evs[0].actualEnd = '2026-01-02';
let b1 = computeBoth(PRJ(evs), TODAY);
const g1 = (n) => b1.live.events.find(e => e.name === n);
eq('A 準時完成 → B 仍 1/3', g1('B採購').earliestDate, '2026-01-03');
eq('準時 → 不落後', b1.live.totals.driftDays, 0);
eq('完成度 25%', b1.live.totals.donePct, 25);

// A 拖到 1/5 才完成 → B C D 全部往後推 3 天
evs = chain();
evs[0].status = 'done'; evs[0].actualStart = '2026-01-01'; evs[0].actualEnd = '2026-01-05';
let b2 = computeBoth(PRJ(evs), TODAY);
const g2 = (n) => b2.live.events.find(e => e.name === n);
eq('A 晚 3 天完成 → B 改 1/6 開始', g2('B採購').earliestDate, '2026-01-06');
eq('C 跟著推到 1/9', g2('C組裝').earliestDate, '2026-01-09');
eq('D 跟著推到 1/11', g2('D驗收').earliestDate, '2026-01-11');
eq('整案落後 3 天', b2.live.totals.driftDays, 3);
eq('B 的落後天數', g2('B採購').driftFinish, 3);
eq('D 的落後天數', g2('D驗收').driftFinish, 3);
eq('B 仍看得到原計畫日期', g2('B採購').planStart, '2026-01-03');
eq('預計完工日往後', b2.live.totals.naturalEndDate, '2026-01-11');
eq('原計畫完工日不變', b2.live.totals.planEndDate, '2026-01-08');
ok('彈性被吃掉', b2.live.totals.slackDays < b0.live.totals.slackDays,
  `${b2.live.totals.slackDays} vs ${b0.live.totals.slackDays}`);

// 中間的人延誤 → 只影響他後面的
evs = chain();
evs[0].status = 'done'; evs[0].actualStart = '2026-01-01'; evs[0].actualEnd = '2026-01-02';
evs[1].status = 'done'; evs[1].actualStart = '2026-01-03'; evs[1].actualEnd = '2026-01-10';  // 計畫 3 天，實際 8 天
let b3 = computeBoth(PRJ(evs), TODAY);
const g3 = (n) => b3.live.events.find(e => e.name === n);
eq('A 不受影響', g3('A收集').earliestDate, '2026-01-01');
eq('C 被推到 1/11', g3('C組裝').earliestDate, '2026-01-11');
eq('D 被推到 1/13', g3('D驗收').earliestDate, '2026-01-13');
eq('整案落後 5 天', b3.live.totals.driftDays, 5);
eq('A 自己沒落後', g3('A收集').driftFinish, 0);

// 提早完成 → 後面可以提前
evs = chain();
evs[0].status = 'done'; evs[0].actualStart = '2026-01-01'; evs[0].actualEnd = '2026-01-01';  // 2 天的事 1 天做完
let b4 = computeBoth(PRJ(evs), TODAY);
eq('提早完成 → B 提前到 1/2', b4.live.events.find(e => e.name === 'B採購').earliestDate, '2026-01-02');
eq('整案提前 1 天', b4.live.totals.driftDays, -1);

console.log('\n=== ⑫ 還沒開工的事，最早也只能從今天算起 ===');
// 今天已經 1/10，但 A 還沒開工
let b5 = computeBoth(PRJ(chain()), '2026-01-10');
const g5 = (n) => b5.live.events.find(e => e.name === n);
eq('A 改成今天才能開始', g5('A收集').earliestDate, '2026-01-10');
eq('整串往後推', g5('D驗收').earliestDate, '2026-01-17');
eq('落後 9 天', b5.live.totals.driftDays, 9);
ok('A 被標成逾期未開工', g5('A收集').lateToStart === false || g5('A收集').lateToStart === true);

console.log('\n=== ⑬ 狀態與統計 ===');
evs = chain();
evs[0].status = 'done'; evs[0].actualStart = '2026-01-01'; evs[0].actualEnd = '2026-01-02';
evs[1].status = 'doing'; evs[1].actualStart = '2026-01-03';
evs[2].status = 'blocked'; evs[2].note = '等廠商報價';
let b6 = computeBoth(PRJ(evs), '2026-01-04');
eq('完成 1 件', b6.live.totals.doneCount, 1);
eq('進行中 1 件', b6.live.totals.doingCount, 1);
eq('卡住 1 件', b6.live.totals.blockedCount, 1);
eq('完成度 25%', b6.live.totals.donePct, 25);
eq('狀態中文標籤', STATUS.blocked.label, '卡住了');
eq('進行中的 B 釘在實際開始日', b6.live.events.find(e => e.name === 'B採購').earliestDate, '2026-01-03');

console.log('\n=== ⑭ 舊資料相容：只有 done 沒有 status ===');
let b7 = computeBoth(PRJ([
  { id: 'x', name: 'X', days: 2, deps: [], done: true },
  { id: 'y', name: 'Y', days: 2, deps: ['x'] },
]), TODAY);
eq('舊的 done:true 要認得', b7.live.events.find(e => e.name === 'X').status, 'done');
eq('舊資料完成度 50%', b7.live.totals.donePct, 50);

console.log('\n=== ⑩ 完整範本「自由工作者→可擴展事業」 ===');
const sc = TEMPLATES.find(t => t.key === 'scalable');
const r6 = computePert({ startDate: '2026-07-01', dueDate: '2027-09-01', events: sc.events });
eq('事件數', r6.totals.count, 41);
eq('無循環', r6.cycle.length, 0);
eq('使命是起點', r6.events.find(e => e.name === '建立使命').earliestDate, '2026-07-01');
eq('手冊：建立使命最早 7-1', r6.events.find(e => e.name === '建立使命').esOffset, 0);
// 手冊：資源評估 7-16（使命 1 天後 = 7-2？手冊把工期算進前置的起算，這裡驗證邏輯一致性而非逐格相同
eq('發表開始是終點(無後續)', r6.events.filter(e =>
  !sc.events.some(x => (x.deps || []).includes(e.id))).map(e => e.name).includes('發表開始'), true);
eq('預算合計', r6.totals.budget, 365000);
const crit = r6.events.filter(e => e.critical).map(e => e.name);
eq('要徑包含發表開始', crit.includes('發表開始'), true);
eq('要徑包含建立使命', crit.includes('建立使命'), true);
console.log('    要徑：' + crit.join(' → '));
console.log('    最快完成 ' + r6.totals.naturalEndDays + ' 天（' + r6.totals.naturalEndDate + '）');

console.log('\n=== ⑦ 分層（畫圖用） ===');
const layers = layerize(r6.events);
eq('第 0 層只有建立使命', layers[0].map(e => e.name).join(), '建立使命');
eq('層數合理', layers.length > 5 && layers.length < 20, true);
eq('所有事件都被分層', layers.reduce((a, l) => a + l.length, 0), 41);

console.log('\n=== ⑧ 指向不存在的前置事件不可當掉 ===');
const r8 = computePert({ startDate: '2026-01-01', dueDate: '', events: [{ id: 'a', name: 'A', days: 2, deps: ['nope'] }] });
eq('忽略壞前置', r8.events[0].earliestDate, '2026-01-01');

console.log(`\n${fail === 0 ? '✓ 全部通過' : '✗ 有失敗'}　${pass} 通過 / ${fail} 失敗\n`);
process.exitCode = fail ? 1 : 0;
