# 卜卦模块重构设计（Divination Redesign）

> 目标：视觉与交互全面重构（国风水墨），后端升级为完整可扩展的卜卦模块，为 C 端（mobile/has-web）后续扩展预留能力。
> 原则：**业务规则不变**（主题必填 ≤50 字、后端生成六爻、AI 解卦、逐爻展示节奏可调），只升级展示层与接口时序。

---

## 1. 现状问题

| # | 问题 | 证据 | 影响 |
|---|------|------|------|
| 1 | **AI 解卦同步阻塞，前端会超时** | `frontend/src/api/http.ts` timeout=10000ms；`divination.service.ts` 的 `create()` 等 `aiService.interpret()` 返回后才落库返回 | DeepSeek 慢时 axios 10s 超时报"占卜失败"，但后端实际已成功，用户以为失败记录却存在 |
| 2 | 无整卦信息 | 后端只有每爻 name（老阳/少阴…），没有本卦名（如"地天泰"）、变卦名 | 展示层面缺失六爻最核心的"卦"概念 |
| 3 | 无历史记录 | 只有 create + getById | C 端"我的占卜"无法实现 |
| 4 | 结果展示原始 | 前端用 `JSON.stringify` 数组 + Descriptions 展示 | 调试风格，无产品感 |
| 5 | 动画是假的 | setInterval 每 600ms append 一张卡片，"铜钱/破碗"是两个文本 div | 无沉浸感 |
| 6 | 代码单文件 | DivinationPage.tsx 一个文件 160 行 | 不好扩展 |

---

## 2. 交互设计：三幕式

### 第一幕 · 祈愿（Wish）
- 宣纸底纹 + 水墨远山横幅，居中一枚朱红"卜"字印章元素
- 主题输入框改为下划线式（保留必填校验与 50 字上限），placeholder："默念所问之事……"
- 主按钮："起卦"（印章红 #9d2933 系），次按钮"重置"（保留原有 resetAll 逻辑）

### 第二幕 · 摇卦（Cast）
后端已预先返回 6 爻结果，动画只是演绎，每爻约 1.3s（总时长 ~8s）：
1. 三枚 SVG 铜钱从碗中抛起：translateY 上抛 + rotateX 3D 翻转（随机 2~4 圈），错峰 80ms
2. 铜钱落定入碗，按后端给出的 signStr 显示正/反面；碗轻微摇晃
3. 由铜钱位置"飞出"爻线素材，落位到卦象区对应爻位，SVG `stroke-dashoffset` 描边画出（阳爻一笔长线、阴爻两段短线）
4. 老阳（○）/老阴（×）标记呼吸闪烁提示"动爻"
- 底部进度：`第 N 爻 · 少阳`；从下往上堆叠（初爻在下，符合卦象规则）

### 第三幕 · 成卦（Reveal）
- 六爻齐后整卦合拢缩放 + 光晕，卦名毛笔字浮现（blur→清晰）
- 展示：**本卦名**、**变卦名**（有动爻时）、六爻明细表（保留 sum/signStr/symbol/name 字段，只是换视觉容器）
- AI 解卦：先显示八卦旋转 loading（"解卦中…"），就绪后**打字机逐字输出**；失败显示"卦象已成，解读暂不可用" + 重新解读按钮（调 reinterpret 接口）
- 解卦改为 **SSE 长连接实时输出**：动画结束即建立 SSE 连接，AI 分片边生成边推送；服务端流结束后落库标记完成

---

## 3. 前端模块结构（面向 C 端复用）

```
frontend/src/pages/divination/
  DivinationPage.tsx          # 薄容器：场景切换
  useDivinationFlow.ts        # 状态机 hook：idle → casting → revealing → interpreting → done / failed
  types.ts                    # 与后端 DTO 对齐的类型定义（C 端 Vue 可直接复制字段结构）
  components/
    InkBackground.tsx         # 背景：宣纸纹理 + 远山
    WishPanel.tsx             # 第一幕
    CastPanel.tsx             # 第二幕（碗 + 进度）
    CoinToss.tsx              # 三枚铜钱动画（props: 正反结果 + 播放控制，独立可复用）
    YaoStack.tsx              # 六爻 SVG 堆叠
    HexagramPanel.tsx         # 第三幕：卦名 + 明细
    InterpretationPanel.tsx   # 解卦打字机 + 轮询 + 重试
  divination.css              # 全部 keyframes 集中管理（方便 C 端按同样节奏移植）
```

- 动画技术：**纯 CSS 3D + SVG 描边，零新增依赖**（不引 framer-motion/lottie，管理后台保持轻量；CSS/SVG 资产 Vue 可原样复用）
- `api/divination.ts` 扩展 list / reinterpret / remove 并导出类型

