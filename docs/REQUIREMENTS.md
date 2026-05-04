# 门店 SCRM 系统需求文档

## 一、项目概述

### 1.1 项目背景
门店 SCRM（Social Customer Relationship Management）系统是一款面向 B 端的门店客户关系管理系统，旨在帮助企业管理门店信息、客户跟进记录、企业微信机器人配置等核心业务场景，提升商务团队的客户管理效率。

### 1.2 产品定位
- **目标用户**：企业管理员、商务人员
- **核心价值**：集中管理门店信息、系统化跟进记录、智能化客户分析
- **使用场景**：门店开发、客户维护、团队协作

### 1.3 技术架构
| 层级 | 技术选型 |
|------|----------|
| 前端框架 | Next.js 16 (App Router) + React 19 |
| 开发语言 | TypeScript 5 |
| 样式方案 | Tailwind CSS 4 + 字节风格设计系统 |
| 后端服务 | Next.js API Routes |
| 数据库 | Supabase (PostgreSQL) |
| 对象存储 | S3 兼容存储 |
| AI 能力 | coze-coding-dev-sdk (豆包大模型) |
| 包管理器 | pnpm |

---

## 二、设计规范

### 2.1 视觉设计
- **设计风格**：字节风格设计系统
- **主色调**：#165dff（蓝色）
- **功能色**：
  - 成功色：#00b42a（绿色）
  - 警告色：#ff7d00（橙色）
  - 危险色：#f53f3f（红色）
- **圆角规范**：
  - 卡片：8px
  - 按钮：6px
  - 标签：4px
- **页面内容区域宽度**：1500px

### 2.2 交互规范
- 按钮悬停有颜色变化反馈
- 表单提交有 loading 状态
- 操作成功/失败有消息提示
- 危险操作需二次确认

### 2.3 响应式设计
- 桌面端（≥768px）：表格布局
- 移动端（<768px）：卡片布局 + 全屏弹窗
- 工具栏固定在顶部
- 表格表头冻结

---

## 三、用户角色与权限

### 3.1 角色定义

| 角色 | 密钥 | 权限范围 |
|------|------|----------|
| 管理员 | 996 | 全部功能 |
| 商务人员 | 编号（如 001） | 仅管理自己负责的门店 |

### 3.2 权限矩阵

| 功能模块 | 管理员 | 商务人员 |
|----------|--------|----------|
| 查看所有门店 | ✅ | ❌（仅自己负责的） |
| 添加门店 | ✅ | ❌ |
| 批量导入门店 | ✅ | ❌ |
| 删除门店 | ✅ | ❌ |
| 编辑门店等级 | ✅ | ❌ |
| 分配商务人员 | ✅ | ❌ |
| 商务人员管理 | ✅ | ❌ |
| 配置机器人 | ✅ | ✅ |
| 填写跟进记录 | ✅ | ✅ |
| 查看跟进记录 | ✅ | ✅ |
| AI 分析 | ✅ | ✅ |
| AI 配置 | ✅ | ✅ |

### 3.3 登录机制
- **登录方式**：单一密钥登录
- **管理员密钥**：固定为 996
- **商务密钥**：使用商务编号（如 001、B001 等）
- **状态持久化**：localStorage 存储
- **退出登录**：清除本地状态

---

## 四、功能模块详细设计

### 4.1 用户认证模块

#### 4.1.1 登录页面
**页面元素**：
- 系统 Logo + 名称
- 密钥输入框（密码类型）
- 登录按钮
- 错误提示

**交互逻辑**：
1. 用户输入密钥
2. 点击登录按钮
3. 系统验证密钥：
   - 匹配 996 → 管理员角色
   - 匹配商务编号 → 商务角色
   - 不匹配 → 显示"密钥错误"
4. 验证成功后跳转主页

**API 接口**：
```
POST /api/auth/login
Request: { "key": "996" }
Response: { "success": true, "data": { "role": "admin", "id": "admin", "name": "管理员" } }
```

---

### 4.2 主布局模块

