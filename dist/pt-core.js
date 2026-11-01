/* pt-core.js —— PT Daily Reward Dashboard 公共层
 *
 * 由主脚本以 @require 注入，与主脚本处于同一沙箱作用域；
 * 通过全局 var PT_CORE 暴露能力，主脚本解构后使用。
 *
 * 内容：时间常量 / 日志（持久化 + 网络 hook）/ 网络请求 / 页面性质判定 /
 *       文本与时间格式化 / 标签页管理。
 * 依赖：GM_getValue、GM_setValue、GM_deleteValue、GM_xmlhttpRequest、unsafeWindow。
 * 与站点无关——不含任何站点表、状态机或领取逻辑。
 */
var PT_CORE = (function () {
'use strict';

/* ---- 时间常量 ---- */
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- 日志层：每个实例绑定一个 host，读写各自的本地缓冲 ---- */
function createLogger({ tag = '[PT]', host = '', key = 'pt_debug_log_v2_', max = 800, ttl = 48 * HOUR, flushDelay = 400 } = {}) {
    let pending = [];
    let timer = null;

    const serialize = args => args.map(a => {
        if (a == null) return String(a);
        if (typeof a === 'string') return a;
        if (typeof a === 'number' || typeof a === 'boolean') return String(a);
        if (a instanceof Error) return (a.stack || a.message || String(a));
        if (a instanceof Element) return `<${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}>`;
        try { return JSON.stringify(a); } catch (e) { return String(a); }
    }).join(' ');

    const buffer = h => {
        const raw = GM_getValue(key + h, null);
        if (!Array.isArray(raw)) return [];
        const cutoff = Date.now() - ttl;
        return raw.filter(e => e && typeof e.ts === 'number' && e.ts > cutoff);
    };

    const flush = () => {
        timer = null;
        if (!pending.length) return;
        const buf = buffer(host);
        buf.push(...pending);
        pending = [];
        while (buf.length > max) buf.shift();
        try { GM_setValue(key + host, buf); } catch (e) {}
    };

    const append = (level, args) => {
        pending.push({ ts: Date.now(), level, msg: serialize(args) });
        if (level === 'error') console.error(tag, ...args);
        else if (level === 'warn') console.warn(tag, ...args);
        else console.log(tag, ...args);
        if (!timer) timer = setTimeout(flush, flushDelay);
    };

    const log = (...a) => append('info', a);
    const warn = (...a) => append('warn', a);
    const error = (...a) => append('error', a);

    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);

    /** 给页面 fetch / XHR 挂日志（幂等，只挂一次） */
    const installNetworkLog = W => {
        if (W._pt_netlog_hooked) return;
        W._pt_netlog_hooked = true;
        try {
            const origFetch = W.fetch.bind(W);
            W.fetch = function (input, init) {
                const url = typeof input === 'string' ? input : (input && input.url) || '';
                const method = (init && init.method) || (input && input.method) || 'GET';
                const t0 = performance.now();
                return origFetch(input, init).then(res => {
                    log(`[Net] ${method} ${url} → ${res.status}  (${(performance.now() - t0).toFixed(0)}ms)`);
                    return res;
                }).catch(err => {
                    error(`[Net] ${method} ${url} → FAILED: ${err.message} (${(performance.now() - t0).toFixed(0)}ms)`);
                    throw err;
                });
            };
        } catch (e) {}
        try {
            const origOpen = W.XMLHttpRequest.prototype.open;
            const origSend = W.XMLHttpRequest.prototype.send;
            W.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
                this._ptLogMethod = method;
                this._ptLogUrl = url;
                return origOpen.apply(this, [method, url, ...rest]);
            };
            W.XMLHttpRequest.prototype.send = function (...args) {
                const t0 = performance.now();
                this.addEventListener('load', () => {
                    if (this._ptLogUrl && !String(this._ptLogUrl).includes('/cdn-cgi/')) {
                        log(`[XHR] ${this._ptLogMethod} ${this._ptLogUrl} → ${this.status} (${(performance.now() - t0).toFixed(0)}ms)`);
                    }
                });
                this.addEventListener('error', () => {
                    error(`[XHR] ${this._ptLogMethod} ${this._ptLogUrl} → ERROR (${(performance.now() - t0).toFixed(0)}ms)`);
                });
                return origSend.apply(this, args);
            };
        } catch (e) {}
    };

    /** 汇总多个 host 的日志并下载 + 复制 */
    const exportAll = hosts => {
        const lines = [];
        for (const h of hosts) {
            for (const e of buffer(h)) {
                const ts = new Date(e.ts).toISOString().replace('T', ' ').slice(0, 23);
                lines.push(`[${ts}] [${h}] [${e.level.toUpperCase()}] ${e.msg}`);
            }
        }
        lines.sort();
        const text = lines.join('\n') || '（无日志）';
        try {
            const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `pt-reward-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) { error('[Log] 下载失败:', e.message || e); }
        try {
            navigator.clipboard.writeText(text).catch(() => warn('[Log] 复制到剪贴板失败（可能需要 https 或用户手势）'));
        } catch (e) {}
    };

    const clearAll = hosts => {
        for (const h of hosts) GM_deleteValue(key + h);
        log('[Log] 已清空所有站点的本地日志');
    };

    return { log, warn, error, flush, buffer, exportAll, clearAll, installNetworkLog };
}

/* ==========================================================================
   网络层 + 页面性质判定 + 格式化 + toast（原主脚本第 4 节）
   ========================================================================== */
const NET_ERR_RE = /ERR_INVALID_RESPONSE|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE|net::ERR_/i;
const isNetError = msg => NET_ERR_RE.test(String(msg || ''));

async function fetchWithTimeout(url, options = {}, timeout = 5000, retries = 1) {
    for (let i = 0; i < retries; i++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout);
        try {
            const res = await fetch(url, { ...options, signal: ctrl.signal });
            clearTimeout(timer);
            return res;
        } catch (e) {
            clearTimeout(timer);
            if (i === retries - 1) {
                if (isNetError(e.message)) throw Object.assign(new Error(`网络层异常：${e.message}`), { name: 'NetworkError' });
                throw e;
            }
            await sleep(1000);
        }
    }
}

function gmFetch(url, { timeout = 10000, method = 'GET', data = null, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method,
            url,
            timeout,
            withCredentials: true,
            headers: {
                'User-Agent': navigator.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': navigator.language || 'en-US,en;q=0.9',
                ...headers,
            },
            data,
            onload: r => {
                const finalUrl = r.finalUrl || url;
                resolve({
                    ok: r.status >= 200 && r.status < 300,
                    status: r.status,
                    statusText: r.statusText || '',
                    finalUrl,
                    url: finalUrl,
                    redirected: finalUrl !== url,
                    text: () => Promise.resolve(r.responseText || ''),
                });
            },
            onerror: e => {
                const msg = String((e && e.error) || 'network');
                if (/timeout/i.test(msg)) reject(Object.assign(new Error('GM_xhr timeout'), { name: 'AbortError' }));
                else reject(new Error(`GM_xhr error: ${msg}`));
            },
            ontimeout: () => reject(Object.assign(new Error('GM_xhr timeout'), { name: 'AbortError' })),
        });
    });
}

/* ---- 页面性质判定（全脚本唯一入口） ---- */
const looksLikeLoginPage = html => {
    if (!html) return false;
    if (/<form[^>]+action=["'][^"']*\/login/i.test(html)) return true;
    if (/name=["']password["']/i.test(html) && /name=["']username["']/i.test(html)) return true;
    return /<title>[^<]*\b(login|sign in)\b/i.test(html);
};
const looksLikeLoginResponse = res => !!(res && ((res.redirected && /\/(login|auth|signin)/i.test(res.url)) || res.status === 401 || res.status === 403));
const looksLikeCloudflareChallenge = html => !!html && /cf-browser-verification|cf_chl_|Just a moment/i.test(html);
const looksLike404 = html => {
    if (!html) return false;
    if (/events__prize/.test(html)) return false;
    return /Error 404|The route events could not be found|Page not found/i.test(html) || /<title>[^<]*404[^<]*<\/title>/i.test(html);
};
const isMaintenancePage = html => {
    if (!html) return false;
    if (/top-nav|panelV2|data-table|ratio-bar|events__list|error__heading/i.test(html)) return false;
    return /503\s*[-:]?\s*SERVICE UNAVAILABLE|offline for scheduled maintenance|maintenance mode|<title>[^<]*Maintenance[^<]*<\/title>|站点维护|系统维护/i.test(html);
};
const MAINTENANCE_TEXT_RE = /503\s*[-:]?\s*SERVICE UNAVAILABLE|MAINTENANCE|offline for scheduled maintenance|站点维护|维护中|back shortly/i;
const isMaintenanceText = t => MAINTENANCE_TEXT_RE.test(t || '');
/** 正文像维护页、且页面里没有指定业务组件时判定为维护 */
const isMaintenanceBody = exceptSel => isMaintenanceText(document.body?.innerText || '')
    && !(exceptSel && document.querySelector(exceptSel));
const isOnLoginPageNow = () => /\/(login|auth|signin)/i.test(location.pathname)
    || !!(document.querySelector('input[name="password"]') && document.querySelector('input[name="username"]'));

/** 把一段 HTML 归类成状态对象；正常页面返回 null */
function classifyHtml(html) {
    if (!html) return null;
    if (looksLike404(html)) return { status: 'inactive', message: '该站无活动页面 (404)' };
    if (isMaintenancePage(html)) return { status: 'maintenance', message: '站点维护中' };
    if (looksLikeLoginPage(html)) return { status: 'auth', message: '会话已过期 (登录页)' };
    if (looksLikeCloudflareChallenge(html)) return { status: 'maintenance', message: '被 Cloudflare 拦截' };
    return null;
}

/** HTTP 响应码 → 站点状态；正常响应返回 null（notFound=false 时不归类 404） */
function httpStatusToResult(res, { auth = false, notFound = true } = {}) {
    if (auth && (res.status === 401 || res.status === 403)) return { status: 'auth', message: `需要登录 (HTTP ${res.status})` };
    if (notFound && res.status === 404) return { status: 'inactive', message: '该站无活动页面 (404)' };
    if (res.status >= 500) return { status: 'maintenance', message: `服务器错误 (HTTP ${res.status})` };
    return null;
}

function waitFor(fn, timeout = 5000, interval = 150) {
    return new Promise(resolve => {
        const start = Date.now();
        const check = () => {
            try { const r = fn(); if (r) { resolve(r); return true; } } catch (e) {}
            if (Date.now() - start > timeout) { resolve(null); return true; }
            return false;
        };
        if (check()) return;
        const t = setInterval(() => { if (check()) clearInterval(t); }, interval);
    });
}

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escOrDash = s => s ? escapeHtml(s) : '<span class="msg empty">—</span>';
const siteIconHtml = host => `<img class="site-icon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;

/** 取 CSRF Token：meta 优先，Laravel 的 XSRF-TOKEN cookie 兜底 */
function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) return meta.content;
    const m = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}

/* ---- 时间格式化（统一入口，替代原先 6 处重复写法） ---- */
function fmtAgo(ts) {
    const age = Date.now() - ts;
    if (age < MIN) return '刚刚';
    if (age < HOUR) return `${Math.floor(age / MIN)} 分钟前`;
    if (age < DAY) return `${Math.floor(age / HOUR)} 小时前`;
    return `${Math.floor(age / DAY)} 天前`;
}
const fmtNext = ts => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtClock = ts => new Date(ts).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const remainMin = ts => Math.ceil((ts - Date.now()) / MIN);
/** 冷却提示文案（各站 handler 共用） */
const cooldownText = (lastReward, nextTs, withMinutes = true) =>
    `冷却中 · 上次：${lastReward} · 下次：${fmtNext(nextTs)}${withMinutes ? `（${remainMin(nextTs)} 分钟后）` : ''}`;

function showToast(text) {
    if (!document.body) return;
    const el = document.createElement('div');
    el.textContent = text;
    Object.assign(el.style, {
        position: 'fixed', right: '20px', bottom: '20px', zIndex: '2147483647',
        background: '#1e1611', color: '#9ccc65', padding: '12px 18px',
        borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.6)',
        fontSize: '13px', fontWeight: '700', border: '1px solid #3d2d20',
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",Roboto,sans-serif',
        transition: 'opacity .3s', opacity: '1', pointerEvents: 'none'
    });
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

/* ==========================================================================
   标签页管理
   ========================================================================== */
const tabRegistry = Object.create(null);

/** 开标签页并登记（active 时同时记为“当前 tab”供 closeSelf 使用） */
function openTab(key, url, active = false) {
    const tab = GM_openInTab(url, { active, insert: true });
    if (active) window._pt_current_tab = tab;
    tabRegistry[key] = tab;
    return tab;
}
/** 关闭并注销登记的标签页 */
function closeTab(key) {
    const tab = tabRegistry[key];
    if (!tab) return;
    try { tab.close(); } catch (e) {}
    delete tabRegistry[key];
}
/** 一次性后台标签页：无需回收登记，由页面自身关闭 */
const spawnClaimTab = url => GM_openInTab(url, { active: false, insert: true });

return {
    MIN, HOUR, DAY, sleep, waitFor,
    escapeHtml, escOrDash, siteIconHtml, showToast,
    fmtAgo, fmtNext, fmtClock, remainMin, cooldownText,
    isNetError, fetchWithTimeout, gmFetch, getCsrfToken,
    looksLikeLoginPage, looksLikeLoginResponse, looksLikeCloudflareChallenge, looksLike404,
    isMaintenancePage, isMaintenanceText, isMaintenanceBody, isOnLoginPageNow,
    classifyHtml, httpStatusToResult,
    createLogger, tabRegistry, openTab, closeTab, spawnClaimTab,
};

})();
