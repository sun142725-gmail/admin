// UI 档位常量锚点测试：锁定三张刻度表数值，防止后续迁移中漂移（types/ui.ts 为纯常量无依赖）。
import { describe, expect, it } from 'vitest';
import { DRAWER_WIDTH, MODAL_WIDTH, SPACE_SIZE } from './ui';

describe('types/ui 档位常量', () => {
  it('抽屉宽度刻度 sm=480/md=560/lg=720（md 贴现状最大簇）', () => {
    expect(DRAWER_WIDTH).toEqual({ sm: 480, md: 560, lg: 720 });
  });

  it('弹窗宽度刻度 sm=520/md=640/lg=720', () => {
    expect(MODAL_WIDTH).toEqual({ sm: 520, md: 640, lg: 720 });
  });

  it('Space 间距四档 xs=4/sm=8/md=12/lg=16（与 App.tsx token margin* 同源）', () => {
    expect(SPACE_SIZE).toEqual({ xs: 4, sm: 8, md: 12, lg: 16 });
  });
});
