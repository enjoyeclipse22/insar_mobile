import { ScrollView, Text, View, TouchableOpacity, Alert, ActivityIndicator, FlatList, Switch } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/oauth";

interface ProcessStep {
  id: number;
  name: string;
  status: "pending" | "processing" | "completed" | "failed";
  duration?: number;
  progress?: number;
}

interface LogEntry {
  id: number;
  timestamp: string;
  level: "INFO" | "DEBUG" | "WARNING" | "ERROR";
  message: string;
  step?: string;
}

interface Project {
  id: number;
  name: string;
  status: string;
  progress: number;
  location?: string;
  startDate?: string;
  endDate?: string;
  satellite?: string;
}

const PROJECTS_STORAGE_KEY = "insar_projects";

// 处理步骤配置 - 与后端 RealInSARProcessor 对应
const PROCESSING_STEPS = [
  { id: 1, name: "数据搜索", key: "数据搜索" },
  { id: 2, name: "数据下载", key: "数据下载" },
  { id: 3, name: "轨道下载", key: "轨道下载" },
  { id: 4, name: "DEM下载", key: "DEM下载" },
  { id: 5, name: "配准", key: "配准" },
  { id: 6, name: "干涉图生成", key: "干涉图生成" },
  { id: 7, name: "相位解缠", key: "相位解缠" },
  { id: 8, name: "形变反演", key: "形变反演" },
];

// 步骤名称到索引的映射
const STEP_INDEX_MAP: Record<string, number> = {
  "创建工作目录": -1,
  "初始化": -1,
  "数据搜索": 0,
  "数据下载": 1,
  "轨道下载": 2,
  "DEM下载": 3,
  "配准": 4,
  "干涉图生成": 5,
  "相位解缠": 6,
  "形变反演": 7,
  "完成": 8,
  "处理失败": -1,
};

