import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
  ActivityIndicator,
  FlatList,
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
import { getApiBaseUrl } from "@/constants/oauth";

// 下载状态类型
type DownloadStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

// 处理任务接口
interface ProcessingTask {
  id: string;
  projectId: number;
  projectName: string;
  status: DownloadStatus;
  progress: number;
  currentStep: string;
  startTime: string;
  endTime?: string;
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
      case "cancelled":
        return colors.error;
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

// 任务卡片组件
function TaskCard({
  task,
  onViewDetails,
  onCancel,
  colors,
}: {
  task: ProcessingTask;
  onViewDetails: () => void;
  onCancel: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const getStatusIcon = (): "check-circle" | "error" | "cancel" | "downloading" | "schedule" => {
    switch (task.status) {
      case "completed":
        return "check-circle";
      case "failed":
        return "error";
      case "cancelled":
        return "cancel";
      case "processing":
        return "downloading";
      default:
        return "schedule";
    }
  };

  const getStatusColor = () => {
    switch (task.status) {
      case "completed":
        return colors.success;
      case "failed":
      case "cancelled":
        return colors.error;
      default:
        return colors.primary;
    }
  };

  const getStatusText = () => {
    switch (task.status) {
      case "completed":
        return "已完成";
      case "failed":
        return "失败";
      case "cancelled":
        return "已取消";
      case "processing":
        return "处理中";
      default:
        return "等待中";
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <TouchableOpacity
      onPress={onViewDetails}
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
            {task.projectName}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
            {task.currentStep} · {getStatusText()}
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: colors.muted }}>
          {formatDate(task.startTime)}
        </Text>
      </View>

      {/* Progress */}
      {(task.status === "processing" || task.status === "pending") && (
        <>
          <ProgressBar progress={task.progress} status={task.status} colors={colors} />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: 8,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.muted }}>
              进度: {task.progress}%
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {task.currentStep}
            </Text>
          </View>
        </>
      )}

      {/* Actions */}
      {task.status === "processing" && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            marginTop: 12,
            gap: 8,
          }}
        >
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onCancel();
            }}
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
        </View>
      )}
    </TouchableOpacity>
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
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
          {file.size_formatted} · {formatDate(file.added_at)}
        </Text>
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

