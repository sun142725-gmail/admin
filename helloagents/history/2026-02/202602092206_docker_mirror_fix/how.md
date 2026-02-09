# 技术设计：Docker 构建镜像源与依赖修复

## 技术方案
### 核心技术
- Dockerfile（Alpine）
- npm registry 配置

### 实施要点
- 后端/前端 Dockerfile 写入阿里云 apk 源（保持当前 Alpine 版本）。
- 在 Dockerfile 中固定 npm registry 为 https://registry.npmmirror.com。
- 后端运行阶段安装 python3、make、g++，确保 sqlite3 可编译。

## 安全与性能
- **安全:** 镜像源固定后仍需保持官方源校验策略，避免使用未知第三方源。
- **性能:** 构建速度预期提升，构建失败率降低。

## 测试与发布
- **测试:** 执行 `docker-compose build backend frontend` 验证构建成功。
- **发布:** 构建通过后再执行 `docker-compose up -d`。
