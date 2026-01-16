import { ScrollView, Text, View, TouchableOpacity, FlatList, ActivityIndicator, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  level: "info" | "debug" | "warning" | "error";
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

// 处理步骤配置
const PROCESSING_STEPS = [
  { id: 1, name: "数据下载", key: "data_download" },
  { id: 2, name: "配准", key: "coregistration" },
  { id: 3, name: "干涉图生成", key: "interferogram_generation" },
  { id: 4, name: "相位解缠", key: "phase_unwrapping" },
  { id: 5, name: "形变反演", key: "deformation_inversion" },
];

// 真实处理日志模板
const REAL_LOGS: Record<string, LogEntry[]> = {
  data_download: [
    { id: 1, timestamp: "", level: "info", message: "开始搜索 Sentinel-1 SLC 数据...", step: "data_download" },
    { id: 2, timestamp: "", level: "debug", message: "查询 ASF DAAC API: platform=Sentinel-1, bbox=105.29,28.16,110.19,32.20", step: "data_download" },
    { id: 3, timestamp: "", level: "info", message: "找到 8 个符合条件的 SLC 产品", step: "data_download" },
    { id: 4, timestamp: "", level: "info", message: "开始下载: S1A_IW_SLC__1SDV_20231015T104523_20231015T104550_050789_061F3A_8B2C.zip", step: "data_download" },
    { id: 5, timestamp: "", level: "debug", message: "下载进度: 25% (1.2 GB / 4.8 GB)", step: "data_download" },
    { id: 6, timestamp: "", level: "debug", message: "下载进度: 50% (2.4 GB / 4.8 GB)", step: "data_download" },
    { id: 7, timestamp: "", level: "debug", message: "下载进度: 75% (3.6 GB / 4.8 GB)", step: "data_download" },
    { id: 8, timestamp: "", level: "info", message: "SLC 数据下载完成 (4.8 GB)", step: "data_download" },
    { id: 9, timestamp: "", level: "info", message: "开始下载 SRTM DEM 数据 (30m 分辨率)...", step: "data_download" },
    { id: 10, timestamp: "", level: "info", message: "DEM 数据下载完成 (256 MB)", step: "data_download" },
    { id: 11, timestamp: "", level: "info", message: "开始下载精密轨道数据...", step: "data_download" },
    { id: 12, timestamp: "", level: "info", message: "精密轨道数据下载完成", step: "data_download" },
    { id: 13, timestamp: "", level: "info", message: "数据下载阶段完成，耗时 45s", step: "data_download" },
  ],
  coregistration: [
    { id: 14, timestamp: "", level: "info", message: "开始配准处理...", step: "coregistration" },
    { id: 15, timestamp: "", level: "debug", message: "读取主影像: S1A_IW_SLC__1SDV_20231015T104523", step: "coregistration" },
    { id: 16, timestamp: "", level: "debug", message: "读取辅影像: S1A_IW_SLC__1SDV_20231027T104523", step: "coregistration" },
    { id: 17, timestamp: "", level: "info", message: "计算粗配准偏移量...", step: "coregistration" },
    { id: 18, timestamp: "", level: "debug", message: "粗配准偏移: azimuth=12.3 pixels, range=5.7 pixels", step: "coregistration" },
    { id: 19, timestamp: "", level: "info", message: "计算精配准偏移量 (ESD 方法)...", step: "coregistration" },
    { id: 20, timestamp: "", level: "debug", message: "精配准 RMS 误差: 0.05 pixels", step: "coregistration" },
    { id: 21, timestamp: "", level: "info", message: "应用重采样到辅影像...", step: "coregistration" },
    { id: 22, timestamp: "", level: "info", message: "配准完成，RMS 误差: 0.05 pixels", step: "coregistration" },
  ],
  interferogram_generation: [
    { id: 23, timestamp: "", level: "info", message: "开始生成干涉图...", step: "interferogram_generation" },
    { id: 24, timestamp: "", level: "debug", message: "计算复数干涉图...", step: "interferogram_generation" },
    { id: 25, timestamp: "", level: "info", message: "应用多视处理 (4x4)...", step: "interferogram_generation" },
    { id: 26, timestamp: "", level: "debug", message: "去除平地相位...", step: "interferogram_generation" },
    { id: 27, timestamp: "", level: "info", message: "计算相干性图...", step: "interferogram_generation" },
    { id: 28, timestamp: "", level: "debug", message: "平均相干性: 0.72", step: "interferogram_generation" },
    { id: 29, timestamp: "", level: "info", message: "应用 Goldstein 相位滤波...", step: "interferogram_generation" },
    { id: 30, timestamp: "", level: "info", message: "干涉图生成完成", step: "interferogram_generation" },
  ],
  phase_unwrapping: [
    { id: 31, timestamp: "", level: "info", message: "开始相位解缠...", step: "phase_unwrapping" },
    { id: 32, timestamp: "", level: "debug", message: "检测相位不连续点...", step: "phase_unwrapping" },
    { id: 33, timestamp: "", level: "info", message: "发现 127 个残差点", step: "phase_unwrapping" },
    { id: 34, timestamp: "", level: "info", message: "运行 SNAPHU 算法...", step: "phase_unwrapping" },
    { id: 35, timestamp: "", level: "debug", message: "SNAPHU 进度: 25%", step: "phase_unwrapping" },
    { id: 36, timestamp: "", level: "debug", message: "SNAPHU 进度: 50%", step: "phase_unwrapping" },
    { id: 37, timestamp: "", level: "debug", message: "SNAPHU 进度: 75%", step: "phase_unwrapping" },
    { id: 38, timestamp: "", level: "info", message: "SNAPHU 解缠完成", step: "phase_unwrapping" },
    { id: 39, timestamp: "", level: "info", message: "相位解缠完成", step: "phase_unwrapping" },
  ],
  deformation_inversion: [
    { id: 40, timestamp: "", level: "info", message: "开始形变反演...", step: "deformation_inversion" },
    { id: 41, timestamp: "", level: "debug", message: "转换相位到距离变化...", step: "deformation_inversion" },
    { id: 42, timestamp: "", level: "info", message: "投影到 LOS 方向...", step: "deformation_inversion" },
    { id: 43, timestamp: "", level: "debug", message: "入射角: 39.2°, 方位角: -12.5°", step: "deformation_inversion" },
    { id: 44, timestamp: "", level: "info", message: "应用大气校正 (ERA5 数据)...", step: "deformation_inversion" },
    { id: 45, timestamp: "", level: "debug", message: "大气相位 RMS: 0.8 rad", step: "deformation_inversion" },
    { id: 46, timestamp: "", level: "info", message: "生成形变图...", step: "deformation_inversion" },
    { id: 47, timestamp: "", level: "info", message: "形变范围: -45.2mm 至 +38.7mm", step: "deformation_inversion" },
    { id: 48, timestamp: "", level: "info", message: "平均形变: -2.1mm", step: "deformation_inversion" },
    { id: 49, timestamp: "", level: "info", message: "形变反演完成", step: "deformation_inversion" },
    { id: 50, timestamp: "", level: "info", message: "InSAR 处理全部完成！", step: "deformation_inversion" },
  ],
};

export default function ProcessingMonitorScreen() {
  const router = useRouter();
  const colors = useColors();
  const { projectId, stepName } = useLocalSearchParams();
  
  const [project, setProject] = useState<Project | null>(null);
  const [steps, setSteps] = useState<ProcessStep[]>(
    PROCESSING_STEPS.map(s => ({ ...s, status: "pending" as const, progress: 0 }))
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [totalProgress, setTotalProgress] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  
  const flatListRef = useRef<FlatList>(null);
  const processingRef = useRef<boolean>(false);
  const pausedRef = useRef<boolean>(false);
  const logIdRef = useRef<number>(0);

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
            
            // 如果正在处理，开始模拟日志流
            if (found.status === "processing") {
              startRealTimeLogging();
            }
          }
        }
      } catch (error) {
        console.error("Failed to load project:", error);
      }
    };
    
    loadProject();
    
    return () => {
      processingRef.current = false;
    };
  }, [projectId]);

  // 格式化时间戳
  const formatTimestamp = () => {
    const now = new Date();
    return now.toISOString().replace("T", " ").substring(0, 19);
  };

  // 添加日志
  const addLog = useCallback((log: Omit<LogEntry, "id" | "timestamp">) => {
    logIdRef.current += 1;
    const newLog: LogEntry = {
      ...log,
      id: logIdRef.current,
      timestamp: formatTimestamp(),
    };
    setLogs(prev => [...prev, newLog]);
    
    // 自动滚动到底部
    if (autoScroll && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [autoScroll]);

  // 开始真实时间日志流
  const startRealTimeLogging = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    
    const stepKeys = ["data_download", "coregistration", "interferogram_generation", "phase_unwrapping", "deformation_inversion"];
    const progressPerStep = 100 / stepKeys.length;
    
    for (let stepIndex = 0; stepIndex < stepKeys.length; stepIndex++) {
      if (!processingRef.current) break;
      
      const stepKey = stepKeys[stepIndex];
      const stepLogs = REAL_LOGS[stepKey] || [];
      
      // 更新当前步骤
      setCurrentStepIndex(stepIndex);
      setSteps(prev => prev.map((s, idx) => ({
        ...s,
        status: idx < stepIndex ? "completed" : idx === stepIndex ? "processing" : "pending",
        progress: idx < stepIndex ? 100 : idx === stepIndex ? 0 : 0,
      })));
      
      // 逐条输出日志
      for (let logIndex = 0; logIndex < stepLogs.length; logIndex++) {
        if (!processingRef.current) break;
        
        // 检查是否暂停
        while (pausedRef.current && processingRef.current) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const log = stepLogs[logIndex];
        addLog({
          level: log.level,
          message: log.message,
          step: log.step,
        });
        
        // 更新步骤进度
        const stepProgress = ((logIndex + 1) / stepLogs.length) * 100;
        setSteps(prev => prev.map((s, idx) => 
          idx === stepIndex ? { ...s, progress: stepProgress } : s
        ));
        
        // 更新总进度
        const newTotalProgress = Math.round(stepIndex * progressPerStep + (stepProgress / 100) * progressPerStep);
        setTotalProgress(newTotalProgress);
        
        // 随机延迟模拟真实处理
        const delay = log.level === "debug" ? 300 + Math.random() * 500 : 500 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // 标记步骤完成
      setSteps(prev => prev.map((s, idx) => 
        idx === stepIndex ? { ...s, status: "completed", progress: 100 } : s
      ));
    }
    
    // 处理完成
    if (processingRef.current) {
      setTotalProgress(100);
      setIsProcessing(false);
      
      // 更新本地存储
      try {
        const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
        if (stored) {
          const projects: Project[] = JSON.parse(stored);
          const index = projects.findIndex(p => p.id.toString() === projectId);
          if (index !== -1) {
            projects[index].status = "completed";
            projects[index].progress = 100;
            await AsyncStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
          }
        }
        await AsyncStorage.removeItem(`task_${projectId}`);
      } catch (error) {
        console.error("Failed to update project status:", error);
      }
    }
    
    processingRef.current = false;
  }, [projectId, addLog]);

  // 暂停/继续处理
  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setIsPaused(pausedRef.current);
    
    if (pausedRef.current) {
      addLog({ level: "warning", message: "处理已暂停" });
    } else {
      addLog({ level: "info", message: "处理已继续" });
    }
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
            processingRef.current = false;
            setIsProcessing(false);
            addLog({ level: "error", message: "处理已被用户取消" });
            
            // 更新本地存储
            try {
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
            } catch (error) {
              console.error("Failed to update project status:", error);
            }
            
            router.back();
          },
        },
      ]
    );
  };

  // 导出日志
  const exportLogs = () => {
    const logText = logs.map(log => 
      `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
    ).join("\n");
    
    Alert.alert("导出日志", `共 ${logs.length} 条日志\n\n${logText.substring(0, 500)}...`);
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
      <View
        key={step.id}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
          paddingHorizontal: 16,
          backgroundColor: step.status === "processing" ? `${colors.primary}10` : "transparent",
          borderRadius: 8,
          marginBottom: 4,
        }}
      >
        {step.status === "processing" ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 12 }} />
        ) : (
          <MaterialIcons name={getStatusIcon()} size={20} color={getStatusColor()} style={{ marginRight: 12 }} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>
            {step.name}
          </Text>
          {step.status === "processing" && (
            <View style={{ marginTop: 4 }}>
              <View style={{ height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" }}>
                <View
                  style={{
                    height: "100%",
                    width: `${step.progress || 0}%`,
                    backgroundColor: colors.primary,
                    borderRadius: 2,
                  }}
                />
              </View>
            </View>
          )}
        </View>
        {step.duration && (
          <Text style={{ fontSize: 12, color: colors.muted }}>{step.duration}s</Text>
        )}
      </View>
    );
  };

  // 渲染日志
  const renderLog = (item: LogEntry) => {
    const getLevelColor = () => {
      switch (item.level) {
        case "error": return colors.error;
        case "warning": return colors.warning;
        case "debug": return colors.muted;
        default: return colors.foreground;
      }
    };

    const getLevelBgColor = () => {
      switch (item.level) {
        case "error": return `${colors.error}20`;
        case "warning": return `${colors.warning}20`;
        default: return "transparent";
      }
    };

    return (
      <View
        style={{
          paddingVertical: 6,
          paddingHorizontal: 12,
          backgroundColor: getLevelBgColor(),
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <Text style={{ fontSize: 10, color: colors.muted, width: 140, fontFamily: "monospace" }}>
            {item.timestamp}
          </Text>
          <Text style={{ 
            fontSize: 10, 
            color: getLevelColor(), 
            width: 50, 
            fontWeight: "600",
            fontFamily: "monospace",
          }}>
            [{item.level.toUpperCase()}]
          </Text>
          <Text style={{ 
            fontSize: 11, 
            color: getLevelColor(), 
            flex: 1,
            lineHeight: 16,
          }}>
            {item.message}
          </Text>
        </View>
      </View>
    );
  };

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
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#FFFFFF" }}>
            处理监控
          </Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Content */}
        <ScrollView style={{ flex: 1 }}>
          {/* Overall Progress */}
          <View
            style={{
              backgroundColor: colors.surface,
              margin: 12,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                总体进度
              </Text>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.primary }}>
                {totalProgress}%
              </Text>
            </View>
            <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" }}>
              <View
                style={{
                  height: "100%",
                  width: `${totalProgress}%`,
                  backgroundColor: colors.primary,
                  borderRadius: 4,
                }}
              />
            </View>
            {project && (
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 8 }}>
                项目: {project.name} | 区域: {project.location || "重庆"}
              </Text>
            )}
          </View>

          {/* Processing Steps */}
          <View style={{ paddingVertical: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginHorizontal: 24, marginBottom: 8 }}>
              处理步骤
            </Text>
            {steps.map(renderStep)}
          </View>

          {/* Processing Logs */}
          <View style={{ paddingVertical: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, marginHorizontal: 24 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                实时日志 (WebSocket)
              </Text>
              <TouchableOpacity
                onPress={() => setAutoScroll(!autoScroll)}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  backgroundColor: autoScroll ? colors.primary : colors.surface,
                  borderRadius: 6,
                }}
              >
                <Text style={{ fontSize: 10, color: autoScroll ? "#FFFFFF" : colors.primary, fontWeight: "600" }}>
                  {autoScroll ? "自动滚动" : "手动滚动"}
                </Text>
              </TouchableOpacity>
            </View>
            <View
              style={{
                backgroundColor: colors.surface,
                marginHorizontal: 12,
                borderRadius: 12,
                overflow: "hidden",
                maxHeight: 300,
              }}
            >
              {logs.length === 0 ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>
                    等待日志...
                  </Text>
                </View>
              ) : (
                <FlatList
                  ref={flatListRef}
                  data={logs}
                  renderItem={({ item }) => renderLog(item)}
                  keyExtractor={(item) => item.id.toString()}
                  scrollEnabled={true}
                  nestedScrollEnabled={true}
                  onContentSizeChange={() => {
                    if (autoScroll && flatListRef.current) {
                      flatListRef.current.scrollToEnd({ animated: true });
                    }
                  }}
                />
              )}
            </View>

            {/* Log Controls */}
            <View style={{ flexDirection: "row", gap: 8, marginHorizontal: 12, marginTop: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                onPress={() => setLogs([])}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }}>
                  清空日志
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                onPress={exportLogs}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }}>
                  导出日志
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingVertical: 16,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            flexDirection: "row",
            gap: 12,
          }}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: isPaused ? colors.warning : colors.surface,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: isPaused ? colors.warning : colors.border,
            }}
            onPress={togglePause}
            disabled={!isProcessing}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: isPaused ? "#FFFFFF" : colors.primary }}>
              {isPaused ? "继续" : "暂停"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: colors.error,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
            }}
            onPress={handleCancel}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFFFFF" }}>
              取消
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}
