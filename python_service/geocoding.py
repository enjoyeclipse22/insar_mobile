"""
地理编码模块 - 将 InSAR 处理结果转换为地理坐标并生成地图瓦片

实现功能：
1. 雷达坐标到地理坐标转换
2. GeoTIFF 地理信息提取
3. 结果重采样和投影转换
4. 地图瓦片生成
5. 颜色映射和透明度处理
"""

import numpy as np
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass
from enum import Enum
import json
import os
import math
from datetime import datetime


class CoordinateSystem(Enum):
    """坐标系统枚举"""
    WGS84 = "EPSG:4326"  # 经纬度
    UTM = "UTM"  # 通用横轴墨卡托
    RADAR = "RADAR"  # 雷达坐标（距离-方位）
    WEB_MERCATOR = "EPSG:3857"  # Web 墨卡托（用于在线地图）


@dataclass
class GeoTransform:
    """地理变换参数"""
    x_origin: float  # 左上角 X 坐标
    pixel_width: float  # 像素宽度
    x_rotation: float  # X 方向旋转
    y_origin: float  # 左上角 Y 坐标
    y_rotation: float  # Y 方向旋转
    pixel_height: float  # 像素高度（通常为负值）
    
    def pixel_to_geo(self, col: int, row: int) -> Tuple[float, float]:
        """像素坐标转地理坐标"""
        x = self.x_origin + col * self.pixel_width + row * self.x_rotation
        y = self.y_origin + col * self.y_rotation + row * self.pixel_height
        return x, y
    
    def geo_to_pixel(self, x: float, y: float) -> Tuple[int, int]:
        """地理坐标转像素坐标"""
        det = self.pixel_width * self.pixel_height - self.x_rotation * self.y_rotation
        col = int((self.pixel_height * (x - self.x_origin) - self.x_rotation * (y - self.y_origin)) / det)
        row = int((-self.y_rotation * (x - self.x_origin) + self.pixel_width * (y - self.y_origin)) / det)
        return col, row


@dataclass
class BoundingBox:
    """地理边界框"""
    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float
    
    @property
    def center(self) -> Tuple[float, float]:
        """获取中心点"""
        return (self.min_lon + self.max_lon) / 2, (self.min_lat + self.max_lat) / 2
    
    @property
    def width(self) -> float:
        """获取宽度（经度范围）"""
        return self.max_lon - self.min_lon
    
    @property
    def height(self) -> float:
        """获取高度（纬度范围）"""
        return self.max_lat - self.min_lat
    
    def contains(self, lon: float, lat: float) -> bool:
        """检查点是否在边界框内"""
        return self.min_lon <= lon <= self.max_lon and self.min_lat <= lat <= self.max_lat
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "min_lon": self.min_lon,
            "min_lat": self.min_lat,
            "max_lon": self.max_lon,
            "max_lat": self.max_lat,
            "center": self.center,
            "width": self.width,
            "height": self.height
        }


