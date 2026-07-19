# Files

## Purpose
公共文件上传与文件元数据管理

## Module Overview
- **Responsibility:** 统一处理公共上传、文件落库与业务目录区分
- **Status:** 🚧In Development
- **Last Updated:** 2026-07-19

## Specifications

### Requirement: 公共上传
**Module:** files
提供统一上传接口，按 `bizType` 区分业务目录。

#### Scenario: 上传文件
- 上传后返回文件 URL
- 文件元数据落库

## API Interfaces
### POST /api/files/upload
**Description:** 公共文件上传
**Input:** file, bizType
**Output:** id, url

## Data Models
### file_assets
| Field | Type | Description |
|-------|------|-------------|
| biz_type | varchar | 文件业务类型 |
| storage_path | varchar | 存储路径 |
| file_name | varchar | 原始文件名 |

## Dependencies
- users

## Change History
- [202607191107_c_account_profile](../../history/2026-07/202607191107_c_account_profile/) - 新增公共文件上传模块
