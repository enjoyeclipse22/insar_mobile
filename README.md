# InSAR Pro Mobile

干涉合成孔径雷达（InSAR）数据处理移动应用平台。

## 项目简介

InSAR Pro 是一个专业的 InSAR 数据处理移动应用，支持从 Sentinel-1 卫星数据下载到形变图生成的完整处理流程。该应用采用 React Native + Expo 构建前端，Node.js + tRPC 构建后端，Python 提供核心 InSAR 处理算法。

## 功能特性

### 移动应用端
- **项目管理**：创建、编辑、删除 InSAR 处理项目
- **区域选择**：交互式地图选择研究区域
- **处理监控**：实时查看处理进度和日志
- **结果展示**：查看干涉图、相干图、形变图等处理结果
- **数据管理**：管理下载的卫星数据和处理结果

### 后端服务
- **数据下载**：自动从 ASF DAAC 下载 Sentinel-1 SLC 数据
- **轨道数据**：自动获取精密轨道数据
- **DEM 下载**：自动下载 SRTM DEM 数据
- **InSAR 处理**：配准、干涉图生成、相位解缠、形变反演
- **WebSocket**：实时日志推送

### Python 处理服务
- **ASF API 集成**：Sentinel-1 数据搜索和下载
- **SAR 算法**：配准、干涉图生成、多视处理
- **相位解缠**：SNAPHU 算法集成
- **大气校正**：ERA5 和 GACOS 大气校正
- **时序分析**：SBAS 时序反演

## 技术栈

### 前端
- React Native 0.81
- Expo SDK 54
- TypeScript 5.9
- NativeWind (Tailwind CSS)
- Expo Router 6

### 后端
- Node.js
- tRPC
- Drizzle ORM
- MySQL

### Python 服务
- asf_search - ASF 数据搜索
- PyGMTSAR - InSAR 处理
- NumPy / SciPy - 科学计算
- Matplotlib - 可视化

## 项目结构

```
insar-mobile-app/
├── app/                      # Expo Router 页面
│   ├── (tabs)/              # Tab 导航页面
│   ├── create-project/      # 创建项目向导
│   ├── processing-monitor/  # 处理监控
│   ├── results-viewer/      # 结果展示
│   └── ...
├── components/              # React 组件
├── hooks/                   # React Hooks
├── lib/                     # 工具库
├── server/                  # Node.js 后端
│   ├── _core/              # 核心服务
│   ├── insar-processor.ts  # InSAR 处理器
│   ├── python-client.ts    # Python 服务客户端
│   └── ...
├── python_service/          # Python 处理服务
│   ├── insar_processor.py  # InSAR 处理核心
│   ├── asf_api.py          # ASF API 集成
│   ├── download_service.py # 数据下载服务
│   └── ...
├── drizzle/                 # 数据库 Schema
├── tests/                   # 测试文件
└── public/                  # 静态资源
    └── insar-results/      # 处理结果图像
```

## 快速开始

### 环境要求
- Node.js 18+
- Python 3.11+
- MySQL 8.0+
- pnpm

### 安装依赖

```bash
# 安装 Node.js 依赖
pnpm install

# 安装 Python 依赖
pip install asf_search numpy scipy matplotlib
```

### 配置环境变量

创建 `.env` 文件：

```env
DATABASE_URL=mysql://user:password@localhost:3306/insar
ASF_USERNAME=your_asf_username
ASF_PASSWORD=your_asf_password
```

### 启动开发服务器

```bash
# 启动前端和后端
pnpm dev

# 单独启动 Python 服务
cd python_service && python main.py
```

### 运行测试

```bash
pnpm test
```

## API 文档

### tRPC 路由

| 路由 | 描述 |
|------|------|
| `insar.startProcessing` | 启动 InSAR 处理任务 |
| `insar.getStatus` | 获取处理状态 |
| `insar.cancelProcessing` | 取消处理任务 |
| `insar.getResults` | 获取处理结果 |

### WebSocket 事件

| 事件 | 描述 |
|------|------|
| `log` | 处理日志消息 |
| `progress` | 进度更新 |
| `completed` | 处理完成 |
| `failed` | 处理失败 |

## 处理流程

1. **数据搜索**：通过 ASF API 搜索 Sentinel-1 SLC 数据
2. **数据下载**：下载主从影像、轨道数据、DEM
3. **配准**：主从影像配准
4. **干涉图生成**：生成复数干涉图
5. **多视处理**：降低噪声
6. **相位滤波**：Goldstein 滤波
7. **相位解缠**：SNAPHU 算法
8. **形变反演**：相位转换为形变量
9. **大气校正**：ERA5/GACOS 校正（可选）

## 示例结果

处理土耳其地震区域数据生成的结果：

- **干涉图**：显示缠绕相位条纹
- **相干图**：表示影像相似程度
- **解缠相位图**：连续相位值
- **形变图**：地表形变（形变范围 -671 ~ 701 mm）

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request。

## 联系方式

如有问题，请提交 Issue。