#### 4.2.1 顶部导航栏
**布局结构**：
- 左侧：空白
- 右侧：
  - 门店总数（淡灰色）
  - 当前用户信息（徽章样式）
  - 商务管理按钮（仅管理员可见）
  - 删除门店按钮（仅管理员可见）
  - 退出按钮

**响应式适配**：
- 桌面端：显示完整文字
- 移动端：仅显示图标

#### 4.2.2 商务管理弹窗
**功能列表**：
- 查看商务人员列表（编号、姓名、状态）
- 添加商务人员（编号 + 姓名）
- 编辑商务人员姓名
- 启用/禁用商务人员
- 删除商务人员（需确认，其负责的门店变为未分配）

**API 接口**：
```
GET  /api/business-staff          # 获取商务人员列表
POST /api/business-staff          # 添加商务人员
PUT  /api/business-staff/[id]     # 更新商务人员
DELETE /api/business-staff/[id]   # 删除商务人员
```

---

### 4.3 门店管理模块

#### 4.3.1 门店数据模型

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | uuid | 自动 | 主键 |
| store_name | varchar(255) | ✅ | 门店名称 |
| store_id | varchar(100) | ❌ | 门店ID（业务编号） |
| category | varchar(255) | ❌ | 品类 |
| merchant_name | varchar(255) | ❌ | 商户名称 |
| merchant_id | varchar(100) | ❌ | 商户ID |
| region | varchar(100) | ❌ | 区域 |
| province | varchar(100) | ❌ | 省份 |
| city | varchar(100) | ❌ | 城市 |
| address | text | ❌ | 详细地址 |
| attach_status | varchar(50) | ❌ | 入驻状态 |
| business_status | varchar(50) | ❌ | 营业状态 |
| store_level | varchar(10) | ❌ | 门店等级（S/A/B/C） |
| contact_phone | varchar(50) | ❌ | 联系电话 |
| phone1/phone2/phone3 | varchar(50) | ❌ | 营业电话1/2/3 |
| business_id | varchar(36) | ❌ | 负责商务ID |
| created_at | timestamp | 自动 | 创建时间 |

#### 4.3.2 门店列表页面

**工具栏区域**（固定在顶部）：
1. **搜索框**：支持搜索门店名称、地址、品类、商户名、营业电话
2. **操作按钮**：
   - 批量导入
   - AI配置
   - 添加门店
3. **筛选区域**：
   - 日期范围选择器（下次跟进时间）
   - 快捷筛选标签：今天跟进、明日跟进、已逾期
   - 重置按钮

**表格列设计**：

| 列名 | 宽度 | 说明 |
|------|------|------|
| 门店名称 | 220px | 悬停显示详情气泡 |
| 门店ID | 130px | 业务编号 |
| 等级 | 60px | SABC下拉选择 |
| 营业状态 | 80px | 下拉选择 |
| 联系人 | 80px | 点击展开管理 |
| 商务 | 100px | 下拉分配（仅管理员） |
| 下次跟进 | 100px | 时间标签+排序 |
| 操作 | 80px | 跟进/查看按钮 |

**门店名称气泡详情**：
- 触发：鼠标悬停 300ms
- 显示内容：
  - 地区（省+市）
  - 详细地址
  - 品类
  - 商户名称
  - 商户ID
  - 商户电话
  - 营业电话1/2/3
  - 入驻状态
  - 创建时间

**等级颜色规范**：
- S级：红色（#f53f3f）
- A级：橙色（#ff7d00）
- B级：青色（#165dff）
- C级：灰色（#86909c）

**下次跟进时间标签**：
- 今天：蓝色背景标签
- 明天：蓝色背景标签
- N天后：灰色背景标签
- 已逾期：红色背景标签

**机器人状态图标**：
- 蓝色：已配置机器人
- 灰色：未配置机器人
- 点击：打开机器人配置弹窗

#### 4.3.3 添加门店弹窗

**表单字段**：
- 门店名称 *（必填）
- 门店ID
- 品类
- 商户名称
- 商户ID
- 省份
- 城市
- 详细地址
- 商户电话
- 营业电话1/2/3
- 入驻状态
- 营业状态

