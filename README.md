[Uploading README.md…]()
[README.md](https://github.com/user-attachments/files/35093775/README.md)

# PT Daily Reward Dashboard

> 多站点 PT 每日奖励控制面板 —— 一个 Tampermonkey 用户脚本，把几十个 PT 站的每日签到、转盘、活动礼物收进同一个面板里批量领取。

![version](https://img.shields.io/badge/version-11.0.6-blue)
![license](https://img.shields.io/badge/license-GPL--3.0-green)
![platform](https://img.shields.io/badge/platform-Tampermonkey-orange)

支持 **57 个站点**，覆盖 Unit3D 系活动页、以及十余个有独立玩法的站点（转盘、签到、南瓜、抽奖）。所有领取都在后台静默完成，不抢焦点、不打断你正在做的事。

---

## 特性

- **一键扫描全部**：并发探测所有站点的今日活动，只对真有可领内容的站点动手
- **后台静默领取**：标签页在后台打开，领取完自动关闭；能直接 POST 的站点走极速直领，连标签页都不开
- **多活动连续领取**：同一站点有多个活动时按顺序全部领完，不会领一个就走
- **特殊玩法适配**：转盘、签到、南瓜、抽奖等非标准活动页有独立处理器
- **时区感知**：按站点所在时区判断"今天"，避免跨时区把今日活动误判成已过期
- **自动降级 / 恢复**：连续 3 次探测失败的站点自动移出活跃列表，恢复后自动回来
- **维护暂停**：已知在维护的站点可以暂停扫描，不占扫描时间、不计失败
- **悬浮球 Badge**：页面上直接显示还有几个站没领
- **单站日志**：每个站点独立日志，可一键导出排查

## 安装

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)（Chrome / Edge / Firefox 均可）
2. 安装脚本：

   ```
   https://raw.githubusercontent.com/linlikun/PT-Daily-Reward-Dashboard/main/PT-Daily-Reward-Dashboard.js
   ```

3. 用 Tampermonkey 打开上面的地址，点「安装」。`@require` 的 `pt-core.js` 和 `dist/` 下的资源文件会自动从 CDN 加载，不需要额外下载。
4. 在浏览器里登录你要用的 PT 站，然后打开任意一个受支持的站点。

> 脚本需要 `@connect *` 权限，用于跨站请求活动页；`@noframes` 保证不在内嵌框架里重复运行。

## 使用

### 打开面板

三种方式，任选一种：

- 页面右下角的**悬浮球**，点一下展开
- Tampermonkey 菜单 →「📊 打开奖励控制面板」
- 地址后加 `#pt-dashboard`

### 面板操作

| 按钮 | 作用 |
|---|---|
| 🔍 立即扫描全部 | 并发探测所有站点今日是否有可领活动 |
| ▶ 串行领取全部 | 逐个站点领取，稳但慢；适合站点多、怕触发风控时用 |
| ⚡ 并行领取全部 | 分批同时领取，快；每批之间留了间隔 |
| ↺ 重置今日 | 清空今日领取状态，重新扫描（**不会**恢复已下线的活动） |
| 📋 导出日志 | 导出全部站点日志为 txt，反馈问题时附上这个 |
| 🗑️ 清空日志 | 清空日志缓冲区 |
| 每日自动扫描 | 开关。打开后每天首次访问受支持站点时自动跑一轮 |

表格里的每个站点都能单独「检测」或「重试」，已降级的站点可以手动「恢复」。

### 状态说明

| 状态 | 含义 |
|---|---|
| ⏳ 待领取 | 已识别到今日活动，等待领取 |
| 🔄 领取中 | 正在提交 |
| ✅ 已领取 | 本次成功领取 |
| ℹ️ 今日已领 | 之前已领过，今天不用再领 |
| 🎁 检测到可领取 | 确认有可领内容 |
| 🎲 空礼物 | 领到了空奖励（转盘常见） |
| 🔒 需要登录 | 站点 cookie 失效，重新登录即可 |
| ⏰ 未到时间 | 活动有未来预告，今天还没开始 |
| 💤 无活动 | 该站当前没有活动页 |
| 🚧 维护中 | 站点维护，稍后再试 |
| ⌛ 超时 | 探测超时，连续 3 次会自动降级 |
| ❌ 失败 | 请求或解析失败，详情看日志 |
| ⚠️ 跳过 | 条件不满足（按钮禁用、结构变化等） |

### 菜单命令

Tampermonkey 菜单里还有几个排查用的开关：

- 📋 导出日志 / 🗑️ 清空日志
- 👁️ 只看有活动/已领站点
- 🌐 切换网络日志 hook（排查请求问题，会显著增加日志量，平时关着）
- 🐞 调试：不自动关领取标签页
- 🧹 清空本站 GM 缓存

## 支持的站点

按处理器分为 13 类，共 57 个站点：

| 处理器 | 站点数 | 说明 |
|---|---|---|
| `unit3d` | 45 | Unit3D 系标准活动页（`/events`） |
| `infinityhd` | 1 | InfinityHD 定制活动页 |
| `v3x` | 1 | V3X：签到 + 转盘直接调用 `api.v3x.club` |
| `digitalcore` | 1 | DigitalCore 积分签到 |
| `dirtybytes` | 1 | DirtyBytes 每日连续签到 |
| `czteam` | 1 | CZTeam 每日礼物 |
| `seedcore` | 1 | SeedCore 气泡/日期玩法 |
| `retrotoon` | 1 | RetroToon 每日签到 |
| `spinwheel` | 1 | 0DayFiles：签到 + 转盘双任务 |
| `yuscene_spinwheel` | 1 | YUSCENE：转盘 + 万圣节南瓜双任务 |
| `polishtorrent` | 1 | PolishTorrent 转盘 |
| `myfunzone` | 1 | MyFunZone 转盘 |
| `filelist` | 1 | FileList 转盘 |

<details>
<summary>展开完整站点列表</summary>

**Unit3D 系（45）**
3dvault.org · bitporn.eu · capybarabr.com · clearjav.com · darkpeers.org · dreadvault.org · eiga.moi · emu-warez.com · f1carreras.xyz · gemini-tracker.org · generation-free.org · hd-united.vn · hellenic-hd.cc · homiehelpdesk.net · immortuos.life · itatorrents.xyz · jme-reunit3d.de · lat-team.com · luminarr.me · malayabits.cc · midnightscene.cc · nirvana.li · nordicq.org · oldtoons.world · onlyencodes.cc · podzemlje.net · portugas.org · rastastugan.org · reelflix.cc · retro-movies.club · samaritano.cc · seedpool.org · sextorrent.myds.me · shareisland.org · skipthecommercials.xyz · torrent.desi · torrenteros.org · torrentland.li · tracker.milnueve.cc · tracker.teamflix.cc · tracker.vietmediaf.store · turkseed.com · upload.cx · upscalevault.com · znth.cx

**独立玩法（12）**
0dayfiles.net · czteam.me · digitalcore.club · dirtybytes.net · filelist.io · infinityhd.net · myfunzone.org · polishtorrent.top · retrotoon.world · seedcore.net · v3x.club · yu-scene.net

</details>

## 仓库结构

```
PT-Daily-Reward-Dashboard/
├── PT-Daily-Reward-Dashboard.js   # 主脚本（安装这个）
├── README.md
└── dist/                          # 通过 @resource 加载的静态资源
    ├── pt-core.js                 # 公共工具库（@require 引入）
    ├── dashboard.css              # 面板样式
    ├── dashboard.html             # 面板结构
    ├── sites.json                 # 站点表：域名 → 处理器
    ├── inactive.json              # 已下线/无活动站点
    └── timezone.json              # 站点时区表
```

`dist/` 下的文件通过 jsDelivr 加载，脚本里对 CSS / HTML / JSON 做了 fastly、unpkg 的兜底切换。改完这些文件推到 `main` 分支即可生效（jsDelivr 有缓存，通常几分钟内刷新）。

## 自定义

### 新增站点

在 `dist/sites.json` 里加一行即可，键是域名，值指定处理器：

```json
{
  "example-tracker.com": { "handler": "unit3d" }
}
```

Unit3D 系的站默认走 `/events`，如果活动页路径不同，加上 `rewardPath`：

```json
{
  "example-tracker.com": { "handler": "unit3d", "rewardPath": "/giveaways" }
}
```

站点改名时，脚本里的 `SITE_OVERRIDES` 可以在不改 `sites.json` 的情况下临时覆盖或下线旧域名：

```js
const SITE_OVERRIDES = {
    'old-domain.com': null,                                    // 旧域名下线
    'new-domain.com': { handler: 'unit3d', rewardPath: '/events' },
};
```

### 时区配置

`dist/timezone.json` 决定脚本如何判断站点的"今天"：

```json
{
  "digitalcore.club": "Europe/Berlin",
  "filelist.io": "Europe/Bucharest"
}
```

没配时区的站点会同时接受 UTC+8 和 UTC 两个日期，宁可多认一天也不错判。**不确定时区就别填**——填错会让"今天"整体偏一天，比留空更糟。

### 站点维护

已知在维护的站点，在脚本的 `SITE_PAUSED` 里加一行，暂停期内完全不探测：

```js
const SITE_PAUSED = {
    'oldtoons.world': { reason: '站点维护中', until: Date.parse('2026-11-26T00:00:00+08:00') },
};
```

到期后自动回到常规扫描，不需要手动改回来。

## 工作原理

1. **探测**：并发请求各站活动页，解析今日活动卡片（未领 / 已领 / 未来）
2. **直领**：能直接 POST 领取接口的站点，后台完成，不开标签页
3. **开页领取**：需要交互的站点，在后台标签页打开活动页执行领取，完成后自动关闭
4. **落定**：把结果写进 GM 存储，面板和悬浮球据此刷新

站点状态、失败计数、活动路径缓存都按域名分开存，互不干扰；跨标签页用任务锁保证同一时间只有一轮任务在跑。

## 常见问题

**一直显示「🔒 需要登录」？**
站点 cookie 过期了，重新登录该站，再点一次扫描。

**某个站一直「⌛ 超时」或「❌ 失败」？**
先确认浏览器里能正常打开该站。如果站点被 Cloudflare 拦截或 `GM_xhr` 被 CSP 挡住，可以改用标签页模式探测；连续 3 次失败后脚本会自动把它移出活跃列表，不再每轮白等。

**扫描时打开了很多标签页？**
需要交互的站点必须开页领取。标签页在后台静默打开、领完自动关闭。如果不想看到这个过程，优先用「▶ 串行领取全部」，或在菜单里关掉「每日自动扫描」，改成手动触发。

**日期判断不对，今天的活动被判成已过期？**
该站没配时区，或时区配错了。检查 `dist/timezone.json`。

**重置今日后，之前标记为已下线的活动又出现了？**
「↺ 重置今日」只清今日领取状态，不恢复已下线标记。如果你手动清过 GM 缓存，南瓜这类活动会重新尝试一次探测，属正常。

**日志太多？**
菜单里的「🌐 切换网络日志 hook」会把站点自身请求也记进来，排查完记得关掉，否则日志会被站点自身的轮询刷满。

## 更新日志

### 11.0.6
- `torrenthaven.org` 已并入 `infinityhd.net`：从活跃站点表、脚本匹配规则和本地缓存中移除
- `v3x.club` 改为独立 `v3x` handler：签到与转盘直接 POST `api.v3x.club`，不再跳转不存在的 `/events` 页面

### 11.0.5
- 支持站点改名（`emu-warez.com`），旧域名记录自动清理
- 新增站点维护暂停机制，维护期不探测、不计失败

### 11.0.4
- 南瓜活动增加当日尝试上限（3 次，间隔 30 分钟），避免无限重试
- 「重置今日」不再清除"活动已下线"标记
- 转盘冷却时间加合理性校验，异常值按 26 小时兜底并记日志
- 连续超时计入自动降级

### 11.0.3
- 扫描并发提到 6，全局超时按站点数自适应
- 缺时区的站点同时接受 UTC+8 与 UTC 两个日期
- 新增状态变化日志，便于排查

## 免责声明

本项目仅用于**个人账号的每日签到自动化**，不提供账号、邀请或任何绕过站点权限的功能。使用前请确认不违反各站点的用户协议；因使用本脚本导致的账号风控、封禁等后果由使用者自行承担。

## 许可证

[GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html)

作者：Whale, DeepSeek
