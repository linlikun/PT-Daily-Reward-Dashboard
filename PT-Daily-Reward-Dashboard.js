// ==UserScript==
// @name         PT Daily Reward Dashboard
// @namespace    http://tampermonkey.net/
// @version      11.0.5
// @description  多站点 PT 每日奖励控制面板；支持同站点多活动连续领取；极速后台静默领取；多特殊转盘支持；修复 seedpool 隐藏报错及误报成功；新增 polishtorrent/myfunzone/yu-scene 的 /events + 特殊玩法双分支；集成 V11 优化：防风控重试、CDN 兜底、悬浮球 Badge、后台静默、单站日志与插件化重构
// @author       Whale, DeepSeek
// @license      GPL-3.0 License
// @match        https://bitporn.eu/*
// @match        https://lat-team.com/*
// @match        https://seedpool.org/*
// @match        https://onlyencodes.cc/*
// @match        https://oldtoons.world/*
// @match        https://infinityhd.net/*
// @match        https://digitalcore.club/*
// @match        https://samaritano.cc/*
// @match        https://shareisland.org/*
// @match        https://itatorrents.xyz/*
// @match        https://sextorrent.myds.me/*
// @match        https://czteam.me/*
// @match        https://www.czteam.me/*
// @match        https://seedcore.net/*
// @match        https://www.seedcore.net/*
// @match        https://znth.cx/*
// @match        https://www.znth.cx/*
// @match        https://midnightscene.cc/*
// @match        https://skipthecommercials.xyz/*
// @match        https://retro-movies.club/*
// @match        https://retrotoon.world/*
// @match        https://tracker.vietmediaf.store/*
// @match        https://0dayfiles.net/*
// @match        https://dirtybytes.net/*
// @match        https://www.dirtybytes.net/*
// @match        https://yu-scene.net/*
// @match        https://dreadvault.org/*
// @match        https://clearjav.com/*
// @match        https://eiga.moi/*
// @match        https://malayabits.cc/*
// @match        https://rastastugan.org/*
// @match        https://nordicq.org/*
// @match        https://podzemlje.net/*
// @match        https://turkseed.com/*
// @match        https://nirvana.li/*
// @match        https://gemini-tracker.org/*
// @match        https://generation-free.org/*
// @match        https://tracker.teamflix.cc/*
// @match        https://immortuos.life/*
// @match        https://capybarabr.com/*
// @match        https://torrentland.li/*
// @match        https://emu-warez.com/*
// @match        https://torrenteros.org/*
// @match        https://tracker.milnueve.cc/*
// @match        https://portugas.org/*
// @match        https://polishtorrent.top/*
// @match        https://hellenic-hd.cc/*
// @match        https://jme-reunit3d.de/*
// @match        https://myfunzone.org/*
// @match        https://hd-united.vn/*
// @match        https://darkpeers.org/*
// @match        https://upload.cx/*
// @match        https://luminarr.me/*
// @match        https://homiehelpdesk.net/*
// @match        https://reelflix.cc/*
// @match        https://torrent.desi/*
// @match        https://upscalevault.com/*
// @match        https://3dvault.org/*
// @match        https://f1carreras.xyz/*
// @match        https://filelist.io/*
// @match        https://torrenthaven.org/*
// @match        https://v3x.club/*
// @icon         https://cdn.jsdelivr.net/gh/twitter/twemoji@master/assets/svg/1f381.svg
// @resource     pt_css        https://cdn.jsdelivr.net/gh/linlikun/PT-Daily-Reward-Dashboard@main/dist/dashboard.css
// @resource     pt_html       https://cdn.jsdelivr.net/gh/linlikun/PT-Daily-Reward-Dashboard@main/dist/dashboard.html
// @resource     pt_sites      https://cdn.jsdelivr.net/gh/linlikun/PT-Daily-Reward-Dashboard@main/dist/sites.json
// @resource     pt_inactive   https://cdn.jsdelivr.net/gh/linlikun/PT-Daily-Reward-Dashboard@main/dist/inactive.json
// @resource     pt_timezone   https://cdn.jsdelivr.net/gh/linlikun/PT-Daily-Reward-Dashboard@main/dist/timezone.json
// @grant        GM_getResourceText
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        window.close
// @grant        unsafeWindow
// @require      https://cdn.jsdelivr.net/gh/linlikun/PT-Daily-Reward-Dashboard@main/dist/pt-core.js
// @run-at       document-idle
// @noframes
// @connect      *
// ==/UserScript==

/*
 * V11.0.0 更新说明：
 *   1. 增加 robustFetch（带随机延迟、指数退避重试、伪造 Header）。
 *   2. 增加 CDN 兜底（jsDelivr 失败自动切 fastly / unpkg）。
 *   3. 悬浮球增加未领取活动 Badge 提示。
 *   4. 后台静默打开标签页，不再抢占焦点。
 *   5. Watchdog 动态超时，慢速站点不再误判。
 *   6. 站点配置向插件化靠拢（提取 PROBES 和 HANDLERS）。
 *   7. 支持单站日志复制和只看活跃站点过滤。
 *   8. 多任务站点状态剥离（0dayfiles 等单独维护 subStatus）。
 */

(function () {
'use strict';

const CORE = (typeof PT_CORE !== 'undefined') ? PT_CORE : null;
if (!CORE) { console.error('[PT-Reward] pt-core.js 未加载'); return; }
const {
    MIN, HOUR, DAY,
    sleep, waitFor, escapeHtml, escOrDash, siteIconHtml, showToast,
    fmtAgo, fmtNext, fmtClock, remainMin, cooldownText,
    isNetError, fetchWithTimeout, gmFetch, getCsrfToken,
    looksLikeLoginResponse, classifyHtml, httpStatusToResult,
    isMaintenancePage, isMaintenanceText, isMaintenanceBody, isOnLoginPageNow,
    tabRegistry, openTab, closeTab, spawnClaimTab,
} = CORE;

// ==========================================
// 全局常量与状态码枚举
// ==========================================
const LOG = '[PT-Reward]';
const STATUS = {
    PENDING: 'pending', CLAIMING: 'claiming', CLAIMED: 'claimed', ALREADY: 'already',
    AUTH: 'auth', SKIP: 'skip', FAILED: 'failed', TIMEOUT: 'timeout', INACTIVE: 'inactive',
    EMPTY: 'empty', AVAILABLE: 'available', NOTOPEN: 'notopen', MAINTENANCE: 'maintenance',
    NAVIGATING: 'navigating'
};
const DEFAULT_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
};

const _resCache = new Map();
const resText = name => {
    if (_resCache.has(name)) return _resCache.get(name);
    let t = '';
    try { t = GM_getResourceText(name) || ''; } catch (e) {}

    // 优化 3：CDN 备用源兜底
    if (!t) {
        const paths = { pt_css: 'dashboard.css', pt_html: 'dashboard.html', pt_sites: 'sites.json', pt_inactive: 'inactive.json', pt_timezone: 'timezone.json' };
        const file = paths[name];
        if (file) {
            const urls = [
                `https://fastly.jsdelivr.net/gh/linlikun/PT-Daily-Reward-Dashboard@main/dist/${file}`,
                `https://unpkg.com/pt-daily-reward-dashboard@latest/dist/${file}`
            ];
            for (const url of urls) {
                try {
                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', url, false);
                    xhr.send();
                    if (xhr.status === 200 && xhr.responseText) {
                        t = xhr.responseText;
                        console.log(LOG, `[Res] 从备用 CDN 加载成功: ${name}`);
                        break;
                    }
                } catch (e) {}
            }
        }
    }
    if (t) _resCache.set(name, t); // 失败不缓存，下次调用可重试
    return t;
};
const resJson = (name, dflt) => {
    const raw = resText(name);
    if (!raw) { console.warn(LOG, `[Res] ${name} 为空`); return dflt; }
    try { const v = JSON.parse(raw); return (v && typeof v === 'object') ? v : dflt; }
    catch (e) { console.error(LOG, `[Res] 解析 ${name} 失败`, e.message); return dflt; }
};

// 站点表来自 CDN，这里加一层本地覆盖：域名迁移、维护暂停不必等 CDN 更新
const SITE_OVERRIDES = {
    // emuwarez 2026-11 换域名：旧域名下线，新域名沿用 unit3d 的 /events
    'emuwarez.com': null,
    'emu-warez.com': { handler: 'unit3d', rewardPath: '/events' },
};
// 维护中站点：until 之前完全不探测（不占扫描时间、不计失败），到期自动回到常规探测
const SITE_PAUSED = {
    'oldtoons.world': { reason: '站点维护中（修复 PHP 漏洞）', until: Date.parse('2026-11-26T00:00:00+08:00') },
};
const SITES_RAW       = resJson('pt_sites', {});
const SITES           = (() => {
    const out = { ...SITES_RAW };
    for (const [h, cfg] of Object.entries(SITE_OVERRIDES)) {
        if (cfg === null) delete out[h];
        else out[h] = { ...(out[h] || {}), ...cfg };
    }
    return out;
})();
const KNOWN_INACTIVE  = resJson('pt_inactive', {});
for (const [h, cfg] of Object.entries(SITE_OVERRIDES)) if (cfg === null) delete KNOWN_INACTIVE[h];
const SITE_TIMEZONE   = resJson('pt_timezone', {});
const ALL_KNOWN_SITES = { ...SITES, ...KNOWN_INACTIVE };
const panelCss  = () => resText('pt_css');
const panelHtml = () => resText('pt_html');

if (!Object.keys(SITES).length) {
    console.error(LOG, '[Res] sites.json 未加载，脚本停止');
    return;
}

const HOST = location.hostname.replace(/^www\./, '');
const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
const DIRTYBYTES_ORIGIN = 'https://dirtybytes.net';
const DIRTYBYTES_API = '/api/v1/status?timeSinceLastCheck=10011';
const CLAIM_HASH = '#pt-claim', DETECT_HASH = '#pt-detect',
      DASHBOARD_HASH = '#pt-dashboard', PUMPKIN_HASH = '#pt-pumpkin';

const TTL_SNAPSHOT = 10 * MIN, TTL_EVENT_PATH = 6 * HOUR, TTL_DC_POINTS = 24 * HOUR,
      TTL_AUTO_SCAN_MIN = HOUR, TTL_RECHECK = 12 * HOUR,
      ATTENDANCE_COOLDOWN = 20 * HOUR, ATTENDANCE_ATTEMPT_COOLDOWN = 30 * MIN,
      PENDING_EVENTS_TTL = 30 * MIN, TIMEOUT_COOLDOWN = 10 * MIN,
      FAILED_COOLDOWN = 5 * MIN, PUMPKIN_COOLDOWN = 20 * HOUR,
      AUTO_TAB_TTL = 30 * MIN, STALE_PENDING_MS = 60 * 1000, TASK_LOCK_TTL = 3 * MIN;

const SEQUENTIAL_TIMEOUT = 40000, SEQUENTIAL_GAP = 400, HARD_TIMEOUT_MARGIN = 1000,
      FETCH_TIMEOUT = 5000, WAIT_BUTTON_TIMEOUT = 15000,
      AUTODETECT_TIMEOUT = 8000, INACTIVE_DETECT_TIMEOUT = 12000, OPEN_TAB_INTERVAL = 400,
      PROBE_SITE_BUDGET = 20000, DIRECT_CLAIM_TIMEOUT = 5000;

const SPIN_CHECK_TICK = 10 * MIN,
      ATTENDANCE_CHECK_TICK = 60 * MIN, ATTENDANCE_FIRST_DELAY = 30 * 1000;

const STATUS_PREFIX = 'pt_status_v60_', PROMOTED_KEY = 'pt_promoted_sites_v60',
      FAILURE_KEY_PREFIX = 'pt_failure_count_v60_',
      AUTO_SCAN_TIME_KEY = 'pt_last_auto_scan_time_v60',
      AUTO_SCAN_ENABLED = 'pt_auto_scan_enabled_v60',
      DEMOTED_KEY = 'pt_demoted_sites_v60', DEMOTE_REASON_KEY = 'pt_demote_reason_v60_',
      EVENT_PATH_CACHE_PREFIX = 'pt_event_path_v61_',
      PENDING_EVENTS_PREFIX = 'pt_pending_events_v1_',
      MULTI_EVENT_REWARDS_KEY = 'pt_multi_event_rewards_',
      CZ_BALANCE_KEY = 'pt_cz_balance_before',
      SEEDCORE_BUBBLE_BEFORE = 'pt_seedcore_bubble_before',
      SEEDCORE_DATE_BEFORE = 'pt_seedcore_date_before',
      DC_POINTS_KEY = 'pt_dc_points',
      ATTENDANCE_LAST_CONFIRMED_KEY = 'pt_0df_attendance_last_confirmed',
      ATTENDANCE_LAST_ATTEMPT_KEY   = 'pt_0df_attendance_last_attempt',
      ATTENDANCE_LAST_REWARD_KEY    = 'pt_0df_attendance_last_reward',
      YUSCENE_SPIN_NEXT_KEY   = 'pt_yuscene_spin_next_v1',
      MYFUNZONE_SPIN_NEXT_KEY = 'pt_myfunzone_spin_next_v1',
      SPINWHEEL_NEXT_KEY      = 'pt_spinwheel_next_v1',
      SPINWHEEL_LAST_REWARD_KEY = 'pt_spinwheel_last_reward_v1',
      FILELIST_SPIN_NEXT_KEY  = 'pt_filelist_spin_next_v1',
      FILELIST_LAST_REWARD_KEY = 'pt_filelist_last_reward_v1',
      PUMPKIN_STATUS_KEY      = 'pt_yuscene_pumpkin_status_v1',
      PUMPKIN_LAST_CLAIM_KEY  = 'pt_pumpkin_last_claim_v1',
      PUMPKIN_LAST_REWARD_KEY = 'pt_pumpkin_last_reward_v1',
      PUMPKIN_RETIRED_KEY     = 'pt_pumpkin_retired_v1',
      PUMPKIN_ATTEMPT_KEY     = 'pt_pumpkin_attempts_v1',
      COLLAPSE_KEY            = 'pt_dashboard_collapsed_v53',
      TASK_LOCK_KEY           = 'pt_task_lock_v55',
      DEBUG_NETLOG_KEY        = 'pt_debug_netlog',
      DEBUG_KEEP_TAB_KEY      = 'pt_debug_keep_tab',
      PROBE_MODE_KEY          = 'pt_probe_mode',
      AUTO_TAB_SESSION_KEY    = 'pt_auto_tab',
      FILTER_ONLY_AVAIL_KEY   = 'pt_filter_only_avail',
      POLISH_LAST_REWARD_KEY  = 'pt_polishtorrent_last_reward';

const lastOpenDateKey = (host = HOST) => 'pt_last_open_date_v1_' + host;

const STATUS_LABELS = {
    pending: '⏳ 待领取', claiming: '🔄 领取中', claimed: '✅ 已领取', already: 'ℹ️ 今日已领',
    auth: '🔒 需要登录', skip: '⚠️ 跳过', failed: '❌ 失败', timeout: '⌛ 超时',
    inactive: '💤 无活动', empty: '🎲 空礼物', available: '🎁 检测到可领取', notopen: '⏰ 未到时间',
    maintenance: '🚧 维护中',
};
const TERMINAL_STATUSES = ['claimed', 'already', 'failed', 'skip', 'auth', 'timeout', 'empty', 'available', 'notopen', 'maintenance'];
const SETTLED_STATUSES = TERMINAL_STATUSES.filter(s => s !== 'available');
// timeout 也算失败：连不上的站点每轮白占 20s 预算，连续 3 次后自动降级（恢复后会被 promote 回来）
const FAIL_STATUSES = ['failed', 'inactive', 'timeout'];
const isTerminal = st => TERMINAL_STATUSES.includes(st.status);
const isSettled  = st => SETTLED_STATUSES.includes(st.status);

const authResult = (message = '会话已过期，需要重新登录') => ({ status: STATUS.AUTH, message });
const isNavigating = r => !!r && r.status === STATUS.NAVIGATING;
const loginGate = () => (isOnLoginPageNow() ? authResult() : null);
const guardLogin = fn => async (...a) => loginGate() || fn(...a);

// DirtyBytes 每日登录奖励：探针与领取共用一份解析。
// 注意 pt-core 的 gmFetch 响应只有 text()，没有 json()，必须自己 JSON.parse。
const DIRTYBYTES_STATUS = async () => {
    try {
        const res = await robustFetch(`${DIRTYBYTES_ORIGIN}${DIRTYBYTES_API}`, { timeout: 6000 });
        if (looksLikeLoginResponse(res) || res.status === 401 || res.status === 403) {
            return { status: 'auth', message: '会话已过期，需要重新登录' };
        }
        if (res.status >= 500) return { status: 'maintenance', message: `服务器错误 (HTTP ${res.status})` };
        if (!res.ok) return { status: 'failed', message: `API HTTP ${res.status}` };
        let data;
        try { data = JSON.parse(await res.text()); } catch (e) { return { status: 'failed', message: 'API 返回非 JSON' }; }
        const bonus = data?.user?.dailyLoginBonusStatus;
        if (!bonus) return { status: 'skip', message: '未找到每日登录奖励数据' };
        const { streak = 0, cycleDay = 0, daysInCycle = 7, nextPoints = 0, progressPercent = 0 } = bonus;
        if (bonus.claimedToday) {
            const t = parseDirtyBytesLastClaim(bonus.lastClaim);
            const last = t ? fmtClock(t.getTime()) : '今日';
            return { status: 'already', message: `连续 ${streak} 天 · 周期 ${cycleDay}/${daysInCycle} · 进度 ${progressPercent}% · 下次 +${nextPoints}p · 上次 ${last}` };
        }
        return { status: 'available', message: `待登录发放 · 连续 ${streak} 天 · 下次 +${nextPoints}p` };
    } catch (e) { return { status: 'failed', message: `异常：${e.message || e}` }; }
};

const MULTI_TASK_SITES = new Set(['0dayfiles.net', 'polishtorrent.top', 'myfunzone.org', 'yu-scene.net']);
const TAB_ONLY_HANDLERS = new Set(['czteam', 'seedcore', 'retrotoon', '0dayfiles', 'digitalcore', 'myfunzone', 'polishtorrent', 'filelist']);
const AUTO_SCAN_CFG = { failureThreshold: 3, intervalBetween: 2500, maxPerRun: 100 };

const SEL_UNCLAIMED = '.events__prize-icon--today-unclaimed';
const SEL_CLAIMED   = '.events__prize-icon--today-claimed';
const SEL_FUTURE    = '.events__prize-icon--future';
const ACTIVITY_PATH_RE = /^\/(events|giveaways)\/(\d+)\/?$/;
const ACTIVITY_LIST_RE = /^\/(events|giveaways)\/?$/;
const ADMIN_PATH_RE    = /^\/(admin|staff|moderat|manage|acp|mcp|control-?panel)\//i;

let isAutoScanRunning = false, isSequentialRunning = false;
let listenersRegistered = false;
const _timers = { spin: null, attendance: null, yuscene: null };

const PTLog = CORE.createLogger({ tag: LOG, host: HOST });
const log = PTLog.log, logWarn = PTLog.warn, logError = PTLog.error;
const flushLog = PTLog.flush;
// pt-core 的 openTab(key, url, active) 只接受 3 个参数且固定 insert:true；
// 这里包一层，支持真正的后台静默插入，并复用 core 的 tabRegistry / closeTab。
function openTabQ(key, url, active = false) {
    let tab;
    try { tab = GM_openInTab(url, { active: !!active, insert: false }); }
    catch (e) { tab = GM_openInTab(url, { active: !!active }); }
    if (active) window._pt_current_tab = tab;
    tabRegistry[key] = tab;
    return tab;
}

const _allLogHosts = () => new Set([...Object.keys(ALL_KNOWN_SITES), HOST]);
const exportLogs = () => PTLog.exportAll(_allLogHosts());
const clearLogs  = () => PTLog.clearAll(_allLogHosts());

// ==========================================
// 优化：带伪装的、支持指数退避重试的网络请求
// ==========================================
async function robustFetch(url, opts = {}, timeout = 0, retries = 3) {
    // 兼容旧调用 robustFetch(url, opts, timeout, retries)：原先这两个位置参数被静默丢弃
    const maxRetries = Math.max(1, retries | 0);
    const base = timeout ? { ...opts, timeout } : opts;
    for (let attempt = 1; ; attempt++) {
        try {
            const headers = { ...DEFAULT_HEADERS, ...(base.headers || {}) };
            if (!headers['User-Agent']) headers['User-Agent'] = navigator.userAgent;
            const res = await gmFetch(url, { ...base, headers });
            // 429/503 视为限速：还有重试机会就退避重试，最后一次把响应交给调用方判定
            if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
                throw new Error(`RateLimited_${res.status}`);
            }
            return res;
        } catch (e) {
            if (attempt >= maxRetries) throw e;
            const delay = 2 ** attempt * 1000 + Math.random() * 500;
            log(`[Fetch] ${url} 请求异常或限速，${delay.toFixed(0)}ms 后重试 (${attempt}/${maxRetries})...`);
            await sleep(delay);
        }
    }
}

window.addEventListener('error', e => {
    if (!e || !e.message) return;
    // 屏蔽 seedpool 站点自身的 Livewire/JS 报错
    if (HOST === 'seedpool.org' && /bookmark is not defined|button is not defined|icon is not defined|Cannot convert undefined/i.test(e.message)) return;
    logError('[Uncaught]', e.message, 'at', `${e.filename || '?'}:${e.lineno || 0}:${e.colno || 0}`);
});
window.addEventListener('unhandledrejection', e => {
    const r = e && e.reason;
    const msg = (r && (r.stack || r.message)) || String(r);
    // 屏蔽 seedpool 站点的 ethers CDN 获取失败报错
    if (HOST === 'seedpool.org' && /ethers@6\.13\.2/i.test(msg)) return;
    logError('[Unhandled Promise]', msg);
});

const isOnEventPage = () => /^\/(events|giveaways)\/\d+/.test(location.pathname);
const gmSet = (key, value) => GM_setValue(key, { v: value, ts: Date.now() });
function gmGet(key, ttl = 0, dflt = null) {
    const r = GM_getValue(key, null);
    if (!r || typeof r !== 'object' || !r.ts || !('v' in r)) return dflt;
    if (ttl > 0 && Date.now() - r.ts > ttl) return dflt;
    return r.v;
}

