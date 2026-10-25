# 「股市圆桌」多智能体股票分析模块 实施计划

## 一、模块定位

新增业务模块 **Stock（股市圆桌）**：用户选择分析对象（大盘 / 指数 / 板块 / 个股），后端拉取真实 A 股行情并计算技术指标，生成「数据简报」分发给 **5 位风格迥异的专家智能体**，先**并行独立分析**，再进入**圆桌辩论轮相互质疑否定**，最后由**会议主席**归纳产出最终会议纪要（共识/分歧/多空投票/操作建议/风险提示），全程 SSE 流式展示在圆桌可视化页面。

> 分析仅供学习研究参考，报告固定附带免责声明，不构成投资建议。

## 二、五位专家 + 会议主席（7 个 AiAgent，code 为锚点）

| code | 角色 | 方法论（提示词人设） | 性格 |
|---|---|---|---|
| `stock-trend` | 趋势专家·道氏门人 | MA/EMA 多空排列、MACD 金叉死叉、BOLL 通道、趋势结构 | 沉稳，重右侧交易 |
| `stock-momentum` | 动量专家·短线猎手 | KDJ/RSI/WR/乖离率、超买超卖、涨跌节奏 | 激进敏锐，短线视角 |
| `stock-flow` | 量价专家·主力追踪 | 成交量结构、OBV、换手率、量比、量在价先 | 疑心重，盯"谁在买" |
| `stock-value` | 价值专家·守拙先生 | 估值框架、行业格局、基本面逻辑、中长期 | 慢节奏，反投机 |
| `stock-risk` | 风控专家·空头检察官 | 情景推演、黑天鹅、止损纪律、仓位管理 —— **专职否定其他专家** | 天生唱反调，会议的"魔鬼代言人" |
| `stock-moderator` | 会议主席·衡之 | 中立主持：归纳共识、点出分歧、产出纪要 | 不站队 |

每位专家的 systemPrompt 内置：人设 + 分析框架 + **输出格式约定**（正文 + 末尾 `【立场】看多/看空/中性`、`【置信度】0-100`、`【核心依据】` 标签行，供后端正则解析立场，流式展示与结构化解析兼得）。

## 三、会议流程（后端编排，复用 ai/chat 两段式 SSE 模式）

1. **POST `/stock/roundtable`** `{subjectType: market|index|sector|stock, symbol?, question?, mode}` → 创建会话落库，后台启动编排，立即返回 `{id}`。mode：`quick`(独立+总结) / `standard`(独立+1轮辩论，默认) / `deep`(独立+2轮辩论)。
2. **GET `/stock/roundtable/:id/stream`** SSE 订阅（Map+Subject 共享、断线重连重放 buffer、TTL 清理，照抄 `chat.service.ts:27-119` 的已验证实现）。
3. 编排阶段：
   - **preparing**：拉行情（实时快照 + 250 日 K 线 + 板块/大盘上下文），后端纯函数计算 MA/EMA/MACD/KDJ/RSI/BOLL/ATR/WR/量比等 → 组装数据简报（文本+结构化 JSON，落库）。
   - **round1 独立分析**：5 专家**并行**调用（用户原话"同时分析"），chunk 事件带 `expertCode` 路由到对应卡片；完成后解析立场。
   - **debate 辩论**：**串行**发言，每人可见其他人的立场与此前发言，被点名质疑须回应；风控专家最后发言做总否定。
   - **summary 总结**：主席汇总全部发言流式产出纪要；后端统计多空投票，解析结构化结论。
   - 全程 `stage`/`expert_start`/`chunk`/`expert_done`/`vote`/`summary_chunk`/`done`/`error`/`thinking` 心跳事件。
4. 容错：单个专家失败发 `expert_error` 后继续（其余 4 人开会）；主席失败则用立场数据本地模板兜底生成纪要；**无可用模型渠道时，用基于指标信号的规则引擎本地兜底**（如 MACD 金叉+均线多头→趋势专家看多），保证零配置也能演示/测试，与 divination 降级思路一致。行情源全挂则会话 failed 并明确报错。
5. 每次调用经 `UsageLogService.record` 记录用量（kind 扩展 `roundtable`），耗时打点。

## 四、行情数据源（免费公开接口，无 key，多源互备）

- 实时快照：腾讯 `qt.gtimg.cn`（主）/ 新浪 `hq.sinajs.cn`（备，带 Referer），GBK 用 `TextDecoder('gbk')` 解码。
- 日 K 线：东方财富 `push2his` kline 接口（前复权，250 根）。
- 板块列表/涨幅榜：东方财富 clist（行业 `t:2`/概念 `t:3`）；搜索：腾讯 sug 智能搜索 + 东财搜索双源。
- 指标全部**后端纯 TS 计算**（`indicators.util.ts`，约 200 行，不加依赖），K 线接口直接返回"K线+指标序列"，前端 echarts 免算。
- 内存 TTL 缓存（快照 30s / K线 10 分钟 / 板块 5 分钟），失败自动切换备用源。

## 五、后端改动清单

