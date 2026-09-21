# 上线部署文档

> 上线准备事项、脚本与执行顺序的**唯一权威文档**：[`deploy/README.md`](../../deploy/README.md)
>
> - 目录 `deploy/` 内含环境变量模板与两个编号脚本（01 同步 AI 智能体 / 02 冒烟验证），全部幂等
> - 关键约束：`AI_ENCRYPTION_KEY` 上线后不可更换；`DB_SYNC=true` 仅首启建表需要
> - 六爻解卦智能体同步命令：`bash deploy/scripts/01-sync-ai.sh`
