// 角色权限页将复杂权限配置从角色列表中拆出，便于集中维护。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Empty, Input, Space, Spin, Tag, message } from 'antd';
import { ArrowLeftOutlined, DownOutlined, ReloadOutlined, RightOutlined, SaveOutlined } from '@ant-design/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { listRoles, assignPermissions } from '../../api/roles';
import { listPermissions } from '../../api/permissions';
import { Permission } from '../../components/permission/Permission';

interface PermissionItem {
  id: number;
  name: string;
  code: string;
  description?: string;
}

interface RoleItem {
  id: number;
  name: string;
  code: string;
  description?: string;
  permissions?: Array<{ id: number; name: string; code?: string }>;
}

interface PermissionGroup {
  key: string;
  title: string;
  items: PermissionItem[];
}

const MODULE_LABEL_MAP: Record<string, string> = {
  'system:user': '用户管理',
  'system:role': '角色管理',
  'system:permission': '权限管理',
  'config:dict': '字典管理',
  'notification:template': '通知模板',
  'notification:publish': '通知发布',
  'notification:inbox': '站内信',
  'log:audit': '审计日志',
  'log:track': '打点日志',
  'log:frontend': '前端日志',
  'log:error': '错误日志',
  'tool:divination': '六爻占卜',
  profile: '个人中心'
};

