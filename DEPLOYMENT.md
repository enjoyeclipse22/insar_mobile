# InSAR Pro Mobile 部署指南

## 环境要求

| 组件 | 版本要求 |
|------|----------|
| Node.js | 18.0+ |
| Python | 3.11+ |
| MySQL | 8.0+ |
| pnpm | 9.0+ |

## 快速启动

### 1. 克隆项目

```bash
git clone https://github.com/enjoyeclipse22/insar_mobile.git
cd insar_mobile
```

### 2. 安装依赖

```bash
# 安装 Node.js 依赖
pnpm install

# 安装 Python 依赖
cd python_service
pip install -r requirements.txt
cd ..
```

### 3. 配置环境变量

创建 `.env` 文件：

```env
# 数据库配置
DATABASE_URL=mysql://username:password@localhost:3306/insar_db

# ASF 数据下载凭据（可选，用于下载 Sentinel-1 数据）
ASF_USERNAME=your_asf_username
ASF_PASSWORD=your_asf_password

# 服务端口
EXPO_PORT=8081
API_PORT=3000
```

### 4. 初始化数据库

```bash
# 生成数据库迁移
pnpm db:push
```

### 5. 启动开发服务器

**方式一：同时启动前后端（推荐）**

```bash
pnpm dev
```

这将同时启动：
- Metro 开发服务器（端口 8081）
- Node.js API 服务器（端口 3000）

**方式二：分别启动**

```bash
# 终端 1：启动 Node.js 后端
pnpm dev:server

# 终端 2：启动 Expo Metro
pnpm dev:metro
```

### 6. 启动 Python 服务（可选）

如需使用完整的 InSAR 处理功能：

```bash
cd python_service
python main.py
```

Python 服务默认运行在端口 8000。

## 访问应用

| 服务 | 地址 |
|------|------|
| Web 预览 | http://localhost:8081 |
| API 服务 | http://localhost:3000 |
| Python 服务 | http://localhost:8000 |

## 移动设备测试

1. 安装 **Expo Go** 应用（iOS App Store / Google Play）
2. 确保手机和电脑在同一网络
3. 运行 `pnpm qr` 生成二维码
4. 使用 Expo Go 扫描二维码

## 生产部署

### Node.js 后端

```bash
# 构建
pnpm build

# 启动生产服务
pnpm start
```

### 移动应用

```bash
# 构建 iOS
npx expo build:ios

# 构建 Android
npx expo build:android
```

## 常见问题

**Q: 数据库连接失败**
- 检查 MySQL 服务是否运行
- 确认 DATABASE_URL 格式正确

**Q: Metro 启动失败**
- 清除缓存：`npx expo start --clear`
- 删除 node_modules 重新安装

**Q: Python 服务无法启动**
- 确认 Python 版本 ≥ 3.11
- 检查依赖是否完整安装

## 目录结构

```
insar_mobile/
├── app/                 # Expo Router 页面
├── server/              # Node.js 后端
├── python_service/      # Python InSAR 处理
├── drizzle/             # 数据库 Schema
└── public/              # 静态资源
```