**API 接口**：
```
POST /api/stores
Request: { "store_name": "xxx门店", "province": "广东省", ... }
Response: { "success": true, "data": { ... } }
```

#### 4.3.4 批量导入功能

**文件格式**：Excel (.xlsx, .xls)

**模板列顺序**：
1. 门店名称 *（必填）
2. 门店ID
3. 品类
4. 商户名称
5. 商户ID
6. 区域
7. 省份
8. 城市
9. 详细地址
10. 入驻状态
11. 营业状态
12. 联系电话
13. 营业电话1
14. 营业电话2
15. 营业电话3

**导入逻辑**：
1. 解析 Excel 文件
2. 跳过表头行
3. 验证门店名称非空
4. 批量插入数据库
5. 返回成功数量

**API 接口**：
```
POST /api/stores/batch-upload
Request: { "stores": [{ "store_name": "xxx", ... }, ...] }
Response: { "success": true, "message": "成功上传 N 家门店" }
```

#### 4.3.5 删除门店功能

**安全机制**：
1. 需要输入管理员密码（996）
2. 需要输入门店ID确认
3. 双重验证通过后执行删除

**删除流程**：
1. 点击 Header 删除门店按钮
2. 弹窗输入管理员密码
3. 输入要删除的门店ID
4. 确认删除

**API 接口**：
```
DELETE /api/stores/[id]
Response: { "success": true }
```

---

### 4.4 联系人管理模块

#### 4.4.1 联系人数据模型

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | uuid | 自动 | 主键 |
| store_id | uuid | ✅ | 门店ID（外键） |
| name | varchar(100) | ❌ | 姓名 |
| position | varchar(100) | ❌ | 职位 |
| phone | varchar(50) | ❌ | 电话 |
| wechat | varchar(100) | ❌ | 微信 |
| remark | text | ❌ | 备注 |
| is_primary | boolean | 默认false | 是否首选联系人 |
| created_at | timestamp | 自动 | 创建时间 |

#### 4.4.2 联系人管理功能

**功能列表**：
- 查看门店联系人列表
- 添加联系人
- 编辑联系人
- 删除联系人
- 设置首选联系人（显示在列表第一位）

**交互方式**：
- 列表页点击"联系人"单元格展开面板
- 面板内显示联系人列表和操作按钮
- 首选联系人显示星标

**API 接口**：
```
GET  /api/contacts?store_id=xxx
POST /api/contacts
PUT  /api/contacts/[id]
DELETE /api/contacts/[id]
```

---

### 4.5 企业微信机器人配置模块

#### 4.5.1 机器人配置数据模型

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | uuid | 自动 | 主键 |
| store_id | uuid | ✅ | 门店ID（外键） |
| webhook_url | text | ✅ | Webhook地址 |
| robot_name | varchar(255) | ❌ | 机器人名称 |
| description | text | ❌ | 描述 |
| is_active | boolean | 默认true | 是否启用 |
| created_at | timestamp | 自动 | 创建时间 |

#### 4.5.2 机器人配置功能

**功能列表**：
- 查看门店的机器人配置列表
- 添加机器人配置
- 编辑机器人配置
- 删除机器人配置
- 启用/禁用机器人

**交互方式**：
- 点击门店名称前的机器人图标打开配置弹窗
- 支持一个门店配置多个机器人

**API 接口**：
```
GET  /api/robot-configs?store_id=xxx
POST /api/robot-configs
PUT  /api/robot-configs/[id]
DELETE /api/robot-configs/[id]
```

---

### 4.6 跟进记录模块

#### 4.6.1 跟进记录数据模型

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | uuid | 自动 | 主键 |
| store_id | uuid | ✅ | 门店ID（外键） |
| follow_time | timestamp | ✅ | 跟进时间 |
| remark | text | ✅ | 备注 |
| ai_analysis | text | 自动 | AI分析结果 |
| next_follow_time | timestamp | ❌ | 下次跟进时间 |
| created_at | timestamp | 自动 | 创建时间 |