function getSiteToday(host = HOST) {
    const tz = SITE_TIMEZONE[host];
    if (tz) {
        try {
            return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        } catch (e) { log(`[TZ] 无效时区 ${tz}，回退 UTC+8`); }
    }
    return new Date(Date.now() + 8 * HOUR).toISOString().slice(0, 10);
}
const TODAY = getSiteToday(HOST);

const attendanceDone = () => (Date.now() - GM_getValue(ATTENDANCE_LAST_CONFIRMED_KEY, 0)) < ATTENDANCE_COOLDOWN;
const markAttendanceConfirmed = () => GM_setValue(ATTENDANCE_LAST_CONFIRMED_KEY, Date.now());
// 南瓜元素常驻但点不出奖励时，只靠 20h 冷却兜不住：加"当日尝试上限 + 间隔"，避免每开一个页面就重开一次南瓜 tab
const PUMPKIN_MAX_ATTEMPTS = 3, PUMPKIN_RETRY_GAP = 30 * MIN;
const pumpkinAttempts = () => {
    const a = GM_getValue(PUMPKIN_ATTEMPT_KEY, null);
    if (!a || typeof a !== 'object') return { date: '', n: 0, ts: 0 };
    return { date: a.date || '', n: Number(a.n) || 0, ts: Number(a.ts) || 0 };
};
const pumpkinAttemptsToday = () => {
    const a = pumpkinAttempts();
    return a.date === getSiteToday('yu-scene.net') ? a.n : 0;
};
function bumpPumpkinAttempt() {
    const a = pumpkinAttempts(), today = getSiteToday('yu-scene.net');
    const n = (a.date === today ? a.n : 0) + 1;
    GM_setValue(PUMPKIN_ATTEMPT_KEY, { date: today, n, ts: Date.now() });
    return n;
}
const pumpkinDone = () => {
    if (GM_getValue(PUMPKIN_RETIRED_KEY, false) === true) return true;
    if (pumpkinAttemptsToday() >= PUMPKIN_MAX_ATTEMPTS) return true;
    const last = GM_getValue(PUMPKIN_LAST_CLAIM_KEY, 0);
    return !!last && Date.now() - last < PUMPKIN_COOLDOWN;
};
/** 还能不能再试一次：未完成、今日未超限、距上次尝试已过间隔 */
const pumpkinRetryable = () => {
    if (pumpkinDone()) return false;
    const a = pumpkinAttempts();
    return !a.ts || Date.now() - a.ts >= PUMPKIN_RETRY_GAP;
};
/** 站点给的"下次可领"时间戳做合理性钳制：必须晚于现在，且不超过 maxHours（防秒/毫秒/时区误判把冷却放大成几天） */
function saneNextTs(ts, maxHours = 26) {
    const now = Date.now();
    if (!ts || !isFinite(ts) || ts <= now + 30 * 1000) return 0;
    const cap = now + maxHours * HOUR;
    if (ts > cap) {
        log(`[Next] 站点给的冷却时间异常（${new Date(ts).toISOString()}，约 ${remainMin(ts)} 分钟后），按 ${maxHours}h 兜底`);
        return cap;
    }
    return ts;
}

function setPendingEvents(host, paths) { GM_setValue(PENDING_EVENTS_PREFIX + host, { paths: [...paths], ts: Date.now() }); }
function getPendingEvents(host) {
    const v = GM_getValue(PENDING_EVENTS_PREFIX + host, null);
    if (!v || !Array.isArray(v.paths) || !v.ts) return [];
    if (Date.now() - v.ts > PENDING_EVENTS_TTL) { GM_deleteValue(PENDING_EVENTS_PREFIX + host); return []; }
    return v.paths;
}
const clearPendingEvents = host => GM_deleteValue(PENDING_EVENTS_PREFIX + host);
function removePendingEvent(host, path) {
    const paths = getPendingEvents(host).filter(p => p !== path);
    if (!paths.length) clearPendingEvents(host); else setPendingEvents(host, paths);
}

function getCollectedRewards(host) {
    let rewards = {};
    try {
        const saved = GM_getValue(MULTI_EVENT_REWARDS_KEY + host, null);
        if (Array.isArray(saved)) saved.forEach((r, i) => rewards['_old_' + i] = r);
        else if (saved && typeof saved === 'object') rewards = saved;
    } catch (e) {}
    try {
        const saved = sessionStorage.getItem(MULTI_EVENT_REWARDS_KEY + host);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) parsed.forEach((r, i) => rewards['_sess_' + i] = r);
            else if (parsed && typeof parsed === 'object') Object.assign(rewards, parsed);
        }
    } catch (e) {}
    return rewards;
}
function setCollectedRewards(host, rewards) {
    GM_setValue(MULTI_EVENT_REWARDS_KEY + host, rewards);
    try { sessionStorage.setItem(MULTI_EVENT_REWARDS_KEY + host, JSON.stringify(rewards)); } catch (e) {}
}
function clearCollectedRewards(host) {
    GM_deleteValue(MULTI_EVENT_REWARDS_KEY + host);
    try { sessionStorage.removeItem(MULTI_EVENT_REWARDS_KEY + host); } catch (e) {}
}
function addCollectedReward(host, path, text) {
    if (!text) return;
    const rewards = getCollectedRewards(host);
    rewards[path] = text;
    setCollectedRewards(host, rewards);
}

const keyFor = (host, suffix) => STATUS_PREFIX + host + (suffix ? '_' + suffix : '');
function setSiteStatus(host, status, suffix) {
    let finalStatus = status;
    // 优化：针对多任务站点剥离状态
    if (MULTI_TASK_SITES.has(host) && !suffix) {
        const isSubTask = location.pathname === '/attendance' || location.pathname === '/spin-wheel' || location.pathname === '/spin';
        const subKey = keyFor(host, 'sub');
        let sub = GM_getValue(subKey, {});
        if (isSubTask) {
            const subType = location.pathname.includes('attendance') ? 'attendance' : 'spin';
            sub[subType] = status.status;
            GM_setValue(subKey, sub);
        }
        finalStatus = { ...status, sub };
    }

    const skey = keyFor(host, suffix);
    const prev = GM_getValue(skey, null);
    GM_setValue(skey, { status: finalStatus.status, message: finalStatus.message || '', ts: Date.now(), url: location.href, sub: finalStatus.sub });
    if (!prev || prev.status !== finalStatus.status || (prev.message || '') !== (finalStatus.message || '')) {
        log(`[Status] ${host}${suffix ? '/' + suffix : ''} → ${finalStatus.status}${finalStatus.message ? '：' + finalStatus.message : ''}`);
    }

    if (suffix) return;
    if (['claimed', 'already', 'available', 'notopen', 'maintenance'].includes(status.status)) {
        resetFailure(host);
        if (getAutoDemoted().includes(host)) removeFromDemoted(host);
        if (KNOWN_INACTIVE[host]) promoteSite(host);
        return;
    }
    if (FAIL_STATUSES.includes(status.status)) {
        if (MULTI_TASK_SITES.has(host)) return;
        if (KNOWN_INACTIVE[host] || getAutoDemoted().includes(host)) return;
        const n = incrementFailure(host);
        if (n >= AUTO_SCAN_CFG.failureThreshold) addToDemoted(host, `连续 ${n} 次失败：${status.message || status.status}`);
    }
}
function getSiteStatus(host, suffix) {
    const s = GM_getValue(keyFor(host, suffix), null);
    if (!s || !s.ts || !s.status) return { status: 'pending', message: '' };
    return s;
}
const setPumpkinStatus = (status, message) => setSiteStatus(HOST, { status, message }, 'pumpkin');
const getPumpkinStatus = () => getSiteStatus(HOST, 'pumpkin');

const YUSCENE_WHEEL_OK = ['claimed', 'already', 'empty'];
const yusceneWheelDone = () => { const st = getSiteStatus('yu-scene.net'); return YUSCENE_WHEEL_OK.includes(st.status) && !!st.ts && Date.now() - st.ts < DAY; };

const getFailureCount = host => { const n = GM_getValue(FAILURE_KEY_PREFIX + host, 0); return typeof n === 'number' ? n : 0; };
const incrementFailure = host => { const n = getFailureCount(host) + 1; GM_setValue(FAILURE_KEY_PREFIX + host, n); return n; };
const resetFailure = host => GM_setValue(FAILURE_KEY_PREFIX + host, 0);

const getAutoDemoted = () => { const a = GM_getValue(DEMOTED_KEY, []); return Array.isArray(a) ? a : []; };
const setAutoDemoted = a => GM_setValue(DEMOTED_KEY, a);
function addToDemoted(host, reason) {
    const a = getAutoDemoted();
    if (!a.includes(host)) { a.push(host); setAutoDemoted(a); }
    GM_setValue(DEMOTE_REASON_KEY + host, reason);
}
function removeFromDemoted(host) {
    const a = getAutoDemoted();
    const n = a.filter(h => h !== host);
    if (n.length !== a.length) setAutoDemoted(n);
    GM_deleteValue(DEMOTE_REASON_KEY + host);
}
const getDemoteReason = host => GM_getValue(DEMOTE_REASON_KEY + host, '连续失败已自动降级');

const getPromoted = () => { const a = GM_getValue(PROMOTED_KEY, []); return Array.isArray(a) ? a : []; };
const setPromoted = a => GM_setValue(PROMOTED_KEY, a);
function promoteSite(host) {
    if (!KNOWN_INACTIVE[host]) return;
    const a = getPromoted();
    if (!a.includes(host)) { a.push(host); setPromoted(a); }
}
const demoteSite = host => setPromoted(getPromoted().filter(h => h !== host));

/** 维护暂停且尚未到期的站点 */
const getPausedSites = () => Object.keys(SITE_PAUSED).filter(h => (SITE_PAUSED[h].until || 0) > Date.now());
/** 旧域名下线后清掉它的状态/失败计数/降级记录，避免面板里留幽灵条目（只跑一次） */
function migrateRenamedSites() {
    const flag = 'pt_migrate_v1105';
    if (GM_getValue(flag, false) === true) return;
    for (const oldH of Object.keys(SITE_OVERRIDES)) {
        if (SITE_OVERRIDES[oldH] !== null) continue;
        GM_deleteValue(keyFor(oldH));
        GM_deleteValue(FAILURE_KEY_PREFIX + oldH);
        GM_deleteValue(EVENT_PATH_CACHE_PREFIX + oldH);
        clearPendingEvents(oldH);
        removeFromDemoted(oldH);
        log(`[Migrate] 旧域名 ${oldH} 的本地记录已清理`);
    }
    GM_setValue(flag, true);
}

function siteSets() {
    const promoted = getPromoted(), demoted = getAutoDemoted(), paused = getPausedSites();
    const active = { ...SITES };
    for (const h of demoted) delete active[h];
    for (const h of paused) delete active[h];
    for (const h of promoted) if (KNOWN_INACTIVE[h]) active[h] = KNOWN_INACTIVE[h];
    const inactive = {};
    for (const h of Object.keys(KNOWN_INACTIVE)) if (!promoted.includes(h)) inactive[h] = KNOWN_INACTIVE[h];
    for (const h of demoted) inactive[h] = { reason: getDemoteReason(h), autoDemoted: true };
    for (const h of paused) inactive[h] = { reason: SITE_PAUSED[h].reason, paused: true };
    const scan = new Set([
        ...Object.keys(SITES).filter(h => !demoted.includes(h) && !paused.includes(h)),
        ...Object.keys(KNOWN_INACTIVE).filter(h => !promoted.includes(h)),
        ...demoted,
    ]);
    return { promoted, demoted, active, inactive, scan };
}
const getActiveSites = () => siteSets().active;
const getInactiveOnly = () => siteSets().inactive;

function needsRecheck(host) {
    const s = GM_getValue(keyFor(host), null);
    if (!s || !s.ts || !s.status) return true;
    if (s.status === 'timeout') return Date.now() - s.ts > TIMEOUT_COOLDOWN;
    if (s.status === 'failed')  return Date.now() - s.ts > FAILED_COOLDOWN;
    if (['claimed', 'already', 'inactive', 'notopen', 'maintenance', 'auth'].includes(s.status)) return Date.now() - s.ts > TTL_RECHECK;
    return true;
}

const cacheKeyFor = host => EVENT_PATH_CACHE_PREFIX + host;
const PATH_SOURCES = ['remote-hint', 'local-hint', 'probe-unclaimed', 'probe-claimed', 'config', 'local'];
function getCachedEventPath(host) {
    const c = GM_getValue(cacheKeyFor(host), null);
    if (!c || !c.path || !c.ts) return null;
    if (Date.now() - c.ts >= TTL_EVENT_PATH) return null;
    if (!PATH_SOURCES.includes(c.source)) return null;
    return c.path;
}
const setCachedEventPath = (host, path, source = 'unknown') => GM_setValue(cacheKeyFor(host), { path, source, ts: Date.now() });
const clearCachedEventPath = host => GM_deleteValue(cacheKeyFor(host));

// 每个页面一个 owner 标识：只释放自己拿到的锁，避免页面刷新/多标签互相删锁
const LOCK_OWNER = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
function tryAcquireTaskLock(type) {
    const existing = GM_getValue(TASK_LOCK_KEY, null);
    if (existing && existing.ts && (Date.now() - existing.ts) < TASK_LOCK_TTL) {
        log(`[TaskLock] 已有任务运行中（${existing.type || '?'}，${Math.round((Date.now() - existing.ts) / 1000)}s 前），跳过本次 ${type}`);
        return false;
    }
    GM_setValue(TASK_LOCK_KEY, { type, ts: Date.now(), owner: LOCK_OWNER });
    return true;
}
function releaseTaskLock() {
    const cur = GM_getValue(TASK_LOCK_KEY, null);
    if (cur && cur.owner && cur.owner !== LOCK_OWNER) return; // 不是自己的锁，别删
    GM_deleteValue(TASK_LOCK_KEY);
}
function isTaskLocked() {
    const existing = GM_getValue(TASK_LOCK_KEY, null);
    if (!existing || !existing.ts) return false;
    if (Date.now() - existing.ts > TASK_LOCK_TTL) { GM_deleteValue(TASK_LOCK_KEY); return false; }
    return true;
}

window.addEventListener('beforeunload', () => {
    if (isAutoScanRunning || isSequentialRunning) {
        releaseTaskLock();
    }
});

const markAutoTab = () => {
    try { sessionStorage.setItem(AUTO_TAB_SESSION_KEY, JSON.stringify({ ts: Date.now(), from: location.hash || 'unknown' })); } catch (e) {}
};
function isAutoOpenedTab() {
    try {
        const raw = sessionStorage.getItem(AUTO_TAB_SESSION_KEY);
        if (!raw) return false;
        if (raw === '1') { sessionStorage.removeItem(AUTO_TAB_SESSION_KEY); return false; }
        const d = JSON.parse(raw);
        if (!d || typeof d.ts !== 'number') return false;
        if (Date.now() - d.ts > AUTO_TAB_TTL) { sessionStorage.removeItem(AUTO_TAB_SESSION_KEY); return false; }
        return true;
    } catch (e) { return false; }
}
function closeSelf() {
    const auto = isAutoOpenedTab();
    log(`[CloseSelf] host=${HOST} autoOpenedTab=${auto}`);
    if (!auto) return;
    try { flushLog(); } catch (e) {}
    if (GM_getValue(DEBUG_KEEP_TAB_KEY, false)) return;
    setTimeout(() => {
        try {
            if (window._pt_current_tab && typeof window._pt_current_tab.close === 'function') {
                window._pt_current_tab.close();
                window._pt_current_tab = null;
                return;
            }
            // 尝试通过 opener 关闭
            if (window.opener && !window.opener.closed) {
                try { window.opener.postMessage({ type: 'pt-close-tab', host: HOST }, '*'); } catch (e) {}
            }
            // 尝试直接关闭
            window.close();
            // 兜底：若 1 秒后页面仍未关闭（说明浏览器拒绝了），在页面右上角显示关闭提示
            setTimeout(() => {
                if (document.body && !document.getElementById('pt-close-tip')) {
                    const tip = document.createElement('div');
                    tip.id = 'pt-close-tip';
                    tip.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;background:#2a2a2a;color:#ffb266;padding:12px 20px;border-radius:8px;font-size:14px;box-shadow:0 4px 16px rgba(0,0,0,0.6);cursor:pointer;border:1px solid #ffb266;';
                    tip.textContent = '✅ 任务已完成，点击此处关闭页面';
                    tip.onclick = () => { try { window.close(); } catch(e) {} tip.remove(); };
                    document.body.appendChild(tip);
                }
            }, 1000);
        } catch (e) {}
    }, 2000);
}

window.addEventListener('message', e => {
    if (!e.data || e.data.type !== 'pt-close-tab' || !e.data.host) return;
    const host = e.data.host;
    // 匹配 host 及带 hash 后缀的 tabKey（例如 'yu-scene.net#pumpkin'）
    const keysToClose = Object.keys(tabRegistry).filter(k => k === host || k.startsWith(host + '#'));
    for (const key of keysToClose) {
        const tab = tabRegistry[key];
        if (tab && typeof tab.close === 'function') {
            try { tab.close(); delete tabRegistry[key]; log(`[TabRegistry] 已关闭 ${key}`); } catch (err) {}
        }
    }
});

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_CN = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
const MONTH_INDEX = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };

/**
 * 站点"今天"的候选日期。
 * 58 个站点里只有 32 个配了时区，其余回退 UTC+8；对欧美站点，在 UTC+8 的凌晨
 * 会比站点本地日期早一天，导致"今日活动"被判成已过期。这里对没配时区的站点
 * 同时接受 UTC+8 与 UTC 两个日期（两者最多差一天）。
 */
function siteTodayCandidates(host = HOST) {
    const t = getSiteToday(host);
    if (SITE_TIMEZONE[host]) return [t];
    const utc = new Date().toISOString().slice(0, 10);
    return utc === t ? [t] : [t, utc];
}

function findTodayArticle(root = document, host = HOST) {
    const labels = new Set();
    for (const date of siteTodayCandidates(host)) {
        const [, m, d] = date.split('-').map(Number);
        labels.add(`${MONTH_ABBR[m - 1]} ${d}`);
        labels.add(`${d} ${MONTH_CN[m - 1]}`);
    }
    for (const art of root.querySelectorAll('article.events__prize')) {
        const h = art.querySelector('.events__prize-heading');
        if (!h) continue;
        if (labels.has(h.textContent.trim())) return art;
    }
    const unclaimed = root.querySelector(SEL_UNCLAIMED);
    if (unclaimed) return unclaimed.closest('article') || unclaimed.closest('.panelV2') || unclaimed.closest('form')?.parentElement || unclaimed.parentElement;
    const claimed = root.querySelector(SEL_CLAIMED);
    if (claimed) return claimed.closest('article') || claimed.closest('.panelV2') || claimed.parentElement;
    const claimForm = root.querySelector('form[action*="/claims"]');
    if (claimForm) return claimForm.closest('article') || claimForm.parentElement;
    return null;
}

function articleState(article) {
    if (!article) return 'none';
    const icon = article.querySelector('.events__prize-icon');
    if (!icon) return 'none';
    if (icon.classList.contains('events__prize-icon--today-claimed')) return 'claimed';
    if (icon.classList.contains('events__prize-icon--today-unclaimed')) return 'unclaimed';
    if (icon.classList.contains('events__prize-icon--future')) return 'future';
    return 'none';
}

function messagesOf(article) {
    if (!article) return [];
    return [...article.querySelectorAll('.events__prize-message')]
        .map(m => m.textContent.trim().replace(/\s+/g, ' '))
        .filter(Boolean);
}

function extractRewardText() {
    const art = findTodayArticle(document, HOST);
    if (!art) return '';
    if (articleState(art) !== 'claimed') return '';
    return messagesOf(art).join('，');
}

function extractRetroToonReward() {
    const clean = s => (s || '').replace(/[\u2713\u2714]/g, '').replace(/\s+/g, ' ').trim().replace(/^\+\s*/, '');
    const dayNum = String(Number(getSiteToday('retrotoon.world').split('-')[2]));
    for (const cell of document.querySelectorAll('.att-cal-cell--claimed, .att-cal-cell--today')) {
        const b = cell.querySelector('b');
        if (b && b.textContent.trim() === dayNum) {
            const tag = cell.querySelector('.att-cal-claimed-tag');
            if (tag) return clean(tag.textContent);
        }
    }
    const tags = document.querySelectorAll('.att-cal-claimed-tag');
    return tags.length ? clean(tags[tags.length - 1].textContent) : '';
}

const parseCzBalance = t => parseFloat(String(t || '').replace(/,/g, '')) || 0;
function getCzCurrentBalance() {
    const g = document.querySelector('.gift-hero .balance b');
    if (g) return parseCzBalance(g.textContent);
    const s = document.querySelector('.cz-stats a[href="bonus.php"] b');
    return s ? parseCzBalance(s.textContent) : 0;
}
function buildCzMessage(beforeBal) {
    const after = getCzCurrentBalance();
    if (beforeBal != null && after > 0 && after >= beforeBal) {
        const diff = after - beforeBal;
        if (diff > 0) return `${diff.toFixed(2)} bonus points`;
    }
    return '今日礼物已领取';
}
function getSeedcoreBalance() {
    const clean = el => {
        if (!el) return 0;
        const c = el.cloneNode(true);
        const i = c.querySelector('i');
        if (i) i.remove();
        return parseFloat(String(c.textContent).replace(/[,\s]/g, '')) || 0;
    };
    return {
        pts: clean(document.querySelector('.ratio-bar__points a')),
        tok: clean(document.querySelector('.ratio-bar__tokens a')),
    };
}
function buildSeedcoreBubbleMessage() {
    let before = gmGet(SEEDCORE_BUBBLE_BEFORE, TTL_SNAPSHOT);
    if (!before || typeof before !== 'object' || before.pts === undefined) {
        try {
            const raw = sessionStorage.getItem(SEEDCORE_BUBBLE_BEFORE);
            if (raw) {
                const { v, ts } = JSON.parse(raw);
                if (v && ts && Date.now() - ts < TTL_SNAPSHOT && v.pts !== undefined) before = v;
            }
        } catch (e) {}
    }
    if (!before || typeof before !== 'object' || before.pts === undefined) return '';
    const dateBefore = gmGet(SEEDCORE_DATE_BEFORE, TTL_SNAPSHOT);
    const final = getSeedcoreBalance();
    let bubblePts, bubbleTok;
    if (dateBefore && typeof dateBefore === 'object' && dateBefore.pts !== undefined) {
        bubblePts = Math.round((dateBefore.pts || 0) - (before.pts || 0));
        bubbleTok = Math.round((dateBefore.tok || 0) - (before.tok || 0));
    } else {
        bubblePts = Math.round((final.pts || 0) - (before.pts || 0));
        bubbleTok = Math.round((final.tok || 0) - (before.tok || 0));
    }
    const parts = [];
    const push = (label, pts, tok) => {
        if (pts <= 0 && tok <= 0) return;
        const sub = [];
        if (pts > 0) sub.push(`${pts} 魔力`);
        if (tok > 0) sub.push(`${tok} 免费令`);
        parts.push(`${label}：+${sub.join(' + ')}`);
    };
    push('气泡', bubblePts, bubbleTok);
    return parts.join(' · ');
}

