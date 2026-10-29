# 图文/动漫流水线 — 测试报告

> 生成时间：2026-10-29 ｜ 执行环境：本机（MySQL 3307 / Node 3000 / Go 8081）
> 结论：**后端 17 套件 105 用例全绿；Go build/vet/test 全绿；前端 tsc 0 错误 + vite build 成功**

## 一、后端 E2E（Jest + supertest + sqlite 内存库）

| 套件 | 用例数 | 结果 | 覆盖点 |
|---|---|---|---|
| prompt-library.spec ✨新 | 9 | ✅ | JWT 401 / 非法分类·缺字段·未知字段 422 / CRUD / 分类+关键字过滤 / 内部接口令牌 |
| internal-ai.spec ✨新 | 7 | ✅ | 无令牌·错令牌 401（fail-closed）/ image·chat·tts 无模型 503 可读降级 / DTO 校验 |
| auth.spec | 4 | ✅ | 密码登录 / 刷新 / 短信验证码登录·注册·重置（test 环境本地模拟） |
| dict.spec | 1 | ✅ | 字典创建与批量查询 |
| notification/template-render | 3 | ✅ | 模板变量渲染 |
| notification/publish-flow | 3 | ✅ | 发布流（含幂等/重试） |
| ai-admin.spec | 6 | ✅ | 模型密钥加密存储/掩码、端点去重、会话访问控制 |
| proxy.spec | — | ✅ | /api/svc/core 转发与 502 降级 |
| stock×5 / divination / log-center / ai-crypto / hexagram | — | ✅ | 存量回归 |

**修复过程**：初始 4 套件失败（spec 引导漂移缺 `setGlobalPrefix('api')` 等）+ 验证码服务 test 环境无模拟 → 全部修复后连续 3 轮全绿。

## 二、Go 单测（go test）

| 文件 | 覆盖点 | 结果 |
|---|---|---|
| graphic/service_test.go | LLM 分幕 JSON 提取（围栏/废话容忍/12 幕裁剪）、模板渲染兜底、mime 映射 | ✅ |
| graphic/hub_test.go | 事件订阅/发布、终态关流、200 并发发布不阻塞、故事间隔离 | ✅ |
| graphic/media_test.go | 幕时长策略（静音 4s/配音+0.6s/下限 2.5s）、SRT 时间轴、**真实 ffmpeg 合成**（成片≥10KB、ffprobe 时长≈8s、无 libass 时产出外挂字幕） | ✅ |
| aiclient/client_test.go | **Nest POST 201 契约**、业务错误透出、内部令牌随请求携带、TTS base64 解析、参考图透传 | ✅ |

## 三、端到端实测（真实调用，非 mock）

| 用例 | 数据 | 结果 |
|---|---|---|
| 图文流水线（故事#2 锦鲤物语） | 4 幕 LLM 分幕 → gpt-image-2.5 并发生图 → 落盘 | ✅ succeeded，49s |
| 断点重跑 | 仅重置幕 1 → 其余 3 幕复用 | ✅ 复用生效 |
| 动漫流水线（故事#3 锦鲤动漫·二期） | 5 幕**首帧延续**生图 → TTS 静音兜底 → ffmpeg 合成 | ✅ succeeded，final.mp4 20s/1280x720/h264/986KB + final.srt |
| 静态服务 | Node /uploads 访问成片 | ✅ HTTP 200 |
| 网关链路 | /api/svc/core/graphic/stories 经 Node 转发 Go | ✅ 数据返回正常 |

**落库数据**（MySQL rbac 库，当前实况）：
- `prompt_templates`：6 条（3 条带真实示例图，复用流水线产物）
- `graphic_stories`：3 条（2 succeeded / 1 failed 断网用例）
- `graphic_scenes`：9 张已生成幕图 + 1 个成片，文件在 `backend/uploads/graphic/`

## 四、前端验证

| 项 | 结果 |
|---|---|
| tsc --noEmit | ✅ 0 错误（原 81 个存量错误已根修） |
| 相对导入完整性检查（check-imports.mjs） | ✅ 89 个文件全可解析 |
| lazyPage 命名导出检查 | ✅ 全部符合（修复 /graphic /prompts 崩溃后加的防线） |
| vite build | ✅ built in ~6s |
| 防线自证 | 故意注入坏 CSS 路径/坏导出 → check 均精确报红；恢复后全绿 |

## 五、本轮暴露并修复的真 bug 清单

1. Nest POST 返回 201，Go 客户端只认 200 → 统一接受 2xx
2. gpt-image 返回 base64 data URL（~350KB）撑爆 varchar(500) → 统一落盘换 /uploads 相对路径
3. TypeORM `string|null` 列缺显式类型 → MySQL 驱动拒绝
4. Node JSON body 100KB 上限挡住图生图参考图 → 10MB
5. `String.match` 解构错位 → 参考图解析失败
6. Homebrew ffmpeg 缺 libass → 字幕自动降级外挂 .srt
7. `cmd.Dir` 导致相对路径基准漂移 → Compose 入口统一 filepath.Abs
8. 滤镜链缺输出标签 `[v]` → 合成失败
9. spec 引导漂移 ×4 + 验证码 test 环境无模拟
10. 自选股星标 `res.items` 恒 undefined（后端返回数组）
11. `screener-shared.tsx` 模块路径 / GraphicPage CSS 路径
12. lazyPage 页面误用 default 导出 → 渲染崩溃

## 六、如何自己跑

```bash
# 后端
cd backend && NODE_ENV=test npx jest --runInBand
# Go
cd services/core && go build ./... && go vet ./... && go test ./internal/...
# 前端（build 现在自带 tsc + 导入检查两道防线）
cd frontend && npm run build
# 本地起 Go 服务（不再依赖会话存活）
cd services/core && ./dev.sh
```