export default function ProcessingMonitorScreen() {
  const router = useRouter();
  const colors = useColors();
  const { projectId, taskId: initialTaskId } = useLocalSearchParams();
  
  const [project, setProject] = useState<Project | null>(null);
  const [steps, setSteps] = useState<ProcessStep[]>(
    PROCESSING_STEPS.map(s => ({ ...s, status: "pending" as const, progress: 0 }))
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [totalProgress, setTotalProgress] = useState(0);
  const [currentStepName, setCurrentStepName] = useState("");
  const [taskId, setTaskId] = useState<string | null>(initialTaskId as string || null);
  const [taskStatus, setTaskStatus] = useState<string>("pending");
  const [error, setError] = useState<string | null>(null);
  
  const flatListRef = useRef<FlatList>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLogCountRef = useRef<number>(0);

  // tRPC mutations
  const cancelProcessingMutation = trpc.realInsar.cancelProcessing.useMutation();

  // 尝试从后端获取该项目的最新任务
  const findTaskForProject = useCallback(async (projId: string) => {
    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/api/trpc/realInsar.listTasks`);
      const data = await response.json();
      
      if (data?.result?.data?.json) {
        const tasks = data.result.data.json;
        // 查找该项目的最新任务
        const projectTask = tasks.find((t: any) => t.projectId.toString() === projId);
        if (projectTask) {
          return projectTask.id;
        }
      }
    } catch (error) {
      console.error("Failed to find task for project:", error);
    }
    return null;
  }, []);

  // 加载项目信息
  useEffect(() => {
    const loadProject = async () => {
      try {
        const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
        if (stored) {
          const projects: Project[] = JSON.parse(stored);
          const found = projects.find(p => p.id.toString() === projectId);
          if (found) {
            setProject(found);
            setIsProcessing(found.status === "processing");
            setTotalProgress(found.progress);
          }
        }
        
        // 获取保存的 taskId
        if (!taskId) {
          let savedTaskId = await AsyncStorage.getItem(`task_${projectId}`);
          
          // 如果本地没有保存的 taskId，尝试从后端获取
          if (!savedTaskId) {
            savedTaskId = await findTaskForProject(projectId as string);
            if (savedTaskId) {
              await AsyncStorage.setItem(`task_${projectId}`, savedTaskId);
            }
          }
          
          if (savedTaskId) {
            setTaskId(savedTaskId);
          }
        }
      } catch (error) {
        console.error("Failed to load project:", error);
      }
    };
    
    loadProject();
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [projectId]);

  // 当有 taskId 时开始轮询
  useEffect(() => {
    if (taskId) {
      startPolling();
    }
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [taskId]);

  // 轮询后端获取状态和日志
  const startPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    const pollData = async () => {
      if (!taskId) return;
      
      try {
        // 获取处理状态
        const apiBase = getApiBaseUrl();
        const statusResponse = await fetch(
          `${apiBase}/api/trpc/realInsar.getStatus?input=${encodeURIComponent(JSON.stringify({ json: { taskId } }))}`
        );
        const statusData = await statusResponse.json();
        
        if (statusData?.result?.data?.json) {
          const status = statusData.result.data.json;
          
          setTaskStatus(status.status);
          setTotalProgress(status.progress || 0);
          setCurrentStepName(status.currentStep || "");
          
          // 更新步骤状态
          const currentStepIndex = STEP_INDEX_MAP[status.currentStep] ?? -1;
          setSteps(prev => prev.map((s, idx) => ({
            ...s,
            status: idx < currentStepIndex ? "completed" : 
                   idx === currentStepIndex ? "processing" : "pending",
            progress: idx < currentStepIndex ? 100 : 
                     idx === currentStepIndex ? 50 : 0,
          })));
          
          // 更新本地项目状态
          if (status.status === "completed" || status.status === "failed") {
            setIsProcessing(false);
            
            // 更新本地存储
            const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
            if (stored) {
              const projects: Project[] = JSON.parse(stored);
              const index = projects.findIndex(p => p.id.toString() === projectId);
              if (index !== -1) {
                projects[index].status = status.status;
                projects[index].progress = status.status === "completed" ? 100 : projects[index].progress;
                await AsyncStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
              }
            }
            
            if (status.status === "completed") {
              setSteps(prev => prev.map(s => ({ ...s, status: "completed", progress: 100 })));
            }
            
            if (status.error) {
              setError(status.error);
            }
            
            // 停止轮询
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
            }
          }
        }

        // 获取日志
        const logsResponse = await fetch(
          `${apiBase}/api/trpc/realInsar.getLogs?input=${encodeURIComponent(JSON.stringify({ json: { 
            taskId, 
            offset: 0, 
            limit: 500 
          } }))}`
        );
        const logsData = await logsResponse.json();
        
        if (logsData?.result?.data?.json?.logs) {
          const newLogs: LogEntry[] = logsData.result.data.json.logs.map((log: any, index: number) => ({
            id: index,
            timestamp: new Date(log.timestamp).toLocaleTimeString(),
            level: log.level,
            message: log.message,
            step: log.step,
          }));
          
          // 只有当日志数量变化时才更新
          if (newLogs.length !== lastLogCountRef.current) {
            setLogs(newLogs);
            lastLogCountRef.current = newLogs.length;
            
            // 自动滚动到底部
            if (autoScroll && flatListRef.current && newLogs.length > 0) {
              setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
              }, 100);
            }
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };

    // 立即执行一次
    pollData();
    
    // 每 1.5 秒轮询一次
    pollingRef.current = setInterval(pollData, 1500);
  };

  // 取消处理
  const handleCancel = () => {
    Alert.alert(
      "取消处理",
      "确定要取消当前处理任务吗？",
      [
        { text: "否", style: "cancel" },
        {
          text: "是",
          style: "destructive",
          onPress: async () => {
            try {
              if (taskId) {
                await cancelProcessingMutation.mutateAsync({ taskId });
              }
              
              // 停止轮询
              if (pollingRef.current) {
                clearInterval(pollingRef.current);
              }
              
              setIsProcessing(false);
              
              // 更新本地存储
              const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
              if (stored) {
                const projects: Project[] = JSON.parse(stored);
                const index = projects.findIndex(p => p.id.toString() === projectId);
                if (index !== -1) {
                  projects[index].status = "created";
                  projects[index].progress = 0;
                  await AsyncStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
                }
              }
              await AsyncStorage.removeItem(`task_${projectId}`);
              
              Alert.alert("已取消", "处理任务已取消");
              router.back();
            } catch (error) {
              Alert.alert("错误", `取消失败: ${error}`);
            }
          },
        },
      ]
    );
  };

  // 导出日志
  const exportLogs = () => {
    const logText = logs.map(log => 
      `[${log.timestamp}] [${log.level}] [${log.step}] ${log.message}`
    ).join("\n");
    
    Alert.alert(
      "导出日志", 
      `共 ${logs.length} 条日志\n\n${logText.substring(0, 1000)}${logText.length > 1000 ? "..." : ""}`
    );
  };

  // 清空日志显示
  const clearLogs = () => {
    setLogs([]);
    lastLogCountRef.current = 0;
  };

  // 渲染步骤
  const renderStep = (step: ProcessStep, index: number) => {
    const getStatusColor = () => {
      switch (step.status) {
        case "completed": return colors.success;
        case "processing": return colors.primary;
        case "failed": return colors.error;
        default: return colors.muted;
      }
    };

    const getStatusIcon = (): "check-circle" | "schedule" | "radio-button-unchecked" | "error" => {
      switch (step.status) {
        case "completed": return "check-circle";
        case "processing": return "schedule";
        case "failed": return "error";
        default: return "radio-button-unchecked";
      }
    };

    return (
      <View key={step.id} className="flex-row items-center py-2">
        <MaterialIcons name={getStatusIcon()} size={20} color={getStatusColor()} />
        <Text className="text-foreground ml-2 flex-1">{step.name}</Text>
        {step.status === "processing" && (
          <ActivityIndicator size="small" color={colors.primary} />
        )}
      </View>
    );
  };

  // 渲染日志项
  const renderLogItem = ({ item }: { item: LogEntry }) => {
    const getLevelColor = () => {
      switch (item.level) {
        case "ERROR": return colors.error;
        case "WARNING": return colors.warning;
        case "DEBUG": return colors.muted;
        default: return colors.foreground;
      }
    };

    const getLevelBgColor = () => {
      switch (item.level) {
        case "ERROR": return colors.error + "20";
        case "WARNING": return colors.warning + "20";
        default: return "transparent";
      }
    };

    return (
      <View 
        className="px-3 py-2 border-b border-border"
        style={{ backgroundColor: getLevelBgColor() }}
      >
        <View className="flex-row items-center mb-1">
          <Text className="text-muted text-xs">{item.timestamp}</Text>
          <View 
            className="ml-2 px-2 py-0.5 rounded"
            style={{ backgroundColor: getLevelColor() + "30" }}
          >
            <Text style={{ color: getLevelColor() }} className="text-xs font-medium">
              {item.level}
            </Text>
          </View>
          {item.step && (
            <Text className="text-muted text-xs ml-2">[{item.step}]</Text>
          )}
        </View>
        <Text className="text-foreground text-sm">{item.message}</Text>
      </View>
    );
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View 
        className="flex-row items-center justify-between px-4 py-3"
        style={{ backgroundColor: colors.primary }}
      >
        <TouchableOpacity onPress={() => router.back()} className="p-2">
          <MaterialIcons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-semibold">处理监控</Text>
        <View className="w-10" />
      </View>

      {/* Progress Section */}
      <View className="m-4 p-4 rounded-xl bg-surface border border-border">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-foreground font-semibold">总体进度</Text>
          <Text className="text-primary font-bold">{totalProgress}%</Text>
        </View>
        <View className="h-3 bg-border rounded-full overflow-hidden">
          <View 
            className="h-full rounded-full"
            style={{ 
              width: `${totalProgress}%`,
              backgroundColor: taskStatus === "failed" ? colors.error : colors.primary,
            }}
          />
        </View>
        <Text className="text-muted text-sm mt-2">
          项目: {project?.name || projectId} | 区域: {project?.location || "未知"}
        </Text>
        {currentStepName && (
          <Text className="text-primary text-sm mt-1">当前步骤: {currentStepName}</Text>
        )}
        {error && (
          <Text className="text-error text-sm mt-1">错误: {error}</Text>
        )}
      </View>

      {/* Steps Section */}
      <View className="mx-4 mb-2">
        <Text className="text-foreground font-semibold mb-2">处理步骤</Text>
        <View className="bg-surface rounded-xl border border-border p-3">
          {steps.map((step, index) => renderStep(step, index))}
        </View>
      </View>

      {/* Logs Section */}
      <View className="flex-1 mx-4 mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-foreground font-semibold">实时日志 (WebSocket)</Text>
          <View className="flex-row items-center">
            <Text className="text-muted text-sm mr-2">自动滚动</Text>
            <Switch
              value={autoScroll}
              onValueChange={setAutoScroll}
              trackColor={{ false: colors.border, true: colors.primary + "50" }}
              thumbColor={autoScroll ? colors.primary : colors.muted}
            />
          </View>
        </View>
        
        <View className="flex-1 bg-surface rounded-xl border border-border overflow-hidden">
          {logs.length === 0 ? (
            <View className="flex-1 items-center justify-center p-8">
              <ActivityIndicator size="large" color={colors.primary} />
              <Text className="text-muted mt-4">等待日志...</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={logs}
              renderItem={renderLogItem}
              keyExtractor={(item) => item.id.toString()}
              showsVerticalScrollIndicator={true}
              onScrollBeginDrag={() => setAutoScroll(false)}
            />
          )}
        </View>
      </View>

      {/* Action Buttons */}
      <View className="flex-row mx-4 mb-4 space-x-3">
        <TouchableOpacity
          className="flex-1 py-3 rounded-xl items-center border border-border"
          onPress={clearLogs}
        >
          <Text className="text-foreground font-medium">清空日志</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 py-3 rounded-xl items-center border border-border"
          onPress={exportLogs}
        >
          <Text className="text-foreground font-medium">导出日志</Text>
        </TouchableOpacity>
      </View>

      {/* Control Buttons */}
      {(taskStatus === "processing" || taskStatus === "pending") && (
        <View className="flex-row mx-4 mb-6 space-x-3">
          <TouchableOpacity
            className="flex-1 py-4 rounded-xl items-center"
            style={{ backgroundColor: colors.primary }}
            onPress={() => setIsPaused(!isPaused)}
          >
            <Text className="text-white font-semibold">
              {isPaused ? "继续" : "暂停"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 py-4 rounded-xl items-center"
            style={{ backgroundColor: colors.error }}
            onPress={handleCancel}
          >
            <Text className="text-white font-semibold">取消</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Completed/Failed Status */}
      {(taskStatus === "completed" || taskStatus === "failed") && (
        <View className="mx-4 mb-6">
          <TouchableOpacity
            className="py-4 rounded-xl items-center"
            style={{ backgroundColor: taskStatus === "completed" ? colors.success : colors.error }}
            onPress={() => router.back()}
          >
            <Text className="text-white font-semibold">
              {taskStatus === "completed" ? "处理完成 - 返回" : "处理失败 - 返回"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScreenContainer>
  );
}