#### 4.6.2 跟进截图数据模型

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | uuid | 自动 | 主键 |
| follow_record_id | uuid | ✅ | 跟进记录ID（外键） |
| image_key | varchar(500) | ✅ | 图片存储Key |
| image_url | text | ❌ | 图片访问URL |
| created_at | timestamp | 自动 | 创建时间 |

#### 4.6.3 填写跟进记录弹窗

**表单字段**：
- 跟进时间 *（日期时间选择器）
- 跟进备注 *（多行文本）
- 聊天截图 *（多图上传，支持拖拽）
- 下次跟进时间（快捷选择：明天/3天后/7天后/自定义）

**提交逻辑**：
1. 上传截图到对象存储
2. 创建跟进记录
3. 调用 AI 分析截图内容
4. 保存 AI 分析结果
5. 返回成功

**API 接口**：
```
POST /api/follow-records
Content-Type: multipart/form-data
Request: { store_id, follow_time, remark, next_follow_time, images[] }
Response: { success: true, data: { ... } }
```

#### 4.6.4 查看跟进记录弹窗

**功能列表**：
- 按时间倒序显示跟进记录
- 显示跟进时间、备注、截图
- 图片点击放大预览
- 键盘左右切换图片
- AI 分析结果展示

**时间显示格式**：
- 完整格式：MM-DD HH:00（如 03-15 14:00）

#### 4.6.5 跟进记录气泡预览

**交互方式**：
- 鼠标悬停小眼睛图标 300ms 后显示
- 显示最近 5 条跟进记录
- 气泡内图片可点击放大

---

### 4.7 AI 分析模块

#### 4.7.1 AI 分析功能

**触发场景**：
1. 填写跟进记录时自动分析聊天截图
2. 在跟进记录列表中手动生成 AI 总结

**分析内容**：
- 基于聊天截图自动识别：
  - 沟通要点
  - 客户需求
  - 待跟进事项

#### 4.7.2 AI 总结功能

**功能描述**：
- 基于跟进记录和聊天截图生成商户分析报告
- 支持自定义 AI 角色词模板
- 模板持久化存储在 localStorage

**分析报告结构**：
```
一、商户基本情况
二、沟通内容摘要
三、商户需求分析
四、跟进效果评估
五、后续建议
```

**API 接口**：
```
POST /api/ai-summary
Request: { 
  images: string[],      // 图片URL数组
  remarks: string,       // 跟进备注
  promptTemplate: string, // 自定义模板
  customInput: string,   // 自定义输入（优先使用）
  storeInfo: {           // 门店信息
    name: string,
    storeId: string,
    category: string,
    ...
  }
}
Response: { success: true, summary: "..." }
```

#### 4.7.3 AI 配置弹窗

**功能列表**：
- 查看默认 AI 角色词模板
- 编辑自定义模板
- 重置为默认模板
- 保存模板到本地

---

## 五、数据库设计

### 5.1 表关系图

```
stores (门店表)
    ├── robot_configs (机器人配置) 1:N
    ├── follow_records (跟进记录) 1:N
    │       └── follow_images (跟进截图) 1:N
    ├── contacts (联系人) 1:N
    └── business_staff (商务人员) N:1
```

### 5.2 索引设计

| 表名 | 索引名 | 字段 | 用途 |
|------|--------|------|------|
| stores | stores_store_id_idx | store_id | 门店ID查询 |
| stores | stores_province_idx | province | 省份筛选 |
| stores | stores_city_idx | city | 城市筛选 |
| stores | stores_created_at_idx | created_at | 时间排序 |
| follow_records | follow_records_store_id_idx | store_id | 门店跟进记录查询 |
| follow_records | follow_records_follow_time_idx | follow_time | 时间筛选 |
| follow_images | follow_images_follow_record_id_idx | follow_record_id | 记录图片查询 |

---

## 六、API 接口汇总

### 6.1 认证接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 用户登录 |

### 6.2 门店接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/stores | 获取门店列表 |
| POST | /api/stores | 创建门店 |
| PUT | /api/stores/[id] | 更新门店 |
| DELETE | /api/stores/[id] | 删除门店 |
| POST | /api/stores/batch-upload | 批量上传 |

