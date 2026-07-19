# C 端对接说明

## 1. 对接方式

建议 C 端直接对接后端统一 API，和管理端共用同一套 `users` 主表与鉴权体系。

- C 端只负责业务交互
- 后端统一负责账号、验证码、权限、上传与个人资料
- 端差异通过 `user_type`、角色和权限控制

## 2. 登录态约定

### Token
- `accessToken`：短期访问令牌
- `refreshToken`：刷新令牌

### 请求头
```http
Authorization: Bearer <accessToken>
```

### 刷新逻辑
1. accessToken 过期后，先调用刷新接口
2. 刷新成功后替换本地 token
3. 刷新失败则跳回登录页

## 3. 登录注册流程

### 手机号验证码登录
1. `POST /api/auth/code/send`
2. `POST /api/auth/code/login`
3. 首次未绑定时自动注册

### 邮箱验证码注册/登录
1. `POST /api/auth/code/send`
2. `POST /api/auth/code/login`
3. 首次未绑定时自动注册

### 重置密码
1. `POST /api/auth/code/send`
2. `POST /api/auth/code/reset-password`

## 4. 个人信息

- `GET /api/auth/profile`：获取当前用户基础信息与权限
- `GET /api/profile`：获取个人资料
- `PATCH /api/profile`：更新昵称、邮箱、头像
- `POST /api/profile/password`：旧密码改密

## 5. 头像上传

### 推荐流程
1. `POST /api/files/upload`
2. 拿到返回的 `url`
3. 再调用 `PATCH /api/profile` 保存头像地址

### 上传参数
- `file`：文件本体
- `bizType`：业务目录，头像建议传 `avatar`

## 6. 接口清单

### Auth
- `POST /api/auth/login`
- `POST /api/auth/code/send`
- `POST /api/auth/code/login`
- `POST /api/auth/code/reset-password`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/profile`

### Profile
- `GET /api/profile`
- `PATCH /api/profile`
- `POST /api/profile/password`
- `POST /api/profile/avatar`

### Files
- `POST /api/files/upload`

## 7. 返回值约定

统一响应结构：
```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "timestamp": 0,
  "traceId": "..."
}
```

## 8. 需要关注的点

- 验证码只在非生产环境回传明文 code，生产环境由短信/邮件通道发送
- 改密后旧 token 会失效
- 手机号和邮箱都是独立标识，不能重复绑定
- 上传文件建议前端先做类型和大小校验

## 9. 推荐前端状态

- 登录态统一存储 `accessToken`
- `refreshToken` 建议单独安全存储
- 用户信息建议缓存一份，登录后先拉 `GET /api/auth/profile`
- 头像路径直接使用后端返回的相对 URL