function checkEventList(doc, host) {
    const anyDateRe = new RegExp(`\\b(${MONTH_ABBR.join('|')})\\s*\\d+`, 'i');
    // 每个候选日期一套 "Nov 14" / "14 Nov" / "Nov 14th" 正则
    const mats = siteTodayCandidates(host).map(date => {
        const [, m, d] = date.split('-').map(Number);
        const mon = MONTH_ABBR[m - 1];
        return {
            date,
            re: [new RegExp(`\\b${mon}\\s*${d}(?:st|nd|rd|th)?\\b`, 'i'),
                 new RegExp(`\\b${d}(?:st|nd|rd|th)?\\s*${mon}\\b`, 'i')],
        };
    });
    const isToday = text => mats.some(x => x.re[0].test(text) || x.re[1].test(text));
    const inRange = (start, end) => mats.some(x => x.date >= start && x.date <= end);
    const isFuture = start => mats.every(x => start > x.date);

    let hasAnyEvent = false, hasFuture = false;
    const todayPaths = [], allPaths = new Set();

    for (const a of doc.querySelectorAll('a[href*="/events/"], a[href*="/giveaways/"]')) {
        const rawHref = a.getAttribute('href');
        if (!rawHref) continue;
        let p = rawHref;
        try { p = new URL(rawHref, location.origin).pathname; } catch (e) {}
        const match = p.match(ACTIVITY_PATH_RE);
        if (!match) continue;
        const path = `/${match[1]}/${match[2]}`;
        allPaths.add(path);

        const container = a.closest('tr') || a.closest('li') || a.closest('div') || a.parentElement;
        if (!container) continue;
        const text = container.textContent || '';
        const times = [...container.querySelectorAll('time[datetime]')].map(t => t.getAttribute('datetime') || '');

        if (times.length) {
            hasAnyEvent = true;
            const start = times[0].slice(0, 10);
            const end = (times[1] || '').slice(0, 10);
            if (end) {
                if (start && inRange(start, end)) todayPaths.push(path);
                else if (start && isFuture(start)) hasFuture = true;
            } else if (mats.some(x => start.startsWith(x.date))) todayPaths.push(path);
            else if (isFuture(start)) hasFuture = true;
        } else if (isToday(text)) {
            hasAnyEvent = true;
            todayPaths.push(path);
        } else if (anyDateRe.test(text)) {
            hasAnyEvent = true;
        }
    }

    // 兜底：页面完全没有活动链接（纯卡片渲染）
    if (!allPaths.size) {
        if (ACTIVITY_PATH_RE.test(location.pathname)) {
            if (doc.querySelector(SEL_UNCLAIMED)) return { paths: [location.pathname], source: 'local-hint' };
        } else if (isToday(doc.body?.innerText || '')) {
            return { paths: ['/events'], source: 'remote-hint' };
        }
    }

    if (hasAnyEvent) {
        if (todayPaths.length) return { paths: todayPaths, source: 'remote-hint' };
        if (hasFuture) return { status: 'notopen', message: '今日无活动，有未来预告' };
        return { status: 'inactive', message: '活动已全部过期' };
    }
    if (allPaths.size) return { paths: [...allPaths], source: 'remote-hint' };
    return { status: 'inactive', message: '活动列表为空' };
}

const ACTIVITY_ICON_RE = /\bfa-(gift|calendar|calendar-star|calendar-check|calendar-day|star|bell|coin|coins|trophy|award|check-circle|hand-holding-heart|seedling)\b/i;
const ACTIVITY_ANIM_RE = /\b(fa-beat|fa-beat-fade|fa-fade|fa-pulse|fa-spin|fa-bounce|fa-shake|animate-pulse|animate-bounce|animate-ping|blink|pulse-dot|dot-blink)\b/i;
const ACTIVITY_HREF_RE = /\/(events?|giveaways?|daily|reward|bonus|check-?in|sign-?in|gift|claim|attendance)\b/i;
const ACTIVITY_NEGATIVE_RE = /(admin|staff|moderat|manage|dashboard|acp|mcp|control-?panel|notification|message|conversation|inbox|ticket|support|donate|公告|通知|消息|私信|工单|悬赏|request)/i;
const ACTIVITY_TEXT_HINTS = ['每日奖励','每日签到','签到','每日礼物','领取奖励','活动','Daily Reward','Daily Login','Daily Bonus','Daily Gift','Claim','Claim Reward','Check-in','Check in','Attendance'];
const scoreHint = r => (r.includes('svg-animate') ? 10 : 0) + (r.includes('text') ? 8 : 0) + (r.includes('icon') ? 5 : 0)
    + (r.includes('child-anim') ? 4 : 0) + (r.includes('self-anim') ? 4 : 0) + (r.includes('href') ? 3 : 0) + (r.includes('badge') ? 2 : 0);

function hintToEventPath(hint, base = location.origin) {
    if (!hint) return null;
    const raw = typeof hint === 'string' ? hint : (hint.href || hint.getAttribute?.('href') || '');
    if (!raw) return null;
    let u, baseOrigin;
    try { u = new URL(raw, base); baseOrigin = new URL(base).origin; } catch (e) { return null; }
    if (u.origin !== baseOrigin) return null;
    const m = u.pathname.match(ACTIVITY_PATH_RE);
    return m ? `/${m[1]}/${m[2]}` : null;
}

function detectActivityHints(root, base = location.origin) {
    const hits = new Map();
    let host = HOST;
    try { host = new URL(base).hostname.replace(/^www\./, ''); } catch (e) {}
    const siteCfg = ALL_KNOWN_SITES[host];
    if (siteCfg && siteCfg.activitySelector) {
        const el = root.querySelector(siteCfg.activitySelector);
        if (el) {
            const a = el.closest('a[href]') || (el.tagName === 'A' ? el : null);
            if (a) return [{ href: a.getAttribute('href'), base, reasons: ['site-custom'], score: 100, el: a }];
        }
    }
    let baseOrigin = location.origin;
    try { baseOrigin = new URL(base).origin; } catch (e) {}
    for (const a of root.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href') || '';
        let absHref = '';
        try { absHref = new URL(href, base).href; } catch (e) { continue; }
        if (!absHref.startsWith(baseOrigin)) continue;
        const cls = a.getAttribute('class') || '';
        if (ACTIVITY_NEGATIVE_RE.test(href) || ACTIVITY_NEGATIVE_RE.test(cls)) continue;
        const inNav = !!a.closest('header, nav, .top-nav, .sidebar, aside, .menu, .navbar, .secondary-nav, .breadcrumbsV2, .navigation');
        const hrefMatch = ACTIVITY_HREF_RE.test(href);
        if (!inNav && !hrefMatch) continue;
        const reasons = [];
        if (a.querySelector('svg animate, svg animateTransform')) reasons.push('svg-animate');
        if (ACTIVITY_ANIM_RE.test(cls)) reasons.push('self-anim');
        for (const child of a.querySelectorAll('*')) {
            if (ACTIVITY_ANIM_RE.test(child.getAttribute('class') || '')) { reasons.push('child-anim'); break; }
        }
        if (a.querySelector('.badge, .dot, .indicator, .unread, [class*="badge"], [class*="dot"]')) reasons.push('badge');
        if (a.querySelector('i, svg, img') && (ACTIVITY_ICON_RE.test(a.innerHTML) || ACTIVITY_ICON_RE.test(cls))) reasons.push('icon');
        const textLower = (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (ACTIVITY_TEXT_HINTS.some(t => textLower.includes(t.toLowerCase()))) reasons.push('text');
        if (hrefMatch && inNav) reasons.push('href');
        if (reasons.length) {
            const prev = hits.get(absHref);
            if (!prev || prev.reasons.length < reasons.length) hits.set(absHref, { href: absHref, base, reasons, el: a });
        }
    }
    return [...hits.values()].map(h => ({ ...h, score: scoreHint(h.reasons) })).sort((a, b) => b.score - a.score);
}

function matchRewardTextScore(linkText, patterns) {
    const txt = (linkText || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!txt) return 0;
    let best = 0;
    for (const p of patterns) {
        const pat = p.toLowerCase();
        if (txt === pat) return 3;
        if (txt.startsWith(pat + ' ') || txt.endsWith(' ' + pat)) best = Math.max(best, 2);
        if (txt.includes(pat)) best = Math.max(best, 1);
    }
    return best;
}

// ==========================================
// 探测层
// ==========================================
async function loadEventPage(fetcher, url, host, opts) {
    let res;
    try { res = await fetcher(url, opts); }
    catch (e) { return { netError: e }; }
    if (res.status === 429) return { status: { status: 'failed', message: '请求被限速 (429)', rateLimited: true } };
    if (res.status === 404) return { status: { status: 'inactive', message: '详情页不存在 (404)' } };
    if (res.status >= 500) return { status: { status: 'maintenance', message: `服务器错误 (HTTP ${res.status})` } };
    if (!res.ok) return { httpError: true, httpStatus: res.status };
    if (res.redirected && ADMIN_PATH_RE.test(new URL(res.url || res.finalUrl).pathname)) {
        return { status: { status: 'skip', message: '详情页被重定向到后台' } };
    }
    const html = await res.text();
    const bad = classifyHtml(html);
    if (bad) return { status: bad };
    if (html.includes('scratch-card-component') || html.includes('scratch-card-root')) {
        return { status: { status: 'skip', message: '特殊活动页面（刮刮卡），跳过' } };
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const article = findTodayArticle(doc, host);
    return { html, doc, article, state: articleState(article) };
}

async function refreshTokenFrom(url) {
    try {
        const res = await robustFetch(url, { timeout: 6000 });
        if (!res.ok) return null;
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const input = doc.querySelector('form[action*="/claims"] input[name="_token"]') || doc.querySelector('meta[name="csrf-token"]');
        return input ? (input.value || input.content || null) : null;
    } catch (e) { return null; }
}

async function postClaimToken(postUrl, token, referer) {
    try {
        return await robustFetch(postUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': referer },
            data: `_token=${encodeURIComponent(token)}`,
            timeout: DIRECT_CLAIM_TIMEOUT,
        });
    } catch (e) {
        log(`[Claim] POST 异常: ${e.message || e}`);
        return null;
    }
}

async function submitClaimPost(action, token, referer, refreshToken) {
    const postUrl = new URL(action, location.origin).href;
    let res = await postClaimToken(postUrl, token, referer);
    if (res && res.status === 419) {
        log('[Claim] 419 会话过期，刷新 Token 重试…');
        const fresh = await refreshToken().catch(() => null);
        if (fresh) {
            res = await postClaimToken(postUrl, fresh, referer);
            log(`[Claim] 使用新 Token 重试结果: ${res ? res.status : 'no-response'}`);
        }
    }
    if (!res) { log(`[Claim] POST ${postUrl} 无响应`); return { ok: false, status: 0 }; }
    if (res.status === 429) return { ok: false, status: 429, rateLimited: true };
    if (!res.ok) { log(`[Claim] POST ${postUrl} → HTTP ${res.status}`); return { ok: false, status: res.status }; }

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const errorCopy = doc.getElementById('ERROR_COPY');
    if (errorCopy && errorCopy.textContent.includes('Event is not active')) {
        return { ok: false, status: res.status, serverError: 'Event is not active' };
    }

    const todayArt = findTodayArticle(doc, HOST);
    const isTodayClaimed = todayArt && todayArt.querySelector('.events__prize-icon--today-claimed');
    if (!isTodayClaimed) log(`[Claim] POST ${postUrl} 返回 ${res.status}，但页面没有"已领"标记（回退整页提交）`);

    return isTodayClaimed ? { ok: true, html } : { ok: false, status: res.status };
}

async function submitFormSafe(form) {
    const action = form.getAttribute('action');
    const tokenInput = form.querySelector('input[name="_token"]');
    if (!action || !tokenInput) return { ok: false };
    return submitClaimPost(action, tokenInput.value, location.href, () => refreshTokenFrom(location.href));
}

async function directClaimFromArticle(base, host, targetPath, article) {
    const form = article.querySelector('form[action*="/claims"]');
    if (!form) return null;
    const action = form.getAttribute('action');
    const tokenInput = form.querySelector('input[name="_token"]');
    if (!action || !tokenInput) return null;
    const referer = `${base}${targetPath}`;
    const res = await submitClaimPost(action, tokenInput.value, referer, () => refreshTokenFrom(referer));
    if (res.rateLimited) return 'rate-limited';
    if (!res.ok) return null;
    const doc = new DOMParser().parseFromString(res.html, 'text/html');
    return { text: messagesOf(findTodayArticle(doc, host)).join('，') };
}

async function probeEventPaths(host, base, allPaths) {
    const paths = allPaths.slice(0, 5);
    const availablePaths = [], alreadyMsgs = [], directRewards = [];
    let hasAlready = false, hasNotopen = false, directClaimedCount = 0, rateLimited = false;
    const details = await Promise.allSettled(paths.map(p =>
        loadEventPage((u, o) => robustFetch(u, o), `${base}${p}`, host, { timeout: 6000 })
        .then(r => {
            if (r.status && r.status.rateLimited) return { targetPath: p, rateLimited: true };
            if (r.status && r.status.status === 'skip') return null;
            return r.article ? { targetPath: p, article: r.article, state: r.state } : { targetPath: p, unknown: true };
        })
    ));
    for (const r of details) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        const v = r.value;
        if (v.rateLimited) { rateLimited = true; log(`[Probe] ${host} 429 限速，跳过本站剩余活动`); break; }
        if (v.unknown) { availablePaths.push(v.targetPath); continue; }
        const { targetPath, article, state } = v;
        if (state === 'unclaimed') {
            const claimed = await directClaimFromArticle(base, host, targetPath, article);
            if (claimed === 'rate-limited') { availablePaths.push(targetPath); break; }
            if (claimed) {
                directClaimedCount++;
                setCachedEventPath(host, targetPath, 'probe-unclaimed');
                if (claimed.text) { directRewards.push(claimed.text); addCollectedReward(host, targetPath, claimed.text); }
                log(`[DirectClaim] ${host} ${targetPath} 后台极速领取成功`);
            } else {
                availablePaths.push(targetPath);
            }
        } else if (state === 'claimed') {
            hasAlready = true;
            const text = messagesOf(article).join('，');
            if (text) { alreadyMsgs.push(text); addCollectedReward(host, targetPath, text); }
        } else if (state === 'future') {
            hasNotopen = true;
        }
    }
    if (availablePaths.length > 0) {
        setPendingEvents(host, availablePaths);
        setCachedEventPath(host, availablePaths[0], 'remote-hint');
        const msg = availablePaths.length > 1 ? `检测到 ${availablePaths.length} 个需开 tab 领取` : '检测到可领取';
        return { status: 'available', message: msg, eventPath: availablePaths[0] };
    }
    if (directClaimedCount > 0 || hasAlready) {
        const parts = [...alreadyMsgs, ...directRewards];
        return {
            status: directClaimedCount > 0 ? 'claimed' : 'already',
            message: parts.join('，') || (directClaimedCount > 0 ? '后台极速领取成功' : '今日已领'),
        };
    }
    if (rateLimited) return { status: 'timeout', message: '探测被限速 (429)，稍后重试' };
    if (hasNotopen) return { status: 'notopen', message: '今日未开放' };
    return { status: 'inactive', message: '无活动可领取' };
}

const REWARD_TEXT_PATTERNS_DEFAULT = ['Daily Reward'];

function probeErrorToStatus(e) {
    if (e && (e.name === 'AbortError' || /timeout/i.test(String(e.message || '')))) {
        return { status: 'timeout', message: '探测超时（站点可能离线/维护）' };
    }
    const msg = String((e && e.message) || e);
    if (isNetError(msg)) return { status: 'maintenance', message: `网络层异常：${msg.slice(0, 80)}` };
    return { status: 'failed', message: `探测异常：${msg}` };
}

// ==========================================
// 站点探针：不依赖当前页面 DOM，可在任意站点标签页里远程探测
// ==========================================
/** 统一校验响应：重定向登录 / 4xx-5xx / 维护页 → {status}；正常 → {html} */
async function readPage(res, path) {
    if (res.redirected && /\/(login|auth|signin)/i.test(new URL(res.finalUrl || res.url).pathname)) {
        return { status: { status: 'auth', message: '会话已过期' } };
    }
    const httpBad = httpStatusToResult(res, { auth: true });
    if (httpBad) return { status: httpBad };
    if (!res.ok) return { status: { status: 'failed', message: `GET ${path} → HTTP ${res.status}` } };
    const html = await res.text();
    const bad = classifyHtml(html);
    if (bad) return { status: bad };
    return { html };
}

/** 列表页 → {result}（有今日活动）/ {list,doc}（无活动，doc 供上层继续找线索）/ {error} */
async function probeEventsList(base, host, path) {
    let res;
    try { res = await robustFetch(`${base}${path}`, host === 'jme-reunit3d.de' ? { timeout: 40000 } : {}); }
    catch (e) { return { error: probeErrorToStatus(e) }; }
    const page = await readPage(res, path);
    if (page.status) return { error: page.status };
    const doc = new DOMParser().parseFromString(page.html, 'text/html');
    const list = checkEventList(doc, host);
    if (list.paths && list.paths.length) return { result: await probeEventPaths(host, base, list.paths) };
    return { list, doc };
}

/** 详情页探测（可选后台直领）：三个调用分支共用 */
async function probeDetail(base, host, path, { directClaim = false, cacheSource = null } = {}) {
    const detail = await loadEventPage((u, o) => robustFetch(u, o), `${base}${path}`, host);
    if (detail.netError) return { status: 'failed', message: 'fetch 详情页超时', eventPath: path };
    if (detail.httpError) return { status: 'failed', message: `GET ${path} → HTTP ${detail.httpStatus}`, eventPath: path };
    if (detail.status) return { ...detail.status, eventPath: path };
    if (!detail.article) return { status: 'inactive', message: '未找到今日格子', eventPath: path };
    if (cacheSource) setCachedEventPath(host, path, cacheSource);
    const text = messagesOf(detail.article).join('，');
    if (detail.state === 'claimed') {
        if (text) addCollectedReward(host, path, text);
        return { status: 'already', message: text || '今日已领', eventPath: path };
    }
    if (detail.state === 'future') return { status: 'notopen', message: '今日未开放', eventPath: path };
    if (detail.state === 'unclaimed' && directClaim) {
        const claimed = await directClaimFromArticle(base, host, path, detail.article);
        if (claimed === 'rate-limited') return { status: 'available', message: '限速，需开 tab', eventPath: path };
        if (claimed) {
            if (claimed.text) addCollectedReward(host, path, claimed.text);
            log(`[DirectClaim] ${host} ${path} 后台极速领取成功`);
            return { status: 'claimed', message: claimed.text || '后台极速领取成功', eventPath: path };
        }
    }
    if (detail.state === 'unclaimed') return { status: 'available', message: '检测到可领取', eventPath: path };
    return { status: 'skip', message: '状态未知', eventPath: path };
}

/** 只关心"有今日活动"的探针（myfunzone / polishtorrent / yu-scene 共用） */
async function probeEventsPage(host, base) {
    const r = await probeEventsList(base, host, '/events');
    return r.result || null;
}

// ---- 站点私有探针 ----
const v3xPost = url => robustFetch(url, {
    method: 'POST', credentials: 'include',
    headers: { 'Accept': '*/*', 'Origin': 'https://v3x.club', 'Referer': 'https://v3x.club/' },
});
const v3xReward = j => (j ? (j.reward ?? j.points ?? j.amount ?? j.value) : undefined);

async function v3xProbe() {
    try {
        const msgs = [];
        let claimed = false;
        const daily = await v3xPost('https://api.v3x.club/me/daily/claim-login');
        if (daily.status === 401 || daily.status === 403) return { status: 'auth', message: '需要登录' };
        if (daily.status === 200 || daily.status === 204) {
            let r;
            try { const t = (await daily.text()).trim(); if (t) r = v3xReward(JSON.parse(t)); } catch (e) {}
            msgs.push(r !== undefined && r !== null ? `签到：+${r}` : '签到：成功');
            claimed = true;
        } else if (daily.status === 400 || daily.status === 409) msgs.push('签到：今日已领');
        else msgs.push(`签到异常(${daily.status})`);

        const wheel = await v3xPost('https://api.v3x.club/me/wheel/spin');
        if (wheel.status === 200) {
            let label = '';
            try {
                const t = (await wheel.text()).trim();
                if (t) {
                    const j = JSON.parse(t);
                    if (j.ok) {
                        const r = v3xReward(j);
                        label = (r !== undefined && r !== null) ? `转盘：+${r}` : `转盘：${j.label || '成功'}`;
                    }
                }
            } catch (e) {}
            if (label) { msgs.push(label); claimed = true; } else msgs.push('转盘：已转');
        } else if (wheel.status === 400 || wheel.status === 409) msgs.push('转盘：今日已转');
        else msgs.push(`转盘异常(${wheel.status})`);
        return { status: claimed ? 'claimed' : 'already', message: msgs.join('，') };
    } catch (e) { return { status: 'failed', message: `异常：${e.message}` }; }
}

