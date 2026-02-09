# 变更提案：Docker 构建镜像源与依赖修复

## 需求背景
当前 Docker 构建过程中出现 npm 依赖下载与 sqlite3 编译失败问题，主要原因是容器内未配置稳定的镜像源，且运行阶段缺少 Python/编译工具导致 node-gyp 无法构建。

## 变更内容
1. 后端与前端 Dockerfile 同时指定阿里云 apk 源与 npm registry。
2. 后端运行阶段补齐 python3 与编译工具，避免 sqlite3 依赖安装失败。

## 影响范围
- **模块:** backend / frontend
- **文件:** backend/Dockerfile, frontend/Dockerfile
- **APIs:** 无
- **数据:** 无

## 核心场景

### 需求：Docker 构建镜像源固定
**模块:** backend / frontend
统一设置 apk 源与 npm registry，降低镜像源波动导致的构建失败。

#### 场景：构建依赖下载
在执行 docker-compose build 时，npm 依赖能够稳定下载并安装。
- 预期结果：构建过程不再出现 npm registry 连接失败或超时。

### 需求：sqlite3 运行阶段构建依赖补齐
**模块:** backend
运行阶段安装依赖时能够找到 Python 与编译工具链。

#### 场景：sqlite3 安装
在后端镜像运行阶段执行 npm install 时，sqlite3 编译成功。
- 预期结果：不再出现 node-gyp 找不到 Python 的错误。

## 风险评估
- **风险:** 镜像源切换导致包版本差异
- **缓解:** 固定 registry 与 apk 源域名，并保持 Alpine 版本不变
