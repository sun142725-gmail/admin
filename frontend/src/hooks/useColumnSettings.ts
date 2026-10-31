// 列可见性 localStorage 记忆：抽离 AuditCenterPage.tsx:73-134/:541-557 模式。
// 契约不得变：存储前缀 rbac_log_columns_、值为列 key 数组 JSON、changeVisible(null) 时 removeItem 回默认。
// storage 注入式设计（默认浏览器 localStorage，node 单测注入内存实现）；
// 配套 components/ColumnSettings.tsx 原样复用（visible/change 直接对接其 props）。
import { useCallback, useState } from 'react';

/** 既有契约：audit 页表头列设置 localStorage 前缀（按页签记忆）。 */
export const COLUMN_STORAGE_PREFIX = 'rbac_log_columns_';

export interface ColumnVisibilityStore {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/** 浏览器默认存储：函数体内访问 window，模块顶层安全（node 可导入本文件）。 */
const defaultBrowserStore: ColumnVisibilityStore = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key)
};

/** 解析存储值：空/脏数据/解析失败返回 null（回退默认），数组元素过滤非字符串。 */
export const parseVisibleColumns = (raw: string | null): string[] | null => {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return null;
  }
};

const safeGetItem = (store: ColumnVisibilityStore, key: string): string | null => {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
};

/** 纯函数：读取可见列集合（回退 defaults），store 注入便于 node 单测。 */
export const loadVisibleColumns = (
  store: ColumnVisibilityStore,
  storageKey: string,
  defaults: string[]
): string[] => parseVisibleColumns(safeGetItem(store, storageKey)) ?? defaults;

export interface UseColumnSettingsOptions {
  /** 页签标识：完整存储键 = rbac_log_columns_ + tab（既有契约）。 */
  tab: string;
  /** 默认展示列（如 audit 页 DEFAULT_VISIBLE[tab]）。 */
  defaults: string[];
  /** 存储实现（默认浏览器 localStorage；node 测试注入内存版）。 */
  store?: ColumnVisibilityStore;
}

export interface UseColumnSettingsResult {
  visible: string[];
  /** 对接 ColumnSettings onChange：传 null 表示回默认并清除存储。 */
  change: (keys: string[] | null) => void;
  reset: () => void;
  /** 完整存储键（rbac_log_columns_ + tab），调试/迁移核对用。 */
  storageKey: string;
}

export const useColumnSettings = ({
  tab,
  defaults,
  store
}: UseColumnSettingsOptions): UseColumnSettingsResult => {
  const activeStore = store ?? defaultBrowserStore;
  const storageKey = `${COLUMN_STORAGE_PREFIX}${tab}`;
  const [visible, setVisible] = useState<string[]>(() => loadVisibleColumns(activeStore, storageKey, defaults));

  const change = useCallback(
    (keys: string[] | null) => {
      if (keys) {
        setVisible(keys);
        try {
          activeStore.setItem(storageKey, JSON.stringify(keys));
        } catch {
          // 存储不可用（隐私模式等）时仅本次会话生效（对齐 AuditCenterPage.tsx:554-556）
        }
      } else {
        setVisible(defaults);
        try {
          activeStore.removeItem(storageKey);
        } catch {
          // 同上
        }
      }
    },
    [activeStore, storageKey, defaults]
  );

  const reset = useCallback(() => change(null), [change]);

  return { visible, change, reset, storageKey };
};