/** filelist 冷却文本 → 下次可转时间戳（探针与领取共用） */
function filelistCooldownTs(text) {
    const m = text.match(/Please check back again in\s*(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/i);
    if (!m) return 0;
    const n = i => parseInt(m[i] || '0', 10);
    return Date.now() + ((n(1) * 3600 + n(2) * 60 + n(3)) * 1000);
}
const FILELIST_ENDED_RE = /This event has ended|Please check again later/i;

async function filelistProbe() {
    try {
        const res = await robustFetch('https://filelist.io/spin.php', { timeout: 6000 });
        if (res.status >= 500) return { status: 'maintenance', message: `服务器错误 (HTTP ${res.status})` };
        if (!res.ok) return { status: 'failed', message: `GET /spin.php → HTTP ${res.status}` };
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const bodyText = doc.body?.innerText || '';
        if (FILELIST_ENDED_RE.test(bodyText)) return { status: 'inactive', message: '转盘活动已结束' };
        const nextTs = filelistCooldownTs(bodyText);
        if (nextTs) {
            GM_setValue(FILELIST_SPIN_NEXT_KEY, saneNextTs(nextTs, 26));
            return { status: 'already', message: cooldownText(GM_getValue(FILELIST_LAST_REWARD_KEY, '未知') || '未知', nextTs, false) };
        }
        if (doc.querySelector('#spin')) return { status: 'available', message: '转盘可领取' };
        return { status: 'skip', message: '未找到 Spin 按钮' };
    } catch (e) { return { status: 'failed', message: `异常：${e.message || e}` }; }
}

/** myfunzone 转盘状态（探针与领取共用同一套判定） */
function myfunzoneWheelState(doc) {
    const fab = doc.getElementById('dw-fab');
    const spinBtn = doc.getElementById('dw-spin');
    const fabReady = !!(fab && fab.querySelector('b') && parseInt(fab.querySelector('b').textContent) > 0);
    const btnReady = !!(spinBtn && !spinBtn.disabled && spinBtn.textContent.includes('SPIN THE WHEEL'));
    const done = !!(spinBtn && spinBtn.textContent.includes('SEE YOU TOMORROW')) || (!fab && !btnReady);
    return { fab, spinBtn, fabReady, btnReady, done };
}
async function myfunzoneWheelProbe() {
    try {
        const res = await robustFetch('https://myfunzone.org/', { timeout: 6000 });
        if (!res.ok) return { status: 'failed', message: `GET / → HTTP ${res.status}` };
        const s = myfunzoneWheelState(new DOMParser().parseFromString(await res.text(), 'text/html'));
        if (s.fabReady || s.btnReady) return { status: 'available', message: '转盘可领取' };
        if (s.done) return { status: 'already', message: '今日已领' };
        return { status: 'skip', message: '未找到转盘' };
    } catch (e) { return { status: 'failed', message: `异常：${e.message || e}` }; }
}

/** polishtorrent 转盘状态（探针与领取共用） */
function polishWheelState(doc) {
    const btn = doc.querySelector('#spinBtn');
    if (!btn) return { state: 'missing' };
    if (btn.hasAttribute('disabled') || btn.classList.contains('disabled')) {
        const last = doc.querySelector('.spin-already strong')?.textContent?.trim() || '';
        return { state: 'already', last };
    }
    return { state: 'available' };
}
async function polishtorrentWheelProbe() {
    try {
        const res = await robustFetch('https://polishtorrent.top/spin', { timeout: 6000 });
        if (!res.ok) return { status: 'failed', message: `GET /spin → HTTP ${res.status}` };
        const s = polishWheelState(new DOMParser().parseFromString(await res.text(), 'text/html'));
        if (s.state === 'missing') return { status: 'inactive', message: '未找到转盘按钮（页面结构可能已变化）' };
        if (s.state === 'already') return { status: 'already', message: s.last ? `今日已领 · 上次：${s.last}` : '今日转盘已领取' };
        return { status: 'available', message: '转盘可领取' };
    } catch (e) { return { status: 'failed', message: `异常：${e.message || e}` }; }
}

async function czteamProbe() {
    try {
        const res = await robustFetch('https://czteam.me/events.php', { timeout: 6000 });
        if (!res.ok) return { status: 'failed', message: `GET /events.php → HTTP ${res.status}` };
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const h2 = doc.querySelector('.gift-hero h2');
        if (h2 && /already opened/i.test(h2.textContent || '')) return { status: 'already', message: '今日礼物已领取' };
        if (doc.querySelector('button.gift-btn')) return { status: 'available', message: '礼物可领取' };
        if (doc.querySelector('.gift-locked')) return { status: 'already', message: '今日已领取' };
        return { status: 'skip', message: '未找到每日礼物按钮' };
    } catch (e) { return { status: 'failed', message: `异常：${e.message || e}` }; }
}

async function seedcoreProbe() {
    try {
        const detail = await loadEventPage((u, o) => robustFetch(u, o), 'https://seedcore.net/events/2', 'seedcore.net');
        if (detail.article) {
            if (detail.state === 'claimed') return { status: 'already', message: messagesOf(detail.article).join('，') || '今日已领' };
            if (detail.state === 'unclaimed') return { status: 'available', message: '检测到可领取' };
            if (detail.state === 'future') return { status: 'notopen', message: '今日未开放' };
            return { status: 'skip', message: '状态未知' };
        }
        if (detail.status) return detail.status;
        return { status: 'inactive', message: '未找到今日格子' };
    } catch (e) { return { status: 'failed', message: `异常：${e.message || e}` }; }
}

const SITE_PROBES = {
    'v3x.club': v3xProbe,
    'dirtybytes.net': DIRTYBYTES_STATUS,
    'filelist.io': filelistProbe,
    'myfunzone.org': async () => (await probeEventsPage('myfunzone.org', 'https://myfunzone.org')) || myfunzoneWheelProbe(),
    'polishtorrent.top': async () => (await probeEventsPage('polishtorrent.top', 'https://polishtorrent.top')) || polishtorrentWheelProbe(),
    'yu-scene.net': async () => probeEventsPage('yu-scene.net', 'https://yu-scene.net'),
    'czteam.me': czteamProbe,
    'seedcore.net': seedcoreProbe,
    '0dayfiles.net': async () => (has0DayFilesTask()
        ? { status: 'available', message: '有签到/转盘任务待处理' }
        : { status: 'already', message: '签到和转盘均已完成' }),
};

async function probeRemoteSite(host) {
    const cfg = ALL_KNOWN_SITES[host];
    if (!cfg) return { status: 'skip', message: '未配置的站点' };
    if (KNOWN_INACTIVE[host] && !getPromoted().includes(host)) {
        return { status: 'inactive', message: KNOWN_INACTIVE[host].reason || '无活动' };
    }
    if (SITE_PROBES[host]) {
        // 探针返回空表示"给不出结论"，交给开 tab 的 DOM 流程
        return (await SITE_PROBES[host]()) || { status: 'pending', message: '该站需开 tab 处理', needsTab: true };
    }
    if (cfg.handler !== 'unit3d' && cfg.handler !== 'infinityhd') {
        return { status: 'pending', message: '该站类型需开 tab 处理', needsTab: true };
    }

    const base = `https://${host}`;
    const rewardTexts = cfg.rewardLinkText || REWARD_TEXT_PATTERNS_DEFAULT;

    // 1) 配置直接给了详情页
    if (cfg.rewardPath && ACTIVITY_PATH_RE.test(cfg.rewardPath)) {
        return probeDetail(base, host, cfg.rewardPath, { directClaim: true, cacheSource: 'config' });
    }
    // 2) 配置给的是列表页
    if (cfg.rewardPath && ACTIVITY_LIST_RE.test(cfg.rewardPath)) {
        const r = await probeEventsList(base, host, cfg.rewardPath);
        return r.error || r.result || (r.list && r.list.status ? r.list : null) || { status: 'inactive', message: '列表页无今日活动' };
    }
    // 3) 通用：/events 列表 → 详情；列表无今日活动再按页面链接打分
    const r = await probeEventsList(base, host, '/events');
    if (r.error) return r.error;
    if (r.result) return r.result;
    if (r.list && r.list.status) return r.list;
    const doc = r.doc;

    const textCandidates = [], allCandidates = [];
    for (const a of doc.querySelectorAll('a[href]')) {
        const p = hintToEventPath(a.getAttribute('href'), base);
        if (!p) continue;
        const m = p.match(ACTIVITY_PATH_RE);
        const id = m ? +m[2] : 0;
        allCandidates.push({ path: p, id });
        const score = matchRewardTextScore(a.textContent, rewardTexts);
        if (score > 0) textCandidates.push({ path: p, id, score });
    }
    textCandidates.sort((a, b) => b.score - a.score || b.id - a.id);
    let targetPath = textCandidates.length ? textCandidates[0].path : null;
    let targetSource = targetPath ? 'remote-hint' : null;
    if (!targetPath) {
        if (!allCandidates.length) return { status: 'inactive', message: '无活动链接' };
        allCandidates.sort((a, b) => b.id - a.id);
        targetPath = allCandidates[0].path;
        targetSource = 'probe-unclaimed';
    }
    return probeDetail(base, host, targetPath, { cacheSource: targetSource });
}

async function probeRemoteSiteWithBudget(host, budgetMs = PROBE_SITE_BUDGET) {
    if (host === 'jme-reunit3d.de') budgetMs = 45000;
    let timer;
    const timeout = new Promise(resolve => {
        timer = setTimeout(() => resolve({ status: 'timeout', message: `探测超时（${Math.round(budgetMs / 1000)}s 预算）` }), budgetMs);
    });
    try { return await Promise.race([probeRemoteSite(host), timeout]); }
    finally { clearTimeout(timer); }
}

function updateScanProgress(done, total, host) {
    const bar = document.getElementById('pt-progress');
    if (bar) bar.style.width = `${Math.round(done / total * 100)}%`;
    const sum = document.getElementById('pt-summary');
    if (sum) sum.innerHTML = `探测中… ${done}/${total}（当前：${host}）`;
}

async function probeAllSitesParallel(hosts, concurrency = 6) {
    if (GM_getValue(PROBE_MODE_KEY, 'gm_xhr') === 'tab') return {};
    const results = {};
    let idx = 0, done = 0;
    const total = hosts.length;
    const FORCE_REPROBE = new Set(['filelist.io', 'dirtybytes.net', '0dayfiles.net']);

    // 新增：超时标志位
    let globalTimeout = false;

    async function worker() {
        while (idx < total) {
            if (globalTimeout) break; // 收到超时信号，立即退出循环
            const host = hosts[idx++];
            try {
                const st = getSiteStatus(host);
                if (!FORCE_REPROBE.has(host) &&
                    (st.status === 'claimed' || st.status === 'already') &&
                    Date.now() - st.ts < TTL_RECHECK) {
                    results[host] = st;
                } else {
                    const r = (await probeRemoteSiteWithBudget(host)) || { status: 'timeout', message: '探测无结果' };
                    if (!r.needsTab) setSiteStatus(host, r);
                    results[host] = r;
                }
            } catch (e) {
                results[host] = { status: 'failed', message: e.message };
            }
            done++;
            updateScanProgress(done, total, host);
            await sleep(150 + Math.random() * 250);
        }
    }

    // 固定 60s 对 57 个站点不够用（日志里 7 次扫描有 4 次被截断），按站点数放宽
    const budgetMs = Math.min(150000, Math.max(90000, total * 2500));
    const timer = setTimeout(() => {
        globalTimeout = true;
        log(`[Scan] 阶段 1 全局超时 ${Math.round(budgetMs / 1000)}s（已完成 ${done}/${total}），进入下一阶段`);
    }, budgetMs);

    await Promise.all(Array.from({ length: concurrency }, worker));
    clearTimeout(timer);
    // 全局超时被截断的站点补状态，避免"没有结果"被当成已处理
    for (const h of hosts) {
        if (!results[h]) results[h] = { status: 'timeout', message: '扫描整体超时，本站未探测' };
    }
    return results;
}

async function autoDetectRewardPath() {
    return Promise.race([
        _autoDetectRewardPathInner(),
        new Promise(resolve => setTimeout(() => resolve(null), AUTODETECT_TIMEOUT)),
    ]);
}

async function _autoDetectRewardPathInner() {
    for (const h of detectActivityHints(document)) {
        const p = hintToEventPath(h);
        if (p) return { path: p, source: 'local-hint' };
    }
    const base = location.origin;
    let res;
    try { res = await robustFetch(`${base}/events`, { credentials: 'include' }, 10000, 2); }
    catch (e) { return null; }
    if (looksLikeLoginResponse(res)) return { needLogin: true };
    const httpBad = httpStatusToResult(res);
    if (httpBad) return httpBad;
    if (!res.ok) return null;
    const html = await res.text();
    const bad = classifyHtml(html);
    if (bad) return bad.status === 'auth' ? { needLogin: true } : bad;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const list = checkEventList(doc, HOST);
    if (list.paths && list.paths.length > 0) {
        if (list.paths.length > 1) setPendingEvents(HOST, list.paths);
        return { path: list.paths[0], source: 'remote-hint' };
    }
    if (list.status) return list;
    for (const h of detectActivityHints(doc)) {
        const p = hintToEventPath(h);
        if (p) return { path: p, source: 'remote-hint' };
    }
    const paths = new Set();
    for (const a of doc.querySelectorAll('a[href]')) {
        const p = hintToEventPath(a.getAttribute('href'), base);
        if (p) paths.add(p);
    }
    const sortedPaths = [...paths].sort((a, b) => {
        const ma = a.match(ACTIVITY_PATH_RE), mb = b.match(ACTIVITY_PATH_RE);
        return (mb ? +mb[2] : 0) - (ma ? +ma[2] : 0);
    }).slice(0, 5);
    for (const path of sortedPaths) {
        const r = await loadEventPage((u, o) => fetchWithTimeout(u, o, 3000, 1), `${base}${path}`, HOST);
        if (!r.state || r.state === 'none') continue;
        if (r.state === 'claimed') return { path, source: 'probe-claimed' };
        return { path, source: 'probe-unclaimed' };
    }
    return null;
}

const buildClaimUrl = (host, mode = 'claim') => {
    const hash = mode === 'detect' ? DETECT_HASH : CLAIM_HASH;
    if (host === 'polishtorrent.top') {
        const cached = getCachedEventPath(host);
        return cached
            ? `https://${host}${cached}${hash}`
            : `https://${host}/events${hash}`;
    }
    if (host === 'myfunzone.org') {
        const cached = getCachedEventPath(host);
        return cached
            ? `https://${host}${cached}${hash}`
            : `https://${host}/wheel${hash}`;
    }
    if (host === 'yu-scene.net') {
        if (mode === 'pumpkin') return `https://yu-scene.net/${PUMPKIN_HASH}`;
        const cached = getCachedEventPath(host);
        return cached
            ? `https://${host}${cached}${hash}`
            : `https://${host}/prize-wheel${hash}`;
    }
    if (host === '0dayfiles.net') {
        return `https://0dayfiles.net/${attendanceDone() ? 'spin-wheel' : 'attendance'}${hash}`;
    }
    const cfg = ALL_KNOWN_SITES[host];
    const handler = (cfg && cfg.handler) || 'unit3d';
    let path = (cfg && cfg.rewardPath) || '/';
    if (handler === 'unit3d' || handler === 'infinityhd') {
        const cached = getCachedEventPath(host);
        if (cached) path = cached;
        else if (!cfg.rewardPath) path = '/events';
    }
    return `https://${host}${path}${hash}`;
};

function ensurePath(match, path, { hash = location.hash || CLAIM_HASH } = {}) {
    const p = location.pathname;
    const onPath = typeof match === 'function' ? match(p)
        : (match instanceof RegExp ? match.test(p) : p.includes(match));
    if (onPath) return null;
    location.href = location.origin + path + hash;
    return { status: 'navigating' };
}

const waitForEventArticles = (timeout = 15000) =>
    waitFor(() => document.querySelectorAll('article.events__prize').length > 0 || null, timeout, 200);

function locateClaimTarget() {
    const todayArt = findTodayArticle();
    if (!todayArt) return null;
    if (articleState(todayArt) !== 'unclaimed') return null;
    const form = todayArt.querySelector('form[action*="/claims"]');
    const btn = form?.querySelector('button') || todayArt.querySelector('button');
    if (btn && !btn.disabled) return { type: 'button', button: btn, form };
    return { type: 'unclaimed-no-button' };
}

function detectedToResult(d) {
    if (!d) return null;
    if (d.needLogin) return authResult();
    return ['maintenance', 'inactive', 'notopen'].includes(d.status) ? d : null;
}

async function navigateToUnit3DEventPage(cfg) {
    const hash = location.hash === DETECT_HASH ? DETECT_HASH : CLAIM_HASH;
    const base = location.origin;
    if (document.body.innerHTML.includes('scratch-card-component') || document.querySelector('.scratch-header')) {
        log(`[Nav] 检测到特殊重定向活动页，清理缓存`);
        clearCachedEventPath(HOST);
        return { status: 'skip', message: '特殊活动页面（刮刮卡），已跳过' };
    }
    function navGuard(path) {
        if (canNavigateTo(path)) return null;
        log(`[Nav] 检测到循环跳转 ${path}（30s 内 ≥3 次），放弃`);
        clearCachedEventPath(HOST);
        return { status: 'failed', message: `循环跳转 ${path}，giveaway 状态异常` };
    }
    function canNavigateTo(path) {
        const key = 'pt_nav_guard_' + HOST + '_' + path;
        const now = Date.now();
        let ts;
        try { ts = JSON.parse(sessionStorage.getItem(key) || '[]'); } catch (e) { ts = []; }
        if (!Array.isArray(ts)) ts = [];
        ts = ts.filter(t => typeof t === 'number' && now - t < 30000);
        if (ts.length >= 3) return false;
        ts.push(now);
        try { sessionStorage.setItem(key, JSON.stringify(ts)); } catch (e) {}
        return true;
    }
    const cached = getCachedEventPath(HOST);
    if (cached && ACTIVITY_PATH_RE.test(cached)) {
        const bad = navGuard(cached);
        if (bad) return bad;
        location.href = `${base}${cached}${hash}`;
        return { status: 'navigating' };
    }
    if (cfg.rewardPath && ACTIVITY_LIST_RE.test(cfg.rewardPath) && location.pathname === cfg.rewardPath) {
        const listStatus = checkEventList(document, HOST);
        if (listStatus.paths && listStatus.paths.length > 0) {
            if (listStatus.paths.length > 1) setPendingEvents(HOST, listStatus.paths);
            const path = listStatus.paths[0];
            setCachedEventPath(HOST, path, 'remote-hint');
            const bad = navGuard(path);
            if (bad) return bad;
            location.href = `${base}${path}${hash}`;
            return { status: 'navigating' };
        }
        if (listStatus.status) return listStatus;
        return { status: 'skip', message: '列表页未找到今日活动' };
    }
    if (cfg.rewardPath && !ADMIN_PATH_RE.test(cfg.rewardPath)) {
        location.href = `${base}${cfg.rewardPath}${hash}`;
        return { status: 'navigating' };
    }
    const detected = await autoDetectRewardPath();
    const early = detectedToResult(detected);
    if (early) return early;
    if (detected && detected.path) {
        setCachedEventPath(HOST, detected.path, detected.source || 'local');
        location.href = `${base}${detected.path}${hash}`;
        return { status: 'navigating' };
    }
    return { status: 'skip', message: '未找到每日奖励活动页' };
}

function canSubmitAgain() {
    const key = 'pt_submit_guard_' + HOST + '_' + location.pathname;
    const now = Date.now();
    let arr;
    try { arr = JSON.parse(sessionStorage.getItem(key) || '[]'); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    arr = arr.filter(t => typeof t === 'number' && now - t < 60000);
    if (arr.length >= 3) return false;
    arr.push(now);
    try { sessionStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
    return true;
}

async function finishUnit3DClaim(form, button) {
    const modalText = document.querySelector('.swal2-title, .modal-title, .alert')?.textContent?.toLowerCase() || '';
    if (modalText.includes('not active') || modalText.includes('error')) {
        return { status: 'inactive', message: '页面已弹出活动未开放提示，取消提交' };
    }

    if (!canSubmitAgain()) {
        log(`[Unit3D] ${HOST} 提交过于频繁（60s 内 ≥3 次），熔断`);
        return { status: 'skip', message: '提交过于频繁，已熔断（60s 内 ≥3 次）' };
    }
    if (form) {
        try {
            const res = await submitFormSafe(form);
            if (res.ok) {
                const doc = new DOMParser().parseFromString(res.html, 'text/html');
                const msgs = messagesOf(findTodayArticle(doc, HOST));
                return { status: 'claimed', message: msgs.join('，') || '极速领取成功' };
            } else if (res.serverError) {
                return { status: 'notopen', message: res.serverError };
            }
        } catch (e) { log(`[Unit3D] 提交异常: ${e.message}`); }
    }
    try {
        if (form) form.submit(); else button.click();
    } catch (e) {
        return { status: 'failed', message: `提交失败：${e.message || e}` };
    }
    return { status: 'navigating' };
}

/** Unit3D 详情页公共前置判断：服务端隐藏提示 / giveaway 失效 */
function unit3dPagePrecheck(tag) {
    const errorCopy = document.getElementById('ERROR_COPY');
    if (errorCopy && errorCopy.textContent.includes('Event is not active')) {
        log(`[${tag}] 检测到服务端隐藏提示 Event is not active，终止重试`);
        clearCachedEventPath(HOST);
        removePendingEvent(HOST, location.pathname);
        return { status: 'notopen', message: '站点提示活动未激活（时间未到或已关闭）' };
    }
    const bodyText = (document.body?.innerText || '').toLowerCase();
    if (/giveaway\s+(?:is\s+)?not\s+active|no\s+longer\s+active|not\s+currently\s+active/i.test(bodyText)) {
        log(`[${tag}] 页面提示 giveaway 已失效`);
        clearCachedEventPath(HOST);
        removePendingEvent(HOST, location.pathname);
        return { status: 'inactive', message: 'giveaway is not active' };
    }
    return null;
}

const claimUnit3DEventPage = guardLogin(async () => {
    const pre = unit3dPagePrecheck('Unit3D');
    if (pre) return pre;
    if (isMaintenancePage(document.documentElement.outerHTML)) return { status: 'maintenance', message: '站点维护中' };

    await waitForEventArticles();
    const todayArt = findTodayArticle();
    const todayState = articleState(todayArt);

    if (todayState === 'claimed') {
        return { status: 'already', message: extractRewardText() || '今日已领取' };
    }
    if (todayState === 'future') {
        const msg = (todayArt.querySelector('.events__prize-message')?.textContent || '')
            .trim().replace(/\s+/g, ' ').replace(/✅/g, '').trim();
        return { status: 'notopen', message: `今日奖励尚未开放${msg ? `（${msg}）` : ''}` };
    }
    if (todayState === 'unclaimed') {
        const found = await waitFor(() => locateClaimTarget(), WAIT_BUTTON_TIMEOUT);
        if (!found) return { status: 'skip', message: '未找到领取按钮' };
        if (found.type === 'unclaimed-no-button') {
            const resolved = await waitFor(() => {
                if (!document.querySelector(SEL_UNCLAIMED)) {
                    return document.querySelector(SEL_CLAIMED) ? { type: 'claimed' } : null;
                }
                const hit = locateClaimTarget();
                return (hit && hit.type === 'button') ? hit : null;
            }, 8000, 200);
            if (resolved && resolved.type === 'claimed') {
                return { status: 'already', message: extractRewardText() || '今日已领取（服务端已处理）' };
            }
            if (resolved && resolved.type === 'button') return finishUnit3DClaim(resolved.form, resolved.button);
            return { status: 'skip', message: '按钮持续禁用，请稍后重试' };
        }
        return finishUnit3DClaim(found.form, found.button);
    }

    const allArticles = document.querySelectorAll('article.events__prize');
    const hasForm = !!document.querySelector('form[action*="/claims"]');
    if (allArticles.length === 0 && !hasForm) {
        clearCachedEventPath(HOST);
        return { status: 'skip', message: '未找到任何活动（页面可能已重定向）' };
    }
    if ([...allArticles].some(art => art.querySelector(SEL_FUTURE))) {
        return { status: 'notopen', message: '今日无活动安排（可能有未来活动）' };
    }
    if (!hasForm) return { status: 'inactive', message: '活动已全部过期' };
    return { status: 'skip', message: '未找到今日奖励' };
});

async function handleMultiEventClaim() {
    const pre = unit3dPagePrecheck('MultiEvent');
    if (pre) return pre;

    await waitForEventArticles();
    await sleep(300);

    const todayArt = findTodayArticle();
    const todayState = articleState(todayArt);

    if (todayState === 'claimed') {
        const currentReward = extractRewardText();
        if (currentReward) addCollectedReward(HOST, location.pathname, currentReward);
        removePendingEvent(HOST, location.pathname);
        const remaining = getPendingEvents(HOST);
        if (remaining.length > 0) {
            const nextPath = remaining[0];
            log(`[MultiEvent] ${location.pathname} 完成，约 5 秒后前往 ${nextPath}`);
            setSiteStatus(HOST, { status: 'pending', message: `前往下一个：${nextPath}` });
            await sleep(5000 + Math.random() * 2000);
            location.href = location.origin + nextPath + CLAIM_HASH;
            return { status: 'navigating' };
        }
        clearPendingEvents(HOST);
        const rewards = getCollectedRewards(HOST);
        clearCollectedRewards(HOST);
        const rewardsList = Object.values(rewards);
        return {
            status: 'already',
            message: rewardsList.length ? rewardsList.join('，') : (currentReward || '今日全部已领取'),
        };
    }
    if (todayState === 'future') {
        return { status: 'notopen', message: '今日奖励尚未开放' };
    }
    return claimUnit3DEventPage();
}

async function navigateToInfinityHDEventPage() {
    const hash = location.hash === DETECT_HASH ? DETECT_HASH : CLAIM_HASH;
    const base = location.origin;
    const findLinks = root => [...root.querySelectorAll('a[href*="/events/"]')]
        .filter(a => /Visit daily|earn BON|Daily Reward/i.test((a.textContent || '').replace(/\s+/g, ' ').trim()))
        .map(a => new URL(a.getAttribute('href'), base).href)
        .sort((a, b) => {
            const m1 = a.match(/\/events\/(\d+)/), m2 = b.match(/\/events\/(\d+)/);
            return (m1 && m2) ? +m1[1] - +m2[1] : a.length - b.length;
        });
    let links = findLinks(document);
    if (!links.length) {
        let res;
        try { res = await robustFetch(`${base}/`, { credentials: 'include' }, FETCH_TIMEOUT, 2); }
        catch (e) { return { status: 'failed', message: e.name === 'AbortError' ? '请求超时' : `网络错误：${e.message || e}` }; }
        if (looksLikeLoginResponse(res)) return authResult();
        const httpBad = httpStatusToResult(res, { notFound: false });
        if (httpBad) return httpBad;
        const html = await res.text();
        const bad = classifyHtml(html);
        if (bad) return bad;
        links = findLinks(new DOMParser().parseFromString(html, 'text/html'));
    }
    if (!links.length) return { status: 'skip', message: '未找到每日奖励链接' };
    location.href = links[links.length - 1] + hash;
    return { status: 'navigating' };
}

const claimOnCzTeam = guardLogin(async () => {
    const nav = ensurePath('events.php', '/events.php', { hash: '' });
    if (nav) return nav;
    const h2 = document.querySelector('.gift-hero h2');
    if (h2 && /already opened/i.test(h2.textContent || '')) {
        return { status: 'already', message: buildCzMessage(gmGet(CZ_BALANCE_KEY, TTL_SNAPSHOT)) };
    }
    const found = await waitFor(() => {
        const btn = document.querySelector('button.gift-btn');
        if (btn && !btn.disabled) return { type: 'button', button: btn, form: btn.closest('form[action*="events.php"]') };
        if (document.querySelector('.gift-locked')) return { type: 'already' };
        if (document.querySelector('.gift-hero') && !document.querySelector('button.gift-btn')) return { type: 'already' };
        return null;
    }, WAIT_BUTTON_TIMEOUT);
    if (found && found.type === 'already') return { status: 'already', message: buildCzMessage(gmGet(CZ_BALANCE_KEY, TTL_SNAPSHOT)) };
    if (found && found.type === 'button') {
        const balance = getCzCurrentBalance();
        if (balance > 0) gmSet(CZ_BALANCE_KEY, balance);
        try { if (found.form) found.form.submit(); else found.button.click(); }
        catch (e) { return { status: 'failed', message: `提交失败：${e.message || e}` }; }
        return { status: 'navigating' };
    }
    return { status: 'skip', message: '未找到每日礼物按钮' };
});

async function handleSeedcoreBubble() {
    let area = document.getElementById('reward-area-unique');
    if (!area) {
        area = await waitFor(() => document.getElementById('reward-area-unique'), 800, 200);
        if (!area) {
            log('[SeedCore] 未检测到气泡礼物元素（站点已取消该功能），跳过');
            return { result: 'unavailable' };
        }
    }
    const today = getSiteToday('seedcore.net');
    try {
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k && k.startsWith('claimed_') && k.includes(today)) return { result: 'already' };
        }
    } catch (e) {}
    const visibleArea = await waitFor(() => {
        const el = document.getElementById('reward-area-unique');
        if (!el) return null;
        const d = el.style.display;
        if (d && d !== 'none') return el;
        if (!d) {
            const computed = window.getComputedStyle(el).display;
            if (computed && computed !== 'none') return el;
        }
        return null;
    }, 3000, 200);
    if (!visibleArea) return { result: 'already' };
    const link = visibleArea.querySelector('a[onclick*="daily-claim-form"]');
    if (!link) return { result: 'unavailable' };
    const snapshot = getSeedcoreBalance();
    gmSet(SEEDCORE_BUBBLE_BEFORE, snapshot);
    try { sessionStorage.setItem(SEEDCORE_BUBBLE_BEFORE, JSON.stringify({ v: snapshot, ts: Date.now() })); } catch (e) {}
    try { link.click(); return { result: 'claimed' }; }
    catch (e) { return { result: 'unavailable' }; }
}

const claimOnSeedCore = guardLogin(async () => {
    if (document.getElementById('reward-area-unique')) {
        const bubble = await handleSeedcoreBubble();
        if (bubble.result === 'claimed') return { status: 'navigating' };
    }
    const nav = ensurePath(p => p === '/events/2', '/events/2');
    if (nav) return nav;
    await waitForEventArticles();
    const unclaimed = document.querySelector(SEL_UNCLAIMED);
    if (!unclaimed) {
        const parts = [];
        const rewardText = extractRewardText();
        if (rewardText) parts.push(`日期：${rewardText}`);
        const bubbleMsg = buildSeedcoreBubbleMessage();
        if (bubbleMsg) parts.unshift(bubbleMsg);
        return { status: 'already', message: parts.join(' · ') || '今日全部奖励已领取' };
    }
    const article = unclaimed.closest('article.events__prize') || unclaimed.closest('article');
    const form = article?.querySelector('form[action*="/claims"]');
    const btn = form?.querySelector('button');
    if (form && btn && !btn.disabled) {
        gmSet(SEEDCORE_DATE_BEFORE, getSeedcoreBalance());
        try { form.submit(); return { status: 'navigating' }; }
        catch (e) { return { status: 'failed', message: `提交日期表单失败：${e.message || e}` }; }
    }
    return { status: 'failed', message: '找到未领取标记但无按钮' };
});

const claimOnRetroToon = guardLogin(async () => {
    const nav = ensurePath('attendance.php', '/attendance.php', { hash: '' });
    if (nav) return nav;
    await sleep(300);
    if (/[?&]claimed=1/.test(location.search)) {
        return { status: 'claimed', message: extractRetroToonReward() || '已成功领取每日奖励' };
    }
    const claimBtn = document.querySelector('input[name="claim"][type="submit"], button[name="claim"]');
    if (!claimBtn) return { status: 'already', message: extractRetroToonReward() || '今日已领取' };
    try { claimBtn.click(); return { status: 'navigating' }; }
    catch (e) { return { status: 'failed', message: `点击失败：${e.message || e}` }; }
});

async function doDigitalCoreClaim() {
    try {
        await waitFor(() => document.body.innerText.includes('Points:'), 5000);
        let msg = '已登录';
        const bodyText = document.body.innerText || '';
        const pointsMatch = bodyText.match(/Points:\s*([\d,.]+)/i);
        const streakMatch = bodyText.match(/Day\s*(\d+)\s*of\s*7/i);
        const weeklyMatch = bodyText.match(/([\d,]+)p\s*weekly total/i);
        if (pointsMatch) {
            const currentPoints = parseFloat(pointsMatch[1].replace(/,/g, ''));
            const lastPoints = gmGet(DC_POINTS_KEY, TTL_DC_POINTS) || 0;
            let pointsMsg = `Points: ${pointsMatch[1]}`;
            if (lastPoints > 0 && currentPoints > lastPoints) pointsMsg += ` (+${(currentPoints - lastPoints).toFixed(2)})`;
            gmSet(DC_POINTS_KEY, currentPoints);
            if (streakMatch) pointsMsg = `Day ${streakMatch[1]} of 7 · ${pointsMsg}`;
            msg = pointsMsg;
        } else if (weeklyMatch) {
            msg = `本周奖励: ${weeklyMatch[1]}p`;
        }
        return { status: 'claimed', message: msg };
    } catch (e) {
        return { status: 'failed', message: e.name === 'AbortError' ? '请求超时' : `网络错误：${e.message || e}` };
    }
}

function parseDirtyBytesLastClaim(str) {
    if (!str) return null;
    const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const t = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00`);
    return isNaN(t.getTime()) ? null : t;
}
const claimOnDirtyBytes = guardLogin(DIRTYBYTES_STATUS);

const claimOn0DayFilesAttendance = guardLogin(async () => {
    const storedReward = sessionStorage.getItem('pt_0df_attendance_reward');
    if (storedReward) {
        sessionStorage.removeItem('pt_0df_attendance_reward');
        markAttendanceConfirmed();
        GM_setValue(ATTENDANCE_LAST_REWARD_KEY, storedReward);
        return { status: 'claimed', message: `本次签到：${storedReward}` };
    }
    const doneEl = document.querySelector('.attendance-dot-done');
    if (doneEl && doneEl.offsetParent !== null) {
        const streakMatch = doneEl.textContent.match(/Day\s*(\d+)/i);
        const msg = streakMatch ? `今日已签到 · 连续 ${streakMatch[1]} 天` : '今日已签到';
        markAttendanceConfirmed();
        if (!GM_getValue(ATTENDANCE_LAST_REWARD_KEY, '')) {
            const todayCell = document.querySelector('.attendance-day--done.attendance-day--is-today') || document.querySelector('.attendance-day--is-today');
            const chipText = todayCell && todayCell.textContent.match(/\+([\d,]+)/);
            if (chipText) GM_setValue(ATTENDANCE_LAST_REWARD_KEY, `${chipText[1]} BON`);
        }
        return { status: 'already', message: msg };
    }
    const todayBtn = document.querySelector('.attendance-today__button');
    const btn = todayBtn || document.querySelector('.attendance-dot-btn');
    if (!btn) {
        const todayForm = document.querySelector('.attendance-today__form');
        if (!todayForm) {
            markAttendanceConfirmed();
            return { status: 'already', message: '今日已签到' };
        }
        try {
            if (typeof todayForm.requestSubmit === 'function') todayForm.requestSubmit();
            else todayForm.submit();
            return { status: 'navigating' };
        } catch (e) { return { status: 'skip', message: '未找到签到按钮' }; }
    }
    let rewardStr = '';
    if (todayBtn) {
        const match = (todayBtn.textContent || '').match(/\+([\d,]+)\s*BON/i);
        if (match) rewardStr = `${match[1]} BON`;
    }
    const form = btn.closest('form');
    try {
        if (rewardStr) sessionStorage.setItem('pt_0df_attendance_reward', rewardStr);
        if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
        else btn.click();
    } catch (e) {
        sessionStorage.removeItem('pt_0df_attendance_reward');
        return { status: 'failed', message: `签到点击失败：${e.message || e}` };
    }
    const result = await waitFor(() => {
        const doneElAfter = document.querySelector('.attendance-dot-done');
        if (doneElAfter && doneElAfter.offsetParent !== null) return { type: 'done' };
        if (!document.querySelector('.attendance-today__form') && !document.querySelector('.attendance-dot-form')) return { type: 'formGone' };
        return null;
    }, 5000);
    if (result) {
        markAttendanceConfirmed();
        if (rewardStr) GM_setValue(ATTENDANCE_LAST_REWARD_KEY, rewardStr);
        sessionStorage.removeItem('pt_0df_attendance_reward');
        return { status: 'claimed', message: rewardStr ? `本次签到：${rewardStr}` : '签到成功' };
    }
    if (rewardStr) {
        GM_setValue(ATTENDANCE_LAST_REWARD_KEY, rewardStr);
        return { status: 'claimed', message: `本次签到：${rewardStr}（刷新中）` };
    }
    return { status: 'timeout', message: '签到结果超时，请手动确认' };
});

const claimOn0DayFilesSpinWheel = guardLogin(async () => {
    const root = await waitFor(() => document.querySelector('[x-data^="spinWheel"]'), 5000);
    if (!root) return { status: 'skip', message: '未找到转盘组件（页面结构可能已变化）' };
    const data = await waitFor(() => W.Alpine?.$data?.(root), 8000);
    if (!data) return { status: 'skip', message: 'Alpine 数据未就绪' };
    await waitFor(() => data.config && data.config.next !== undefined, 5000);
    const nextSec = data.next;
    if (nextSec && nextSec * 1000 > Date.now() + 30 * 1000) {
        const nextMs = saneNextTs(nextSec * 1000);
        GM_setValue(SPINWHEEL_NEXT_KEY, nextMs);
        return { status: 'already', message: cooldownText(GM_getValue(SPINWHEEL_LAST_REWARD_KEY, '未知') || '未知', nextMs) };
    }
    const btn = document.querySelector('.sw-hub') || document.querySelector('form button.sw-btn');
    if (!btn) return { status: 'skip', message: '未找到 Spin 按钮' };
    if (btn.disabled) return { status: 'skip', message: 'Spin 按钮当前禁用' };
    try { if (typeof data.spin === 'function') data.spin(); else btn.click(); }
    catch (e) { return { status: 'failed', message: `触发 Spin 失败：${e.message || e}` }; }
    const result = await waitFor(() => data.result || (data.error ? { __err: data.error } : null), 20000);
    if (data.next) GM_setValue(SPINWHEEL_NEXT_KEY, saneNextTs(data.next * 1000));
    if (!result) return { status: 'failed', message: '旋转后未等到结果' };
    if (result.__err) return { status: 'failed', message: `服务端返回：${result.__err}` };
    const reward = result.nothing ? 'Nothing' : (result.label || '未知奖励');
    GM_setValue(SPINWHEEL_LAST_REWARD_KEY, reward);
    return { status: result.nothing ? 'empty' : 'claimed', message: `本次：${reward}${result.golden ? ' ★ Golden' : ''}` };
});

function parseYusceneNextTs(statusText, nextTime) {
    const dayMatch = nextTime.match(/(\d+)\s*天/);
    const hourMatch = nextTime.match(/(\d+)\s*小时/);
    const minMatch = nextTime.match(/(\d+)\s*分钟/);
    if (dayMatch || hourMatch || minMatch) {
        const days = dayMatch ? parseInt(dayMatch[1], 10) : 0;
        const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
        const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
        return Date.now() + ((days * 24 + hours) * 3600 + mins * 60) * 1000;
    }
    const absMatch = statusText.match(/\((.+?)\)/);
    if (!absMatch) return 0;
    const m = absMatch[1].match(/(\d+)\s*(?:([A-Za-z]{3})[a-z]*|(\d+)月),?\s*(\d+):(\d+)/);
    if (!m) return 0;
    const month = m[2] ? MONTH_INDEX[m[2].toLowerCase()] : (parseInt(m[3], 10) - 1);
    if (month === undefined || month === null || isNaN(month) || month < 0 || month > 11) return 0;
    const now = new Date();
    let year = now.getFullYear();
    if (month < now.getMonth()) year++;
    return new Date(year, month, parseInt(m[1], 10), parseInt(m[4], 10), parseInt(m[5], 10)).getTime();
}

const claimOnYusceneSpinWheel = guardLogin(async () => {
    if (isMaintenanceBody('.pw__status')) return { status: 'maintenance', message: '站点维护中 (503)' };
    const statusEl = await waitFor(() => document.querySelector('.pw__status'), 8000);
    if (!statusEl) return { status: 'skip', message: '未找到转盘组件（页面结构可能已变化）' };
    if (document.querySelector('.pw__rotor.is-spinning')) {
        await waitFor(() => !document.querySelector('.pw__rotor.is-spinning'), 15000);
        await sleep(500);
    }
    const statusText = document.querySelector('.pw__status')?.textContent?.trim() || '';
    const lastText = document.querySelector('.pw__status--last')?.textContent?.trim() || '';
    const reward = (lastText.match(/Last spin:\s*(.+?)\s*—/) || [])[1]?.trim() || '';
    const isNothing = /nothing/i.test(reward);
    const nextTime = (statusText.match(/Next spin available\s+(.+?)\s*\(/) || [])[1] || '';
    const nextTs = parseYusceneNextTs(statusText, nextTime);
    GM_setValue(YUSCENE_SPIN_NEXT_KEY, saneNextTs(nextTs));
    if (nextTs && nextTs > Date.now() + 30 * 1000) {
        return {
            status: 'already',
            message: `${reward ? `本次：${reward} · ` : ''}冷却中 · 下次：${fmtNext(nextTs)}（约 ${remainMin(nextTs)} 分钟后）`,
            nextTs,
        };
    }
    if (!nextTs && /Next spin available/i.test(statusText)) {
        return { status: 'already', message: `${reward ? `本次：${reward} · ` : ''}冷却中 · 下次：${nextTime || '未知'}` };
    }
    let spinTarget = document.querySelector('button.pw__go')
        || [...document.querySelectorAll('button')].find(b => /^spin$/i.test(b.textContent.trim()));
    if (!spinTarget) spinTarget = document.querySelector('.pw__hub') || document.querySelector('.pw__stage');
    if (!spinTarget) {
        return {
            status: isNothing ? 'empty' : 'already',
            message: `${reward ? `本次：${reward}` : '已领取'}${nextTime ? ` · 下次：${nextTime}` : ''}`,
        };
    }
    try {
        const form = spinTarget.closest('form');
        if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
        else if (form && typeof form.submit === 'function') form.submit();
        else {
            const rect = spinTarget.getBoundingClientRect();
            const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
            const evtOpts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
            spinTarget.dispatchEvent(new MouseEvent('pointerdown', evtOpts));
            spinTarget.dispatchEvent(new MouseEvent('mousedown', evtOpts));
            spinTarget.dispatchEvent(new MouseEvent('pointerup', evtOpts));
            spinTarget.dispatchEvent(new MouseEvent('mouseup', evtOpts));
            spinTarget.click();
        }
        log('[YuScene] 已触发点击/表单提交，等待旋转…');
        const started = await waitFor(() => document.querySelector('.pw__rotor.is-spinning'), 5000);
        if (started) {
            await waitFor(() => !document.querySelector('.pw__rotor.is-spinning'), 20000);
            await sleep(1000);
        }
        const newLastText = document.querySelector('.pw__status--last')?.textContent?.trim() || '';
        const newReward = (newLastText.match(/Last spin:\s*(.+?)\s*—/) || [])[1]?.trim() || '';
        return {
            status: /nothing/i.test(newReward) ? 'empty' : 'claimed',
            message: newReward ? `本次：${newReward}` : '转盘已执行',
        };
    } catch (e) {
        return { status: 'failed', message: `点击旋转按钮失败：${e.message || e}` };
    }
});

async function claimYuscenePumpkin() {
    const done = r => { setPumpkinStatus(r.status, r.message); return r; };
    if (HOST !== 'yu-scene.net') return done({ status: 'skip', message: '非 YUSCENE 站点' });
    if (isOnLoginPageNow()) return done({ status: 'auth', message: '会话已过期' });
    if (GM_getValue(PUMPKIN_RETIRED_KEY, false) === true) return done({ status: 'already', message: '万圣节南瓜活动已结束' });
    if (isMaintenanceBody('#halloween-bon')) {
        const r = { status: 'maintenance', message: '站点维护中 (503)' };
        setPumpkinStatus(r.status, r.message);
        setSiteStatus(HOST, r);
        return r;
    }
    const pumpkin = await waitFor(() => document.getElementById('halloween-bon'), 5000, 250);
    if (!pumpkin) {
        // 维护页/半加载页也会没有该元素，别据此永久下线
        if (isMaintenanceText(document.body?.innerText || '')) {
            return done({ status: 'maintenance', message: '站点维护中，南瓜状态未知' });
        }
        GM_setValue(PUMPKIN_RETIRED_KEY, true);
        log('[YuScene] 未检测到 #halloween-bon，标记南瓜为已下线（万圣节活动结束）');
        return done({ status: 'already', message: '万圣节南瓜活动已结束' });
    }
    if (pumpkin.dataset.busy === '1') {
        GM_setValue(PUMPKIN_LAST_CLAIM_KEY, Date.now());
        return done({ status: 'already', message: '南瓜正在处理中' });
    }
    const attempt = bumpPumpkinAttempt();
    if (attempt > PUMPKIN_MAX_ATTEMPTS) {
        return done({ status: 'skip', message: `今日已尝试 ${PUMPKIN_MAX_ATTEMPTS} 次仍未确认到奖励，明日再试` });
    }
    const beforeText = (pumpkin.querySelector('.halloween-bon__amount')?.textContent || '').trim();
    try { pumpkin.click(); }
    catch (e) { return done({ status: 'failed', message: `点击南瓜失败：${e.message || e}` }); }
    const result = await waitFor(() => {
        const el = document.getElementById('halloween-bon');
        if (!el) return { type: 'removed' };
        const txt = (el.querySelector('.halloween-bon__amount')?.textContent || '').trim();
        return (txt && txt !== beforeText) ? { type: 'reward', text: txt } : null;
    }, 10000, 200);
    if (result && result.type === 'reward') {
        GM_setValue(PUMPKIN_LAST_CLAIM_KEY, Date.now());
        GM_setValue(PUMPKIN_LAST_REWARD_KEY, result.text);
        showToast(`🎃 万圣节南瓜：${result.text}`);
        return done({ status: 'claimed', message: `🎃 南瓜：${result.text}` });
    }
    if (result && result.type === 'removed') {
        GM_setValue(PUMPKIN_LAST_CLAIM_KEY, Date.now());
        return done({ status: 'already', message: '南瓜已消失（今日可能已领）' });
    }
    // 没抓到文本就不写"已领"，否则会被 20h 冷却挡住真实重试；用当日次数止损
    return done({
        status: 'skip',
        message: `已点击南瓜但未捕获奖励文本（今日第 ${attempt} 次）` +
                 (attempt >= PUMPKIN_MAX_ATTEMPTS ? '，今日不再重试' : `，${PUMPKIN_RETRY_GAP / MIN} 分钟后再试`),
    });
}

const claimOnFilelist = guardLogin(async () => {
    const nav = ensurePath('/spin.php', '/spin.php');
    if (nav) return nav;

    const bodyText = document.body.innerText || '';
    if (FILELIST_ENDED_RE.test(bodyText)) return { status: 'inactive', message: '转盘活动已结束' };
    const nextTs = filelistCooldownTs(bodyText);
    if (nextTs) {
        GM_setValue(FILELIST_SPIN_NEXT_KEY, saneNextTs(nextTs, 26));
        return { status: 'already', message: cooldownText(GM_getValue(FILELIST_LAST_REWARD_KEY, '未知') || '未知', nextTs, false) };
    }

    const btn = document.querySelector('#spin');
    if (!btn) return { status: 'skip', message: '未找到 Spin 按钮' };

    // 站点用 alert 弹奖励，临时劫持
    let interceptedMsg = null;
    const origAlert = window.alert;
    window.alert = msg => { interceptedMsg = msg; };
    try { btn.click(); }
    catch (e) {
        window.alert = origAlert;
        return { status: 'failed', message: `点击失败：${e.message}` };
    }
    const result = await waitFor(() => interceptedMsg, 8000);
    window.alert = origAlert;
    if (!result) return { status: 'timeout', message: '未捕获到奖励弹窗' };
    const match = result.match(/You just won\s*(.+?)!/i);
    if (!match) return { status: 'claimed', message: '已触发（未解析出具体奖励）' };
    const reward = match[1].trim();
    GM_setValue(FILELIST_LAST_REWARD_KEY, reward);
    GM_setValue(FILELIST_SPIN_NEXT_KEY, Date.now() + 24 * HOUR);
    return { status: 'claimed', message: `本次：${reward}` };
});

/** 多活动站点：先领 /events 今日活动，没有则落到转盘页（myfunzone / polishtorrent 共用） */
async function claimEventsThenWheel(wheelPath) {
    if (isOnEventPage()) {
        const r = await handleMultiEventClaim();
        if (r && ['inactive', 'notopen', 'skip'].includes(r.status)) {
            location.href = location.origin + wheelPath + CLAIM_HASH;
            return { status: 'navigating' };
        }
        return r;
    }
    if (location.pathname === '/events' || location.pathname === '/events/') {
        const list = checkEventList(document, HOST);
        if (list.paths && list.paths.length) {
            if (list.paths.length > 1) setPendingEvents(HOST, list.paths);
            location.href = location.origin + list.paths[0] + CLAIM_HASH;
            return { status: 'navigating' };
        }
        location.href = location.origin + wheelPath + CLAIM_HASH;
        return { status: 'navigating' };
    }
    return null;
}

const claimOnMyFunZoneWheel = guardLogin(async () => {
    const early = await claimEventsThenWheel('/wheel');
    if (early) return early;

    const nav = ensurePath('/wheel', '/wheel');
    if (nav) return nav;
    await waitFor(() => document.getElementById('dw-fab') || document.getElementById('dw-spin'), 8000);

    const s = myfunzoneWheelState(document);
    if (!s.fabReady && !s.btnReady && s.done) {
        let nextTs = GM_getValue(MYFUNZONE_SPIN_NEXT_KEY, 0);
        if (nextTs <= Date.now()) {
            nextTs = Date.now() + 24 * HOUR;
            GM_setValue(MYFUNZONE_SPIN_NEXT_KEY, nextTs);
        }
        return { status: 'already', message: `今日已领 · 下次：${fmtClock(nextTs)}` };
    }
    if ((!s.spinBtn || s.spinBtn.offsetParent === null) && s.fab && s.fab.offsetParent !== null) {
        s.fab.click();
        await sleep(600);
    }
    const targetBtn = document.getElementById('dw-spin');
    if (!targetBtn) return { status: 'skip', message: '未找到转盘按钮' };
    if (targetBtn.disabled) return { status: 'already', message: '今日已领取' };

    // 抓 /wheel/spin 的响应，比解析文案可靠
    let captured = null;
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await origFetch.apply(this, args);
        if (args[0] && String(args[0]).includes('/wheel/spin')) {
            try { captured = await response.clone().json(); } catch (e) {}
        }
        return response;
    };
    try { targetBtn.click(); }
    catch (e) {
        window.fetch = origFetch;
        return { status: 'failed', message: `点击失败：${e.message}` };
    }
    const result = await waitFor(() => {
        if (captured) return { type: 'json', data: captured };
        const sub = document.getElementById('dw-sub');
        if (!sub) return null;
        const t = sub.textContent;
        if (t.includes('You won:')) {
            const m = t.match(/You won:\s*(.+?)!/i);
            return { type: 'win', label: m ? m[1] : '未知' };
        }
        if (t.includes('Something went wrong') || t.includes('Network error')) return { type: 'error', label: t };
        if (t.includes('SEE YOU TOMORROW')) return { type: 'done' };
        return null;
    }, 20000, 200);
    window.fetch = origFetch;
    GM_setValue(MYFUNZONE_SPIN_NEXT_KEY, Date.now() + 24 * HOUR);

    if (!result) return { status: 'timeout', message: '旋转结果超时，请手动确认' };
    if (result.type === 'json') {
        return result.data.ok
            ? { status: 'claimed', message: `本次：${result.data.label || '未知'}` }
            : { status: 'already', message: result.data.message || '今日已领取' };
    }
    if (result.type === 'win') return { status: 'claimed', message: `本次：${result.label}` };
    if (result.type === 'done') return { status: 'claimed', message: '转盘已执行' };
    return { status: 'failed', message: result.label };
});

const claimOnPolishTorrentWheel = guardLogin(async () => {
    const early = await claimEventsThenWheel('/spin');
    if (early) return early;

    const s = polishWheelState(document);
    if (s.state === 'missing') return { status: 'inactive', message: '未找到转盘按钮（页面结构可能已变化）' };
    if (s.state === 'already') return { status: 'already', message: s.last ? `今日已领取 · 上次：${s.last}` : '今日已领取' };

    const csrfToken = getCsrfToken();
    if (!csrfToken) return { status: 'failed', message: '未找到 CSRF Token' };
    try {
        const res = await fetch('https://polishtorrent.top/spin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken },
        });
        if (!res.ok) return { status: 'failed', message: `请求失败 HTTP ${res.status}` };
        const data = await res.json();
        if (data.error) return { status: 'already', message: data.error };
        if (!data.success) return { status: 'failed', message: '未知响应格式' };
        const prize = data.prize || {};
        if (prize.label) GM_setValue(POLISH_LAST_REWARD_KEY, prize.label);
        if (prize.type === 'nothing') return { status: 'empty', message: '本次：Pech!（空礼物）' };
        return { status: 'claimed', message: `本次：${prize.label || '未知奖励'}` };
    } catch (e) {
        return { status: 'failed', message: `请求异常：${e.message}` };
    }
});

// 优化：将站点领取逻辑插件化
const SITE_HANDLERS = {
    czteam: claimOnCzTeam,
    seedcore: claimOnSeedCore,
    retrotoon: claimOnRetroToon,
    myfunzone: claimOnMyFunZoneWheel,
    polishtorrent: claimOnPolishTorrentWheel,
    dirtybytes: claimOnDirtyBytes,
    filelist: claimOnFilelist,
    digitalcore: doDigitalCoreClaim,
};
function dispatchHandler(cfg) {
    const handler = cfg.handler || 'unit3d';
    if (handler === 'unit3d' || handler === 'infinityhd') {
        if (isOnEventPage()) return handleMultiEventClaim();
        return handler === 'infinityhd' ? navigateToInfinityHDEventPage() : navigateToUnit3DEventPage(cfg);
    }
    const fn = SITE_HANDLERS[handler];
    return fn ? fn(cfg) : navigateToUnit3DEventPage(cfg);
}

function maybeClearStaleLock() {
    const lock = GM_getValue(TASK_LOCK_KEY, null);
    if (!lock || !lock.ts) return;
    const age = Date.now() - lock.ts;
    if (age > TASK_LOCK_TTL) {
        log(`[TaskLock] 清理过期锁（age=${Math.round(age / 1000)}s）`);
        GM_deleteValue(TASK_LOCK_KEY);
    }
}

// ==========================================
// 调度层
// ==========================================
function checkDailyReset() {
    if (isAutoOpenedTab()) return false;
    const today = getSiteToday(HOST);
    const key = lastOpenDateKey(HOST);
    const lastDate = GM_getValue(key, today);
    if (lastDate === today) return false;
    log(`[DailyReset] 新的一天（${today}，上次 ${lastDate || '无'}），仅清理 ${HOST} 昨日状态`);
    GM_setValue(key, today);
    GM_deleteValue(keyFor(HOST));
    clearCachedEventPath(HOST);
    clearPendingEvents(HOST);
    if (HOST === 'yu-scene.net') {
        for (const k of [PUMPKIN_STATUS_KEY, PUMPKIN_LAST_CLAIM_KEY, PUMPKIN_LAST_REWARD_KEY, PUMPKIN_ATTEMPT_KEY, YUSCENE_SPIN_NEXT_KEY]) GM_deleteValue(k);
    }
    if (HOST === '0dayfiles.net') {
        GM_deleteValue(ATTENDANCE_LAST_CONFIRMED_KEY);
        GM_deleteValue(ATTENDANCE_LAST_REWARD_KEY);
        GM_setValue(SPINWHEEL_NEXT_KEY, 0);
        try { sessionStorage.removeItem('pt_0df_attendance_reward'); } catch (e) {}
    }
    if (HOST === 'myfunzone.org') GM_deleteValue(MYFUNZONE_SPIN_NEXT_KEY);
    if (HOST === 'filelist.io') GM_deleteValue(FILELIST_SPIN_NEXT_KEY);
    clearCollectedRewards(HOST);
    try { refreshUI(); } catch (e) {}
    return true;
}

function cleanupStalePending() {
    const now = Date.now();
    for (const h of Object.keys(ALL_KNOWN_SITES)) {
        const s = GM_getValue(keyFor(h), null);
        if (!s || !s.ts) continue;
        if ((s.status === 'pending' || s.status === 'claiming') && (now - s.ts) > STALE_PENDING_MS) {
            setSiteStatus(h, { status: 'timeout', message: `陈旧状态清理（${Math.round((now - s.ts) / 1000)}s）` });
        }
    }
}

const RESET_GLOBAL_KEYS = [
    CZ_BALANCE_KEY, SEEDCORE_BUBBLE_BEFORE, SEEDCORE_DATE_BEFORE, DC_POINTS_KEY,
    ATTENDANCE_LAST_CONFIRMED_KEY, ATTENDANCE_LAST_ATTEMPT_KEY, ATTENDANCE_LAST_REWARD_KEY,
    AUTO_SCAN_TIME_KEY, TASK_LOCK_KEY,
    MYFUNZONE_SPIN_NEXT_KEY, PUMPKIN_LAST_CLAIM_KEY, PUMPKIN_LAST_REWARD_KEY,
    PUMPKIN_ATTEMPT_KEY,   // 活动是否已下线（PUMPKIN_RETIRED_KEY）属于事实，不随"重置今日状态"复活
    YUSCENE_SPIN_NEXT_KEY, PUMPKIN_STATUS_KEY, FILELIST_SPIN_NEXT_KEY,
];
function resetAllStatuses() {
    const targets = new Set([...Object.keys(ALL_KNOWN_SITES), ...getAutoDemoted()]);
    for (const h of targets) {
        GM_deleteValue(keyFor(h));
        clearCachedEventPath(h);
        clearPendingEvents(h);
        GM_deleteValue(lastOpenDateKey(h));
    }
    for (const k of RESET_GLOBAL_KEYS) GM_deleteValue(k);
    GM_setValue(SPINWHEEL_NEXT_KEY, 0);
    GM_setValue(SPINWHEEL_LAST_REWARD_KEY, '');
    GM_setValue(FILELIST_LAST_REWARD_KEY, '');
    try {
        sessionStorage.removeItem(SEEDCORE_BUBBLE_BEFORE);
        sessionStorage.removeItem('pt_0df_attendance_reward');
        clearCollectedRewards(HOST);
    } catch (e) {}
    refreshUI();
}

function restoreDemotedSite(host) {
    removeFromDemoted(host);
    resetFailure(host);
    GM_deleteValue(keyFor(host));
}

function clearHostCache(host) {
    const PREFIXED = [
        STATUS_PREFIX, FAILURE_KEY_PREFIX, DEMOTE_REASON_KEY,
        EVENT_PATH_CACHE_PREFIX, PENDING_EVENTS_PREFIX, MULTI_EVENT_REWARDS_KEY,
    ];
    for (const p of PREFIXED) GM_deleteValue(p + host);
    GM_deleteValue(keyFor(host, 'pumpkin'));
    GM_deleteValue(lastOpenDateKey(host));
    const HOST_ONLY = {
        'yu-scene.net': { keys: ['pt_yuscene_spin_next_v1', 'pt_yuscene_pumpkin_status_v1', 'pt_pumpkin_last_claim_v1', 'pt_pumpkin_last_reward_v1', 'pt_pumpkin_retired_v1'] },
        'myfunzone.org': { keys: ['pt_myfunzone_spin_next_v1'] },
        '0dayfiles.net': { keys: ['pt_spinwheel_next_v1', 'pt_spinwheel_last_reward_v1', 'pt_0df_attendance_last_confirmed', 'pt_0df_attendance_last_attempt', 'pt_0df_attendance_last_reward'] },
        'filelist.io': { keys: ['pt_filelist_spin_next_v1', 'pt_filelist_last_reward_v1'] },
        'czteam.me': { keys: ['pt_cz_balance_before'] },
        'seedcore.net': { keys: ['pt_seedcore_bubble_before', 'pt_seedcore_date_before'] },
        'digitalcore.club': { keys: ['pt_dc_points'] },
    };
    const hostOnly = HOST_ONLY[host];
    if (hostOnly) for (const k of hostOnly.keys) GM_deleteValue(k);
    try {
        const keys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k && k.startsWith('pt_')) keys.push(k);
        }
        keys.forEach(k => sessionStorage.removeItem(k));
    } catch (e) {}
}

function waitForSiteDone(host, timeout = SEQUENTIAL_TIMEOUT) {
    return new Promise(resolve => {
        const start = Date.now();
        let settled = false, timer = null, hardTimer = null, listenerId = null;
        const cleanup = () => {
            if (timer) clearInterval(timer);
            if (hardTimer) clearTimeout(hardTimer);
            if (listenerId !== null && typeof GM_removeValueChangeListener === 'function') {
                try { GM_removeValueChangeListener(listenerId); } catch (e) {}
            }
        };
        const finish = r => { if (!settled) { settled = true; cleanup(); resolve(r); } };
        const check = () => {
            if (settled) return true;
            const st = getSiteStatus(host);
            if (isTerminal(st)) { finish(st); return true; }
            if (Date.now() - start > timeout) { finish({ status: 'timeout', message: '等待超时' }); return true; }
            return false;
        };
        if (check()) return;
        timer = setInterval(check, 250);
        try { listenerId = GM_addValueChangeListener(keyFor(host), () => check()); } catch (e) {}
        hardTimer = setTimeout(() => { if (!settled) finish({ status: 'timeout', message: '硬性超时' }); }, timeout + HARD_TIMEOUT_MARGIN);
    });
}

function getScanTargets(excludeHost) {
    const { scan } = siteSets();
    if (excludeHost) scan.delete(excludeHost);
    return [...scan];
}

const has0DayFilesTask = () => !attendanceDone() || GM_getValue(SPINWHEEL_NEXT_KEY, 0) <= Date.now();
// 转盘才是任务；南瓜是顺带试一次的附加动作，不能让它单独把 yu-scene 永久钉在任务列表里
const hasYusceneTask = () => !yusceneWheelDone();
const hasFilelistTask = () => GM_getValue(FILELIST_SPIN_NEXT_KEY, 0) <= Date.now();

const NEXT_TS_TABS = [
    { key: SPINWHEEL_NEXT_KEY, host: '0dayfiles.net', path: '/spin-wheel', url: 'https://0dayfiles.net/spin-wheel' },
    { key: MYFUNZONE_SPIN_NEXT_KEY, host: 'myfunzone.org', path: '/wheel', url: 'https://myfunzone.org/wheel' },
    { key: FILELIST_SPIN_NEXT_KEY, host: 'filelist.io', path: '/spin.php', url: 'https://filelist.io/spin.php' },
];
function checkNextTsTab(t) {
    if (GM_getValue(AUTO_SCAN_ENABLED, true) !== true || isTaskLocked()) return;
    const nextTs = GM_getValue(t.key, 0);
    if (!nextTs || nextTs > Date.now()) return;
    if (HOST === t.host && location.pathname === t.path) return;
    GM_setValue(t.key, 0);
    spawnClaimTab(t.url + CLAIM_HASH);
}
function check0DayFilesAttendance() {
    if (GM_getValue(AUTO_SCAN_ENABLED, true) !== true || isTaskLocked()) return;
    if (location.pathname === '/attendance' || location.pathname === '/spin-wheel') return;
    if (attendanceDone()) return;
    if (Date.now() - GM_getValue(ATTENDANCE_LAST_ATTEMPT_KEY, 0) < ATTENDANCE_ATTEMPT_COOLDOWN) return;
    GM_setValue(ATTENDANCE_LAST_ATTEMPT_KEY, Date.now());
    spawnClaimTab('https://0dayfiles.net/attendance' + CLAIM_HASH);
}
function checkYusceneSpin() {
    if (GM_getValue(AUTO_SCAN_ENABLED, true) !== true || isTaskLocked()) return;
    const nextTs = GM_getValue(YUSCENE_SPIN_NEXT_KEY, 0);
    if (nextTs > Date.now() && pumpkinDone()) return;
    if (HOST === 'yu-scene.net' && (location.pathname === '/prize-wheel' || location.hash === PUMPKIN_HASH)) return;
    if (nextTs <= Date.now()) {
        GM_setValue(YUSCENE_SPIN_NEXT_KEY, 0);
        spawnClaimTab('https://yu-scene.net/prize-wheel' + CLAIM_HASH);
    } else if (pumpkinRetryable()) {
        spawnClaimTab('https://yu-scene.net/' + PUMPKIN_HASH);
    }
}
function startSpinTimers() {
    if (!_timers.spin) {
        NEXT_TS_TABS.forEach(checkNextTsTab);
        _timers.spin = setInterval(() => NEXT_TS_TABS.forEach(checkNextTsTab), SPIN_CHECK_TICK);
    }
    if (!_timers.attendance) {
        setTimeout(check0DayFilesAttendance, ATTENDANCE_FIRST_DELAY);
        _timers.attendance = setInterval(check0DayFilesAttendance, ATTENDANCE_CHECK_TICK);
    }
    if (!_timers.yuscene) {
        checkYusceneSpin();
        _timers.yuscene = setInterval(checkYusceneSpin, SPIN_CHECK_TICK);
    }
}
function maybeAutoScan() {
    if (GM_getValue(AUTO_SCAN_ENABLED, true) !== true || isTaskLocked()) return;
    if (isAutoScanRunning || isSequentialRunning) return;
    if (Date.now() - GM_getValue(AUTO_SCAN_TIME_KEY, 0) < TTL_AUTO_SCAN_MIN) return;
    setTimeout(() => { if (!isTaskLocked()) startAutoScan(true); }, 3000);
}

async function withTab(host, url, timeout, tabKey = host) {
    // 优化：强制静默打开标签页
    const isAuto = isAutoOpenedTab() || location.hash === CLAIM_HASH || location.hash === DETECT_HASH;
    openTabQ(tabKey, url, !isAuto);
    await waitForSiteDone(host, timeout);
    closeTab(tabKey);
    return getSiteStatus(host);
}

async function runPumpkinTab(host, { active = false, waitMs = 20000 } = {}) {
    if (!pumpkinRetryable()) return false;
    const key = host + '#pumpkin';
    closeTab(key); // 👈 新增：打开前先强制清理可能残留的旧标签页
    openTabQ(key, buildClaimUrl(host, 'pumpkin'), active);
    const start = Date.now();
    while (Date.now() - start < waitMs) {
        if (pumpkinDone()) break;
        await sleep(500);
    }
    closeTab(key);
    return true;
}

async function startAutoScan(isAuto = false) {
    if (isAutoScanRunning || isSequentialRunning) return;
    const allTargets = getScanTargets(HOST).slice(0, AUTO_SCAN_CFG.maxPerRun);
    if (!allTargets.length) { GM_setValue(AUTO_SCAN_TIME_KEY, Date.now()); renderStats(); return; }
    if (!tryAcquireTaskLock('autoScan')) {
        showToast('⏳ 其它标签页任务运行中，请稍后再试');
        return;
    }
    isAutoScanRunning = true;
    renderStats(); toggleButtons(true);
    try {
        if (HOST === '0dayfiles.net') {
            if (!attendanceDone()) {
                GM_setValue(ATTENDANCE_LAST_ATTEMPT_KEY, Date.now());
                spawnClaimTab('https://0dayfiles.net/attendance' + CLAIM_HASH);
            }
            if (GM_getValue(SPINWHEEL_NEXT_KEY, 0) <= Date.now()) {
                GM_setValue(SPINWHEEL_NEXT_KEY, 0);
                spawnClaimTab('https://0dayfiles.net/spin-wheel' + CLAIM_HASH);
            }
        }
        log(`[Scan] 阶段 1：并发探测 ${allTargets.length} 个站点`);
        const probeResults = await probeAllSitesParallel(allTargets, 4);
        const needTabHosts = [], claimTargets = [];
        for (const host of allTargets) {
            const r = probeResults[host];
            if (GM_getValue(PROBE_MODE_KEY, 'gm_xhr') === 'tab' || (r && r.needsTab)) needTabHosts.push(host);
            else if (r && r.status === 'available') claimTargets.push(host);
            else if (host === 'yu-scene.net' && r && r.status === 'already' && hasYusceneTask()) claimTargets.push(host);
        }
        log(`[Scan] 阶段 2a：特殊站点开 tab 探测/领取 (${needTabHosts.length} 个)`);
        for (let i = 0; i < needTabHosts.length; i++) {
            const host = needTabHosts[i];
            const st0 = getSiteStatus(host);
            if (st0.status === 'claimed' || st0.status === 'already') continue;
            setSiteStatus(host, { status: 'pending', message: 'tab 探测中...' });
            const isInactiveHost = !!KNOWN_INACTIVE[host] || getAutoDemoted().includes(host);
            const afterSt = await withTab(host, buildClaimUrl(host, 'detect'), isInactiveHost ? INACTIVE_DETECT_TIMEOUT : SEQUENTIAL_TIMEOUT);
            if (afterSt.status === 'pending' || afterSt.status === 'claiming') {
                setSiteStatus(host, { status: 'timeout', message: '探测超时' });
            }
            if (afterSt.status === 'available' || TAB_ONLY_HANDLERS.has(SITES[host] && SITES[host].handler)) {
                claimTargets.push(host);
            }
            if (i < needTabHosts.length - 1) await sleep(AUTO_SCAN_CFG.intervalBetween);
        }
        log(`[Scan] 阶段 2b：为检测到可领取的站点开 tab 领取 (${claimTargets.length} 个)`);
        for (let i = 0; i < claimTargets.length; i++) {
            const host = claimTargets[i];
            setSiteStatus(host, { status: 'pending', message: '领取中...' });
            if (host === 'yu-scene.net') {
                const wheelSt = getSiteStatus(host);
                if (['maintenance', 'failed', 'auth'].includes(wheelSt.status)) {
                    log(`[Scan] ${host} 状态为 ${wheelSt.status}，跳过`);
                    continue;
                }
                if (!yusceneWheelDone()) await withTab(host, buildClaimUrl(host, 'claim'), SEQUENTIAL_TIMEOUT);
                await sleep(SEQUENTIAL_GAP);
                await runPumpkinTab(host);
                continue;
            }
            await withTab(host, buildClaimUrl(host), SEQUENTIAL_TIMEOUT);
            if (i < claimTargets.length - 1) await sleep(AUTO_SCAN_CFG.intervalBetween);
        }
        log(`[Scan] 完成：总计 ${allTargets.length}，开 tab 领取 ${claimTargets.length}，特殊 tab 探测 ${needTabHosts.length}`);
    } finally {
        isAutoScanRunning = false;
        releaseTaskLock();
        toggleButtons(false);
        refreshUI();
        GM_setValue(AUTO_SCAN_TIME_KEY, Date.now());
    }
}

async function runSequential(hosts, { taskName, activeTab, pendingMessage, stateFlag }) {
    if (isSequentialRunning || isAutoScanRunning) return;
    if (!tryAcquireTaskLock(taskName)) {
        showToast('⏳ 其它标签页任务运行中，请稍后再试');
        return;
    }
    if (!hosts.length) { releaseTaskLock(); alert('没有需要处理的任务'); return; }
    stateFlag(true);
    renderStats(); toggleButtons(true);
    try {
        for (let i = 0; i < hosts.length; i++) {
            const host = hosts[i];
            setSiteStatus(host, { status: 'pending', message: pendingMessage });
            // 优化：强制静默打开
            openTabQ(host, buildClaimUrl(host), activeTab);
            const result = await waitForSiteDone(host);
            if (result.status === 'timeout' && !isTerminal(getSiteStatus(host))) {
                setSiteStatus(host, { status: 'timeout', message: result.message || '超时' });
            }
            closeTab(host);
            if (host === 'yu-scene.net') {
                await sleep(SEQUENTIAL_GAP);
                const wheelSt = getSiteStatus(host);
                if (['maintenance', 'failed', 'timeout', 'auth'].includes(wheelSt.status)) {
                    log(`[Sequential] ${host} 状态为 ${wheelSt.status}，跳过南瓜`);
                    continue;
                }
                await runPumpkinTab(host, { active: activeTab });
            }
            if (i < hosts.length - 1) await sleep(SEQUENTIAL_GAP);
        }
    } finally {
        stateFlag(false);
        releaseTaskLock();
        toggleButtons(false);
        refreshUI();
    }
}

function pickWorkHosts() {
    return Object.keys(getActiveSites()).filter(h => {
        if (h === '0dayfiles.net') return has0DayFilesTask();
        if (h === 'dirtybytes.net') return true;
        if (h === 'yu-scene.net') return hasYusceneTask();
        if (h === 'filelist.io') return hasFilelistTask();
        return needsRecheck(h);
    });
}
function startAllSequential() {
    const hosts = pickWorkHosts();
    if (!hosts.length) { showToast('没有需要领取的活跃站点'); return; }
    runSequential(hosts, { taskName: 'sequential', activeTab: true, pendingMessage: '等待中...', stateFlag: v => { isSequentialRunning = v; } });
}
async function startAllParallel() {
    if (isSequentialRunning || isAutoScanRunning) { alert('其它任务正在运行中'); return; }
    if (!tryAcquireTaskLock('parallel')) {
        showToast('⏳ 其它标签页任务运行中，请稍后再试');
        return;
    }
    const hosts = pickWorkHosts();
    if (!hosts.length) { releaseTaskLock(); alert('没有需要领取的活跃站点'); return; }

    isSequentialRunning = true;
    renderStats(); toggleButtons(true);
    try {
        const batchSize = 3;
        for (let i = 0; i < hosts.length; i += batchSize) {
            const batch = hosts.slice(i, i + batchSize);
            for (const host of batch) setSiteStatus(host, { status: 'pending', message: '等待中...' });
            batch.forEach((host, j) => setTimeout(() => {
                const st = getSiteStatus(host);
                if (host === 'yu-scene.net' && ['maintenance', 'failed'].includes(st.status)) {
                    log(`[Parallel] ${host} 状态为 ${st.status}，跳过`);
                    return;
                }
                openTabQ(host, buildClaimUrl(host), false);
                if (host === 'yu-scene.net' && pumpkinRetryable()) {
                    openTabQ(host + '#pumpkin', buildClaimUrl(host, 'pumpkin'), false);
                }
            }, j * OPEN_TAB_INTERVAL));
            await sleep(batchSize * OPEN_TAB_INTERVAL + 5000);
        }
        // 等所有站点落定再放锁，否则别的标签页会在领取途中又起一轮扫描
        await Promise.all(hosts.map(h => waitForSiteDone(h)));
    } finally {
        for (const h of hosts) { closeTab(h); closeTab(h + '#pumpkin'); }
        isSequentialRunning = false;
        releaseTaskLock();
        toggleButtons(false);
        refreshUI();
    }
}

// ==========================================
// 面板层 (包含 UI 优化)
// ==========================================
function ensurePanelCss() {
    if (document.getElementById('pt-panel-css')) return;
    const css = panelCss();
    if (!css) { logWarn('[UI] 样式资源为空，面板将以无样式呈现'); return; }
    const st = document.createElement('style');
    st.id = 'pt-panel-css';
    st.textContent = css + `
        /* ====== 面板展开时的定位 ====== */
        #pt-dashboard-root:not(.collapsed) {
            left: auto !important; right: 20px !important; bottom: 20px !important;
            position: fixed !important; max-height: 85vh !important; overflow: auto !important; z-index: 99999 !important;
        }
        /* ====== 折叠时变身小 Logo 悬浮球 ====== */
        #pt-dashboard-root.collapsed {
            width: 56px !important; height: 56px !important; min-width: 56px !important; max-width: 56px !important;
            border-radius: 50% !important; padding: 0 !important; margin: 0 !important;
            left: auto !important; right: 20px !important; bottom: 20px !important;
            background: linear-gradient(135deg, #2a2a2a, #1a1a1a) !important;
            border: 2px solid #ffb266 !important; box-shadow: 0 4px 15px rgba(0,0,0,0.6) !important;
            cursor: pointer !important; overflow: visible !important; transition: transform 0.2s, box-shadow 0.2s !important;
            z-index: 99999 !important; display: flex !important; align-items: center !important; justify-content: center !important;
        }
        #pt-dashboard-root.collapsed:hover {
            transform: scale(1.1) !important; box-shadow: 0 6px 20px rgba(255,178,102,0.4) !important;
        }
        #pt-dashboard-root.collapsed > *:not(#pt-header) { display: none !important; }
        #pt-dashboard-root.collapsed #pt-header {
            display: flex !important; align-items: center !important; justify-content: center !important;
            width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important;
            background: transparent !important; border: none !important; cursor: pointer !important; box-shadow: none !important; border-radius: 50% !important;
        }
        #pt-dashboard-root.collapsed #pt-header * { display: none !important; }
        #pt-dashboard-root.collapsed #pt-header::after { content: "🎁"; display: block !important; font-size: 28px !important; line-height: 1 !important; }
        /* Badge 提示 */
        #pt-dashboard-root.collapsed::before {
            content: attr(data-badge); position: absolute; top: -4px; right: -4px;
            background: #ff3b30; color: #fff; border-radius: 10px; padding: 2px 6px;
            font-size: 12px; font-weight: bold; border: 2px solid #1a1a1a;
            display: none; align-items: center; justify-content: center; min-width: 20px;
        }
        #pt-dashboard-root.collapsed[data-badge]:not([data-badge=""])::before { display: flex; }
        .btn-copy-log { cursor: pointer; color: #82aaff; margin-left: 4px; }
    `;
    (document.head || document.documentElement).appendChild(st);
}

function mountPanel() {
    document.getElementById('pt-dashboard-root')?.remove();
    ensurePanelCss();
    const tpl = panelHtml();
    if (!tpl.trim()) { logError('[UI] 面板模板资源为空，跳过渲染'); return null; }
    // 默认折叠
    const collapsedNow = GM_getValue(COLLAPSE_KEY, true) === true;
    const filled = tpl
        .replace(/\{\{\s*TODAY\s*\}\}/g, getSiteToday(HOST))
        .replace(/\{\{\s*TOGGLE_ICON\s*\}\}/g, collapsedNow ? '▸' : '▾')
        .replace(/\{\{\s*AUTO_SCAN_CHECKED\s*\}\}/g, GM_getValue(AUTO_SCAN_ENABLED, true) === true ? 'checked' : '');
    const box = document.createElement('div');
    box.innerHTML = filled;
    let root = box.querySelector('#pt-dashboard-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'pt-dashboard-root';
        while (box.firstChild) root.appendChild(box.firstChild);
    }
    document.body.appendChild(root);
    return root;
}

async function openYusceneTab(mode) {
    const pumpkin = mode === 'pumpkin';
    if (pumpkin && !pumpkinRetryable()) return;
    const tabKey = pumpkin ? 'yu-scene.net#pumpkin' : 'yu-scene.net';
    openTabQ(tabKey, buildClaimUrl('yu-scene.net', pumpkin ? 'pumpkin' : 'claim'), true);
    const start = Date.now();
    await waitFor(() => {
        const st = pumpkin ? getPumpkinStatus() : getSiteStatus('yu-scene.net');
        return (isSettled(st) && st.ts > start) || Date.now() - start > 60000;
    }, 60000, 500);
    closeTab(tabKey);
}
function retryHost(host) {
    setSiteStatus(host, { status: 'pending', message: '等待重试...' });
    openTabQ(host, buildClaimUrl(host));
    if (host === 'yu-scene.net' && pumpkinRetryable()) {
        openTabQ(host + '#pumpkin', buildClaimUrl(host, 'pumpkin'));
    }
}
async function checkHost(host) {
    setSiteStatus(host, { status: 'pending', message: '等待检测...' });
    const isInactiveHost = !!KNOWN_INACTIVE[host] || getAutoDemoted().includes(host);
    await withTab(host, buildClaimUrl(host), isInactiveHost ? INACTIVE_DETECT_TIMEOUT : SEQUENTIAL_TIMEOUT);
    const st = getSiteStatus(host);
    if (st.status === 'pending' || st.status === 'claiming') setSiteStatus(host, { status: 'timeout', message: '检测超时' });
    refreshUI();
}
async function onPanelClick(e) {
    const el = e.target.closest('[data-open-yuscene],[data-demote],[data-retry],[data-check],[data-restore],[data-hide],[data-copylog]');
    if (!el) return;
    e.preventDefault();
    const d = el.dataset;
    if (d.openYuscene) return openYusceneTab(d.openYuscene);
    if (d.demote) { demoteSite(d.demote); refreshUI(); return; }
    if (d.restore) { restoreDemotedSite(d.restore); refreshUI(); return; }
    if (d.retry) return retryHost(d.retry);
    if (d.check) return checkHost(d.check);
    if (d.hide) { addToDemoted(d.hide, '手动忽略'); refreshUI(); return; }
    if (d.copylog) {
        try {
            // PTLog.exportAll 接受一个 Set，传入单个 host 即可只导出该站
            PTLog.exportAll(new Set([d.copylog]));
            showToast(`✅ 已导出 ${d.copylog} 日志文件`);
        } catch (e) {
            showToast(`❌ 导出失败：${e.message}`);
        }
        return;
    }
}

function renderDashboard() {
    try {
        if (!document.body) return;
        const root = mountPanel();
        if (!root) return;
        const $ = id => root.querySelector('#' + id);
        const collapsed = GM_getValue(COLLAPSE_KEY, true) === true;
        root.classList.toggle('collapsed', collapsed);
        const toggleBtn = $('pt-toggle') || root.querySelector('.pt-toggle');
        const dateEl = $('pt-date') || root.querySelector('.pt-sub');
        const setToggleIcon = c => { if (toggleBtn) toggleBtn.textContent = c ? '▸' : '▾'; };
        if (dateEl) dateEl.textContent = getSiteToday(HOST);
        setToggleIcon(collapsed);
        const autoBox = $('pt-toggle-autoscan');
        if (autoBox) autoBox.checked = GM_getValue(AUTO_SCAN_ENABLED, true) === true;
        const toggleCollapse = () => {
            const c = root.classList.toggle('collapsed');
            setToggleIcon(c);
            GM_setValue(COLLAPSE_KEY, c);
        };
        $('pt-header')?.addEventListener('click', e => {
            if (e.target.closest('button,input,label')) return;
            toggleCollapse();
        });
        toggleBtn?.addEventListener('click', e => { e.stopPropagation(); toggleCollapse(); });
        const on = (id, fn) => $(id)?.addEventListener('click', fn);
        on('pt-btn-seq', startAllSequential);
        on('pt-btn-parallel', startAllParallel);
        on('pt-btn-scan', () => startAutoScan(false));
        on('pt-btn-reset', () => { if (confirm('确定重置今日所有站点的领取状态？')) resetAllStatuses(); });
        on('pt-btn-log', exportLogs);
        on('pt-btn-clearlog', () => { if (confirm('清空所有站点的本地日志？')) clearLogs(); });
        autoBox?.addEventListener('change', e => { e.stopPropagation(); GM_setValue(AUTO_SCAN_ENABLED, e.target.checked); });
        root.addEventListener('click', onPanelClick);
        setupListeners();
        refreshUI();
    } catch (e) {
        console.error(LOG, '渲染面板失败:', e);
    }
}

function setupListeners() {
    if (listenersRegistered) return;
    listenersRegistered = true;
    const refresh = refreshUI;
    const keys = new Set([...Object.keys(ALL_KNOWN_SITES), ...getAutoDemoted()].map(h => keyFor(h)));
    for (const k of [
        PROMOTED_KEY, DEMOTED_KEY, AUTO_SCAN_ENABLED, AUTO_SCAN_TIME_KEY,
        SPINWHEEL_NEXT_KEY, SPINWHEEL_LAST_REWARD_KEY,
        ATTENDANCE_LAST_CONFIRMED_KEY, ATTENDANCE_LAST_ATTEMPT_KEY, ATTENDANCE_LAST_REWARD_KEY,
        PUMPKIN_LAST_CLAIM_KEY, PUMPKIN_LAST_REWARD_KEY, PUMPKIN_RETIRED_KEY,
        YUSCENE_SPIN_NEXT_KEY, MYFUNZONE_SPIN_NEXT_KEY,
        FILELIST_SPIN_NEXT_KEY, FILELIST_LAST_REWARD_KEY,
        keyFor('yu-scene.net', 'pumpkin'),
    ]) keys.add(k);
    for (const k of keys) GM_addValueChangeListener(k, refresh);
}

// 状态写入很密集（扫描时几十次），合并成一次渲染
let _refreshTimer = null;
const refreshUI = () => {
    if (_refreshTimer) return;
    _refreshTimer = setTimeout(() => {
        _refreshTimer = null;
        renderTable(); renderInactive(); renderStats();
    }, 120);
};

const spinCellHtml = (nextTs, lastReward, label = '🎡 Spin') => {
    const last = escapeHtml(lastReward);
    return nextTs > Date.now()
        ? `${label}：<span style="color:#ffb266">冷却中</span> · 上次：<b>${last}</b> · 下次：${fmtNext(nextTs)}（${remainMin(nextTs)} 分钟后）`
        : `${label}：<span style="color:#9ccc65">可领取</span> · 上次：<b>${last}</b>`;
};
const spinSummaryHtml = (label, nextTs) => nextTs > Date.now()
    ? ` · <span style="color:#ffb266">${label}: ${remainMin(nextTs)} 分钟后</span>`
    : ` · <span style="color:#9ccc65">${label}: 可领取</span>`;
const emptyTable = rowsHtml => `<table><colgroup><col style="width:24%"><col style="width:18%"><col style="width:44%"><col style="width:14%"></colgroup><tbody>${rowsHtml}</tbody></table>`;

const yusceneCellHtml = () => {
    const st = getSiteStatus('yu-scene.net');
    const wheelLabel = STATUS_LABELS[st.status] || st.status;
    let pumpkinLine;
    if (GM_getValue(PUMPKIN_RETIRED_KEY, false) === true) {
        pumpkinLine = `<span style="color:#7a6a5a">🎃 南瓜：已下线（万圣节活动结束）</span>`;
    } else if (pumpkinAttemptsToday() >= PUMPKIN_MAX_ATTEMPTS) {
        pumpkinLine = `<span style="color:#ffb266">🎃 南瓜：今日已尝试 ${PUMPKIN_MAX_ATTEMPTS} 次未确认</span> · 明日再试`;
    } else if (pumpkinDone()) {
        const reward = GM_getValue(PUMPKIN_LAST_REWARD_KEY, '');
        pumpkinLine = `<span style="color:#9ccc65">🎃 南瓜：已领</span>${reward ? ` · 上次 ${escapeHtml(reward)}` : ''}`;
    } else {
        const pumpkinSt = getPumpkinStatus();
        const pumpkinLabel = STATUS_LABELS[pumpkinSt.status] || pumpkinSt.status;
        pumpkinLine = `<span style="color:#ffb266">🎃 南瓜：${pumpkinLabel}</span> · ${escOrDash(pumpkinSt.message)}`;
    }
    return `<div>🎡 转盘：<b>${wheelLabel}</b> · ${escOrDash(st.message)}</div>` +
           `<div style="margin-top:4px;color:#a89680;font-size:11px">${pumpkinLine}</div>`;
};
const filelistCellHtml = () =>
    spinCellHtml(GM_getValue(FILELIST_SPIN_NEXT_KEY, 0), GM_getValue(FILELIST_LAST_REWARD_KEY, '未知'));
const zerofilesCellHtml = () => {
    const attendOk = attendanceDone();
    const attendReward = GM_getValue(ATTENDANCE_LAST_REWARD_KEY, '');
    const attendStatus = attendOk
        ? `<span style="color:#9ccc65">✅ 已签到</span>${attendReward ? ` <span style="color:#9ccc65;font-weight:700">${escapeHtml(attendReward)}</span>` : ''}`
        : '<span style="color:#ffb266">⏳ 未签到</span>';
    const spinInfo = spinCellHtml(GM_getValue(SPINWHEEL_NEXT_KEY, 0), GM_getValue(SPINWHEEL_LAST_REWARD_KEY, '未知'));
    return `<div>${spinInfo}</div><div style="margin-top:4px;color:#a89680;font-size:11px">📅 签到：${attendStatus}</div>`;
};
const dirtybytesCellHtml = st => {
    const isClaimed = st.status === 'claimed' || st.status === 'already';
    const detail = st.message ? escapeHtml(st.message) : '';
    if (isClaimed) return `<div style="color:#c4b5a0;font-size:12px">${detail || '<span class="msg empty">—</span>'}</div>`;
    const color = st.status === 'available' ? '#ffcb6b' : '#ffb266';
    const tag = st.status === 'available' ? '⏳ 待发放' : '⏳ 检测中';
    return `<div><span style="color:${color};font-weight:700">${tag}</span></div>`
        + (detail ? `<div style="margin-top:4px;color:#c4b5a0;font-size:12px">${detail}</div>` : '');
};
const CELL_RENDERERS = {
    '0dayfiles.net': zerofilesCellHtml,
    'dirtybytes.net': dirtybytesCellHtml,
    'yu-scene.net': yusceneCellHtml,
    'filelist.io': filelistCellHtml,
};

function actionHtmlFor(host, st, isPromoted) {
    let html;
    if (host === '0dayfiles.net') {
        html = `<a href="https://0dayfiles.net/attendance#pt-claim" target="_blank">📅 签到</a> · <a href="https://0dayfiles.net/spin-wheel#pt-claim" target="_blank">🎡 转盘</a>`;
    } else if (host === 'dirtybytes.net') {
        html = `<a href="${DIRTYBYTES_ORIGIN}/" target="_blank">打开</a>`;
    } else if (host === 'yu-scene.net') {
        const pumpkinRetired = GM_getValue(PUMPKIN_RETIRED_KEY, false) === true;
        html = `<a href="#" data-open-yuscene="wheel">🎡 转盘</a> · ` +
            (pumpkinRetired
             ? `<span style="color:#7a6a5a;text-decoration:line-through">🎃 南瓜（已下线）</span>`
             : `<a href="#" data-open-yuscene="pumpkin">🎃 南瓜</a>`) +
            ` · <a href="#" data-retry="${host}">重试</a>`;
    } else if (st.status === 'auth') {
        html = `<a href="https://${host}/login" target="_blank">登录</a> · <a href="#" data-retry="${host}">重试</a>`;
    } else if (st.status === 'available') {
        html = `<a href="${buildClaimUrl(host)}" target="_blank">🎁 领取</a> · <a href="#" data-retry="${host}">重试</a>`;
    } else if (['failed', 'skip', 'timeout', 'notopen', 'maintenance'].includes(st.status)) {
        html = `<a href="https://${host}/" target="_blank">打开</a> · <a href="#" data-retry="${host}">重试</a> · <a href="#" data-hide="${host}">忽略</a>`;
    } else if (st.status === 'empty') {
        html = `<a href="#" data-retry="${host}">立即重试</a>`;
    } else {
        html = `<a href="${buildClaimUrl(host)}" target="_blank">打开</a>`;
    }
    if (isPromoted) html += ` · <a href="#" data-demote="${host}">取消提升</a>`;

    // 新增单站日志复制
    html += ` · <span class="btn-copy-log" data-copylog="${host}" title="导出此站日志">📥日志</span>`;
    return html;
}

/** 站点表格行（活跃表 / 已停止表共用） */
function rowHtml({ host, tag = '', failBadge = '', note = '', sub = '', cls, statusText, msg, actions }) {
    return `<tr>`
        + `<td><div class="host">${siteIconHtml(host)}<div class="host-body"><div class="host-name">${escapeHtml(host)}${tag}${failBadge}</div>${note}${sub}</div></div></td>`
        + `<td class="${cls}">${statusText}</td>`
        + `<td class="msg">${msg}</td>`
        + `<td>${actions}</td>`
        + `</tr>`;
}

function renderTable() {
    const tbody = document.getElementById('pt-tbody');
    if (!tbody) return;
    const activeSites = getActiveSites();
    const promoted = getPromoted();

    // 优化：只看有活动的过滤
    const onlyAvail = GM_getValue(FILTER_ONLY_AVAIL_KEY, false) === true;
    const hosts = Object.keys(activeSites).filter(host => {
        if (!onlyAvail) return true;
        const st = getSiteStatus(host);
        return ['available', 'claimed', 'already', 'failed'].includes(st.status);
    });

    tbody.innerHTML = hosts.map(host => {
        const cfg = activeSites[host];
        const st = getSiteStatus(host);
        const label = STATUS_LABELS[st.status] || st.status;
        const renderer = CELL_RENDERERS[host];
        const msg = renderer ? renderer(st) : escOrDash(st.message);
        const note = cfg.note ? `<div class="note">${escapeHtml(cfg.note)}</div>` : '';
        const isPromoted = promoted.includes(host);
        const tag = isPromoted ? `<span class="promoted-tag">自动提升</span>` : '';
        const failCount = getFailureCount(host);
        const failBadge = (failCount > 0 && failCount < AUTO_SCAN_CFG.failureThreshold)
            ? `<span class="fail-badge" title="连续失败次数">⚠ ${failCount}/${AUTO_SCAN_CFG.failureThreshold}</span>` : '';
        return rowHtml({
            host, tag, failBadge, note,
            cls: `st-${st.status}`, statusText: label, msg,
            actions: actionHtmlFor(host, st, isPromoted),
        });
    }).join('');
}

function computeScanBadge(st) {
    if ((st.status === 'claiming' || st.status === 'pending') && st.ts) return `<span class="scan-badge scanning">🔄 探测中</span>`;
    if (!st.ts) return `<span class="scan-badge pending">⏰ 未探测</span>`;
    const t = new Date(st.ts);
    const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    const dayLabel = (Date.now() - st.ts) < DAY ? '今日' : `${Math.floor((Date.now() - st.ts) / DAY)} 天前`;
    const map = {
        skip: ['无活动', 'negative'], timeout: ['超时', 'negative'], failed: ['失败', 'negative'],
        auth: ['未登录', 'warning'], available: ['有活动', 'positive'], already: ['已领', 'positive'],
        claimed: ['已领', 'positive'], notopen: ['未开放', 'warning'], maintenance: ['维护中', 'warning'],
    };
    const [text, color] = map[st.status] || [st.status, 'positive'];
    return `<span class="scan-badge ${color}">✓ ${dayLabel}已探测 (${text}) ${time}</span>`;
}

function renderInactive() {
    const container = document.getElementById('pt-inactive');
    if (!container) return;
    const inactiveMap = getInactiveOnly();
    const hosts = Object.keys(inactiveMap);
    if (!hosts.length) { container.innerHTML = ''; return; }
    const rows = hosts.map(host => {
        const cfg = inactiveMap[host];
        const st = getSiteStatus(host);
        const isAutoDemoted = !!cfg.autoDemoted;
        const isPaused = !!cfg.paused;
        const msg = (isPaused || !st.message) ? (cfg.reason ? escapeHtml(cfg.reason) : '<span class="msg empty">—</span>') : escapeHtml(st.message);
        const tag = isPaused ? `<span class="demoted-tag">维护暂停</span>`
                  : isAutoDemoted ? `<span class="demoted-tag">自动降级</span>` : '';
        const failCount = getFailureCount(host);
        const failBadge = (isAutoDemoted && failCount > 0) ? `<span class="fail-badge">${failCount} 次失败</span>` : '';
        const actions = isAutoDemoted
            ? `<a href="https://${host}/" target="_blank">打开</a> · <a href="#" data-check="${host}">检测</a> · <a href="#" data-restore="${host}">恢复</a>`
            : `<a href="https://${host}/" target="_blank">打开</a> · <a href="#" data-check="${host}">检测</a>`;
        return rowHtml({
            host, tag, failBadge,
            sub: `<div style="margin-top:4px">${computeScanBadge(st)}</div>`,
            cls: 'st-inactive', statusText: isPaused ? '🛠 维护中' : '💤 无活动', msg, actions,
        });
    }).join('');
    const promotedCount = getPromoted().length, demotedCount = getAutoDemoted().length;
    const badges = [];
    if (demotedCount > 0) badges.push(`<span class="badge demoted">${demotedCount} 个自动降级</span>`);
    if (promotedCount > 0) badges.push(`<span class="badge recovered">${promotedCount} 个已提升</span>`);
    if (!badges.length) badges.push(`<span class="badge">${hosts.length} 个</span>`);
    container.innerHTML = `<h2 class="section-title">已停止活动 ${badges.join(' ')}</h2>${emptyTable(rows)}`;
}

function renderStats() {
    const hosts = Object.keys(getActiveSites());
    let done = 0;
    for (const h of hosts) {
        const s = getSiteStatus(h);
        if (s.status === 'claimed' || s.status === 'already') done++;
    }
    const pct = hosts.length ? (done / hosts.length) * 100 : 0;
    const bar = document.getElementById('pt-progress');
    if (bar) bar.style.width = `${pct}%`;
    const sum = document.getElementById('pt-summary');
    if (sum) {
        const running = isSequentialRunning ? ' <span class="running">（串行领取中...）</span>' : '';
        const scanning = isAutoScanRunning ? ' <span class="running">（两阶段扫描中...）</span>' : '';
        const lastTs = GM_getValue(AUTO_SCAN_TIME_KEY, 0);
        const scanInfo = lastTs
            ? ` · <span style="color:#9ccc65">上次扫描：${fmtAgo(lastTs)}</span>`
            : ' · <span style="color:#a89680">尚未自动扫描</span>';
        const parts = [];
        const attendOk = attendanceDone();
        parts.push(spinSummaryHtml('0DayFiles Spin', GM_getValue(SPINWHEEL_NEXT_KEY, 0)));
        parts.push(` · <span style="color:${attendOk ? '#9ccc65' : '#ffb266'}">签到: ${attendOk ? '已签到' : '未签到'}</span>`);
        const dbSt = getSiteStatus('dirtybytes.net');
        if (dbSt && ['claimed', 'already', 'available'].includes(dbSt.status)) {
            const color = ['claimed', 'already'].includes(dbSt.status) ? '#9ccc65' : '#ffcb6b';
            parts.push(` · <span style="color:${color}">DirtyBytes: ${escapeHtml((dbSt.message || '').split('·')[0].trim() || dbSt.status)}</span>`);
        }
        const pumpkinSt = getPumpkinStatus();
        const pumpkinRetired = GM_getValue(PUMPKIN_RETIRED_KEY, false) === true;
        parts.push(pumpkinRetired
                   ? ' · <span style="color:#7a6a5a">南瓜: 已下线</span>'
                   : pumpkinAttemptsToday() >= PUMPKIN_MAX_ATTEMPTS
                   ? ` · <span style="color:#ffb266">南瓜: 今日已试 ${PUMPKIN_MAX_ATTEMPTS} 次</span>`
                   : pumpkinDone()
                   ? ' · <span style="color:#9ccc65">南瓜: 已领</span>'
                   : ` · <span style="color:#ffb266">南瓜: ${STATUS_LABELS[pumpkinSt.status] || pumpkinSt.status}</span>`);
        parts.push(spinSummaryHtml('YUSCENE 转盘', GM_getValue(YUSCENE_SPIN_NEXT_KEY, 0)));
        const filelistSt = getSiteStatus('filelist.io');
        if (filelistSt.status === 'claimed' || filelistSt.status === 'already') {
            parts.push(' · <span style="color:#9ccc65">FileList: 已领</span>');
        } else if (filelistSt.status === 'inactive') {
            parts.push(' · <span style="color:#7a6a5a">FileList: 无活动</span>');
        } else {
            parts.push(spinSummaryHtml('FileList Spin', GM_getValue(FILELIST_SPIN_NEXT_KEY, 0)));
        }
        sum.innerHTML = `活跃进度：${done} / ${hosts.length} （${Math.round(pct)}%）${running}${scanning}${scanInfo}${parts.join('')}`;
    }
    const badge = document.getElementById('pt-active-badge');
    if (badge) {
        const p = getPromoted().length, d = getAutoDemoted().length;
        const parts = [`${hosts.length} 个`];
        if (p > 0) parts.push(`含 ${p} 个提升`);
        if (d > 0) parts.push(`${d} 个降级移出`);
        badge.textContent = parts.join('，');
    }

    // 更新悬浮球 Badge
    const root = document.getElementById('pt-dashboard-root');
    if (root) {
        let availCount = 0;
        for (const h of hosts) {
            if (getSiteStatus(h).status === 'available') availCount++;
        }
        if (availCount > 0) root.setAttribute('data-badge', availCount);
        else root.removeAttribute('data-badge');
    }
}

function toggleButtons(disabled) {
    for (const id of ['pt-btn-seq', 'pt-btn-parallel', 'pt-btn-scan', 'pt-btn-reset']) {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
    }
}

function openDashboard() {
    if (location.hash !== DASHBOARD_HASH) location.hash = DASHBOARD_HASH;
    renderDashboard();
}

function registerPanelEntry() {
    GM_registerMenuCommand('📊 打开奖励控制面板', openDashboard);
    GM_registerMenuCommand('📋 导出日志', exportLogs);
    GM_registerMenuCommand('🗑️ 清空日志', clearLogs);
    GM_registerMenuCommand('👁️ 切换：只看有活动/已领站点', () => {
        const cur = GM_getValue(FILTER_ONLY_AVAIL_KEY, false);
        GM_setValue(FILTER_ONLY_AVAIL_KEY, !cur);
        refreshUI();
        showToast(`过滤模式：${!cur ? '只看活跃' : '显示全部'}`);
    });
    GM_registerMenuCommand('🌐 切换网络日志 hook', () => {
        const cur = GM_getValue(DEBUG_NETLOG_KEY, false);
        GM_setValue(DEBUG_NETLOG_KEY, !cur);
        alert('网络日志 hook：' + (!cur ? '已开启（刷新页面生效）' : '已关闭（刷新页面生效）'));
    });
    GM_registerMenuCommand('🐞 调试：不自动关领取标签页', () => {
        const cur = GM_getValue(DEBUG_KEEP_TAB_KEY, false);
        GM_setValue(DEBUG_KEEP_TAB_KEY, !cur);
        alert('调试保留标签页：' + (!cur ? '已开启' : '已关闭'));
    });
    GM_registerMenuCommand('🧹 清空本站 GM 缓存', () => {
        if (!confirm(`确定清空 ${HOST} 的全部本地缓存？\n（状态 / 路径 / pending / 失败计数 / 循环保护 / 站点专属）`)) return;
        clearHostCache(HOST);
        alert(`已清空 ${HOST} 的缓存\n请刷新页面后重新点「扫描」。`);
    });
    window.addEventListener('hashchange', () => { if (location.hash === DASHBOARD_HASH) renderDashboard(); });
}

// ==========================================
// 入口
// ==========================================
const NAVIGATE_TIMEOUT = 30 * 1000;
const _navWatchdogs = new Map();
function armNavigateWatchdog(host, timeout = NAVIGATE_TIMEOUT) {
    // 慢站给更长的跳转宽限
    if (host === 'jme-reunit3d.de' || host === 'filelist.io') timeout = 45000;
    if (_navWatchdogs.has(host)) {
        clearTimeout(_navWatchdogs.get(host));
        _navWatchdogs.delete(host);
    }
    const startTs = Date.now();
    // DOM 就绪说明已经跳过来了，提前撤销；once 避免监听器堆积
    const onLoad = () => { clearTimeout(timer); _navWatchdogs.delete(host); };
    const timer = setTimeout(() => {
        window.removeEventListener('DOMContentLoaded', onLoad);
        _navWatchdogs.delete(host);
        const st = getSiteStatus(host);
        if (st.status === 'claiming' && (st.ts || 0) <= startTs) {
            log(`[Watchdog] ${host} navigating 超时（${Math.round(timeout / 1000)}s），标记 timeout`);
            setSiteStatus(host, { status: 'timeout', message: '提交后未收到服务端响应/跳转' });
            try { renderDashboard(); } catch (e) {}
            closeSelf();
        }
    }, timeout);
    _navWatchdogs.set(host, timer);
    window.addEventListener('DOMContentLoaded', onLoad, { once: true });
}

function finishClaim(result) {
    if (!result) return;
    if (isNavigating(result)) { armNavigateWatchdog(HOST); return; }
    setSiteStatus(HOST, result);
    if (!isAutoOpenedTab() && !window.opener) {
        try { renderDashboard(); } catch (e) {}
    }
    closeSelf();
}

async function runClaim() {
    const pageHtml = document.documentElement?.outerHTML || '';
    const pageText = document.body?.innerText || '';
    const hasNormalUI = /events__prize|pw__status|attendance-checkin|attendance-dot-wrap|attendance-today__form|gift-btn|spinWheel|ratio-bar__points|dw-wrap|#spin/i.test(pageHtml);
    if (!hasNormalUI && isMaintenanceText(pageText)) {
        setSiteStatus(HOST, { status: 'maintenance', message: '站点维护中 (503)' });
        return closeSelf();
    }
    if (HOST === '0dayfiles.net') {
        const r = location.pathname === '/attendance'
            ? await claimOn0DayFilesAttendance()
            : await claimOn0DayFilesSpinWheel();
        setSiteStatus(HOST, r);
        return closeSelf();
    }
    if (HOST === 'yu-scene.net') {
        if (isOnEventPage()) {
            const r = await handleMultiEventClaim();
            if (r && ['inactive', 'notopen', 'skip'].includes(r.status) && !isNavigating(r)) {
                if (yusceneWheelDone()) {
                    setSiteStatus(HOST, { status: 'already', message: `活动已过期，今日转盘也已完成${r.message ? '（' + r.message + '）' : ''}` });
                    return closeSelf();
                }
                setSiteStatus(HOST, { status: 'pending', message: '活动已过期，转去转盘...' });
                location.href = location.origin + '/prize-wheel' + CLAIM_HASH;
                return;
            }
            setSiteStatus(HOST, r);
            return closeSelf();
        }
        if (location.pathname === '/events' || location.pathname === '/events/') {
            const list = checkEventList(document, HOST);
            if (list.paths && list.paths.length) {
                if (list.paths.length > 1) setPendingEvents(HOST, list.paths);
                setSiteStatus(HOST, { status: 'pending', message: '前往今日活动...' });
                location.href = location.origin + list.paths[0] + CLAIM_HASH;
                return;
            }
            setSiteStatus(HOST, { status: 'pending', message: '无今日活动，转去转盘...' });
            location.href = location.origin + '/prize-wheel' + CLAIM_HASH;
            return;
        }
        if (location.pathname !== '/prize-wheel') {
            setSiteStatus(HOST, { status: 'pending', message: '导航到转盘页面...' });
            location.href = location.origin + '/prize-wheel' + CLAIM_HASH;
            return;
        }
        setSiteStatus(HOST, await claimOnYusceneSpinWheel());
        return closeSelf();
    }
    setSiteStatus(HOST, { status: 'claiming', message: '正在领取...' });
    const cfg = ALL_KNOWN_SITES[HOST];
    if (!cfg) { setSiteStatus(HOST, { status: 'failed', message: '未配置的站点' }); return closeSelf(); }
    const isPromotedNow = getPromoted().includes(HOST);
    if (KNOWN_INACTIVE[HOST] && !isPromotedNow && !cfg.rewardPath && !cfg.handler && !cfg.rewardLinkText) {
        setSiteStatus(HOST, { status: 'skip', message: cfg.reason || '暂时无活动' });
        return closeSelf();
    }
    let result;
    try { result = await dispatchHandler(cfg); }
    catch (e) { result = { status: 'failed', message: `异常：${e.message || e}` }; }
    finishClaim(result || { status: 'skip', message: '无处理结果' });
}

function setupYuscenePumpkin() {
    if (HOST !== 'yu-scene.net') return;
    setTimeout(() => claimYuscenePumpkin(), 2000);
}

async function main() {
    if (!ALL_KNOWN_SITES[HOST]) return;
    log(`[Main] enter host=${HOST} hash=${location.hash} vis=${document.visibilityState}`);
    if (HOST === 'samaritano.cc' || GM_getValue(DEBUG_NETLOG_KEY, false)) PTLog.installNetworkLog(W);
    checkDailyReset();
    migrateRenamedSites();
    cleanupStalePending();
    maybeClearStaleLock();
    startSpinTimers();
    if (location.hash === DASHBOARD_HASH) { registerPanelEntry(); return renderDashboard(); }
    if (HOST === 'yu-scene.net' && location.hash === PUMPKIN_HASH) {
        markAutoTab(); // 直接标记，不废话
        await claimYuscenePumpkin();
        return closeSelf();
    }
    const auto = isAutoOpenedTab();
    if (location.hash === CLAIM_HASH || location.hash === DETECT_HASH || auto) {
        markAutoTab();
        return runClaim();
    }
    // 这几个站点在普通页面直接出面板，不做导航
    if (HOST === '0dayfiles.net' || HOST === 'dirtybytes.net' || HOST === 'yu-scene.net') {
        if (HOST === '0dayfiles.net' && (location.pathname === '/attendance' || location.pathname === '/spin-wheel')) {
            setSiteStatus(HOST, location.pathname === '/attendance'
                ? await claimOn0DayFilesAttendance()
                : await claimOn0DayFilesSpinWheel());
        }
        if (HOST === 'dirtybytes.net') setSiteStatus(HOST, await claimOnDirtyBytes());
        renderDashboard();
        if (HOST === 'yu-scene.net' && (location.pathname === '/' || location.pathname === '')) setupYuscenePumpkin();
        return registerPanelEntry();
    }
    const cfg = ALL_KNOWN_SITES[HOST];
    const isUnit3DStyle = cfg && (cfg.handler === 'unit3d' || cfg.handler === 'infinityhd' || !cfg.handler);
    if (isUnit3DStyle && isOnEventPage()) {
        const visitKey = 'pt_auto_visit_' + HOST + '_' + location.pathname;
        let visited = false;
        try { visited = sessionStorage.getItem(visitKey) === '1'; } catch (e) {}
        if (!visited) {
            try { sessionStorage.setItem(visitKey, '1'); } catch (e) {}
            return runClaim();
        }
        if (isMaintenancePage(document.documentElement.outerHTML)) {
            setSiteStatus(HOST, { status: 'maintenance', message: '站点维护中' });
            return closeSelf();
        }
        return finishClaim(await handleMultiEventClaim());
    }
    if (cfg && cfg.handler === 'retrotoon' && location.pathname.includes('attendance.php') && /[?&]claimed=1/.test(location.search)) {
        await sleep(300);
        setSiteStatus(HOST, { status: 'claimed', message: extractRetroToonReward() || '已成功领取每日奖励' });
        return closeSelf();
    }
    if (HOST === 'czteam.me' || (cfg && cfg.handler === 'seedcore')) return runClaim();
    if (!isOnEventPage()) maybeAutoScan();
    renderDashboard();
    registerPanelEntry();
}

const _runMain = () => main().catch(e => logError('[Main] 未捕获异常', e && (e.stack || e.message) || e));

if (location.hash === CLAIM_HASH || location.hash === DETECT_HASH) {
    markAutoTab();
    _runMain();
} else {
    setTimeout(_runMain, 500);
}

})();
