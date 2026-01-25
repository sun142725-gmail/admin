# 任务清单: 六爻占卜与 AI 解卦模块

Directory: `helloagents/plan/202601251127_divination_ai/`

---

## 1. Backend - Divination 模块
- [√] 1.1 新增 divination 实体与仓储在 `backend/src/modules/divination/*`, 对齐 why.md#占卜主题记录-新建占卜
- [√] 1.2 实现六爻计算与落库在 `backend/src/modules/divination/*`, 对齐 why.md#占卜结果生成与-ai-解卦-ai-解卦
- [√] 1.3 实现 divination API 在 `backend/src/modules/divination/*`

## 2. Backend - AI 模块
- [√] 2.1 新增 AI 模块与供应商适配在 `backend/src/modules/ai/*`
- [√] 2.2 实现 DeepSeek/OpenAI 调用与兜底策略在 `backend/src/modules/ai/*`

## 3. Frontend - 占卜页面与动画
- [√] 3.1 新增占卜路由与页面在 `frontend/src/pages/divination/*`
- [√] 3.2 实现动画流程与结果展示在 `frontend/src/pages/divination/*`

## 4. Security Check
- [√] 4.1 执行安全检查（输入校验/敏感信息/权限控制/EHRB 风险规避）

## 5. Documentation
- [√] 5.1 更新 `helloagents/wiki/modules/divination.md` 与 `helloagents/wiki/api.md`
- [√] 5.2 更新 `helloagents/wiki/data.md` 新增表结构

## 6. Testing
- [-] 6.1 新增 divination 服务测试在 `backend/test/divination.spec.ts`
> Note: 已编写测试用例，但未在当前环境执行
