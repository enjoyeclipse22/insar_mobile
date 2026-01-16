import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

// 缓存配置
const CACHE_CONFIG = {
  maxTiles: 1000, // 最大缓存瓦片数量
  maxAge: 7 * 24 * 60 * 60 * 1000, // 缓存有效期：7天
  cacheDir: `${FileSystem.cacheDirectory}map-tiles/`,
};

// 缓存元数据
interface TileCacheMetadata {
  url: string;
  localPath: string;
  timestamp: number;
  size: number;
}

// 缓存统计
interface CacheStats {
  totalTiles: number;
  totalSize: number;
  oldestTile: number;
  newestTile: number;
}

// 缓存索引键
const CACHE_INDEX_KEY = "@tile_cache_index";

// 获取缓存索引
async function getCacheIndex(): Promise<Record<string, TileCacheMetadata>> {
  try {
    const data = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error("Error reading cache index:", error);
    return {};
  }
}

// 保存缓存索引
async function saveCacheIndex(index: Record<string, TileCacheMetadata>): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch (error) {
    console.error("Error saving cache index:", error);
  }
}

// 生成缓存键
function getCacheKey(url: string): string {
  // 使用 URL 的哈希作为缓存键
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `tile_${Math.abs(hash)}`;
}

// 获取本地文件路径
function getLocalPath(cacheKey: string): string {
  return `${CACHE_CONFIG.cacheDir}${cacheKey}.png`;
}

// 确保缓存目录存在
async function ensureCacheDir(): Promise<void> {
  if (Platform.OS === "web") return;
  
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_CONFIG.cacheDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_CONFIG.cacheDir, { intermediates: true });
    }
  } catch (error) {
    console.error("Error creating cache directory:", error);
  }
}

// 清理过期缓存
async function cleanExpiredCache(): Promise<void> {
  if (Platform.OS === "web") return;
  
  try {
    const index = await getCacheIndex();
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, metadata] of Object.entries(index)) {
      if (now - metadata.timestamp > CACHE_CONFIG.maxAge) {
        expiredKeys.push(key);
        try {
          await FileSystem.deleteAsync(metadata.localPath, { idempotent: true });
        } catch (e) {
          // 忽略删除错误
        }
      }
    }
    
    if (expiredKeys.length > 0) {
      for (const key of expiredKeys) {
        delete index[key];
      }
      await saveCacheIndex(index);
    }
  } catch (error) {
    console.error("Error cleaning expired cache:", error);
  }
}

// 限制缓存大小
async function limitCacheSize(): Promise<void> {
  if (Platform.OS === "web") return;
  
  try {
    const index = await getCacheIndex();
    const entries = Object.entries(index);
    
    if (entries.length > CACHE_CONFIG.maxTiles) {
      // 按时间排序，删除最旧的
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, entries.length - CACHE_CONFIG.maxTiles);
      
      for (const [key, metadata] of toDelete) {
        try {
          await FileSystem.deleteAsync(metadata.localPath, { idempotent: true });
        } catch (e) {
          // 忽略删除错误
        }
        delete index[key];
      }
      
      await saveCacheIndex(index);
    }
  } catch (error) {
    console.error("Error limiting cache size:", error);
  }
}

// 缓存瓦片
export async function cacheTile(url: string): Promise<string | null> {
  if (Platform.OS === "web") {
    // Web 平台使用浏览器缓存
    return url;
  }
  
  try {
    await ensureCacheDir();
    
    const cacheKey = getCacheKey(url);
    const localPath = getLocalPath(cacheKey);
    const index = await getCacheIndex();
    
    // 检查是否已缓存且未过期
    if (index[cacheKey]) {
      const metadata = index[cacheKey];
      if (Date.now() - metadata.timestamp < CACHE_CONFIG.maxAge) {
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        if (fileInfo.exists) {
          return localPath;
        }
      }
    }
    
    // 下载并缓存
    const downloadResult = await FileSystem.downloadAsync(url, localPath);
    
    if (downloadResult.status === 200) {
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      
      // 更新索引
      index[cacheKey] = {
        url,
        localPath,
        timestamp: Date.now(),
        size: (fileInfo as any).size || 0,
      };
      
      await saveCacheIndex(index);
      
      // 异步清理
      cleanExpiredCache();
      limitCacheSize();
      
      return localPath;
    }
    
    return null;
  } catch (error) {
    console.error("Error caching tile:", error);
    return null;
  }
}

// 获取缓存的瓦片
export async function getCachedTile(url: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return null;
  }
  
  try {
    const cacheKey = getCacheKey(url);
    const localPath = getLocalPath(cacheKey);
    const index = await getCacheIndex();
    
    if (index[cacheKey]) {
      const metadata = index[cacheKey];
      if (Date.now() - metadata.timestamp < CACHE_CONFIG.maxAge) {
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        if (fileInfo.exists) {
          return localPath;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error getting cached tile:", error);
    return null;
  }
}

// 获取缓存统计
export async function getCacheStats(): Promise<CacheStats> {
  try {
    const index = await getCacheIndex();
    const entries = Object.values(index);
    
    if (entries.length === 0) {
      return {
        totalTiles: 0,
        totalSize: 0,
        oldestTile: 0,
        newestTile: 0,
      };
    }
    
    const timestamps = entries.map((e) => e.timestamp);
    const sizes = entries.map((e) => e.size);
    
    return {
      totalTiles: entries.length,
      totalSize: sizes.reduce((a, b) => a + b, 0),
      oldestTile: Math.min(...timestamps),
      newestTile: Math.max(...timestamps),
    };
  } catch (error) {
    console.error("Error getting cache stats:", error);
    return {
      totalTiles: 0,
      totalSize: 0,
      oldestTile: 0,
      newestTile: 0,
    };
  }
}

// 清空所有缓存
export async function clearAllCache(): Promise<void> {
  if (Platform.OS === "web") return;
  
  try {
    await FileSystem.deleteAsync(CACHE_CONFIG.cacheDir, { idempotent: true });
    await AsyncStorage.removeItem(CACHE_INDEX_KEY);
    await ensureCacheDir();
  } catch (error) {
    console.error("Error clearing cache:", error);
  }
}

// 预缓存区域瓦片
export async function precacheArea(
  bounds: { north: number; south: number; east: number; west: number },
  zoom: number,
  getTileUrl: (x: number, y: number, z: number) => string,
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  if (Platform.OS === "web") return 0;
  
  try {
    await ensureCacheDir();
    
    // 计算需要缓存的瓦片范围
    const n = Math.pow(2, zoom);
    const minX = Math.floor(((bounds.west + 180) / 360) * n);
    const maxX = Math.floor(((bounds.east + 180) / 360) * n);
    const minY = Math.floor((1 - Math.log(Math.tan((bounds.north * Math.PI) / 180) + 1 / Math.cos((bounds.north * Math.PI) / 180)) / Math.PI) / 2 * n);
    const maxY = Math.floor((1 - Math.log(Math.tan((bounds.south * Math.PI) / 180) + 1 / Math.cos((bounds.south * Math.PI) / 180)) / Math.PI) / 2 * n);
    
    const tiles: { x: number; y: number }[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tiles.push({ x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) });
      }
    }
    
    let cached = 0;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const url = getTileUrl(tile.x, tile.y, zoom);
      const result = await cacheTile(url);
      if (result) cached++;
      if (onProgress) onProgress(i + 1, tiles.length);
    }
    
    return cached;
  } catch (error) {
    console.error("Error precaching area:", error);
    return 0;
  }
}

// 格式化文件大小
export function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
