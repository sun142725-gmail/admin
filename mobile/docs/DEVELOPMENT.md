# 家庭管理应用 - 开发文档

> 版本：v1.0  
> 日期：2026-08-05  
> 技术栈：Vue 3 + Vant 4 + Pinia + TailwindCSS + Vite  

---

## 一、产品概览

### 1.1 产品定位
一款面向家庭场景的轻量协作工具，核心解决家庭成员间的**家务分工**与**信息同步**问题。

### 1.2 核心功能
| 模块 | 说明 |
|------|------|
| 家庭引导 | 创建家庭 / 加入家庭（邀请码） |
| 家庭总览 | 家庭信息、成员、快捷入口、最近动态 |
| 成员管理 | 成员列表、邀请码、加入审核（房主权限） |
| 家务待办 | 共享待办的新建、分配、完成、编辑、删除 |
| 家庭公告 | 房主发布、全员可见的公告 |
| 个人中心 | 资料、家庭切换、设置 |

### 1.3 角色定义
| 角色 | 权限 |
|------|------|
| 房主 (owner) | 全部权限：管理成员、发布公告、管理待办 |
| 普通成员 (member) | 查看、创建/编辑自己的待办、查看公告 |

### 1.4 一期限制
- 一个家庭最多 20 人
- 不做角色细分，只有房主 / 普通成员
- 头像选内置，不支持自定义上传
- 公告纯文本，不支持图片附件
- 待办不支持重复周期
- 加入家庭一期可关闭审核（直接加入）

---

## 二、页面结构与路由

### 2.1 页面清单

| 编号 | 页面 | 路由 | 文件 | 说明 |
|------|------|------|------|------|
| 01 | 登录 | `/login` | `LoginView.vue` | 已完成 |
| 02 | 注册 | `/register` | `RegisterView.vue` | 已完成 |
| 03 | 家庭引导 | `/family-guide` | `FamilyGuideView.vue` | 无家庭才进入 |
| 04 | 首页(家庭总览) | `/home` | `HomeView.vue` | 重构，tabbar 第 1 个 |
| 05 | 成员管理 | `/members` | `MembersView.vue` | |
| 06 | 家务待办 | `/todos` | `TodosView.vue` | tabbar 第 2 个 |
| 07 | 待办详情 | `/todos/:id` | `TodoDetailView.vue` | |
| 08 | 家庭公告 | `/notices` | `NoticesView.vue` | tabbar 第 3 个 |
| 09 | 公告编辑 | `/notices/edit` | `NoticeEditView.vue` | 房主使用 |
| 10 | 我的 | `/profile` | `ProfileView.vue` | 重构，tabbar 第 4 个 |
| 11 | 设置 | `/settings` | `SettingsView.vue` | |

### 2.2 路由守卫逻辑

```
用户登录后：
  → 查询用户家庭列表
    → 无家庭 → 重定向 /family-guide
    → 有家庭 → 重定向 /home（使用上次活跃家庭）
    → 有多个家庭 → 使用上次活跃家庭，可在个人中心切换
```

### 2.3 TabBar 结构

| Tab | 路由 | 图标 | 说明 |
|-----|------|------|------|
| 首页 | `/home` | `wap-home-o` | 家庭总览 |
| 待办 | `/todos` | `todo-list-o` | 家务待办 |
| 公告 | `/notices` | `bell` | 家庭公告 |
| 我的 | `/profile` | `user-o` | 个人中心 |

---

## 三、页面详细设计

### 3.1 家庭引导页（页面 03）

**入口条件：** 已登录但无任何家庭

**布局：**
- 顶部渐变 Hero 区：品牌图标 + "欢迎使用" + 副标题
- 两个大卡片入口：
  - 创建家庭（卡片 1）：图标 + "创建家庭" + "创建一个新家庭，成为房主"
  - 加入家庭（卡片 2）：图标 + "加入家庭" + "输入邀请码加入已有家庭"

**模块 A - 创建家庭弹窗/流程：**
- 家庭名称输入（placeholder: "如：张三的小家"，2-20 字符）
- 家庭头像选择（6-8 个内置头像，网格选择，默认选中第一个）
- 创建按钮 → 成功后进入首页

