import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, Platform, Dimensions, Modal, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { useColors } from "@/hooks/use-colors";
import { cacheTile, getCachedTile, getCacheStats, clearAllCache, formatSize, precacheArea } from "@/lib/tile-cache";

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface Marker {
  id: string;
  lat: number;
  lon: number;
  label?: string;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
}

interface RealMapSelectorProps {
  bounds: Bounds;
  onBoundsChange: (bounds: Bounds) => void;
}

// 预设区域
const presetAreas = [
  { name: "土耳其地震区", north: 38.5, south: 36.5, east: 38.0, west: 35.5 },
  { name: "加州断层带", north: 36.5, south: 35.0, east: -117.0, west: -119.0 },
  { name: "日本富士山", north: 35.8, south: 35.0, east: 139.0, west: 138.0 },
  { name: "冰岛火山区", north: 64.5, south: 63.5, east: -18.0, west: -20.0 },
];

// 地图图层类型
type MapLayerType = "street" | "satellite" | "terrain";

// 地图图层配置
const mapLayers: Record<MapLayerType, { name: string; getTileUrl: (x: number, y: number, z: number) => string }> = {
  street: {
    name: "街道",
    getTileUrl: (x, y, z) => {
      const servers = ['a', 'b', 'c'];
      const server = servers[(x + y) % servers.length];
      return `https://${server}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
    },
  },
  satellite: {
    name: "卫星",
    getTileUrl: (x, y, z) => {
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    },
  },
  terrain: {
    name: "地形",
    getTileUrl: (x, y, z) => {
      const servers = ['a', 'b', 'c'];
      const server = servers[(x + y) % servers.length];
      return `https://${server}.tile.opentopomap.org/${z}/${x}/${y}.png`;
    },
  },
};

// 经纬度转瓦片坐标
function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

// 瓦片坐标转经纬度
function tileToLonLat(x: number, y: number, zoom: number): { lon: number; lat: number } {
  const n = Math.pow(2, zoom);
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lon, lat };
}