```
common/entities/stock-roundtable.entity.ts   # 会话主表：对象类型/code/name、question、mode、status
                                             # (preparing/round1/debating/summarizing/completed/failed)、
                                             # briefJson、summaryText、consensusJson、errorMessage
common/entities/stock-roundtable-turn.entity.ts  # 发言表：round、expertCode、expertName、content、
                                                  # stanceJson(方向/置信度/要点)、status
modules/stock/
  stock.module.ts            # forFeature 两实体 + imports AiModule
  stock.controller.ts        # POST 发起 / GET stream(SSE,SKIP_RESPONSE_WRAP) / 列表 / 详情
  market-data.controller.ts  # GET search / quote / kline / overview / sectors（行情只读接口）
  roundtable.service.ts      # 编排 + SSE 状态机（两段式）
  experts.service.ts         # 加载 agents、prompt 组装、立场解析、规则兜底
  market/market-data.service.ts + tencent-quote.api.ts + eastmoney.api.ts
  indicators.util.ts
  dto/roundtable.dto.ts
```

接线：`app.module.ts` 两处 entities 数组（sqlite 测试 + mysql）登记新实体、imports 注册 StockModule、SSE 禁缓冲中间件 forRoutes 增加 stock 流路由；`ai.module.ts` exports 增加 `ModelRouterService`、`UsageLogService`（供 stock 复用，改动一行）。

种子与脚本：
- `seed.service.ts` 新增 `ensureStockSetup()`（仿 `ensureAiSetup()` 幂等模板）：权限码 `stock:roundtable:use`、菜单资源「股市圆桌」`/stock`、admin 角色补绑。
- 新脚本 `scripts/sync-stock-agents.ts`（仿 sync-divination-agent.ts 三级幂等查找）批量同步 6 个智能体及提示词，npm scripts 加 `sync:stock`；`deploy/scripts/` 增加 `04-sync-stock-agents.sh`。

## 六、前端改动清单（MainLayout 内管理页 `/stock`）

新依赖：`echarts` + `echarts-for-react`（项目目前无图表库）。

```
api/stock.ts                    # 类型 + 行情/会议 API + streamRoundtable（复用 streamSse）
pages/stock/
  StockPage.tsx                 # 主页面：分析台 Tab + 会议记录 Tab
  components/SubjectPicker.tsx  # 大盘/板块/个股切换 + 联想搜索 + 实时快照卡
  components/KlineChart.tsx     # echarts K线 + MA + 成交量 + MACD/KDJ/RSI 副图切换
  components/RoundtableStage.tsx# 圆桌舞台：环形座位布局、发言高亮脉冲、
                                #   流式打字气泡、阶段进度条、多空投票动画条
  components/ExpertCard.tsx     # 头像/流派徽章/立场(红涨绿跌色)/置信度/摘要
  components/ReportPanel.tsx    # 会议纪要：结论/共识/分歧/投票/建议/风险 + 免责声明，可复制
  components/HistoryTable.tsx   # AppTable 历史记录 + Drawer 回放（各轮发言+报告）
  stock.css                     # 纯 CSS keyframes（发言脉冲/投票条/结论印章），沿用 divination 动画手法
```

- 圆桌舞台：桌面端环形座位（5 专家围绕中心主席），当前发言者卡片放大高亮、文字流式打字；移动端退化为纵向卡片列表（Tailwind 响应式）。
- 路由 `router/index.tsx` 在 `/` children 加 `/stock`（套 MainLayout + RequireAuth）；`MainLayout.tsx` 的 `pathIconMap`、`PAGE_CODE_MAP` 各加一条；发起按钮用 `<Permission code="stock:roundtable:use">`。
- 样式复用现有 `@theme` token（primary/文本/画布色），红涨绿跌用 A 股惯例色。

## 七、测试

- 单测：`indicators.util.spec.ts`（MACD/KDJ/RSI 已知值、金叉判定）、立场解析器（标签行解析）、行情 API 解析器（fixture 字符串，不联网）。
- e2e（sqlite，仿现有 test/ 风格）：无模型配置时走规则兜底 → 完整跑通 发起→SSE 事件序列→落库→历史查询 断言。

## 八、文档

- 根 README：模块/权限码/接口补充。
- `helloagents/wiki/modules/stock.md` 新增模块文档（架构图、SSE 事件协议表、数据源说明）。

## 九、实施顺序

1. 实体 + 模块骨架 + app.module/ai.module 接线
2. 行数 据源服务 + 指标计算 + 单测
3. 专家服务（人设/解析/规则兜底）+ 圆桌编排 + SSE + 持久化
4. seed + sync 脚本 + e2e 测试
5. 前端 API 层 + K线图 + 选股器
6. 圆桌舞台 + 报告面板 + 历史回放 + 路由菜单
7. 文档更新，`npm test` + 前后端启动自测

## 十、风险与对策

- **免费接口不稳定/被限流**：双源互备 + TTL 缓存 + 明确报错提示；接口解析器与网络层分离，便于测试。
- **免费接口字段变更**：解析器集中在两个 api 文件，单测覆盖。
- **会议总时长**（standard = 5 并行 + 5 串行 + 1 总结）：并行轮约等于单次调用时长，串行辩论逐人流式推进可感知进度；单流 90s 超时、总会话 8 分钟上限，超时按已有内容收尾（沿用 chat.service 部分输出即收尾策略）。
- **模型费用**：mode 三档可控，quick 模式仅 6 次调用；用量全部落 ai_usage_logs。