**模块 B - 加入家庭弹窗/流程：**
- 邀请码输入（6 位字母数字，支持粘贴）
- 提交按钮 → 成功后进入首页
- 一期简化：不需要审核，直接加入

---

### 3.2 首页 - 家庭总览（页面 04）

**布局：**
- 渐变 Hero 头部区：
  - 家庭头像 + 家庭名称
  - 成员头像横向列表（最多展示 5 个，超出显示 +N）
  - 右上角设置图标
- 概览卡片（叠在 Hero 下方）：
  - 成员数 / 待办数 / 公告数
- 快捷入口区（4 个）：
  - 成员管理 → `/members`
  - 家务待办 → `/todos`
  - 家庭公告 → `/notices`
  - 生成邀请码 → 弹窗展示邀请码
- 最近动态区：
  - 最新 1 条公告（标题 + 时间）
  - 最新 2 条待办（标题 + 执行人）
- 空状态：刚创建家庭无数据，展示引导文案

---

### 3.3 成员管理页（页面 05）

**权限控制：** 房主显示全部操作，普通成员只读

**布局：**
- 成员列表卡片：
  - 每行：头像 + 昵称 + 角色标签（房主/成员）
  - 房主操作：移除成员（滑动或点击）、修改成员昵称
  - 列表底部显示 "共 N/20 人"
- 邀请码模块（房主可见）：
  - 显示当前邀请码（大字 + 复制按钮）
  - 有效期提示（7 天）
  - 重新生成按钮
- 加入申请列表（房主可见，有申请时才显示）：
  - 每行：头像 + 昵称 + 同意/拒绝按钮

---

### 3.4 家务待办页（页面 06）

**布局：**
- 顶部：未完成 / 已完成 Tab 切换
- 新增待办按钮（底部浮动或顶部）
- 待办列表：
  - 每条：复选框 + 标题 + 执行人头像 + 截止日期
  - 点击进入详情
  - 左滑显示删除
- 空状态：无待办时展示引导文案

**新增待办表单（弹窗）：**
- 待办标题（必填，1-50 字符）
- 执行人（下拉选择家庭成员，默认自己）
- 截止日期（日期选择器，默认今天）

---

### 3.5 待办详情页（页面 07）

**布局：**
- 待办标题（可编辑）
- 创建人信息
- 执行人（可修改，下拉选择）
- 截止时间（可修改，日期选择器）
- 状态切换（完成/未完成）
- 底部：删除按钮

---

### 3.6 家庭公告页（页面 08）

**布局：**
- 顶部：发布公告按钮（仅房主显示）
- 公告列表：
  - 每条：标题 + 正文预览（2 行）+ 发布人 + 时间
  - 点击查看全文（弹窗或新页面）
- 空状态

---

### 3.7 公告编辑页（页面 09）

**布局：**
- 公告标题输入（必填，1-30 字符）
- 正文输入（textarea，必填，1-500 字符，显示字数统计）
- 底部：发布 / 取消

---

### 3.8 我的 - 个人中心（页面 10）

**布局：**
- 渐变 Hero 头部：头像 + 昵称
- 当前家庭卡片：家庭名称 + 切换按钮（多家庭时显示）
- 菜单列表：
  - 编辑资料 → 弹窗修改昵称
  - 家庭管理 → 成员管理
  - 设置 → `/settings`
  - 退出登录

---

### 3.9 设置页（页面 11）

**布局：**
- 消息通知开关（Switch）
- 关于我们
- 用户协议
- 隐私政策
- 退出账号

---

## 四、数据模型

### 4.1 Family（家庭）

```typescript
interface Family {
  id: string
  name: string              // 家庭名称
  avatar: string            // 内置头像标识（如 'avatar_01'）
  ownerId: string           // 房主用户 ID
  memberCount: number       // 成员数
  createdAt: string         // 创建时间
}
```

### 4.2 FamilyMember（家庭成员）

```typescript
interface FamilyMember {
  id: string
  familyId: string
  userId: string
  nickname: string          // 家庭内昵称
  avatarUrl: string         // 用户头像
  role: 'owner' | 'member'  // 角色
  joinedAt: string          // 加入时间
}
```