### 6.3 联系人接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/contacts | 获取联系人列表 |
| POST | /api/contacts | 创建联系人 |
| PUT | /api/contacts/[id] | 更新联系人 |
| DELETE | /api/contacts/[id] | 删除联系人 |

### 6.4 机器人配置接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/robot-configs | 获取配置列表 |
| POST | /api/robot-configs | 创建配置 |
| PUT | /api/robot-configs/[id] | 更新配置 |
| DELETE | /api/robot-configs/[id] | 删除配置 |

### 6.5 跟进记录接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/follow-records | 获取跟进记录 |
| POST | /api/follow-records | 创建跟进记录 |
| DELETE | /api/follow-records/[id] | 删除跟进记录 |

### 6.6 AI 分析接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/ai-summary | 生成AI分析 |

### 6.7 商务人员接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/business-staff | 获取商务人员列表 |
| POST | /api/business-staff | 创建商务人员 |
| PUT | /api/business-staff/[id] | 更新商务人员 |
| DELETE | /api/business-staff/[id] | 删除商务人员 |

---

## 七、非功能性需求

### 7.1 性能要求
- 页面首屏加载时间 < 2s
- 列表加载支持骨架屏
- 图片上传支持进度显示
- AI 分析异步处理，不阻塞用户操作

### 7.2 安全要求
- 删除操作需密码验证
- 商务人员数据隔离
- 密钥不明文传输
- 敏感操作日志记录

### 7.3 兼容性要求
- 浏览器：Chrome 90+, Safari 14+, Firefox 88+
- 响应式：支持桌面端和移动端
- 屏幕宽度：最小支持 320px

### 7.4 可维护性要求
- 代码使用 TypeScript 强类型
- 组件化开发，保持单一职责
- API 接口统一响应格式
- 错误信息友好展示

---

## 八、项目目录结构

```
├── public/                     # 静态资源
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API 接口
│   │   │   ├── ai-summary/    # AI 分析
│   │   │   ├── auth/login/    # 登录
│   │   │   ├── business-staff/# 商务人员
│   │   │   ├── contacts/      # 联系人
│   │   │   ├── follow-records/# 跟进记录
│   │   │   ├── robot-configs/ # 机器人配置
│   │   │   └── stores/        # 门店
│   │   ├── layout.tsx         # 根布局
│   │   ├── page.tsx           # 主页面
│   │   └── globals.css        # 全局样式
│   ├── components/            # 业务组件
│   │   ├── ui/               # Shadcn UI 组件
│   │   ├── Dashboard.tsx     # 主面板
│   │   ├── LoginPage.tsx     # 登录页
│   │   ├── MainLayout.tsx    # 主布局
│   │   └── StoreList.tsx     # 门店列表
│   ├── contexts/             # React Context
│   │   └── AuthContext.tsx   # 认证状态
│   ├── hooks/                # 自定义 Hooks
│   └── storage/              # 数据存储
│       └── database/         # 数据库客户端
├── .coze                     # Coze 配置
├── package.json              # 依赖管理
└── AGENTS.md                 # 项目文档
```

---

## 九、开发规范

### 9.1 代码规范
- 使用 pnpm 作为包管理器
- 数据库字段使用 snake_case
- 前端组件使用 PascalCase
- 函数使用 camelCase

### 9.2 Git 提交规范
- feat: 新功能
- fix: 修复 bug
- refactor: 重构
- docs: 文档更新
- style: 样式调整
- chore: 构建/工具变更

### 9.3 API 响应格式
```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

---

## 十、版本规划

### V1.0（当前版本）
- ✅ 用户认证（密钥登录）
- ✅ 门店管理（增删改查、批量导入）
- ✅ 联系人管理
- ✅ 机器人配置
- ✅ 跟进记录（含图片上传）
- ✅ AI 分析（截图分析、总结生成）
- ✅ 商务人员管理

### 未来规划
- 数据统计仪表盘
- 跟进提醒通知
- 移动端 App
- 数据导出功能
- 权限细粒度控制
