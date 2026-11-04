// 菜单更名幂等判定单测（纯函数，不依赖 Nest 容器 / 网络 / 数据库）。
import { LEGACY_PAGE_NAMES, shouldRenameResourcePage } from '../src/modules/seed/resource-naming';

describe('shouldRenameResourcePage', () => {
  it('老库存的旧名归位到新名', () => {
    expect(shouldRenameResourcePage('/graphic', '小说生图', 'AI 生成漫画')).toBe(true);
  });

  it('已经是新名时不重复更新', () => {
    expect(shouldRenameResourcePage('/graphic', 'AI 生成漫画', 'AI 生成漫画')).toBe(false);
  });

  it('管理员自定义名称不被覆盖', () => {
    expect(shouldRenameResourcePage('/graphic', '我的漫画工作台', 'AI 生成漫画')).toBe(false);
  });

  it('未登记更名映射的路径不动（即使名称恰好等于旧名）', () => {
    expect(shouldRenameResourcePage('/prompts', '小说生图', '图片提示词库')).toBe(false);
    expect(shouldRenameResourcePage('/flow', '小说生图', '流程管理')).toBe(false);
  });

  it('目标名称与旧名相同时不产生无意义更新', () => {
    expect(shouldRenameResourcePage('/graphic', '小说生图', '小说生图')).toBe(false);
  });

  it('可注入自定义映射，便于后续模块更名复用', () => {
    const legacy = { '/other': '旧模块' };
    expect(shouldRenameResourcePage('/other', '旧模块', '新模块', legacy)).toBe(true);
    expect(shouldRenameResourcePage('/graphic', '小说生图', 'AI 生成漫画', legacy)).toBe(false);
  });

  it('默认映射登记了 /graphic 的历史名称', () => {
    expect(LEGACY_PAGE_NAMES['/graphic']).toBe('小说生图');
  });
});