### 4.3 Todo（待办）

```typescript
interface Todo {
  id: string
  familyId: string
  title: string             // 待办标题
  creatorId: string         // 创建人 ID
  creatorName: string       // 创建人昵称
  assigneeId: string        // 执行人 ID
  assigneeName: string      // 执行人昵称
  assigneeAvatar: string    // 执行人头像
  dueDate: string           // 截止日期 (YYYY-MM-DD)
  status: 'pending' | 'completed'  // 状态
  completedAt: string | null      // 完成时间
  createdAt: string
  updatedAt: string
}
```

### 4.4 Announcement（公告）

```typescript
interface Announcement {
  id: string
  familyId: string
  title: string             // 公告标题
  content: string           // 公告正文
  publisherId: string       // 发布人 ID
  publisherName: string     // 发布人昵称
  publishedAt: string       // 发布时间
  createdAt: string
}
```

### 4.5 InviteCode（邀请码）

```typescript
interface InviteCode {
  code: string              // 6 位邀请码
  familyId: string
  expiresAt: string         // 过期时间
  createdAt: string
}
```

### 4.6 JoinRequest（加入申请）

```typescript
interface JoinRequest {
  id: string
  familyId: string
  userId: string
  nickname: string          // 申请人昵称
  avatarUrl: string         // 申请人头像
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  processedAt: string | null
}
```

### 4.7 User（用户）

```typescript
interface User {
  id: string
  username: string          // 账号
  nickname: string          // 昵称
  avatarUrl: string         // 头像
  phone: string             // 手机号
  email: string             // 邮箱
  currentFamilyId: string   // 当前活跃家庭 ID
  families: Family[]        // 加入的家庭列表
}
```

---

## 五、前端架构规划

### 5.1 目录结构

```
src/packages/has-web/
├── views/
│   ├── LoginView.vue           # 已有
│   ├── RegisterView.vue        # 已有
│   ├── ResetPasswordView.vue   # 已有
│   ├── FamilyGuideView.vue     # 新增 - 家庭引导页
│   ├── HomeView.vue            # 重构 - 家庭总览
│   ├── MembersView.vue         # 新增 - 成员管理
│   ├── TodosView.vue           # 新增 - 待办列表
│   ├── TodoDetailView.vue      # 新增 - 待办详情
│   ├── NoticesView.vue         # 新增 - 公告列表
│   ├── NoticeEditView.vue      # 新增 - 公告编辑
│   ├── ProfileView.vue         # 重构 - 个人中心
│   └── SettingsView.vue        # 新增 - 设置
├── components/
│   ├── FamilyAvatar.vue        # 家庭头像（内置头像选择器）
│   ├── MemberAvatar.vue        # 成员头像
│   ├── TodoItem.vue            # 待办列表项
│   ├── NoticeItem.vue          # 公告列表项
│   ├── TabBar.vue              # 底部导航栏（提取公共）
│   ├── InviteCodeDialog.vue    # 邀请码弹窗
│   ├── TodoCreateSheet.vue     # 新建待办弹窗
│   └── EmptyState.vue          # 空状态组件
├── stores/
│   ├── auth.js                 # 已有
│   ├── profile.js              # 已有
│   ├── family.js               # 新增 - 家庭状态
│   ├── todo.js                 # 新增 - 待办状态
│   └── notice.js               # 新增 - 公告状态
├── services/
│   ├── request.js              # 已有
│   ├── auth.js                 # 已有
│   ├── family.js               # 新增 - 家庭接口
│   ├── todo.js                 # 新增 - 待办接口
│   ├── notice.js               # 新增 - 公告接口
│   └── user.js                 # 新增 - 用户接口
├── composables/
│   ├── useCountdown.js         # 已有
│   └── useFamily.js            # 新增 - 家庭快捷操作
├── utils/
│   └── validators.js           # 已有
├── constants/
│   └── avatars.js              # 新增 - 内置头像列表
├── router/
│   └── index.js                # 更新路由
├── styles/
│   └── index.css               # 更新样式
├── App.vue
└── main.js
```

### 5.2 Store 设计

