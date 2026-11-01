/* ============================================================
   內建範本 — 直接取自 Blair Singer《PERT》手冊
   ① 鳥舍（第 06-08 頁教學範例）
   ② 從自由工作者到可擴展的事業（第 10-11 頁完整網絡圖）
   每個範本都是純資料，可直接載入成新專案後自行修改。
   ============================================================ */

const TEMPLATES = [
  {
    key: 'birdhouse',
    tone: 'faint',
    hint: '教學用，看一次就好',
    title: '鳥舍（教學範例）',
    desc: '手冊第 6-8 頁的入門範例。4 個里程碑事件，示範最早／最晚日期與鬆弛時間怎麼算。',
    goal: '安裝好一座鳥舍',
    startDate: '08-01',
    dueDate: '08-10',
    events: [
      { id: 'b1', name: '設計和計劃鳥舍', en: 'BIRDHOUSE DESIGNED & PLANNED', resp: '', days: 1, budget: 0, deps: [] },
      { id: 'b2', name: '分配做鳥舍的材料及工具', en: 'BIRDHOUSE MATERIALS/TOOLS ALLOCATED', resp: '', days: 1, budget: 30, deps: ['b1'] },
      { id: 'b3', name: '組裝好鳥舍', en: 'BIRDHOUSE ASSEMBLED', resp: '', days: 3, budget: 0, deps: ['b2'] },
      { id: 'b4', name: '安裝鳥舍', en: 'BIRDHOUSE INSTALLED', resp: '', days: 1, budget: 0, deps: ['b3'] },
    ],
  },

  {
    key: 'scalable',
    tone: 'normal',
    hint: '想先看完整範例長什麼樣',
    title: '從自由工作者到可擴展的事業',
    desc: '手冊第 10-11 頁的完整 PERT 網絡圖，41 個里程碑事件，涵蓋 B-I 三角形全部區塊（使命／現金流／溝通／系統／法務／產品）。',
    goal: '發表開始 — 事業可擴展、不需要你親自在場也能運轉',
    startDate: '07-01',
    dueDate: '09-01',
    dueYearOffset: 1,     // 手冊的圖表橫跨一年多：7月起跑，隔年 9 月發表
    events: [
      // --- 地基 ---
      { id: 's01', name: '建立使命', en: 'MISSION CREATED', resp: '', days: 1, budget: 0, deps: [], track: '使命' },
      { id: 's02', name: '資源評估及 GHPS 開始', en: 'ASSESSMENT OF RESOURCES & GHPS BEGUN', resp: '', days: 15, budget: 0, deps: ['s01'], track: '使命' },
      { id: 's03', name: '建立榮譽典章', en: 'CODE OF HONOR CREATED', resp: '', days: 15, budget: 0, deps: ['s01'], track: '使命' },
      { id: 's04', name: 'PERT 計劃開始', en: 'PERT PLAN BEGUN', resp: '', days: 45, budget: 0, deps: ['s02', 's03'], track: '使命' },
      { id: 's05', name: '挑選團隊開始', en: 'TEAM SELECTION BEGUN', resp: '', days: 15, budget: 0, deps: ['s04'], track: '使命' },

      // --- 產品線 ---
      { id: 's06', name: '挑選產品研發團隊及開始', en: 'PROD. DEV TEAM SELECTED & COMMENCED', resp: '', days: 30, budget: 10000, deps: ['s05'], track: '產品' },
      { id: 's07', name: '產品構思', en: 'PRODUCTS CONCEIVED', resp: '', days: 15, budget: 0, deps: ['s06'], track: '產品' },
      { id: 's08', name: '產品設計及測試', en: 'PRODUCTS DESIGNED AND TESTED', resp: '', days: 30, budget: 0, deps: ['s07'], track: '產品' },
      { id: 's09', name: '模型測試', en: 'MODELS TESTED', resp: '', days: 60, budget: 0, deps: ['s08'], track: '產品' },
      { id: 's10', name: '產品研發完成', en: 'PRODUCT DEVELOPMENT COMPLETED', resp: '', days: 30, budget: 0, deps: ['s09'], track: '產品' },

      // --- 法務線 ---
      { id: 's11', name: '建立法務團隊', en: 'LEGAL TEAM FOUND', resp: '', days: 15, budget: 20000, deps: ['s05'], track: '法務' },
      { id: 's12', name: '確定法律要求', en: 'LEGAL REQUIREMENTS IDENTIFIED', resp: '', days: 30, budget: 0, deps: ['s11'], track: '法務' },
      { id: 's13', name: '建立保障（智慧財產權、商標、版權）', en: 'PROTECTIONS ESTABLISHED (IP, TM, COPYRIGHT)', resp: '', days: 30, budget: 0, deps: ['s12'], track: '法務' },
      { id: 's14', name: '法務系統完成', en: 'LEGAL SYSTEMS COMPLETED', resp: '', days: 30, budget: 0, deps: ['s13'], track: '法務' },

      // --- 營運／客服線 ---
      { id: 's15', name: '籌劃營運及客服團隊', en: 'OPERATIONS & CUST. SERVICE TEAM ARRANGED', resp: '', days: 15, budget: 0, deps: ['s05'], track: '系統' },
      { id: 's16', name: '建立營運及客服系統', en: 'OPS & C/S SYSTEMS CREATED', resp: '', days: 45, budget: 0, deps: ['s15'], track: '系統' },
      { id: 's17', name: '營運系統設計及測試', en: 'OPS SYSTEMS DESIGNED AND TESTED', resp: '', days: 30, budget: 0, deps: ['s16'], track: '系統' },

      // --- 溝通／業務線 ---
      { id: 's18', name: '定義傳播通訊團隊', en: 'COMMUNICATION TEAMS DEFINED', resp: '', days: 15, budget: 15000, deps: ['s05'], track: '溝通' },
      { id: 's19', name: '挑選銷售／業務團隊', en: 'SALES TEAM SELECTED', resp: '', days: 60, budget: 100000, deps: ['s18'], track: '溝通' },
      { id: 's20', name: '團隊訓練及測試', en: 'TEAM TRAINED AND TESTED', resp: '', days: 60, budget: 0, deps: ['s19'], track: '溝通' },
      { id: 's21', name: '完整週期測試', en: 'FULL CYCLE TESTED', resp: '', days: 60, budget: 0, deps: ['s20'], track: '溝通' },
      { id: 's22', name: '銷售程序及基準點達成', en: 'SALES PROCESS AND BENCHMARKS MET', resp: '', days: 30, budget: 0, deps: ['s21'], track: '溝通' },

      // --- 行銷線 ---
      { id: 's23', name: '挑選行銷團隊', en: 'MARKETING TEAM SELECTED', resp: '', days: 45, budget: 200000, deps: ['s18'], track: '行銷' },
      { id: 's24', name: '定義目標市場', en: 'TARGET MARKET DEFINED', resp: '', days: 30, budget: 0, deps: ['s23'], track: '行銷' },
      { id: 's25', name: '定義行銷引擎', en: 'MARKETING ENGINE DEFINED', resp: '', days: 30, budget: 0, deps: ['s24'], track: '行銷' },
      { id: 's26', name: '行銷引擎測試及運作', en: 'MARKETING ENGINE TESTED & RUNNING', resp: '', days: 30, budget: 0, deps: ['s25'], track: '行銷' },
      { id: 's27', name: '行銷引擎測試及驗證', en: 'MARKETING ENGINE TESTED & PROVEN', resp: '', days: 30, budget: 0, deps: ['s26'], track: '行銷' },

      // --- 品牌線 ---
      { id: 's28', name: '品牌管理開始', en: 'BRAND MANAGEMENT STARTED', resp: '', days: 45, budget: 0, deps: ['s18'], track: '品牌' },
      { id: 's29', name: '商標、logo、商業包裝設計', en: 'MARKS, LOGOS, TRADE DRESS DESIGNED', resp: '', days: 30, budget: 0, deps: ['s28'], track: '品牌' },
      { id: 's30', name: '促銷活動建立／測試', en: 'PROMO CAMPAIGNS CREATED/TESTED', resp: '', days: 60, budget: 0, deps: ['s29'], track: '品牌' },
      { id: 's31', name: '穩固分支機構及初級合夥人／簡報', en: 'AFFILIATE & JV PARTNERS SECURED/BRIEFED', resp: '', days: 30, budget: 0, deps: ['s30'], track: '品牌' },
      { id: 's32', name: '發表流程準備', en: 'LAUNCH PROCESS PREPPED', resp: '', days: 45, budget: 0, deps: ['s31'], track: '品牌' },

      // --- 財務線 ---
      { id: 's33', name: '財務管理系統啟動', en: 'FINANCIAL MGMT. SYSTEMS COMMENCED', resp: '', days: 30, budget: 10000, deps: ['s05'], track: '現金流' },
      { id: 's34', name: '創造模型及計劃', en: 'MODELS AND PROJECTIONS CREATED', resp: '', days: 30, budget: 10000, deps: ['s33'], track: '現金流' },
      { id: 's35', name: '建立基線及現金資源', en: 'BASELINES & CASH RESOURCES ESTABLISHED', resp: '', days: 30, budget: 0, deps: ['s34'], track: '現金流' },
      { id: 's36', name: '計劃資金需求', en: 'FUNDING REQUIREMENTS PROJECTED', resp: '', days: 15, budget: 0, deps: ['s35'], track: '現金流' },
      { id: 's37', name: '啟動資金程序', en: 'FUNDING PROCESS STARTED', resp: '', days: 30, budget: 0, deps: ['s36'], track: '現金流' },
      { id: 's38', name: '回報系統運行', en: 'REPORTING SYSTEMS OPERATING', resp: '', days: 30, budget: 0, deps: ['s37'], track: '現金流' },

      // --- 收斂到發表 ---
      { id: 's39', name: '召集及重整業務及行銷團隊', en: 'SALES & MKTG TEAMS CONVENED & RESTRUCTURED', resp: '', days: 15, budget: 0, deps: ['s22', 's27', 's32'], track: '發表' },
      { id: 's40', name: '促銷／推動開始', en: 'PROMO/PUSH BEGUN', resp: '', days: 10, budget: 0, deps: ['s39', 's10', 's14', 's17', 's38'], track: '發表' },
      { id: 's41', name: '發表開始', en: 'LAUNCH COMMENCES', resp: '', days: 2, budget: 0, deps: ['s40'], track: '發表' },
    ],
  },

  {
    key: 'blank',
    tone: 'primary',
    hint: '建議從這裡開始',
    title: '空白專案',
    desc: '從你自己的目標開始。系統會一步步問「在那之前必須先完成什麼？」，你打字按 Enter，流程自己長出來。',
    goal: '',
    startDate: '',
    dueDate: '',
    events: [],
  },
];

/** 首頁「新增專案」的顯示順序：真正要用的放左邊，教學範例放最右邊 */
const HOME_ORDER = ['blank', 'scalable', 'birdhouse'];

/** B-I 三角形的區塊，用作事件分類標籤 */
const TRACKS = ['使命', '現金流', '溝通', '系統', '法務', '產品', '行銷', '品牌', '發表', '其他'];

if (typeof module !== 'undefined') module.exports = { TEMPLATES, TRACKS };