export default function DataManagerScreen() {
  const router = useRouter();
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<"downloading" | "cached">("downloading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tasks, setTasks] = useState<ProcessingTask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [cacheInfo, setCacheInfo] = useState<CacheInfo>({
    total_files: 0,
    total_size: 0,
    total_size_formatted: "0 B",
    files: [],
  });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 获取缓存信息
  const { data: cacheData, refetch: refetchCache, isLoading: cacheLoading } = 
    trpc.insar.getCacheInfo.useQuery();

  // 取消处理
  const cancelProcessingMutation = trpc.realInsar.cancelProcessing.useMutation({
    onSuccess: () => {
      fetchTasks();
      Alert.alert("成功", "任务已取消");
    },
    onError: (error) => {
      Alert.alert("错误", `取消失败: ${error.message}`);
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

  // 获取任务列表
  const fetchTasks = useCallback(async () => {
    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/api/trpc/realInsar.listTasks`);
      const data = await response.json();
      
      if (data?.result?.data?.json) {
        setTasks(data.result.data.json);
      } else if (Array.isArray(data?.result?.data)) {
        setTasks(data.result.data);
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    } finally {
      setIsLoadingTasks(false);
    }
  }, []);

  // 初始加载和轮询
  useEffect(() => {
    fetchTasks();
    
    // 每 2 秒轮询一次
    pollingRef.current = setInterval(fetchTasks, 2000);
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [fetchTasks]);

  // 更新缓存信息
  useEffect(() => {
    if (cacheData) {
      setCacheInfo(cacheData as CacheInfo);
    }
  }, [cacheData]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([fetchTasks(), refetchCache()]);
    setIsRefreshing(false);
  }, [fetchTasks, refetchCache]);

  const handleViewTaskDetails = (task: ProcessingTask) => {
    router.push(`/processing-monitor?projectId=${task.projectId}&taskId=${task.id}`);
  };

  const handleCancelTask = (taskId: string) => {
    Alert.alert(
      "取消任务",
      "确定要取消此处理任务吗？",
      [
        { text: "否", style: "cancel" },
        {
          text: "是",
          style: "destructive",
          onPress: () => cancelProcessingMutation.mutate({ taskId }),
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

  // 过滤任务
  const activeTasks = tasks.filter(t => t.status === "processing" || t.status === "pending");
  const completedTasks = tasks.filter(t => t.status === "completed" || t.status === "failed" || t.status === "cancelled");

  return (
    <ScreenContainer>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.primary,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ padding: 4 }}
        >
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            fontSize: 18,
            fontWeight: "600",
            color: "#FFFFFF",
            textAlign: "center",
          }}
        >
          数据管理
        </Text>
        <TouchableOpacity
          onPress={handleClearCache}
          style={{ padding: 4 }}
        >
          <MaterialIcons name="delete-sweep" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.background,
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
            marginRight: 8,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: activeTab === "downloading" ? "#FFFFFF" : colors.foreground,
            }}
          >
            处理中 {activeTasks.length > 0 && `(${activeTasks.length})`}
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
              color: activeTab === "cached" ? "#FFFFFF" : colors.foreground,
            }}
          >
            已缓存
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={{ flex: 1, paddingHorizontal: 16 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === "downloading" ? (
          <>
            {isLoadingTasks ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 12, color: colors.muted }}>
                  加载中...
                </Text>
              </View>
            ) : activeTasks.length === 0 && completedTasks.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <MaterialIcons
                  name="cloud-download"
                  size={48}
                  color={colors.muted}
                />
                <Text
                  style={{
                    marginTop: 12,
                    fontSize: 16,
                    color: colors.muted,
                  }}
                >
                  暂无处理任务
                </Text>
                <Text
                  style={{
                    marginTop: 4,
                    fontSize: 14,
                    color: colors.muted,
                    textAlign: "center",
                  }}
                >
                  创建新项目并开始处理后，数据将自动下载
                </Text>
              </View>
            ) : (
              <>
                {/* 活跃任务 */}
                {activeTasks.length > 0 && (
                  <>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: colors.foreground,
                        marginTop: 16,
                        marginBottom: 12,
                      }}
                    >
                      正在处理 ({activeTasks.length})
                    </Text>
                    {activeTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onViewDetails={() => handleViewTaskDetails(task)}
                        onCancel={() => handleCancelTask(task.id)}
                        colors={colors}
                      />
                    ))}
                  </>
                )}

                {/* 已完成任务 */}
                {completedTasks.length > 0 && (
                  <>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: colors.foreground,
                        marginTop: 16,
                        marginBottom: 12,
                      }}
                    >
                      历史记录 ({completedTasks.length})
                    </Text>
                    {completedTasks.slice(0, 10).map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onViewDetails={() => handleViewTaskDetails(task)}
                        onCancel={() => {}}
                        colors={colors}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* 存储统计 */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                marginTop: 16,
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
                    width: `${Math.min((cacheInfo.total_size / (50 * 1024 * 1024 * 1024)) * 100, 100)}%`,
                    height: "100%",
                    backgroundColor: colors.primary,
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
                  已使用 {((cacheInfo.total_size / (50 * 1024 * 1024 * 1024)) * 100).toFixed(1)}%
                </Text>
              </View>
            </View>

            {/* 缓存文件列表 */}
            {cacheLoading ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : cacheInfo.files.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <MaterialIcons
                  name="folder-open"
                  size={48}
                  color={colors.muted}
                />
                <Text
                  style={{
                    marginTop: 12,
                    fontSize: 16,
                    color: colors.muted,
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

        {/* Bottom spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </ScreenContainer>
  );
}