#### family.js（核心 Store）

```javascript
// 状态
{
  families: [],           // 用户所有家庭
  currentFamily: null,    // 当前活跃家庭
  members: [],            // 当前家庭成员列表
  inviteCode: '',         // 当前邀请码
  joinRequests: [],       // 加入申请列表
  dashboard: null         // 首页概览数据
}

// Actions
- loadFamilies()              // 加载用户家庭列表
- createFamily(name, avatar)  // 创建家庭
- joinFamily(code)            // 加入家庭
- switchFamily(familyId)      // 切换家庭
- loadMembers()               // 加载成员列表
- removeMember(memberId)      // 移除成员
- updateMember(memberId, data)// 修改成员
- loadInviteCode()            // 获取邀请码
- regenerateInviteCode()      // 重新生成邀请码
- loadJoinRequests()          // 获取申请列表
- approveRequest(requestId)   // 同意申请
- rejectRequest(requestId)    // 拒绝申请
- loadDashboard()             // 加载首页概览
```

#### todo.js

```javascript
// 状态
{
  todos: [],
  activeTab: 'pending',  // 'pending' | 'completed'
  loading: false
}

// Actions
- loadTodos(status)      // 加载待办列表
- createTodo(data)       // 新建待办
- updateTodo(id, data)   // 更新待办
- deleteTodo(id)         // 删除待办
- toggleTodo(id)         // 切换完成状态
```

#### notice.js

```javascript
// 状态
{
  notices: [],
  loading: false
}

// Actions
- loadNotices()          // 加载公告列表
- createNotice(data)     // 发布公告
- deleteNotice(id)       // 删除公告
```

### 5.3 内置头像方案

```javascript
// constants/avatars.js
export const FAMILY_AVATARS = [
  { id: 'avatar_01', url: '/avatars/family-01.svg', label: '温馨' },
  { id: 'avatar_02', url: '/avatars/family-02.svg', label: '快乐' },
  { id: 'avatar_03', url: '/avatars/family-03.svg', label: '团结' },
  { id: 'avatar_04', url: '/avatars/family-04.svg', label: '幸福' },
  { id: 'avatar_05', url: '/avatars/family-05.svg', label: '和睦' },
  { id: 'avatar_06', url: '/avatars/family-06.svg', label: '活力' },
]
```

一期可使用 Vant 内置图标或 Emoji 作为头像替代方案，后期再替换为设计资源。

---

## 六、开发阶段划分

### 第一阶段：基础设施 + 家庭引导
1. 创建 services/family.js、stores/family.js
2. 创建 constants/avatars.js
3. 家庭引导页 FamilyGuideView.vue（创建/加入家庭）
4. 路由守卫更新（无家庭 → 引导页）
5. 提取公共 TabBar 组件

### 第二阶段：首页重构
1. HomeView.vue 重构为家庭总览
2. 概览卡片（成员数、待办数、公告数）
3. 快捷入口区
4. 最近动态区
5. 邀请码弹窗组件

### 第三阶段：成员管理
1. MembersView.vue
2. 成员列表（房主操作）
3. 邀请码模块
4. 加入申请列表

### 第四阶段：家务待办
1. TodosView.vue（列表 + Tab 切换）
2. TodoCreateSheet.vue（新建弹窗）
3. TodoDetailView.vue（详情页）
4. stores/todo.js

### 第五阶段：家庭公告
1. NoticesView.vue（列表）
2. NoticeEditView.vue（编辑发布）
3. stores/notice.js

### 第六阶段：个人中心 + 设置
1. ProfileView.vue 重构
2. 家庭切换功能
3. SettingsView.vue
4. 资料编辑弹窗

---

## 七、UI 设计规范

延续现有 auth 模块风格：
- 主色渐变：`#0ea5e9 → #0284c7`
- 卡片：白色圆角 `rounded-xl` + `shadow-card`
- 间距基础单位：4px（Tailwind spacing 4/8/12/16/20/24/28/32）
- 字号：xs(10) / sm(12) / base(14) / md(16) / lg(18) / xl(20) / 2xl(24)
- 列表行高度：48px 最小触控
- 空状态：图标 + 文案 + 引导按钮