// 计算比例尺
function getScaleInfo(lat: number, zoom: number): { distance: number; unit: string; width: number } {
  const earthCircumference = 40075016.686;
  const metersPerPixel = (earthCircumference * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
  const targetWidth = 100;
  let distance = metersPerPixel * targetWidth;
  let unit = "m";
  
  if (distance >= 1000) {
    distance = distance / 1000;
    unit = "km";
  }
  
  const niceNumbers = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  let niceDistance = niceNumbers[0];
  for (const n of niceNumbers) {
    if (n <= distance * 1.5) {
      niceDistance = n;
    }
  }
  
  const actualWidth = (niceDistance * (unit === "km" ? 1000 : 1)) / metersPerPixel;
  
  return { distance: niceDistance, unit, width: actualWidth };
}

export function RealMapSelector({ bounds, onBoundsChange }: RealMapSelectorProps) {
  const colors = useColors();
  const [zoom, setZoom] = useState(5);
  const [center, setCenter] = useState({
    lat: (bounds.north + bounds.south) / 2,
    lon: (bounds.east + bounds.west) / 2,
  });
  const [mapSize, setMapSize] = useState({ width: 300, height: 200 });
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  const [mapLayer, setMapLayer] = useState<MapLayerType>("street");
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [showGoToModal, setShowGoToModal] = useState(false);
  const [goToLat, setGoToLat] = useState("");
  const [goToLon, setGoToLon] = useState("");
  
  // 搜索相关状态
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // 标注点相关状态
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [showAddMarkerModal, setShowAddMarkerModal] = useState(false);
  const [newMarkerLat, setNewMarkerLat] = useState("");
  const [newMarkerLon, setNewMarkerLon] = useState("");
  const [newMarkerLabel, setNewMarkerLabel] = useState("");
  
  // 手势相关状态
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; lat: number; lon: number } | null>(null);
  const [touchCount, setTouchCount] = useState(0);
  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null);
  const [initialZoom, setInitialZoom] = useState(5);
  
  // 缓存相关状态
  const [showCacheModal, setShowCacheModal] = useState(false);
  const [cacheStats, setCacheStats] = useState<{ totalTiles: number; totalSize: number } | null>(null);
  const [isPrecaching, setIsPrecaching] = useState(false);
  const [precacheProgress, setPrecacheProgress] = useState({ current: 0, total: 0 });
  const [cachedTileUrls, setCachedTileUrls] = useState<Record<string, string>>({});

  // 更新中心点当边界变化时
  useEffect(() => {
    setCenter({
      lat: (bounds.north + bounds.south) / 2,
      lon: (bounds.east + bounds.west) / 2,
    });
  }, [bounds]);

  // 搜索地名
  const searchPlace = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    
    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        {
          headers: {
            "User-Agent": "InSAR-Pro-Mobile/1.0",
          },
        }
      );
      const data = await response.json();
      setSearchResults(data);
      setShowSearchResults(true);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // 防抖搜索
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchPlace(text);
    }, 500);
  }, [searchPlace]);

  // 选择搜索结果
  const selectSearchResult = useCallback((result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    setCenter({ lat, lon });
    
    // 如果有边界框，设置边界
    if (result.boundingbox) {
      const [south, north, west, east] = result.boundingbox.map(parseFloat);
      onBoundsChange({ north, south, east, west });
    }
    
    setSearchQuery(result.display_name.split(",")[0]);
    setShowSearchResults(false);
    setZoom(10);
  }, [onBoundsChange]);

  // 添加标注点
  const addMarker = useCallback(() => {
    const lat = parseFloat(newMarkerLat);
    const lon = parseFloat(newMarkerLon);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      const newMarker: Marker = {
        id: Date.now().toString(),
        lat,
        lon,
        label: newMarkerLabel || `标注 ${markers.length + 1}`,
      };
      setMarkers([...markers, newMarker]);
      setShowAddMarkerModal(false);
      setNewMarkerLat("");
      setNewMarkerLon("");
      setNewMarkerLabel("");
      // 跳转到标注点位置
      setCenter({ lat, lon });
    }
  }, [newMarkerLat, newMarkerLon, newMarkerLabel, markers]);

  // 删除标注点
  const removeMarker = useCallback((id: string) => {
    setMarkers(markers.filter(m => m.id !== id));
  }, [markers]);

  // 获取当前图层的瓦片 URL
  const getTileUrl = useCallback((x: number, y: number, z: number) => {
    return mapLayers[mapLayer].getTileUrl(x, y, z);
  }, [mapLayer]);

  // 加载缓存统计
  const loadCacheStats = useCallback(async () => {
    const stats = await getCacheStats();
    setCacheStats({ totalTiles: stats.totalTiles, totalSize: stats.totalSize });
  }, []);

  // 预缓存当前区域
  const handlePrecacheArea = useCallback(async () => {
    setIsPrecaching(true);
    setPrecacheProgress({ current: 0, total: 0 });
    
    try {
      // 缓存当前缩放级别和相邻级别的瓦片
      const zoomLevels = [Math.max(1, zoom - 1), zoom, Math.min(18, zoom + 1)];
      let totalCached = 0;
      
      for (const z of zoomLevels) {
        const cached = await precacheArea(
          bounds,
          z,
          getTileUrl,
          (current, total) => {
            setPrecacheProgress({ current, total });
          }
        );
        totalCached += cached;
      }
      
      await loadCacheStats();
      Alert.alert("缓存完成", `已缓存 ${totalCached} 个地图瓦片`);
    } catch (error) {
      Alert.alert("缓存失败", "无法缓存地图瓦片");
    } finally {
      setIsPrecaching(false);
    }
  }, [bounds, zoom, getTileUrl, loadCacheStats]);

  // 清空缓存
  const handleClearCache = useCallback(async () => {
    Alert.alert(
      "确认清空",
      "确定要清空所有地图缓存吗？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "清空",
          style: "destructive",
          onPress: async () => {
            await clearAllCache();
            setCachedTileUrls({});
            await loadCacheStats();
            Alert.alert("已清空", "地图缓存已清空");
          },
        },
      ]
    );
  }, [loadCacheStats]);

  // 组件加载时加载缓存统计
  useEffect(() => {
    loadCacheStats();
  }, [loadCacheStats]);

  // 计算需要显示的瓦片
  const getTiles = useCallback(() => {
    const tiles: Array<{ x: number; y: number; url: string; left: number; top: number }> = [];
    const tileSize = 256;
    
    const centerTile = lonLatToTile(center.lon, center.lat, zoom);
    const tilesX = Math.ceil(mapSize.width / tileSize) + 2;
    const tilesY = Math.ceil(mapSize.height / tileSize) + 2;
    
    const startX = centerTile.x - Math.floor(tilesX / 2);
    const startY = centerTile.y - Math.floor(tilesY / 2);
    
    const n = Math.pow(2, zoom);
    const centerPixelX = ((center.lon + 180) / 360) * n * tileSize;
    const latRad = (center.lat * Math.PI) / 180;
    const centerPixelY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n * tileSize;
    
    const offsetX = mapSize.width / 2 - (centerPixelX - startX * tileSize);
    const offsetY = mapSize.height / 2 - (centerPixelY - startY * tileSize);
    
    for (let dy = 0; dy < tilesY; dy++) {
      for (let dx = 0; dx < tilesX; dx++) {
        const tileX = startX + dx;
        const tileY = startY + dy;
        
        if (tileX >= 0 && tileX < n && tileY >= 0 && tileY < n) {
          tiles.push({
            x: tileX,
            y: tileY,
            url: getTileUrl(tileX, tileY, zoom),
            left: offsetX + dx * tileSize,
            top: offsetY + dy * tileSize,
          });
        }
      }
    }
    
    return tiles;
  }, [center, zoom, mapSize, getTileUrl]);

  // 瓦片加载时自动缓存
  useEffect(() => {
    if (Platform.OS !== "web") {
      const tiles = getTiles();
      tiles.forEach(async (tile) => {
        const cachedPath = await cacheTile(tile.url);
        if (cachedPath) {
          setCachedTileUrls((prev) => ({ ...prev, [tile.url]: cachedPath }));
        }
      });
      loadCacheStats();
    }
  }, [center, zoom, mapLayer, getTiles, loadCacheStats]);

  // 像素坐标转经纬度
  const pixelToLonLat = useCallback((px: number, py: number): { lon: number; lat: number } => {
    const tileSize = 256;
    const n = Math.pow(2, zoom);
    
    const centerPixelX = ((center.lon + 180) / 360) * n * tileSize;
    const latRad = (center.lat * Math.PI) / 180;
    const centerPixelY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n * tileSize;
    
    const globalX = centerPixelX + (px - mapSize.width / 2);
    const globalY = centerPixelY + (py - mapSize.height / 2);
    
    const lon = (globalX / (n * tileSize)) * 360 - 180;
    const latRadResult = Math.atan(Math.sinh(Math.PI * (1 - (2 * globalY) / (n * tileSize))));
    const lat = (latRadResult * 180) / Math.PI;
    
    return { lon, lat };
  }, [center, zoom, mapSize]);

  // 经纬度转像素坐标
  const lonLatToPixel = useCallback((lon: number, lat: number): { x: number; y: number } => {
    const tileSize = 256;
    const n = Math.pow(2, zoom);
    
    const centerPixelX = ((center.lon + 180) / 360) * n * tileSize;
    const latRad = (center.lat * Math.PI) / 180;
    const centerPixelY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n * tileSize;
    
    const targetPixelX = ((lon + 180) / 360) * n * tileSize;
    const targetLatRad = (lat * Math.PI) / 180;
    const targetPixelY = (1 - Math.log(Math.tan(targetLatRad) + 1 / Math.cos(targetLatRad)) / Math.PI) / 2 * n * tileSize;
    
    const x = mapSize.width / 2 + (targetPixelX - centerPixelX);
    const y = mapSize.height / 2 + (targetPixelY - centerPixelY);
    
    return { x, y };
  }, [center, zoom, mapSize]);

  // 计算选中区域的屏幕坐标
  const getSelectionRect = useCallback(() => {
    const nw = lonLatToPixel(bounds.west, bounds.north);
    const se = lonLatToPixel(bounds.east, bounds.south);
    
    return {
      left: Math.min(nw.x, se.x),
      top: Math.min(nw.y, se.y),
      width: Math.abs(se.x - nw.x),
      height: Math.abs(se.y - nw.y),
    };
  }, [bounds, lonLatToPixel]);

  // 计算两点之间的距离
  const getDistance = (touches: any[]): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 处理触摸开始
  const handleTouchStart = useCallback((event: any) => {
    const touches = event.nativeEvent.touches;
    setTouchCount(touches.length);
    
    if (touches.length === 2) {
      // 双指缩放开始
      const distance = getDistance(touches);
      setInitialPinchDistance(distance);
      setInitialZoom(zoom);
      setIsPanning(false);
      setIsSelecting(false);
    } else if (touches.length === 1) {
      const { locationX, locationY } = event.nativeEvent;
      // 单指操作 - 先判断是平移还是选择
      setPanStart({ x: locationX, y: locationY, lat: center.lat, lon: center.lon });
      setIsPanning(true);
    }
  }, [zoom, center]);

  // 处理触摸移动
  const handleTouchMove = useCallback((event: any) => {
    const touches = event.nativeEvent.touches;
    
    if (touches.length === 2 && initialPinchDistance) {
      // 双指缩放
      const currentDistance = getDistance(touches);
      const scale = currentDistance / initialPinchDistance;
      const newZoom = Math.round(initialZoom + Math.log2(scale));
      setZoom(Math.max(1, Math.min(18, newZoom)));
    } else if (touches.length === 1 && isPanning && panStart) {
      // 单指平移
      const { locationX, locationY } = event.nativeEvent;
      const dx = locationX - panStart.x;
      const dy = locationY - panStart.y;
      
      // 如果移动距离较小，可能是选择操作
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        return;
      }
      
      // 计算新的中心点
      const tileSize = 256;
      const n = Math.pow(2, zoom);
      const metersPerPixel = (40075016.686 * Math.cos((panStart.lat * Math.PI) / 180)) / (n * tileSize);
      
      // 转换像素偏移为经纬度偏移
      const lonOffset = -dx / (n * tileSize) * 360;
      const latOffset = dy / (n * tileSize) * 180 * 2;
      
      const newLon = Math.max(-180, Math.min(180, panStart.lon + lonOffset));
      const newLat = Math.max(-85, Math.min(85, panStart.lat + latOffset));
      
      setCenter({ lat: newLat, lon: newLon });
    } else if (isSelecting && selectionStart) {
      const { locationX, locationY } = event.nativeEvent;
      setSelectionEnd({ x: locationX, y: locationY });
    }
  }, [initialPinchDistance, initialZoom, isPanning, panStart, zoom, isSelecting, selectionStart]);

  // 处理触摸结束
  const handleTouchEnd = useCallback((event: any) => {
    const touches = event.nativeEvent.touches;
    
    if (touchCount === 2) {
      // 双指缩放结束
      setInitialPinchDistance(null);
    }
    
    if (isPanning && panStart) {
      const { locationX, locationY } = event.nativeEvent;
      const dx = locationX - panStart.x;
      const dy = locationY - panStart.y;
      
      // 如果移动距离很小，视为点击开始选择
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        setIsSelecting(true);
        setSelectionStart({ x: locationX, y: locationY });
        setSelectionEnd({ x: locationX, y: locationY });
      }
    }
    
    if (isSelecting && selectionStart && selectionEnd) {
      const start = pixelToLonLat(selectionStart.x, selectionStart.y);
      const end = pixelToLonLat(selectionEnd.x, selectionEnd.y);

      const newBounds = {
        north: Math.max(start.lat, end.lat),
        south: Math.min(start.lat, end.lat),
        east: Math.max(start.lon, end.lon),
        west: Math.min(start.lon, end.lon),
      };

      if (Math.abs(newBounds.north - newBounds.south) > 0.1 && 
          Math.abs(newBounds.east - newBounds.west) > 0.1) {
        onBoundsChange(newBounds);
      }
    }

    setIsPanning(false);
    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
    setPanStart(null);
    setTouchCount(0);
  }, [touchCount, isPanning, panStart, isSelecting, selectionStart, selectionEnd, pixelToLonLat, onBoundsChange]);

  // 长按开始选择区域
  const handleLongPress = useCallback((event: any) => {
    const { locationX, locationY } = event.nativeEvent;
    setIsPanning(false);
    setIsSelecting(true);
    setSelectionStart({ x: locationX, y: locationY });
    setSelectionEnd({ x: locationX, y: locationY });
  }, []);

  // 缩放控制
  const handleZoomIn = () => setZoom((z) => Math.min(18, z + 1));
  const handleZoomOut = () => setZoom((z) => Math.max(1, z - 1));

  // 跳转到指定经纬度
  const handleGoTo = () => {
    const lat = parseFloat(goToLat);
    const lon = parseFloat(goToLon);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      setCenter({ lat, lon });
      setShowGoToModal(false);
      setGoToLat("");
      setGoToLon("");
    }
  };

  const tiles = getTiles();
  const selectionRect = getSelectionRect();
  const scaleInfo = getScaleInfo(center.lat, zoom);

  // 计算正在绘制的选择框
  const drawingRect = isSelecting && selectionStart && selectionEnd ? {
    left: Math.min(selectionStart.x, selectionEnd.x),
    top: Math.min(selectionStart.y, selectionEnd.y),
    width: Math.abs(selectionEnd.x - selectionStart.x),
    height: Math.abs(selectionEnd.y - selectionStart.y),
  } : null;

  return (
    <View>
      {/* 搜索框 */}
      <View style={{ marginBottom: 12 }}>
        <View style={{ position: "relative" }}>
          <TextInput
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder="🔍 搜索地名..."
            placeholderTextColor={colors.muted}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14,
              color: colors.foreground,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            returnKeyType="search"
            onSubmitEditing={() => searchPlace(searchQuery)}
          />
          {isSearching && (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ position: "absolute", right: 12, top: 12 }}
            />
          )}
        </View>
        
        {/* 搜索结果 */}
        {showSearchResults && searchResults.length > 0 && (
          <View
            style={{
              backgroundColor: colors.background,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              marginTop: 4,
              maxHeight: 200,
              overflow: "hidden",
            }}
          >
            <ScrollView>
              {searchResults.map((result, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => selectSearchResult(result)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderBottomWidth: index < searchResults.length - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 13, color: colors.foreground }} numberOfLines={2}>
                    {result.display_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* 预设区域快速选择 */}
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
        快速选择预设区域：
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {presetAreas.map((area) => (
            <TouchableOpacity
              key={area.name}
              onPress={() => {
                onBoundsChange(area);
                setCenter({ lat: (area.north + area.south) / 2, lon: (area.east + area.west) / 2 });
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 12, color: colors.foreground }}>{area.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* 真实地图 */}
      <View
        style={{
          height: 280,
          borderRadius: 12,
          overflow: "hidden",
          position: "relative",
          backgroundColor: "#e5e5e5",
        }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setMapSize({ width, height });
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 地图瓦片 */}
        {tiles.map((tile) => (
          <Image
            key={`${tile.x}-${tile.y}-${zoom}-${mapLayer}`}
            source={{ uri: tile.url }}
            style={{
              position: "absolute",
              left: tile.left,
              top: tile.top,
              width: 256,
              height: 256,
            }}
            contentFit="cover"
          />
        ))}

        {/* 已选中区域 */}
        <View
          style={{
            position: "absolute",
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
            borderWidth: 2,
            borderColor: colors.primary,
            backgroundColor: "rgba(10, 126, 164, 0.3)",
            borderRadius: 4,
          }}
        />

        {/* 正在绘制的选择框 */}
        {drawingRect && (
          <View
            style={{
              position: "absolute",
              left: drawingRect.left,
              top: drawingRect.top,
              width: drawingRect.width,
              height: drawingRect.height,
              borderWidth: 2,
              borderColor: "#FF6B6B",
              backgroundColor: "rgba(255, 107, 107, 0.2)",
              borderStyle: "dashed",
              borderRadius: 4,
            }}
          />
        )}

        {/* 标注点 */}
        {markers.map((marker) => {
          const pos = lonLatToPixel(marker.lon, marker.lat);
          if (pos.x < -20 || pos.x > mapSize.width + 20 || pos.y < -20 || pos.y > mapSize.height + 20) {
            return null;
          }
          return (
            <TouchableOpacity
              key={marker.id}
              onLongPress={() => removeMarker(marker.id)}
              style={{
                position: "absolute",
                left: pos.x - 12,
                top: pos.y - 24,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 24 }}>📍</Text>
              {marker.label && (
                <View
                  style={{
                    backgroundColor: "rgba(0,0,0,0.7)",
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    marginTop: -4,
                  }}
                >
                  <Text style={{ fontSize: 10, color: "#fff" }}>{marker.label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* 指北针 */}
        <View
          style={{
            position: "absolute",
            left: 8,
            top: 8,
            width: 36,
            height: 36,
            backgroundColor: "rgba(255,255,255,0.95)",
            borderRadius: 18,
            justifyContent: "center",
            alignItems: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.2,
            shadowRadius: 2,
            elevation: 2,
          }}
        >
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 10, fontWeight: "bold", color: "#E53935" }}>N</Text>
            <View
              style={{
                width: 0,
                height: 0,
                borderLeftWidth: 5,
                borderRightWidth: 5,
                borderBottomWidth: 10,
                borderLeftColor: "transparent",
                borderRightColor: "transparent",
                borderBottomColor: "#E53935",
                marginTop: -2,
              }}
            />
            <View
              style={{
                width: 0,
                height: 0,
                borderLeftWidth: 5,
                borderRightWidth: 5,
                borderTopWidth: 10,
                borderLeftColor: "transparent",
                borderRightColor: "transparent",
                borderTopColor: "#333",
                marginTop: -2,
              }}
            />
          </View>
        </View>

        {/* 缩放级别和图层切换 */}
        <View
          style={{
            position: "absolute",
            left: 50,
            top: 8,
            flexDirection: "row",
            gap: 4,
          }}
        >
          <View
            style={{
              backgroundColor: "rgba(255,255,255,0.95)",
              borderRadius: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 10, color: "#333" }}>缩放: {zoom}</Text>
          </View>
          
          {/* 图层切换按钮 */}
          <TouchableOpacity
            onPress={() => setShowLayerPicker(!showLayerPicker)}
            style={{
              backgroundColor: "rgba(255,255,255,0.95)",
              borderRadius: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 10, color: "#333" }}>🗺️ {mapLayers[mapLayer].name}</Text>
          </TouchableOpacity>

          {/* 定位按钮 */}
          <TouchableOpacity
            onPress={() => setShowGoToModal(true)}
            style={{
              backgroundColor: "rgba(255,255,255,0.95)",
              borderRadius: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 10, color: "#333" }}>📍 定位</Text>
          </TouchableOpacity>

          {/* 添加标注按钮 */}
          <TouchableOpacity
            onPress={() => {
              setNewMarkerLat(center.lat.toFixed(4));
              setNewMarkerLon(center.lon.toFixed(4));
              setShowAddMarkerModal(true);
            }}
            style={{
              backgroundColor: "rgba(255,255,255,0.95)",
              borderRadius: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 10, color: "#333" }}>➕ 标注</Text>
          </TouchableOpacity>

          {/* 缓存按钮 */}
          <TouchableOpacity
            onPress={() => setShowCacheModal(true)}
            style={{
              backgroundColor: "rgba(255,255,255,0.95)",
              borderRadius: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 10, color: "#333" }}>
              💾 {cacheStats ? `${cacheStats.totalTiles}` : "0"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 图层选择下拉菜单 */}
        {showLayerPicker && (
          <View
            style={{
              position: "absolute",
              left: 88,
              top: 32,
              backgroundColor: "rgba(255,255,255,0.98)",
              borderRadius: 8,
              overflow: "hidden",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 4,
              elevation: 5,
            }}
          >
            {(Object.keys(mapLayers) as MapLayerType[]).map((layer) => (
              <TouchableOpacity
                key={layer}
                onPress={() => {
                  setMapLayer(layer);
                  setShowLayerPicker(false);
                }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  backgroundColor: mapLayer === layer ? colors.primary : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: mapLayer === layer ? "#fff" : "#333",
                    fontWeight: mapLayer === layer ? "600" : "400",
                  }}
                >
                  {mapLayers[layer].name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 缩放控制 */}
        <View
          style={{
            position: "absolute",
            right: 8,
            top: 8,
            backgroundColor: "rgba(255,255,255,0.95)",
            borderRadius: 8,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.2,
            shadowRadius: 2,
            elevation: 2,
          }}
        >
          <TouchableOpacity
            onPress={handleZoomIn}
            style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: "#ddd" }}
          >
            <Text style={{ fontSize: 18, fontWeight: "bold", textAlign: "center" }}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleZoomOut} style={{ padding: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", textAlign: "center" }}>−</Text>
          </TouchableOpacity>
        </View>

        {/* 比例尺 */}
        <View
          style={{
            position: "absolute",
            left: 8,
            bottom: 36,
            backgroundColor: "rgba(255,255,255,0.9)",
            borderRadius: 4,
            padding: 4,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View
              style={{
                width: scaleInfo.width,
                height: 4,
                backgroundColor: "#333",
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderColor: "#333",
              }}
            />
            <Text style={{ fontSize: 9, color: "#333" }}>
              {scaleInfo.distance} {scaleInfo.unit}
            </Text>
          </View>
        </View>

        {/* 操作提示 */}
        <View
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            right: 8,
            backgroundColor: "rgba(0,0,0,0.6)",
            borderRadius: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontSize: 10, color: "#fff", textAlign: "center" }}>
            单指拖动平移 | 双指缩放 | 长按绘制选区 | {bounds.west.toFixed(2)}°E ~ {bounds.east.toFixed(2)}°E
          </Text>
        </View>
      </View>

      {/* 标注点列表 */}
      {markers.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
            标注点（长按地图上的标注可删除）：
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {markers.map((marker) => (
                <TouchableOpacity
                  key={marker.id}
                  onPress={() => setCenter({ lat: marker.lat, lon: marker.lon })}
                  onLongPress={() => removeMarker(marker.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Text style={{ fontSize: 12 }}>📍</Text>
                  <Text style={{ fontSize: 12, color: colors.foreground }}>{marker.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* 经纬度跳转弹窗 */}
      <Modal
        visible={showGoToModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoToModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: colors.background,
              borderRadius: 12,
              padding: 20,
              width: 280,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginBottom: 16 }}>
              跳转到指定位置
            </Text>
            
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>纬度 (-90 ~ 90)</Text>
              <TextInput
                value={goToLat}
                onChangeText={setGoToLat}
                placeholder="例如: 37.5"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
            
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>经度 (-180 ~ 180)</Text>
              <TextInput
                value={goToLon}
                onChangeText={setGoToLon}
                placeholder="例如: 36.75"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
            
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setShowGoToModal(false)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 14, color: colors.foreground }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleGoTo}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 14, color: "#fff", fontWeight: "600" }}>跳转</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 添加标注弹窗 */}
      <Modal
        visible={showAddMarkerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddMarkerModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: colors.background,
              borderRadius: 12,
              padding: 20,
              width: 280,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginBottom: 16 }}>
              添加标注点
            </Text>
            
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>标注名称</Text>
              <TextInput
                value={newMarkerLabel}
                onChangeText={setNewMarkerLabel}
                placeholder="例如: 观测点1"
                placeholderTextColor={colors.muted}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
            
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>纬度</Text>
              <TextInput
                value={newMarkerLat}
                onChangeText={setNewMarkerLat}
                placeholder="例如: 37.5"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
            
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>经度</Text>
              <TextInput
                value={newMarkerLon}
                onChangeText={setNewMarkerLon}
                placeholder="例如: 36.75"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
            
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setShowAddMarkerModal(false)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 14, color: colors.foreground }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={addMarker}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 14, color: "#fff", fontWeight: "600" }}>添加</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 缓存管理弹窗 */}
      <Modal
        visible={showCacheModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCacheModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: colors.background,
              borderRadius: 12,
              padding: 20,
              width: 300,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginBottom: 16 }}>
              地图缓存管理
            </Text>
            
            {/* 缓存统计 */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>已缓存瓦片</Text>
                <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "500" }}>
                  {cacheStats?.totalTiles || 0} 个
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>缓存大小</Text>
                <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "500" }}>
                  {formatSize(cacheStats?.totalSize || 0)}
                </Text>
              </View>
            </View>
            
            {/* 预缓存进度 */}
            {isPrecaching && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
                  正在缓存... {precacheProgress.current}/{precacheProgress.total}
                </Text>
                <View
                  style={{
                    height: 4,
                    backgroundColor: colors.surface,
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      height: "100%",
                      width: `${precacheProgress.total > 0 ? (precacheProgress.current / precacheProgress.total) * 100 : 0}%`,
                      backgroundColor: colors.primary,
                    }}
                  />
                </View>
              </View>
            )}
            
            {/* 操作按钮 */}
            <View style={{ gap: 10 }}>
              <TouchableOpacity
                onPress={handlePrecacheArea}
                disabled={isPrecaching}
                style={{
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: isPrecaching ? colors.surface : colors.primary,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 14, color: isPrecaching ? colors.muted : "#fff", fontWeight: "600" }}>
                  {isPrecaching ? "缓存中..." : "缓存当前区域"}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={handleClearCache}
                disabled={isPrecaching}
                style={{
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.error,
                }}
              >
                <Text style={{ fontSize: 14, color: colors.error, fontWeight: "500" }}>
                  清空所有缓存
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => setShowCacheModal(false)}
                style={{
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 14, color: colors.foreground }}>关闭</Text>
              </TouchableOpacity>
            </View>
            
            {/* 提示 */}
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 12, textAlign: "center" }}>
              缓存地图瓦片后可离线查看已访问区域
            </Text>
          </View>
        </View>
      </Modal>

      {/* 手动输入边界坐标 */}
      <View style={{ marginTop: 12 }}>
        <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
          或手动输入边界坐标：
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>北纬</Text>
            <TextInput
              value={bounds.north.toString()}
              onChangeText={(v) => onBoundsChange({ ...bounds, north: parseFloat(v) || 0 })}
              keyboardType="numeric"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 6,
                fontSize: 12,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
          </View>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>南纬</Text>
            <TextInput
              value={bounds.south.toString()}
              onChangeText={(v) => onBoundsChange({ ...bounds, south: parseFloat(v) || 0 })}
              keyboardType="numeric"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 6,
                fontSize: 12,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
          </View>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>东经</Text>
            <TextInput
              value={bounds.east.toString()}
              onChangeText={(v) => onBoundsChange({ ...bounds, east: parseFloat(v) || 0 })}
              keyboardType="numeric"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 6,
                fontSize: 12,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
          </View>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>西经</Text>
            <TextInput
              value={bounds.west.toString()}
              onChangeText={(v) => onBoundsChange({ ...bounds, west: parseFloat(v) || 0 })}
              keyboardType="numeric"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 6,
                fontSize: 12,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
