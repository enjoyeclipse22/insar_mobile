# InSAR.dev Colab 处理流程分析

基于 https://colab.research.google.com/drive/1KsHRDz1XVtDWAkJMXK0gdpMiEfHNvXB3 的处理流程

## 核心库
- `insardev_pygmtsar`: Sentinel-1 SLC 预处理（需要 GMTSAR 二进制文件）
- `insardev_toolkit`: 工具函数和辅助模块
- `insardev`: 核心干涉处理和分析

## 处理步骤

### 1. 安装依赖
```python
pip install insardev_pygmtsar insardev_toolkit
```

### 2. 导入模块
```python
from insardev_pygmtsar import S1
from insardev_toolkit import EOF, ASF, Tiles, XYZTiles
```

### 3. 指定 Sentinel-1 SLC Burst 数据
```python
BURSTS = """
S1_043788_IW1_20230129T033343_VH_DAAA-BURST
S1_043788_IW1_20230210T033342_VH_5708-BURST
S1_043788_IW1_20230129T033343_VV_DAAA-BURST
S1_043788_IW1_20230210T033342_VV_5708-BURST
"""
DATADIR = 'data_turkey_2023'
DEM = f'{DATADIR}/dem.nc'
```

### 4. 下载数据
```python
# ASF 认证
asf = ASF(asf_username, asf_password)
asf.download(DATADIR, BURSTS)

# 读取 SLC 数据
s1 = S1(DATADIR)

# 下载轨道数据
EOF().download(DATADIR, s1.to_dataframe())

# 下载 DEM (SRTM 30m)
Tiles().download_dem_srtm(s1.to_dataframe().buffer(0.2), filename=DEM)
```

### 5. 启动 Dask 集群（并行处理）
```python
from dask.distributed import Client
client = Client(silence_logs='CRITICAL')
```

### 6. 加载数据
```python
s1 = S1(DATADIR, DEM=DEM)
s1.to_dataframe()
s1.plot()
```

### 7. 处理（配准 + 干涉图生成）
```python
# 选择参考日期
s1.plot(ref='2023-01-29')

# 执行变换（配准、干涉图生成）
s1.transform('turkey_2023_path21', ref='2023-01-29', resolution=(40, 10), epsg=32637)
```

## 关键参数

- **resolution**: (40, 10) - 方位向和距离向分辨率
- **epsg**: 32637 - UTM 投影坐标系
- **ref**: 参考日期（主影像）

## 我们需要实现的真实处理步骤

1. **数据搜索** - 使用 ASF API 搜索 Sentinel-1 SLC 数据
2. **数据下载** - 下载 SLC Burst 数据（需要 ASF 认证）
3. **轨道下载** - 下载精密轨道数据 (EOF)
4. **DEM 下载** - 下载 SRTM DEM 数据
5. **配准** - 使用 GMTSAR 进行影像配准
6. **干涉图生成** - 生成复数干涉图
7. **相位解缠** - 使用 SNAPHU 算法
8. **形变反演** - 相位转换为形变量
