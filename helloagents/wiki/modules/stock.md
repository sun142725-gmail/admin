# 股市圆桌（Stock Roundtable）模块

多智能体股票分析：五位风格迥异的专家（趋势/动量/量价/价值/风控）+ 会议主席，对**大盘 / 指数 / 板块 / 个股**进行圆桌式分析，交叉辩论后产出会议纪要。

> ⚠️ 分析结果由 AI 基于公开行情生成，仅供学习研究参考，不构成投资建议。

## 架构

```
用户发起 POST /stock/roundtable ──┐
                                  ▼
                      RoundtableService（编排 + SSE 状态机）
                        │ 数据准备（preparing）
                        │   └─ MarketDataService（免费公开行情 + TTL 缓存 + 多源互备）
                        │        ├─ 快照：腾讯 qt.gtimg.cn（主）→ 新浪（备）
                        │        ├─ K 线：东财 push2his（主）→ 腾讯 ifzq → 新浪（备）
                        │        ├─ 搜索：腾讯 smartbox（主；东财 suggest 已失效废弃）
                        │        └─ 板块：东财 clist（主，BKxxxx）→ 新浪 newSinaHy（备，new_xxx，
                        │             无 K 线时会议简报自动降级为成分股聚合视图）
                        │   └─ indicators.util（MA/MACD/KDJ/RSI/BOLL/ATR/OBV/WR/BIAS 纯函数）
                        │ 第一轮（round1）：5 专家并行独立分析
                        │ 辩论轮（debating）：串行发言、点名质疑、风控压轴（quick/standard/deep = 0/1/2 轮）
                        │ 总结（summarizing）：主席产出纪要 + 多空投票 + 结构化结论
                        ▼
              GET /stock/roundtable/:id/stream（SSE，断线重连回放）
```

## 智能体（AiAgent，code 为锚点）

| code | 角色 | 流派 |
|---|---|---|
| `stock-trend` | 道远 | 趋势派：均线排列 / MACD / BOLL |
| `stock-momentum` | 小雷 | 动量派：KDJ / RSI / 乖离率 |
| `stock-flow` | 墨量 | 量价派：量比 / OBV / 换手 |
| `stock-value` | 守拙 | 价值派：估值 / 位置 / 安全边际 |
| `stock-risk` | 谨言 | 风控派：专职否定、情景推演、止损纪律 |
| `stock-moderator` | 衡之 | 会议主席：归纳共识分歧、产出纪要 |

- 同步脚本：`cd backend && npm run sync:stock`（幂等；智能体未同步时自动回落内置人设）；
  绑定指定模型行：`SYNC_STOCK_MODEL_ID=<id> npm run sync:stock`。
- **会话级模型选择**：发起会议可传 `modelId`（前端"模型"下拉，默认自动）；路由优先级
  `会话指定模型 > 智能体绑定模型 > 任意 chat 渠道`；模型列表接口 `GET /api/stock/models`。
- 模型渠道复用 AI 中心管理（`ai_models` 路由，多行互备）；**无可用渠道时专家走本地规则兜底**（按指标评分生成观点，会议仍可完整进行并落库）。
- 每次调用计入 `ai_usage_logs`（kind=`roundtable`）。

## SSE 事件协议（`GET /api/stock/roundtable/:id/stream`）

| event | data | 说明 |
|---|---|---|
| `stage` | `{stage, label, round?}` | 阶段切换：preparing/round1/debating/summarizing |
| `brief` | `{subjectType, subjectName, snapshot, summary, ...}` | 数据简报就绪（快照 + 指标摘要） |
| `expert_start` | `{round, code, name, school}` | 某专家开始发言 |
| `chunk` | `{round, code, text}` | 流式文本增量（并行轮多专家交错） |
| `expert_done` | `{round, code, name, stance, source}` | 发言完成，含解析立场 `{direction, confidence, keyPoints}` |
| `expert_error` | `{round, code, name, message}` | 单专家失败（会议继续） |
| `vote` | `{round, tally, stances}` | 多空投票汇总（每轮后） |
| `convergence` | `{round, stanceShift, flipped, converged, reason}` | 辩论收敛检测（基础轮次打满后每轮一次） |
| `summary_chunk` | `{text}` | 主席纪要流式 |
| `summary_done` | `{conclusion, conclusionLabel, votes, stances}` | 结构化结论 |
| `done` / `error` | — | 终态 |
| `thinking` | `{elapsedMs}` | 空闲心跳 |

