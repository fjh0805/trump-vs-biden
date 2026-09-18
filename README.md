# 《特朗普大战拜登》

浏览器多人即时战略：在美国本土 48 州地图上派卡通头像部队，带战争迷雾与房间语音。玩法受 State.io 启发，美术与代码均为原创。

游玩路径：**/**（根路径打开即是标题页）

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:43123/` 。

`npm run dev` 使用 Vite + Cloudflare 插件，在本地 Workers 运行时里同时跑前端和 Durable Object（等价于文档要求的 `wrangler dev` 体验）。也可以先构建再跑：

```bash
npm run build
npx wrangler dev --port 43123 --ip 0.0.0.0
```

## 怎么玩

1. **点自己亮着的州，把兵派去邻州抢地。**
2. **迷雾只亮你领地和部队周围一圈，靠边打边探。**
3. **建房拿房间码，好友输码进房；开麦报州名，州多的赢。**

老家：红方德州 / 佛州 / 俄亥俄，蓝方加州 / 纽约 / 宾州（可随机）。2v2 同阵营按密西西比河东西分控，共享迷雾与胜负，只能指挥自己半边。电脑按防守 → 支援 → 进攻决策，约 1.25 秒评估一次。

数值锁（`src/shared/balance.ts` 共建核算表）：普通州 **2.0 秒产 1 兵**，老家 **1.6 秒产 1 兵**，单州上限 **40**。开局老家 **12 兵**；中立州按地图面积小/中/大分别为 **5 / 7 / 9 兵**，占领前无主。默认出兵 **50%**，底部快捷 **25 / 50 / 全部**。两军相遇每 **0.25 秒各减 1**，打到一方归零，余部占州。先占 **26 州** 即胜；满 **4:30** 比州数，再并列比总兵力。电脑进攻需本州兵力 ≥ 邻敌 **1.25 倍**。

掉线：非房主等 **15 秒**（界面「对方掉线，等待重连 15s」），超时由电脑暂管其部队，重连收回。房主掉线房间再留 **60 秒**。

电脑进攻同分时优先 **S 级**（加州、德州、纽约、佛州、宾州），其次 **A 级**（俄亥俄、伊利诺伊、乔治亚、北卡、密歇根），其余为 B。房间码 **4 位**，字母表不含 0/O/1/I。音效仅出兵/交火/占州/胜利，默认音量 30%，可关。

### 胜负（界面顶部与结算层会写明）

- 一局 **4 分 30 秒**。
- 先占领 **26 / 48** 州立即获胜。
- 时间到：比州数；并列比总兵力。
- 结束可立刻再来一局。

### 模式

- **1v1 对战**：各选一个老家对打；缺人则电脑补位。
- **双人同边打 AI**：两名真人同一阵营，西岸 / 东岸分控，对两个电脑。

部队是特朗普阵营 / 拜登阵营的漫画头像 SVG（漫画夸张，不是真人照片）。对局中可点底部「喊话」快捷条，把预设中文口令发到房间聊天。

## 手机

面向竖屏手机：地图铺满屏幕，顶栏 / 出兵比例条叠在地图上，玩家与聊天收进「面板」。单指拖动画布，双指捏合缩放；双击空白处放大或回到铺满。州界与出兵按钮按 44–48px 触控热区处理。横屏可用，顶栏会再收一层。部队沿邻州直线等速前进（细线 + 头像），交火只飘字、轻震一下。

## 架构

- 前端：Vite SPA（静态资源）。
- 后端：Cloudflare Worker + Durable Object `GameRoom`（一个房间码对应一个 DO，内存权威状态，SQLite 持久化以防休眠丢失）。
- 同步：WebSocket Hibernation API。
- 语音：房间 DO 做 WebRTC 信令，媒体走浏览器 P2P；STUN 使用 `stun.cloudflare.com`。

房间状态不需要 D1。

## 部署（推荐：Worker + 静态资源一次发布）

Cloudflare 现在把 Pages 静态站和 Worker 合成「Worker + Assets」。本仓库按这个模型配置，**一条命令同时部署前端和带 Durable Object 的后端**，访问同一个域名即可玩。

1. 安装并登录 Wrangler：`npx wrangler login`
2. 发布：

```bash
npm install
npm run deploy
```

即 `vite build && wrangler deploy`。生产地址类似：

`https://telangpu-dazhan-baideng.<你的子域>.workers.dev/`

需要自定义域时，在 Cloudflare Dashboard 给该 Worker 绑域名。

`wrangler.toml` 已包含：

- `assets.not_found_handling = "single-page-application"`
- `run_worker_first = ["/api/*"]`（房间 HTTP / WebSocket 走 Worker）
- Durable Object 绑定 `ROOM` → `GameRoom`

## 拆开部署 Pages + Worker（可选）

若必须把 UI 放到 Pages、API 放到 Worker：

1. **Worker**（含 Durable Object）

```bash
npm run build
npx wrangler deploy
```

记下 Worker URL，例如 `https://telangpu-dazhan-baideng.<account>.workers.dev`。

2. **Pages**（只上传前端静态文件）

Vite 构建后客户端在 `dist/client/`：

```bash
npx wrangler pages project create telangpu-dazhan-baideng-pages
npx wrangler pages deploy dist/client --project-name telangpu-dazhan-baideng-pages
```

3. 让 Pages 上的 SPA 把 `/api/*` 指到 Worker：在 Pages 项目里加一条 **Advance → HTTP routes / 反向代理**，或构建时把 API 基址写成 Worker 域名。最省事的方式仍是上面的「Worker + Assets」单域名方案，语音 WebSocket 也不会跨域。

Pages **Functions 不作为本游戏权威服**：房间状态必须跑在 Durable Object 上，因此 DO 只能挂在 Worker（或绑定了 DO 的 Pages Functions）。本仓库的 `worker/` 就是权威服。

## 地图数据

`scripts/bake-map.mjs` 把 US Atlas 10m TopoJSON 烘焙成 48 州路径 + 中英标签（例如 California / 加州）。源文件来自 `us-atlas`，坐标经 Albers 投影并量化，不含阿拉斯加/夏威夷（可后续做插画插页）。

```bash
# 若你更新了 /tmp/states-10m.json
npm run bake-map
```

## 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地开发（端口 43123） |
| `npm run build` | 构建 SPA + Worker |
| `npm run deploy` | 构建并发布到 Cloudflare |
| `npm run types` | 根据 wrangler.toml 生成 `Env` 类型 |