const getPermissionGroupKey = (code: string) => {
  const parts = code.split(':');
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`;
  }
  return parts[0] ?? code;
};

const getPermissionGroupTitle = (code: string) => MODULE_LABEL_MAP[getPermissionGroupKey(code)] ?? getPermissionGroupKey(code);

export const RolePermissionsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const roleId = Number(id);
  const state = location.state as { roleName?: string } | null;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [role, setRole] = useState<RoleItem | null>(null);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [activeGroupKey, setActiveGroupKey] = useState<string>('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<string[]>([]);
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const fetchData = async () => {
    if (!roleId) {
      message.error('角色参数无效');
      navigate('/roles');
      return;
    }
    setLoading(true);
    try {
      const [roleRes, permissionRes] = await Promise.all([listRoles(1, 200), listPermissions(1, 500)]);
      const currentRole = (roleRes.items ?? []).find((item: RoleItem) => item.id === roleId) ?? null;
      if (!currentRole) {
        message.error('角色不存在或已被删除');
        navigate('/roles');
        return;
      }
      setRole(currentRole);
      setPermissions(permissionRes.items ?? []);
      setSelectedIds(currentRole.permissions?.map((item) => item.id) ?? []);
      setCollapsedGroupKeys([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [roleId]);

  const groups = useMemo<PermissionGroup[]>(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const filtered = permissions.filter((item) => {
      if (onlySelected && !selectedIds.includes(item.id)) {
        return false;
      }
      if (!normalizedKeyword) {
        return true;
      }
      return [item.name, item.code, item.description ?? ''].some((field) =>
        field.toLowerCase().includes(normalizedKeyword)
      );
    });

    const groupMap = new Map<string, PermissionGroup>();
    filtered.forEach((item) => {
      const key = getPermissionGroupKey(item.code);
      const group = groupMap.get(key) ?? {
        key,
        title: getPermissionGroupTitle(item.code),
        items: []
      };
      group.items.push(item);
      groupMap.set(key, group);
    });

    return Array.from(groupMap.values()).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  }, [keyword, onlySelected, permissions, selectedIds]);

  const selectedCount = selectedIds.length;
  const totalCount = permissions.length;

  useEffect(() => {
    if (!groups.length) {
      setActiveGroupKey('');
      return;
    }
    if (!groups.some((group) => group.key === activeGroupKey)) {
      setActiveGroupKey(groups[0].key);
    }
  }, [activeGroupKey, groups]);

  useEffect(() => {
    setCollapsedGroupKeys((prev) => prev.filter((key) => groups.some((group) => group.key === key)));
  }, [groups]);

  useEffect(() => {
    if (!groups.length) {
      return;
    }

    const scrollContainer = document.querySelector('.app-content-inner');
    if (!(scrollContainer instanceof HTMLElement)) {
      return;
    }

    const updateActiveGroup = () => {
      const containerTop = scrollContainer.getBoundingClientRect().top;
      let nextKey = groups[0].key;

      groups.forEach((group) => {
        const element = groupRefs.current[group.key];
        if (!element) {
          return;
        }
        const { top } = element.getBoundingClientRect();
        if (top - containerTop <= 136) {
          nextKey = group.key;
        }
      });

      setActiveGroupKey(nextKey);
    };

    updateActiveGroup();
    scrollContainer.addEventListener('scroll', updateActiveGroup, { passive: true });
    window.addEventListener('resize', updateActiveGroup);
    return () => {
      scrollContainer.removeEventListener('scroll', updateActiveGroup);
      window.removeEventListener('resize', updateActiveGroup);
    };
  }, [groups]);

  const handleGroupChange = (group: PermissionGroup, checkedValues: Array<string | number>) => {
    const groupIds = group.items.map((item) => item.id);
    const nextSet = new Set(selectedIds.filter((item) => !groupIds.includes(item)));
    checkedValues.forEach((value) => nextSet.add(Number(value)));
    setSelectedIds(Array.from(nextSet));
  };

  const handleCheckAll = (group: PermissionGroup) => {
    const groupIds = group.items.map((item) => item.id);
    const allChecked = groupIds.every((id) => selectedIds.includes(id));
    if (allChecked) {
      handleClearGroup(group);
      return;
    }
    const nextSet = new Set(selectedIds);
    groupIds.forEach((id) => nextSet.add(id));
    setSelectedIds(Array.from(nextSet));
  };

  const handleClearGroup = (group: PermissionGroup) => {
    const groupIds = new Set(group.items.map((item) => item.id));
    setSelectedIds((prev) => prev.filter((item) => !groupIds.has(item)));
  };

  const handleAnchorToGroup = (groupKey: string) => {
    const element = groupRefs.current[groupKey];
    if (!element) {
      return;
    }
    setActiveGroupKey(groupKey);
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleToggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroupKeys((prev) =>
      prev.includes(groupKey) ? prev.filter((item) => item !== groupKey) : [...prev, groupKey]
    );
  };

  const handleCollapseAll = () => {
    setCollapsedGroupKeys(groups.map((group) => group.key));
  };

  const handleExpandAll = () => {
    setCollapsedGroupKeys([]);
  };

  const handleSave = async () => {
    if (!role) {
      return;
    }
    setSaving(true);
    try {
      await assignPermissions(role.id, selectedIds);
      message.success('角色权限已更新');
      await fetchData();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="role-permissions-loading">
        <Spin size="large" />
      </div>
    );
  }

  if (!role) {
    return <Empty description="角色不存在" />;
  }

  return (
    <div className="role-permissions-page">
      <div className="page-toolbar">
        <div>
          <div className="page-toolbar-title">角色功能权限</div>
          <div className="page-toolbar-subtitle">
            为角色 <Tag color="blue">{role.name ?? state?.roleName ?? `#${role.id}`}</Tag> 独立配置功能权限，避免角色列表页信息过长。
          </div>
        </div>
        <div className="page-actions">
          <Button onClick={handleExpandAll}>展开全部模块</Button>
          <Button onClick={handleCollapseAll}>折叠全部模块</Button>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/roles')}>
            返回角色列表
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            刷新
          </Button>
          <Permission code="system:role:assign" mode="disable">
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
              保存权限
            </Button>
          </Permission>
        </div>
      </div>

      <div className="role-permissions-summary">
        <div className="role-permissions-stat-card">
          <div className="role-permissions-stat-label">当前角色</div>
          <div className="role-permissions-stat-value">{role.name}</div>
          <div className="role-permissions-stat-tip">{role.description || '未填写角色描述'}</div>
        </div>
        <div className="role-permissions-stat-card">
          <div className="role-permissions-stat-label">已选权限</div>
          <div className="role-permissions-stat-value">{selectedCount}</div>
          <div className="role-permissions-stat-tip">共 {totalCount} 项可配置权限</div>
        </div>
        <div className="role-permissions-stat-card role-permissions-search-card">
          <div className="role-permissions-stat-label">快速筛选</div>
          <Input
            allowClear
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索权限名称 / 权限码 / 描述"
          />
          <Checkbox checked={onlySelected} onChange={(event) => setOnlySelected(event.target.checked)}>
            仅看已选权限
          </Checkbox>
          <div className="role-permissions-stat-tip">支持按模块、动作关键字快速定位权限</div>
        </div>
      </div>

      <Alert
        className="role-permissions-alert"
        type="info"
        showIcon
        message="建议先按模块配置，再统一保存"
        description="当前页面会按功能模块自动分组展示权限，修改不会即时提交，点击右上角“保存权限”后才会正式生效。"
      />

      <div className="role-permissions-layout">
        <div className="role-permissions-groups">
          {groups.length ? (
            groups.map((group) => {
              const checkedValues = group.items.filter((item) => selectedIds.includes(item.id)).map((item) => item.id);
              const collapsed = collapsedGroupKeys.includes(group.key);
              const allChecked = group.items.length > 0 && checkedValues.length === group.items.length;
              return (
                <div
                  key={group.key}
                  ref={(node) => {
                    groupRefs.current[group.key] = node;
                  }}
                  className="role-permissions-group-card"
                >
                  <div className="role-permissions-group-header">
                    <div>
                      <div className="role-permissions-group-title">{group.title}</div>
                      <div className="role-permissions-group-subtitle">
                        {checkedValues.length} / {group.items.length} 已选
                      </div>
                    </div>
                    <Space>
                      <Button
                        size="small"
                        icon={collapsed ? <RightOutlined /> : <DownOutlined />}
                        onClick={() => handleToggleGroupCollapse(group.key)}
                      >
                        {collapsed ? '展开' : '折叠'}
                      </Button>
                      <Button size="small" onClick={() => handleCheckAll(group)}>
                        {allChecked ? '取消全选' : '全选本组'}
                      </Button>
                      <Button size="small" onClick={() => handleClearGroup(group)}>
                        清空本组
                      </Button>
                    </Space>
                  </div>
                  {!collapsed ? (
                    <Checkbox.Group
                      className="role-permissions-checkbox-group"
                      value={checkedValues}
                      onChange={(values) => handleGroupChange(group, values)}
                    >
                      {group.items.map((item) => (
                        <label key={item.id} className="role-permissions-option">
                          <Checkbox value={item.id}>
                            <span className="role-permissions-option-name">{item.name}</span>
                          </Checkbox>
                          <span className="role-permissions-option-code">{item.code}</span>
                          {item.description ? (
                            <span className="role-permissions-option-desc">{item.description}</span>
                          ) : null}
                        </label>
                      ))}
                    </Checkbox.Group>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="page-table-card role-permissions-empty">
              <Empty description="没有匹配到权限项" />
            </div>
          )}
        </div>

        {groups.length ? (
          <aside className="role-permissions-anchor-card">
            <div className="role-permissions-anchor-title">模块导航</div>
            <div className="role-permissions-anchor-subtitle">滚动高亮当前模块，点击可快速定位</div>
            <div className="role-permissions-anchor-list">
              {groups.map((group) => {
                const checkedCount = group.items.filter((item) => selectedIds.includes(item.id)).length;
                const active = activeGroupKey === group.key;
                const allChecked = group.items.length > 0 && checkedCount === group.items.length;
                return (
                  <div key={group.key} className={`role-permissions-anchor-item ${active ? 'is-active' : ''}`}>
                    <button
                      type="button"
                      className="role-permissions-anchor-link"
                      onClick={() => handleAnchorToGroup(group.key)}
                    >
                      <span className="role-permissions-anchor-name">{group.title}</span>
                      <span className="role-permissions-anchor-meta">
                        {checkedCount}/{group.items.length}
                      </span>
                    </button>
                    <Space size={6}>
                      <Button
                        size="small"
                        type={allChecked ? 'primary' : 'default'}
                        onClick={() => handleCheckAll(group)}
                      >
                        全选
                      </Button>
                    </Space>
                  </div>
                );
              })}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
};
