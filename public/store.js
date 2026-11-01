/* ============================================================
   資料層 (data layer)
   ------------------------------------------------------------
   這一支是「唯一的」存取資料的地方。
   目前驅動 = localStorage（瀏覽器本機）。
   將來併入 WINEX 戰情室時，只要把 DRIVER 換成 supabase 驅動，
   介面（listProjects / getProject / saveProject / ...）完全不變，
   app.js 一行都不用改。
   ============================================================ */

const LS_KEY = 'pert-projects-v1';
const LS_ME = 'pert-me-v1';
const LS_PEOPLE = 'pert-people-v1';

function uid(prefix = 'e') {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}

function nowIso() {
  return new Date().toISOString();
}

/* ---------- 本機驅動 ---------- */
const localDriver = {
  name: 'local',

  async me() {
    let m = null;
    try { m = JSON.parse(localStorage.getItem(LS_ME) || 'null'); } catch (_) {}
    if (!m) {
      m = { id: uid('u'), name: '', display: '（未填姓名）' };
      localStorage.setItem(LS_ME, JSON.stringify(m));
    }
    return m;
  },

  async setMyName(name) {
    const m = await this.me();
    m.name = name;
    m.display = name || '（未填姓名）';
    localStorage.setItem(LS_ME, JSON.stringify(m));
    return m;
  },

  _all() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (_) { return []; }
  },
  _write(list) {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  },

  async listProjects() {
    return this._all().map(p => Store.normalize(p))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  },

  async getProject(id) {
    return Store.normalize(this._all().find(p => p.id === id) || null);
  },

  async saveProject(project) {
    const list = this._all();
    const i = list.findIndex(p => p.id === project.id);
    project.updatedAt = nowIso();
    if (i >= 0) list[i] = project; else { project.createdAt = nowIso(); list.push(project); }
    this._write(list);
    return project;
  },

  async deleteProject(id) {
    this._write(this._all().filter(p => p.id !== id));
  },
};

/* ---------- 對外介面 ---------- */
const Store = {
  driver: localDriver,

  /** 這個驅動是否真的多人共用（決定畫面要不要顯示「只存在這台電腦」的提醒） */
  get isShared() { return this.driver.name !== 'local'; },
  get driverName() { return this.driver.name; },

  me() { return this.driver.me(); },
  setMyName(n) { return this.driver.setMyName(n); },
  listProjects() { return this.driver.listProjects(); },
  getProject(id) { return this.driver.getProject(id); },
  saveProject(p) { return this.driver.saveProject(p); },
  deleteProject(id) { return this.driver.deleteProject(id); },

  /** 建立空白專案物件（還沒存） */
  newProject(partial = {}) {
    return {
      id: uid('p'),
      title: '',
      goal: '',
      startDate: '',
      dueDate: '',
      visibility: 'private',     // private | public
      ownerName: '',
      events: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...partial,
    };
  },

  newEvent(partial = {}) {
    return {
      id: uid('e'),
      name: '',
      assigneeId: '',          // 之後接戰情室人員帳號；現在先存本機名單的 id
      assigneeName: '',        // 姓名快照 —— 名單改名也不影響歷史紀錄
      days: 1,
      budget: 0,
      deps: [],
      track: '其他',
      status: 'todo',          // todo | doing | done | blocked
      actualStart: '',         // 實際開始日（負責人回報）
      actualEnd: '',           // 實際完成日（負責人回報）
      note: '',                // 卡住的原因／備註
      ...partial,
    };
  },

  /**
   * 把舊資料補上新欄位（舊專案沒有 status／實際日期／指派對象）。
   * 每次讀取專案都會跑，是冪等的。
   */
  normalize(p) {
    if (!p) return p;
    p.events = (p.events || []).map(e => {
      const o = {
        assigneeId: '', assigneeName: '', status: 'todo',
        actualStart: '', actualEnd: '', note: '', track: '其他',
        ...e,
      };
      if (!o.status) o.status = o.done ? 'done' : 'todo';
      if (o.done && o.status === 'todo') o.status = 'done';
      // 舊的自由文字「責任」欄 → 搬進姓名快照
      if (!o.assigneeName && o.resp) o.assigneeName = o.resp;
      o.resp = o.assigneeName;
      delete o.done;
      return o;
    });
    if (!p.visibility) p.visibility = 'private';
    return p;
  },

  /* ---------- 人員名單（暫用；併入戰情室後改讀權限中心） ---------- */
  async listPeople() {
    try {
      const raw = localStorage.getItem(LS_PEOPLE);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return [];
  },

  async savePeople(list) {
    localStorage.setItem(LS_PEOPLE, JSON.stringify(list));
    return list;
  },

  async addPerson(name, dept) {
    const list = await Store.listPeople();
    const p = { id: uid('ppl'), name: String(name || '').trim(), dept: String(dept || '').trim() };
    if (!p.name) return list;
    if (list.some(x => x.name === p.name)) return list;
    list.push(p);
    return Store.savePeople(list);
  },

  async removePerson(id) {
    const list = (await Store.listPeople()).filter(p => p.id !== id);
    return Store.savePeople(list);
  },

  /** 從範本建立專案（補上今年年份、重新產生 id 以免撞號） */
  fromTemplate(tpl, year) {
    const y = year || new Date().getFullYear();
    const fixDate = (d, yr) => {
      if (!d) return '';
      if (d.length === 5) return `${yr}-${d}`;          // 範本存成 MM-DD
      return d;
    };
    const idMap = new Map();
    for (const e of tpl.events) idMap.set(e.id, uid('e'));
    const events = tpl.events.map(e => ({
      ...Store.newEvent(),
      ...e,
      id: idMap.get(e.id),
      deps: (e.deps || []).map(d => idMap.get(d)).filter(Boolean),
    }));
    // 日期：優先用「距今幾天」，沒有才用固定的 MM-DD
    const today = todayLocalIso();
    const shift = (n) => fromDayNum(toDayNum(today) + n);
    const startDate = tpl.startOffsetDays != null
      ? shift(tpl.startOffsetDays) : fixDate(tpl.startDate, y);
    const dueDate = tpl.dueOffsetDays != null
      ? shift(tpl.dueOffsetDays) : fixDate(tpl.dueDate, y + (tpl.dueYearOffset || 0));

    return Store.newProject({ title: tpl.title, goal: tpl.goal, startDate, dueDate, events });
  },

  uid,
};

if (typeof module !== 'undefined') module.exports = { Store, localDriver, uid };
