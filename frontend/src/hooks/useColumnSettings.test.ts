// useColumnSettings 纯函数单测：存储注入式设计，内存 store 模拟 localStorage（node 环境）。
// 契约锁定：前缀 rbac_log_columns_、值 JSON 数组、null → removeItem 回默认（AuditCenterPage.tsx:541-557）。
import { describe, expect, it } from 'vitest';
import {
  COLUMN_STORAGE_PREFIX,
  loadVisibleColumns,
  parseVisibleColumns
} from './useColumnSettings';
import type { ColumnVisibilityStore } from './useColumnSettings';

const createMemoryStore = (initial?: Record<string, string>): ColumnVisibilityStore & { data: Map<string, string> } => {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    }
  };
};

describe('COLUMN_STORAGE_PREFIX', () => {
  it('既有契约前缀不得变', () => {
    expect(COLUMN_STORAGE_PREFIX).toBe('rbac_log_columns_');
  });
});

describe('parseVisibleColumns', () => {
  it('合法 JSON 字符串数组原样返回', () => {
    expect(parseVisibleColumns('["id","name"]')).toEqual(['id', 'name']);
  });

  it('数组内非字符串元素被过滤', () => {
    expect(parseVisibleColumns('["id", 3, null, "name"]')).toEqual(['id', 'name']);
  });

  it('非数组 JSON 返回 null（回退默认）', () => {
    expect(parseVisibleColumns('{"a":1}')).toBeNull();
    expect(parseVisibleColumns('"id"')).toBeNull();
  });

  it('空串/null 返回 null', () => {
    expect(parseVisibleColumns(null)).toBeNull();
    expect(parseVisibleColumns('')).toBeNull();
  });

  it('非法 JSON 返回 null 不抛异常', () => {
    expect(parseVisibleColumns('{oops')).toBeNull();
  });
});

describe('loadVisibleColumns', () => {
  it('无存储值回退 defaults', () => {
    const store = createMemoryStore();
    expect(loadVisibleColumns(store, `${COLUMN_STORAGE_PREFIX}audit`, ['id', 'name'])).toEqual(['id', 'name']);
  });

  it('有存储值优先于 defaults', () => {
    const store = createMemoryStore({ 'rbac_log_columns_audit': '["id"]' });
    expect(loadVisibleColumns(store, `${COLUMN_STORAGE_PREFIX}audit`, ['id', 'name'])).toEqual(['id']);
  });

  it('存储脏数据回退 defaults', () => {
    const store = createMemoryStore({ 'rbac_log_columns_audit': 'not-json' });
    expect(loadVisibleColumns(store, `${COLUMN_STORAGE_PREFIX}audit`, ['id', 'name'])).toEqual(['id', 'name']);
  });
});

describe('内存 store 往返（hook change 语义等价验证）', () => {
  it('set 后 get 往返一致；remove 后回 null（changeVisible(null) → removeItem 路径）', () => {
    const store = createMemoryStore();
    const key = `${COLUMN_STORAGE_PREFIX}frontend`;
    store.setItem(key, JSON.stringify(['id', 'level']));
    expect(loadVisibleColumns(store, key, ['id'])).toEqual(['id', 'level']);
    store.removeItem(key);
    expect(loadVisibleColumns(store, key, ['id'])).toEqual(['id']);
  });

  it('storage 抛异常时 loadVisibleColumns 不崩（隐私模式兜底）', () => {
    const brokenStore: ColumnVisibilityStore = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      }
    };
    expect(loadVisibleColumns(brokenStore, `${COLUMN_STORAGE_PREFIX}audit`, ['id'])).toEqual(['id']);
  });
});
