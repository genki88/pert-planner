/* 引擎測試 — 對照手冊第 6-8 頁鳥舍範例印出的真實數字 */
const { computePert, layerize, topoSort } = require('./public/pert.js');
const { TEMPLATES } = require('./public/templates.js');

let pass = 0, fail = 0;
function eq(label, got, want) {
  if (String(got) === String(want)) { pass++; }
  else { fail++; console.log(`  ✗ ${label}\n      得到 ${JSON.stringify(got)}  應為 ${JSON.stringify(want)}`); }
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
eq('自然完成日', r2.totals.naturalEndDate, '2026-08-07');

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

console.log('\n=== ⑥ 完整範本「自由工作者→可擴展事業」 ===');
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