订阅容错：迟到订阅者自动回放已缓冲事件（游标式 flush），进程重启后按落库内容回放精简版。

## 数据表

- `stock_roundtables`：会话主表（对象/问题/模式/状态/briefJson/summaryText/consensusJson）。
- `stock_roundtable_turns`：每轮发言（round、expertCode、content、stanceJson、status）。

## REST 接口（JwtAuthGuard，数据按 userId 隔离）

- `POST /stock/roundtable` `{subjectType: market|index|sector|stock, symbol?, question?, mode?}`
- `GET /stock/roundtable` / `GET /stock/roundtable/:id` / `DELETE /stock/roundtable/:id`
- 行情：`GET /stock/market/search|quote|kline|overview|sectors`（kline 返回 K 线 + 后端算好的指标序列）

## 前端

- 页面 `/stock`（MainLayout 内）：分析台（对象选择 + 实时快照 + echarts K线（MACD/KDJ/RSI/BOLL 副图））+ 会议记录（回放/删除）。
- 圆桌舞台：环形座次（5 专家 + 中央主席），发言高亮脉冲、流式打字、多空投票条、结论印章动画；窄屏退化为纵向。
- 权限码 `stock:roundtable:use` 控制菜单与发起按钮（seed 自动初始化，挂在「AI 中心」菜单下）。

## 测试

- `test/stock-indicators.spec.ts`：指标算法、行情解析器（腾讯/新浪/东财，fixture 为实抓数据）、立场解析、本地兜底。
- `test/stock-roundtable.spec.ts`：mock 行情源下的完整 e2e（发起 → SSE 事件序列 → 落库 → 历史 → 权限隔离）。

## 已知限制

- 行情接口为非官方免费通道，可能被限流（按 IP）：K 线三级互备；板块东财限流时回落新浪板块（行业分类为旧版 49 类，无概念板块、无板块 K 线，会议简报降级为成分股聚合）。
- 板块 K 线（BK 代码）仅东财支持；新浪板块（new_xxx）无 K 线源。
- 腾讯 smartbox 搜索按相关性排序，行业词（如"银行"）可能被同名 ETF 挤占，建议用完整名称/代码/拼音首字母。
- 估值/财务数据仅有快照中的 PE/PB/市值，价值专家以此与位置结构发言。

## 消息面（三档递进，仅个股场景）

1. **巨潮公告（稳）**：官方权威源，最近 8 条公告标题+日期进简报【近期公告（官方）】；
   价值专家必须解读财报类公告，风控专家必须点名风险最大公告，主席纪要含"事件与消息面"节。
2. **同花顺 F10 财务字段（尽力而为）**：抓 EPS/营收及同比/毛利率/ROE/动态 PE 进【财务摘要】，
   先剥标签再匹配（字段与数值间隔含数字属性）；失败静默跳过不伤主流程。
3. **模型调研兜底（公告拿不到时）**：`ExpertsService.researchNews` 带 web_search 工具的
   非流式调用循环（≤2 轮 tool_calls 往返）；搜索执行器可插拔——
   `BOCHA_API_KEY`（博查，国内）> `TAVILY_API_KEY`（Tavily，海外）> 无 key 时告知模型
   工具不可用、退化为"基于公告标题+模型知识"的事件提示（强制标注时效风险）。

## 动态收敛与主席裁决

- `computeDebateConvergence`（experts.definitions，纯函数）：比较相邻两轮各专家立场，翻转 0 人 = 收敛（相对平衡点）。
- 主席拥有最终裁决权：共识达成时表述形成过程；分歧不可调和时必须给出裁决（倾向、依据、改判条件），禁止和稀泥。
- 主席 prompt 会注入收敛信息（轮数/最后一轮翻转人数/是否收敛）。

## 立场解析容错

专家立场（投票依据）按三级解析：① 严格 `【立场】` 标签；② "最终判断/综合判断…"结论行的方向关键词（弱置信 45）；
③ 结尾段落关键词计分（弱置信 40）；结论行多空打平按中性。强模型（如 GPT-6.1）经常忽略标签格式，靠②③保证投票完整。

## 生成引擎与降级

- consensusJson.engine 记录本次纪要的生成方式：`{degraded, llmCount, localCount, models}`。
- 模型渠道全部失败时，专家/主席逐个回落本地规则引擎，前端报告面板显示橙色警示；辩论轮仅在有 LLM 专家时进行（规则引擎不参与辩论）。
