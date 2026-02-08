# 变更日志

本文件记录项目的重要变更，格式参考 Keep a Changelog 与语义化版本。

## [未发布]
### 变更
- Docker 镜像源切换为 DaoCloud 仓库
- 日志管理菜单拆分为审计/打点/前端/错误日志入口
- 新增系统配置菜单并挂载字典管理
- 响应结构增加 traceId，前端表格统一组件与分页文案
- 全站表单必填提示文案统一为中文
- 日志端来源通过字典 source_type 显示
- 通知模板编辑升级为富文本（ReactQuill）并支持变量 Tag 点击插入
- 通知发布页改为按模板变量自动渲染输入项，避免手工维护 key/value
### 修复
- 补充 NestJS TypeORM 与 sqlite3 依赖，修正 Throttler 配置
- 飞书通知通道改为真实 webhook 发送（环境变量 FEISHU_BOT_WEBHOOK）
### 新增
- 六爻占卜模块与 AI 解卦模块
- 日志中心与个人中心模块
- 首页入口与中文面包屑展示
- 日志中心打点/前端/错误日志与批量上报
- 字典管理与多语言枚举查询
- 通知管理模块（模板、发布记录、站内信与飞书通道）
- 站内信收件箱接口与页面（查询、单条已读、全部已读）
- 新增 `NotificationTriggerService` 供其他业务模块直接注入调用通知发送

## [0.1.0] - 2025-01-25

### 新增
- NestJS 后端 RBAC 模块、JWT 鉴权与审计日志
- React 管理后台与权限码控制
- Swagger 文档、Docker Compose 与 Nginx 配置
- 初始化数据与 Auth 基础测试
