# 任务清单：Docker 构建镜像源与依赖修复

Directory: `helloagents/plan/202602092206_docker_mirror_fix/`

---

## 1. Backend 构建与运行镜像
- [√] 1.1 在 `backend/Dockerfile` 中配置阿里云 apk 源与 npm registry，验证 why.md#需求docker-构建镜像源固定-场景构建依赖下载
- [√] 1.2 在 `backend/Dockerfile` 运行阶段安装 python3/make/g++，验证 why.md#需求sqlite3-运行阶段构建依赖补齐-场景sqlite3-安装，依赖任务 1.1

## 2. Frontend 构建镜像
- [√] 2.1 在 `frontend/Dockerfile` 中配置阿里云 apk 源与 npm registry，验证 why.md#需求docker-构建镜像源固定-场景构建依赖下载

## 3. 安全检查
- [√] 3.1 执行安全检查（镜像源可信性、敏感信息暴露、权限控制）

## 4. 文档更新
- [√] 4.1 更新 `helloagents/project.md`，记录镜像源与构建依赖约定

## 5. 测试
- [√] 5.1 执行构建验证：`docker-compose build backend frontend`