---

## 4. 后端设计：异步解卦 + 完整模块

### 4.1 表变更（divinations，DB_SYNC 已开自动加列）

| 新列 | 类型 | 说明 |
|------|------|------|
| status | varchar(16) default 'completed' | pending→interpreting→completed/failed；**默认 completed 兼容旧数据** |
| hexagram_name | varchar(32) null | 本卦名，如"地天泰" |
| changed_hexagram_name | varchar(32) null | 变卦名（有动爻时） |
| error_message | varchar(255) null | AI 失败原因 |

### 4.2 卦名计算（新纯函数 hexagram.util.ts + 单测）

- 6 个 symbol → 下卦（初~三爻）+ 上卦（四~上爻）→ 八卦名（乾兑离震巽坎艮坤）→ 64 卦查表
- 变卦：老阳 O→阴、老阴 ×→阳，重算一次卦名
- 补单测 `hexagram.util.spec.ts`（固定用例断言"地天泰"等 + 64 卦遍历无漏）

### 4.3 流程改造

```
POST /divinations
  生成六爻 → 算卦名 → 落库(status=interpreting) → 立即返回 { id, lines, hexagramName, status }
  └─ 后台异步触发 AI 解卦 → 完成后 update interpretation, status=completed
                           → 失败   update error_message, status=failed
GET /divinations/:id        # 详情（含 status / interpretation）
GET /divinations/:id/interpretation/stream  # SSE 流式解卦（事件：chunk/done/error）
GET /divinations            # 分页列表，只查当前用户（C 端"我的占卜"）
POST /divinations/:id/reinterpret  # failed 记录重新解卦（C 端"重新解读"）
DELETE /divinations/:id     # 只能删自己的记录
```

- 保持不挂 `@Permissions()`（仅登录即可），C 端复用同一组接口无需改权限模型
- 兜底：服务启动时把超过 5 分钟仍 `interpreting` 的旧记录标记 failed（防进程重启留下悬挂状态；暂不引入消息队列）

### 4.4 测试影响

- `divination.spec.ts`：POST 断言从"含 interpretation"改为"含 id/lines/hexagramName/status"；interpretation 改为 SSE 流断言（收集 chunk/done 事件后再查详情）；测试环境无 AI key，fallback 分片流立即完成
- 新增 `hexagram.util.spec.ts`

---

## 5. 图片资产方案

**结论：我可以直接生成图片**（内置生图能力，生成后直接存进项目），你不用自己找。同时把提示词列在下面，你想自己找 AI 生成或换图也行。

真正需要位图的只有 2 张，其余全部 SVG 手绘（矢量可做描边/翻转动画，C 端高清屏友好）：

| 文件 | 用途 | 生成提示词 |
|------|------|-----------|
| `paper-texture.jpg` | 页面宣纸底纹（可平铺） | "中国宣纸纹理背景，浅米白色，细腻纤维质感，均匀无杂色，无缝平铺，平面扫描风格，高清" |
| `ink-mountains.png` | 顶部水墨远山装饰（透明底） | "极简水墨山水画横幅，浅墨远山与云雾，大量留白，宣纸底色，中国传统水墨风格，横向构图，边缘柔和渐隐" |

SVG 自绘清单（我来画）：铜钱正反面（外圆内方 + 文字）、阳爻/阴爻、动爻 ○/× 标记、旋转八卦 loading、朱红"卜"印章。碗/香炉也用 SVG，风格统一可控。

---

## 6. C 端扩展预留（本期不做，只留口子）

- 接口按"登录用户自身数据"设计（list/remove 按 userId 过滤），C 端直接复用
- `types.ts` 字段与后端 DTO 一一对应，Vue 端复制即用
- 动画全部集中 `divination.css`，节奏参数（每爻时长）做成常量，便于 H5 调快
- 预留扩展点：占卜历史页（list 已备）、每日一签（后端加规则即可）、分享卡片（卦名 + 主题生成图片）

---

## 7. 实施步骤（每步可独立验证）

1. 后端：`hexagram.util.ts` + 单测（卦名/变卦，先跑绿）
2. 后端：实体加列、create 异步化、list/reinterpret/remove 接口、启动兜底、更新 e2e
3. 前端：api + types 更新
4. 前端：生成 2 张位图资产 + SVG 组件
5. 前端：useDivinationFlow 状态机 + 三幕组件 + divination.css
6. 联调回归：主题校验、逐爻节奏、明细展示、AI 失败重试、旧记录兼容
7. 文档：更新 `helloagents/wiki/modules/divination.md`、`CHANGELOG.md`，补 ADR（异步解卦时序）