class GeocodingProcessor:
    """地理编码处理器"""
    
    def __init__(self, output_dir: str = "./geocoded"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        
    def extract_geotiff_info(self, data: np.ndarray, 
                             geo_transform: Optional[GeoTransform] = None,
                             bounds: Optional[BoundingBox] = None) -> Dict[str, Any]:
        """
        提取 GeoTIFF 地理信息
        
        Args:
            data: 栅格数据
            geo_transform: 地理变换参数
            bounds: 地理边界框
            
        Returns:
            地理信息字典
        """
        height, width = data.shape[:2] if len(data.shape) >= 2 else (data.shape[0], 1)
        
        # 如果没有提供边界框，使用默认值或从 geo_transform 计算
        if bounds is None:
            if geo_transform is not None:
                min_lon, max_lat = geo_transform.pixel_to_geo(0, 0)
                max_lon, min_lat = geo_transform.pixel_to_geo(width, height)
                bounds = BoundingBox(min_lon, min_lat, max_lon, max_lat)
            else:
                # 默认边界框（示例：土耳其地震区域）
                bounds = BoundingBox(36.0, 37.0, 38.0, 38.5)
        
        return {
            "width": width,
            "height": height,
            "bounds": bounds.to_dict(),
            "pixel_size": {
                "x": bounds.width / width if width > 0 else 0,
                "y": bounds.height / height if height > 0 else 0
            },
            "crs": CoordinateSystem.WGS84.value,
            "data_type": str(data.dtype),
            "nodata": float(np.nan),
            "statistics": {
                "min": float(np.nanmin(data)),
                "max": float(np.nanmax(data)),
                "mean": float(np.nanmean(data)),
                "std": float(np.nanstd(data))
            }
        }
    
    def radar_to_geographic(self, 
                           azimuth: np.ndarray, 
                           range_dist: np.ndarray,
                           orbit_params: Dict[str, float]) -> Tuple[np.ndarray, np.ndarray]:
        """
        雷达坐标转地理坐标
        
        Args:
            azimuth: 方位向坐标数组
            range_dist: 距离向坐标数组
            orbit_params: 轨道参数
                - satellite_height: 卫星高度 (m)
                - look_angle: 视角 (degrees)
                - heading: 航向角 (degrees)
                - center_lat: 中心纬度
                - center_lon: 中心经度
                
        Returns:
            (longitude, latitude) 数组元组
        """
        # 获取轨道参数
        sat_height = orbit_params.get("satellite_height", 693000)  # Sentinel-1 轨道高度
        look_angle = np.radians(orbit_params.get("look_angle", 33.0))
        heading = np.radians(orbit_params.get("heading", -13.0))  # 升轨默认航向
        center_lat = orbit_params.get("center_lat", 37.5)
        center_lon = orbit_params.get("center_lon", 37.0)
        
        # 地球半径
        earth_radius = 6371000  # 米
        
        # 计算地面距离
        ground_range = range_dist * np.cos(look_angle)
        
        # 计算沿轨和跨轨偏移
        along_track = azimuth  # 沿轨方向偏移
        cross_track = ground_range  # 跨轨方向偏移
        
        # 转换为经纬度偏移
        lat_offset = (along_track * np.cos(heading) + cross_track * np.sin(heading)) / earth_radius
        lon_offset = (-along_track * np.sin(heading) + cross_track * np.cos(heading)) / (earth_radius * np.cos(np.radians(center_lat)))
        
        # 计算最终经纬度
        latitude = center_lat + np.degrees(lat_offset)
        longitude = center_lon + np.degrees(lon_offset)
        
        return longitude, latitude
    
    def reproject(self, 
                  data: np.ndarray,
                  src_bounds: BoundingBox,
                  dst_bounds: BoundingBox,
                  dst_size: Tuple[int, int],
                  method: str = "bilinear") -> np.ndarray:
        """
        重投影和重采样
        
        Args:
            data: 源数据
            src_bounds: 源边界框
            dst_bounds: 目标边界框
            dst_size: 目标尺寸 (width, height)
            method: 插值方法 ("nearest", "bilinear", "cubic")
            
        Returns:
            重投影后的数据
        """
        dst_width, dst_height = dst_size
        src_height, src_width = data.shape[:2]
        
        # 创建目标网格
        dst_x = np.linspace(dst_bounds.min_lon, dst_bounds.max_lon, dst_width)
        dst_y = np.linspace(dst_bounds.max_lat, dst_bounds.min_lat, dst_height)
        dst_xx, dst_yy = np.meshgrid(dst_x, dst_y)
        
        # 计算源像素坐标
        src_col = (dst_xx - src_bounds.min_lon) / src_bounds.width * src_width
        src_row = (src_bounds.max_lat - dst_yy) / src_bounds.height * src_height
        
        # 执行插值
        if method == "nearest":
            result = self._nearest_interpolation(data, src_col, src_row)
        elif method == "bilinear":
            result = self._bilinear_interpolation(data, src_col, src_row)
        else:  # cubic
            result = self._cubic_interpolation(data, src_col, src_row)
        
        return result
    
    def _nearest_interpolation(self, data: np.ndarray, 
                               col: np.ndarray, row: np.ndarray) -> np.ndarray:
        """最近邻插值"""
        height, width = data.shape[:2]
        col_int = np.clip(np.round(col).astype(int), 0, width - 1)
        row_int = np.clip(np.round(row).astype(int), 0, height - 1)
        return data[row_int, col_int]
    
    def _bilinear_interpolation(self, data: np.ndarray,
                                col: np.ndarray, row: np.ndarray) -> np.ndarray:
        """双线性插值"""
        height, width = data.shape[:2]
        
        # 获取四个角点
        col0 = np.clip(np.floor(col).astype(int), 0, width - 1)
        col1 = np.clip(col0 + 1, 0, width - 1)
        row0 = np.clip(np.floor(row).astype(int), 0, height - 1)
        row1 = np.clip(row0 + 1, 0, height - 1)
        
        # 计算权重
        col_frac = col - col0
        row_frac = row - row0
        
        # 双线性插值
        result = (data[row0, col0] * (1 - col_frac) * (1 - row_frac) +
                  data[row0, col1] * col_frac * (1 - row_frac) +
                  data[row1, col0] * (1 - col_frac) * row_frac +
                  data[row1, col1] * col_frac * row_frac)
        
        return result
    
    def _cubic_interpolation(self, data: np.ndarray,
                             col: np.ndarray, row: np.ndarray) -> np.ndarray:
        """三次插值（简化版，使用双线性作为后备）"""
        # 简化实现，使用双线性插值
        return self._bilinear_interpolation(data, col, row)
    
    def generate_tiles(self,
                       data: np.ndarray,
                       bounds: BoundingBox,
                       min_zoom: int = 8,
                       max_zoom: int = 14,
                       tile_size: int = 256,
                       colormap: str = "viridis") -> Dict[str, Any]:
        """
        生成地图瓦片
        
        Args:
            data: 栅格数据
            bounds: 地理边界框
            min_zoom: 最小缩放级别
            max_zoom: 最大缩放级别
            tile_size: 瓦片尺寸
            colormap: 颜色映射
            
        Returns:
            瓦片信息字典
        """
        tiles_info = {
            "bounds": bounds.to_dict(),
            "min_zoom": min_zoom,
            "max_zoom": max_zoom,
            "tile_size": tile_size,
            "colormap": colormap,
            "tiles": []
        }
        
        # 为每个缩放级别生成瓦片
        for zoom in range(min_zoom, max_zoom + 1):
            zoom_tiles = self._generate_zoom_level_tiles(
                data, bounds, zoom, tile_size, colormap
            )
            tiles_info["tiles"].extend(zoom_tiles)
        
        return tiles_info
    
    def _generate_zoom_level_tiles(self,
                                   data: np.ndarray,
                                   bounds: BoundingBox,
                                   zoom: int,
                                   tile_size: int,
                                   colormap: str) -> List[Dict]:
        """生成指定缩放级别的瓦片"""
        tiles = []
        
        # 计算瓦片范围
        min_tile_x, min_tile_y = self._lon_lat_to_tile(bounds.min_lon, bounds.max_lat, zoom)
        max_tile_x, max_tile_y = self._lon_lat_to_tile(bounds.max_lon, bounds.min_lat, zoom)
        
        for tile_x in range(min_tile_x, max_tile_x + 1):
            for tile_y in range(min_tile_y, max_tile_y + 1):
                tile_bounds = self._tile_to_bounds(tile_x, tile_y, zoom)
                
                # 检查瓦片是否与数据范围相交
                if self._bounds_intersect(bounds, tile_bounds):
                    tile_data = self._extract_tile_data(
                        data, bounds, tile_bounds, tile_size
                    )
                    
                    if tile_data is not None:
                        # 应用颜色映射
                        colored_tile = self._apply_colormap(tile_data, colormap)
                        
                        # 保存瓦片
                        tile_path = os.path.join(
                            self.output_dir, 
                            f"tiles/{zoom}/{tile_x}/{tile_y}.png"
                        )
                        os.makedirs(os.path.dirname(tile_path), exist_ok=True)
                        
                        tiles.append({
                            "zoom": zoom,
                            "x": tile_x,
                            "y": tile_y,
                            "path": tile_path,
                            "bounds": tile_bounds.to_dict()
                        })
        
        return tiles
    
    def _lon_lat_to_tile(self, lon: float, lat: float, zoom: int) -> Tuple[int, int]:
        """经纬度转瓦片坐标"""
        n = 2 ** zoom
        tile_x = int((lon + 180) / 360 * n)
        tile_y = int((1 - math.log(math.tan(math.radians(lat)) + 
                                    1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
        return tile_x, tile_y
    
    def _tile_to_bounds(self, tile_x: int, tile_y: int, zoom: int) -> BoundingBox:
        """瓦片坐标转边界框"""
        n = 2 ** zoom
        min_lon = tile_x / n * 360 - 180
        max_lon = (tile_x + 1) / n * 360 - 180
        max_lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * tile_y / n))))
        min_lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (tile_y + 1) / n))))
        return BoundingBox(min_lon, min_lat, max_lon, max_lat)
    
    def _bounds_intersect(self, bounds1: BoundingBox, bounds2: BoundingBox) -> bool:
        """检查两个边界框是否相交"""
        return not (bounds1.max_lon < bounds2.min_lon or
                    bounds1.min_lon > bounds2.max_lon or
                    bounds1.max_lat < bounds2.min_lat or
                    bounds1.min_lat > bounds2.max_lat)
    
    def _extract_tile_data(self,
                           data: np.ndarray,
                           data_bounds: BoundingBox,
                           tile_bounds: BoundingBox,
                           tile_size: int) -> Optional[np.ndarray]:
        """提取瓦片数据"""
        try:
            # 重投影到瓦片范围
            tile_data = self.reproject(
                data, data_bounds, tile_bounds, (tile_size, tile_size)
            )
            return tile_data
        except Exception:
            return None
    
    def _apply_colormap(self, data: np.ndarray, colormap: str) -> np.ndarray:
        """应用颜色映射"""
        # 归一化数据
        valid_mask = ~np.isnan(data)
        if not np.any(valid_mask):
            return np.zeros((*data.shape, 4), dtype=np.uint8)
        
        vmin = np.nanmin(data)
        vmax = np.nanmax(data)
        if vmax == vmin:
            normalized = np.zeros_like(data)
        else:
            normalized = (data - vmin) / (vmax - vmin)
        
        # 获取颜色映射
        colors = self._get_colormap(colormap)
        
        # 应用颜色映射
        indices = np.clip((normalized * 255).astype(int), 0, 255)
        rgba = np.zeros((*data.shape, 4), dtype=np.uint8)
        
        for i in range(3):
            rgba[..., i] = colors[indices, i]
        
        # 设置透明度（无效值为透明）
        rgba[..., 3] = np.where(valid_mask, 200, 0)
        
        return rgba
    
    def _get_colormap(self, name: str) -> np.ndarray:
        """获取颜色映射表"""
        if name == "viridis":
            return self._viridis_colormap()
        elif name == "jet":
            return self._jet_colormap()
        elif name == "coolwarm":
            return self._coolwarm_colormap()
        elif name == "rdylgn":
            return self._rdylgn_colormap()
        else:
            return self._viridis_colormap()
    
    def _viridis_colormap(self) -> np.ndarray:
        """Viridis 颜色映射"""
        colors = np.zeros((256, 3), dtype=np.uint8)
        for i in range(256):
            t = i / 255
            colors[i] = [
                int(255 * (0.267004 + t * (0.329415 + t * (-0.498039 + t * 0.901684)))),
                int(255 * (0.004874 + t * (0.873449 + t * (-0.610871 + t * 0.732828)))),
                int(255 * (0.329415 + t * (0.694426 + t * (-0.876022 + t * 0.852126))))
            ]
        return colors
    
    def _jet_colormap(self) -> np.ndarray:
        """Jet 颜色映射"""
        colors = np.zeros((256, 3), dtype=np.uint8)
        for i in range(256):
            t = i / 255
            if t < 0.125:
                colors[i] = [0, 0, int(255 * (0.5 + 4 * t))]
            elif t < 0.375:
                colors[i] = [0, int(255 * (4 * (t - 0.125))), 255]
            elif t < 0.625:
                colors[i] = [int(255 * (4 * (t - 0.375))), 255, int(255 * (1 - 4 * (t - 0.375)))]
            elif t < 0.875:
                colors[i] = [255, int(255 * (1 - 4 * (t - 0.625))), 0]
            else:
                colors[i] = [int(255 * (1 - 4 * (t - 0.875))), 0, 0]
        return colors
    
    def _coolwarm_colormap(self) -> np.ndarray:
        """CoolWarm 颜色映射（适合形变数据）"""
        colors = np.zeros((256, 3), dtype=np.uint8)
        for i in range(256):
            t = i / 255
            if t < 0.5:
                # 蓝色到白色
                s = t * 2
                colors[i] = [int(255 * s), int(255 * s), 255]
            else:
                # 白色到红色
                s = (t - 0.5) * 2
                colors[i] = [255, int(255 * (1 - s)), int(255 * (1 - s))]
        return colors
    
    def _rdylgn_colormap(self) -> np.ndarray:
        """Red-Yellow-Green 颜色映射"""
        colors = np.zeros((256, 3), dtype=np.uint8)
        for i in range(256):
            t = i / 255
            if t < 0.5:
                # 红色到黄色
                s = t * 2
                colors[i] = [255, int(255 * s), 0]
            else:
                # 黄色到绿色
                s = (t - 0.5) * 2
                colors[i] = [int(255 * (1 - s)), 255, 0]
        return colors
    
    def create_geojson_overlay(self,
                               data: np.ndarray,
                               bounds: BoundingBox,
                               threshold: Optional[float] = None,
                               simplify: bool = True) -> Dict:
        """
        创建 GeoJSON 叠加层
        
        Args:
            data: 栅格数据
            bounds: 地理边界框
            threshold: 阈值（仅包含超过阈值的区域）
            simplify: 是否简化几何
            
        Returns:
            GeoJSON 对象
        """
        height, width = data.shape[:2]
        
        features = []
        
        # 计算像素尺寸
        pixel_width = bounds.width / width
        pixel_height = bounds.height / height
        
        # 创建网格点
        for row in range(height):
            for col in range(width):
                value = data[row, col]
                
                if np.isnan(value):
                    continue
                
                if threshold is not None and abs(value) < threshold:
                    continue
                
                # 计算像素中心坐标
                lon = bounds.min_lon + (col + 0.5) * pixel_width
                lat = bounds.max_lat - (row + 0.5) * pixel_height
                
                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [lon, lat]
                    },
                    "properties": {
                        "value": float(value),
                        "row": row,
                        "col": col
                    }
                })
        
        return {
            "type": "FeatureCollection",
            "features": features,
            "properties": {
                "bounds": bounds.to_dict(),
                "data_type": "insar_deformation",
                "unit": "mm/year"
            }
        }
    
    def geocode_insar_result(self,
                             data: np.ndarray,
                             bounds: BoundingBox,
                             result_type: str = "velocity",
                             colormap: str = "coolwarm",
                             generate_tiles: bool = True) -> Dict[str, Any]:
        """
        地理编码 InSAR 结果
        
        Args:
            data: InSAR 处理结果数据
            bounds: 地理边界框
            result_type: 结果类型 ("velocity", "interferogram", "coherence")
            colormap: 颜色映射
            generate_tiles: 是否生成瓦片
            
        Returns:
            地理编码结果
        """
        result = {
            "timestamp": datetime.now().isoformat(),
            "result_type": result_type,
            "geo_info": self.extract_geotiff_info(data, bounds=bounds),
            "colormap": colormap
        }
        
        # 生成瓦片
        if generate_tiles:
            tiles_info = self.generate_tiles(data, bounds, colormap=colormap)
            result["tiles"] = tiles_info
        
        # 创建 GeoJSON 叠加层（用于高亮显示）
        threshold = np.nanstd(data) * 2 if result_type == "velocity" else None
        result["geojson"] = self.create_geojson_overlay(data, bounds, threshold)
        
        # 保存结果
        output_path = os.path.join(self.output_dir, f"{result_type}_geocoded.json")
        with open(output_path, 'w') as f:
            json.dump(result, f, indent=2, default=str)
        
        result["output_path"] = output_path
        
        return result


