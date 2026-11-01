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
    return this._all().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  },

  async getProject(id) {
    return this._all().find(p => p.id === id) || null;
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
      resp: '',
      days: 1,
      budget: 0,
      deps: [],
      track: '其他',
      done: false,
      note: '',
      ...partial,
    };
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
    return Store.newProject({
      title: tpl.title,
      goal: tpl.goal,
      startDate: fixDate(tpl.startDate, y),
      dueDate: fixDate(tpl.dueDate, y + (tpl.dueYearOffset || 0)),
      events,
    });
  },

  uid,
};

if (typeof module !== 'undefined') module.exports = { Store, localDriver, uid };
