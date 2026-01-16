import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { trpc } from "@/lib/trpc";

// 下载状态类型
type DownloadStatus = "pending" | "downloading" | "paused" | "completed" | "failed";

// 下载项接口
interface DownloadItem {
  file_id: string;
  filename: string;
  total_size: number;
  downloaded_size: number;
  progress_percent: number;
  speed: number;
  speed_formatted: string;
  eta: number;
  eta_formatted: string;
  status: DownloadStatus;
  error_message?: string;
}

// 缓存文件接口
interface CachedFile {
  path: string;
  filename: string;
  size: number;
  size_formatted: string;
  added_at: string;
  metadata: Record<string, any>;
}

// 缓存信息接口
interface CacheInfo {
  total_files: number;
  total_size: number;
  total_size_formatted: string;
  files: CachedFile[];
}

// 进度条组件
function ProgressBar({
  progress,
  status,
  colors,
}: {
  progress: number;
  status: DownloadStatus;
  colors: ReturnType<typeof useColors>;
}) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(progress, { duration: 300 });
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  const getProgressColor = () => {
    switch (status) {
      case "completed":
        return colors.success;
      case "failed":
        return colors.error;
      case "paused":
        return colors.warning;
      default:
        return colors.primary;
    }
  };

  return (
    <View
      style={{
        height: 6,
        backgroundColor: colors.border,
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          {
            height: "100%",
            backgroundColor: getProgressColor(),
            borderRadius: 3,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

// 下载项组件
function DownloadItemCard({
  item,
  onPause,
  onResume,
  onCancel,
  colors,
}: {
  item: DownloadItem;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const getStatusIcon = (): "check-circle" | "error" | "pause-circle-filled" | "downloading" | "schedule" => {
    switch (item.status) {
      case "completed":
        return "check-circle";
      case "failed":
        return "error";
      case "paused":
        return "pause-circle-filled";
      case "downloading":
        return "downloading";
      default:
        return "schedule";
    }
  };

  const getStatusColor = () => {
    switch (item.status) {
      case "completed":
        return colors.success;
      case "failed":
        return colors.error;
      case "paused":
        return colors.warning;
      default:
        return colors.primary;
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <MaterialIcons
          name={getStatusIcon()}
          size={24}
          color={getStatusColor()}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: colors.foreground,
            }}
            numberOfLines={1}
          >
            {item.filename}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
            {formatSize(item.downloaded_size)} / {formatSize(item.total_size)}
          </Text>
        </View>
      </View>

      {/* Progress */}
      <ProgressBar
        progress={item.progress_percent}
        status={item.status}
        colors={colors}
      />

      {/* Stats */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 8,
        }}
      >
        <Text style={{ fontSize: 12, color: colors.muted }}>
          {item.progress_percent.toFixed(1)}%
        </Text>
        {item.status === "downloading" && (
          <>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {item.speed_formatted}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              剩余 {item.eta_formatted}
            </Text>
          </>
        )}
        {item.status === "failed" && (
          <Text style={{ fontSize: 12, color: colors.error }}>
            {item.error_message || "下载失败"}
          </Text>
        )}
      </View>

      {/* Actions */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          marginTop: 12,
          gap: 8,
        }}
      >
        {item.status === "downloading" && (
          <TouchableOpacity
            onPress={onPause}
            style={{
              backgroundColor: colors.warning,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 6,
            }}
          >
            <Text style={{ fontSize: 12, color: "#FFFFFF", fontWeight: "600" }}>
              暂停
            </Text>
          </TouchableOpacity>
        )}
        {item.status === "paused" && (
          <TouchableOpacity
            onPress={onResume}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 6,
            }}
          >
            <Text style={{ fontSize: 12, color: "#FFFFFF", fontWeight: "600" }}>
              继续
            </Text>
          </TouchableOpacity>
        )}
        {(item.status === "downloading" || item.status === "paused" || item.status === "pending") && (
          <TouchableOpacity
            onPress={onCancel}
            style={{
              backgroundColor: colors.error,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 6,
            }}
          >
            <Text style={{ fontSize: 12, color: "#FFFFFF", fontWeight: "600" }}>
              取消
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// 缓存文件卡片组件
function CachedFileCard({
  file,
  onDelete,
  colors,
}: {
  file: CachedFile;
  onDelete: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getFileIcon = (): "folder-zip" | "image" | "insert-drive-file" => {
    if (file.filename.endsWith(".zip")) return "folder-zip";
    if (file.filename.endsWith(".tif") || file.filename.endsWith(".tiff"))
      return "image";
    return "insert-drive-file";
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          backgroundColor: colors.primary + "20",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons
          name={getFileIcon()}
          size={24}
          color={colors.primary}
        />
      </View>

      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: colors.foreground,
          }}
          numberOfLines={1}
        >
          {file.filename}
        </Text>
        <View style={{ flexDirection: "row", marginTop: 4, gap: 12 }}>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {file.size_formatted}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {formatDate(file.added_at)}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={onDelete}
        style={{
          padding: 8,
        }}
      >
        <MaterialIcons name="delete" size={20} color={colors.error} />
      </TouchableOpacity>
    </View>
  );
}

// 存储统计组件
function StorageStats({
  cacheInfo,
  colors,
}: {
  cacheInfo: CacheInfo;
  colors: ReturnType<typeof useColors>;
}) {
  // 假设总存储空间为 50GB
  const totalStorage = 50 * 1024 * 1024 * 1024;
  const usedPercent = (cacheInfo.total_size / totalStorage) * 100;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>
          存储空间
        </Text>
        <Text style={{ fontSize: 14, color: colors.muted }}>
          {cacheInfo.total_size_formatted} / 50 GB
        </Text>
      </View>

      <View
        style={{
          height: 8,
          backgroundColor: colors.border,
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.min(usedPercent, 100)}%`,
            height: "100%",
            backgroundColor:
              usedPercent > 80
                ? colors.error
                : usedPercent > 60
                ? colors.warning
                : colors.primary,
            borderRadius: 4,
          }}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 8,
        }}
      >
        <Text style={{ fontSize: 12, color: colors.muted }}>
          {cacheInfo.total_files} 个文件
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>
          已使用 {usedPercent.toFixed(1)}%
        </Text>
      </View>
    </View>
  );
}

export default function DataManagerScreen() {
  const router = useRouter();
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<"downloading" | "cached">("downloading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [cacheInfo, setCacheInfo] = useState<CacheInfo>({
    total_files: 0,
    total_size: 0,
    total_size_formatted: "0 B",
    files: [],
  });

  // 获取下载列表
  const { data: downloadsData, refetch: refetchDownloads, isLoading: downloadsLoading } = 
    trpc.insar.getDownloads.useQuery(undefined, {
      refetchInterval: activeTab === "downloading" ? 2000 : false, // 下载中时每2秒刷新
    });

  // 获取缓存信息
  const { data: cacheData, refetch: refetchCache, isLoading: cacheLoading } = 
    trpc.insar.getCacheInfo.useQuery();

  // 启动下载
  const startDownloadMutation = trpc.insar.startDownload.useMutation({
    onSuccess: () => {
      refetchDownloads();
      Alert.alert("成功", "下载任务已启动");
    },
    onError: (error) => {
      Alert.alert("错误", `启动下载失败: ${error.message}`);
    },
  });

  // 暂停下载
  const pauseDownloadMutation = trpc.insar.pauseDownload.useMutation({
    onSuccess: () => {
      refetchDownloads();
    },
    onError: (error) => {
      Alert.alert("错误", `暂停下载失败: ${error.message}`);
    },
  });

  // 恢复下载
  const resumeDownloadMutation = trpc.insar.resumeDownload.useMutation({
    onSuccess: () => {
      refetchDownloads();
    },
    onError: (error) => {
      Alert.alert("错误", `恢复下载失败: ${error.message}`);
    },
  });

  // 取消下载
  const cancelDownloadMutation = trpc.insar.cancelDownload.useMutation({
    onSuccess: () => {
      refetchDownloads();
      Alert.alert("成功", "下载已取消");
    },
    onError: (error) => {
      Alert.alert("错误", `取消下载失败: ${error.message}`);
    },
  });

  // 删除缓存文件
  const deleteCacheFileMutation = trpc.insar.deleteCacheFile.useMutation({
    onSuccess: () => {
      refetchCache();
      Alert.alert("成功", "文件已删除");
    },
    onError: (error) => {
      Alert.alert("错误", `删除文件失败: ${error.message}`);
    },
  });

  // 清空缓存
  const clearCacheMutation = trpc.insar.clearCache.useMutation({
    onSuccess: () => {
      refetchCache();
      Alert.alert("成功", "缓存已清空");
    },
    onError: (error) => {
      Alert.alert("错误", `清空缓存失败: ${error.message}`);
    },
  });

  // 更新下载列表
  useEffect(() => {
    if (downloadsData) {
      setDownloads(downloadsData as DownloadItem[]);
    }
  }, [downloadsData]);

  // 更新缓存信息
  useEffect(() => {
    if (cacheData) {
      setCacheInfo(cacheData as CacheInfo);
    }
  }, [cacheData]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refetchDownloads(), refetchCache()]);
    setIsRefreshing(false);
  }, [refetchDownloads, refetchCache]);

  const handlePauseDownload = (fileId: string) => {
    pauseDownloadMutation.mutate({ fileId });
  };

  const handleResumeDownload = (fileId: string) => {
    resumeDownloadMutation.mutate({ fileId });
  };

  const handleCancelDownload = (fileId: string) => {
    Alert.alert(
      "取消下载",
      "确定要取消此下载任务吗？",
      [
        { text: "否", style: "cancel" },
        {
          text: "是",
          style: "destructive",
          onPress: () => cancelDownloadMutation.mutate({ fileId }),
        },
      ]
    );
  };

  const handleDeleteFile = (filePath: string, filename: string) => {
    Alert.alert(
      "删除文件",
      `确定要删除 "${filename}" 吗？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () => deleteCacheFileMutation.mutate({ filePath }),
        },
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      "清空缓存",
      "确定要清空所有缓存文件吗？此操作不可恢复。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "清空",
          style: "destructive",
          onPress: () => clearCacheMutation.mutate(),
        },
      ]
    );
  };

  const isLoading = downloadsLoading || cacheLoading;

  return (
    <ScreenContainer className="p-0">
      <View style={{ backgroundColor: colors.background, flex: 1 }}>
        {/* Header */}
        <View
          style={{
            backgroundColor: colors.primary,
            paddingHorizontal: 24,
            paddingVertical: 16,
            paddingTop: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#FFFFFF" }}>
            数据管理
          </Text>
          <TouchableOpacity onPress={handleClearCache}>
            <MaterialIcons name="delete-sweep" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 24,
            paddingVertical: 12,
            gap: 12,
          }}
        >
          <TouchableOpacity
            onPress={() => setActiveTab("downloading")}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 8,
              backgroundColor:
                activeTab === "downloading" ? colors.primary : colors.surface,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: activeTab === "downloading" ? "#FFFFFF" : colors.muted,
              }}
            >
              下载中
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("cached")}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 8,
              backgroundColor:
                activeTab === "cached" ? colors.primary : colors.surface,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: activeTab === "cached" ? "#FFFFFF" : colors.muted,
              }}
            >
              已缓存
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          style={{ flex: 1, paddingHorizontal: 24 }}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
        >
          {isLoading ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 48 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ marginTop: 16, color: colors.muted }}>加载中...</Text>
            </View>
          ) : activeTab === "downloading" ? (
            <>
              {downloads.length === 0 ? (
                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    paddingTop: 48,
                  }}
                >
                  <MaterialIcons
                    name="cloud-download"
                    size={64}
                    color={colors.muted}
                  />
                  <Text
                    style={{
                      fontSize: 16,
                      color: colors.muted,
                      marginTop: 16,
                    }}
                  >
                    暂无下载任务
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      color: colors.muted,
                      marginTop: 8,
                      textAlign: "center",
                    }}
                  >
                    创建新项目并开始处理后，数据将自动下载
                  </Text>
                </View>
              ) : (
                downloads.map((item) => (
                  <DownloadItemCard
                    key={item.file_id}
                    item={item}
                    onPause={() => handlePauseDownload(item.file_id)}
                    onResume={() => handleResumeDownload(item.file_id)}
                    onCancel={() => handleCancelDownload(item.file_id)}
                    colors={colors}
                  />
                ))
              )}
            </>
          ) : (
            <>
              <StorageStats cacheInfo={cacheInfo} colors={colors} />
              {cacheInfo.files.length === 0 ? (
                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    paddingTop: 48,
                  }}
                >
                  <MaterialIcons
                    name="folder-open"
                    size={64}
                    color={colors.muted}
                  />
                  <Text
                    style={{
                      fontSize: 16,
                      color: colors.muted,
                      marginTop: 16,
                    }}
                  >
                    暂无缓存文件
                  </Text>
                </View>
              ) : (
                cacheInfo.files.map((file, index) => (
                  <CachedFileCard
                    key={file.path || index}
                    file={file}
                    onDelete={() => handleDeleteFile(file.path, file.filename)}
                    colors={colors}
                  />
                ))
              )}
            </>
          )}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
