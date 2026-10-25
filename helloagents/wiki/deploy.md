# 上线部署文档

> 上线准备事项、脚本与执行顺序的**唯一权威文档**：[`deploy/README.md`](../../deploy/README.md)
>
> - 目录 `deploy/` 内含环境变量模板与四个编号脚本（01 六爻智能体同步 / 02 全量 AI 配置 SQL / 03 冒烟验证 / 04 股市圆桌智能体同步），全部幂等
> - 关键约束：`AI_ENCRYPTION_KEY` 上线后不可更换；`DB_SYNC=true` 仅首启建表需要
> - 六爻解卦智能体同步命令：`bash deploy/scripts/01-sync-ai.sh`
> - 股市圆桌六位智能体同步：`SYNC_STOCK_MODEL_ID=<模型id> bash deploy/scripts/04-sync-stock-agents.sh`（或由 02 全量 SQL 一并覆盖）
> - 本次「股市圆桌」上线清单：新表 `stock_roundtables`/`stock_roundtable_turns`（首启自动建）、权限 `stock:roundtable:use`+菜单（SEED 自动）、前后端镜像均需重建