class MapOverlayGenerator:
    """地图叠加层生成器"""
    
    def __init__(self, geocoder: GeocodingProcessor):
        self.geocoder = geocoder
    
    def generate_velocity_overlay(self,
                                  velocity_data: np.ndarray,
                                  bounds: BoundingBox,
                                  vmin: float = -50,
                                  vmax: float = 50) -> Dict:
        """
        生成形变速率叠加层
        
        Args:
            velocity_data: 形变速率数据 (mm/year)
            bounds: 地理边界框
            vmin: 最小值
            vmax: 最大值
            
        Returns:
            叠加层信息
        """
        # 裁剪数据范围
        clipped_data = np.clip(velocity_data, vmin, vmax)
        
        return self.geocoder.geocode_insar_result(
            clipped_data, bounds, 
            result_type="velocity",
            colormap="coolwarm"
        )
    
    def generate_interferogram_overlay(self,
                                       phase_data: np.ndarray,
                                       bounds: BoundingBox) -> Dict:
        """
        生成干涉图叠加层
        
        Args:
            phase_data: 相位数据 (radians)
            bounds: 地理边界框
            
        Returns:
            叠加层信息
        """
        # 将相位包裹到 [-π, π]
        wrapped_phase = np.angle(np.exp(1j * phase_data))
        
        return self.geocoder.geocode_insar_result(
            wrapped_phase, bounds,
            result_type="interferogram",
            colormap="jet"
        )
    
    def generate_coherence_overlay(self,
                                   coherence_data: np.ndarray,
                                   bounds: BoundingBox) -> Dict:
        """
        生成相干图叠加层
        
        Args:
            coherence_data: 相干性数据 (0-1)
            bounds: 地理边界框
            
        Returns:
            叠加层信息
        """
        return self.geocoder.geocode_insar_result(
            coherence_data, bounds,
            result_type="coherence",
            colormap="viridis"
        )
    
    def generate_combined_overlay(self,
                                  velocity_data: np.ndarray,
                                  coherence_data: np.ndarray,
                                  bounds: BoundingBox,
                                  coherence_threshold: float = 0.3) -> Dict:
        """
        生成组合叠加层（用相干性掩膜形变速率）
        
        Args:
            velocity_data: 形变速率数据
            coherence_data: 相干性数据
            bounds: 地理边界框
            coherence_threshold: 相干性阈值
            
        Returns:
            叠加层信息
        """
        # 应用相干性掩膜
        masked_velocity = np.where(
            coherence_data >= coherence_threshold,
            velocity_data,
            np.nan
        )
        
        return self.geocoder.geocode_insar_result(
            masked_velocity, bounds,
            result_type="masked_velocity",
            colormap="coolwarm"
        )


# 测试函数
def test_geocoding():
    """测试地理编码功能"""
    print("测试地理编码模块...")
    
    # 创建测试数据
    height, width = 100, 100
    test_data = np.random.randn(height, width) * 10  # 模拟形变速率数据
    
    # 创建边界框（土耳其地震区域）
    bounds = BoundingBox(36.5, 37.0, 38.0, 38.5)
    
    # 创建地理编码处理器
    geocoder = GeocodingProcessor("./test_geocoded")
    
    # 测试地理信息提取
    geo_info = geocoder.extract_geotiff_info(test_data, bounds=bounds)
    print(f"地理信息: {geo_info}")
    
    # 测试地理编码
    result = geocoder.geocode_insar_result(
        test_data, bounds,
        result_type="velocity",
        colormap="coolwarm",
        generate_tiles=False  # 跳过瓦片生成以加快测试
    )
    print(f"地理编码结果: {result['geo_info']}")
    
    # 测试叠加层生成
    overlay_gen = MapOverlayGenerator(geocoder)
    velocity_overlay = overlay_gen.generate_velocity_overlay(test_data, bounds)
    print(f"速率叠加层生成完成")
    
    print("地理编码模块测试完成!")
    return True


if __name__ == "__main__":
    test_geocoding()
