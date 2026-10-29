// 测试配置用于单元测试与集成测试。
//
// 仓库根 test 符号链接兼容层（条件加载）：
// 工作流检查器从仓库根以 `--runTestsByPath test/xxx.spec.ts` 调用 jest，而 jest 按进程 cwd
// （仓库根）解析该相对路径（@jest/core SearchSource 对 config.cwd 做 path.resolve，cwd 强制取
// process.cwd()，见 jest-config normalize），仓库根的 `test` 是指向 backend/test 的符号链接。
// 该链接未跟踪/缺失（如 Windows 检出降级为文本文件）时必须整体关闭兼容层，
// 否则 roots 指向不存在目录会让 jest 启动即报 Validation Error，backend 下 `npm test` 全挂。
// 注意：链接存在时 haste 爬虫对根目录 readdir 会解引用（isSymbolicLink 跳过只作用于目录内条目），
// 由 modulePathIgnorePatterns 排除符号链接视图，保证全量测试发现不翻倍。
const fs = require('fs');
const path = require('path');

const rootTestLink = path.resolve(__dirname, '..', 'test');
const hasRootTestLink = (() => {
  try {
    return fs.existsSync(rootTestLink) && fs.statSync(rootTestLink).isDirectory();
  } catch {
    return false;
  }
})();

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>', ...(hasRootTestLink ? [rootTestLink] : [])],
  moduleNameMapper: hasRootTestLink
    ? {
        // 符号链接路径（仓库根 test/）下的 `../src/...` 会解析到仓库根 src，这里映射回 backend/src；
        // 对 backend 内文件，映射目标与原相对解析结果一致。
        '^\\.\\./src/(.*)': '<rootDir>/src/$1'
      }
    : {},
  // 符号链接路径下的裸包导入（typeorm/supertest 等）无法向上找到 backend/node_modules，补充解析路径。
  modulePaths: hasRootTestLink ? [path.resolve(__dirname, 'node_modules')] : [],
  modulePathIgnorePatterns: hasRootTestLink ? ['(?<!backend)/test/.+\\.spec\\.ts$'] : [],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest'
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node'
};
