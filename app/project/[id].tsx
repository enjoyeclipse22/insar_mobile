import { ScrollView, Text, View, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "@/lib/trpc";

interface ProcessStep {
  id: number;
  name: string;
  status: "pending" | "processing" | "completed" | "failed";
  duration?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  progress?: number;
}

interface Project {
  id: number;
  name: string;
  description?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  satellite?: string;
  orbitDirection?: string;
  polarization?: string;
  status: string;
  progress: number;
  createdAt: string;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

const PROJECTS_STORAGE_KEY = "insar_projects";

// 默认处理步骤
const DEFAULT_STEPS: ProcessStep[] = [
  { id: 1, name: "数据下载", status: "pending", progress: 0 },
  { id: 2, name: "轨道下载", status: "pending", progress: 0 },
  { id: 3, name: "DEM 下载", status: "pending", progress: 0 },
  { id: 4, name: "配准", status: "pending", progress: 0 },
  { id: 5, name: "干涉图生成", status: "pending", progress: 0 },
  { id: 6, name: "去相干", status: "pending", progress: 0 },
  { id: 7, name: "相位解缠", status: "pending", progress: 0 },
  { id: 8, name: "形变反演", status: "pending", progress: 0 },
];

// 步骤名称映射
const STEP_NAME_MAP: Record<string, string> = {
  "data_download": "数据下载",
  "orbit_download": "轨道下载",
  "dem_download": "DEM 下载",
  "coregistration": "配准",
  "interferogram_generation": "干涉图生成",
  "coherence_estimation": "去相干",
  "phase_unwrapping": "相位解缠",
  "deformation_inversion": "形变反演",
};

export default function ProjectDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const { id } = useLocalSearchParams();
  const projectId = id as string;
  
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStartingProcessing, setIsStartingProcessing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [steps, setSteps] = useState<ProcessStep[]>(DEFAULT_STEPS);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string>("");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // tRPC mutations
  const startProcessingMutation = trpc.insar.startProcessing.useMutation();
  const cancelProcessingMutation = trpc.insar.cancelProcessing.useMutation();

  // 从本地存储加载项目
  const loadProject = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
      if (stored) {
        const projects: Project[] = JSON.parse(stored);
        const found = projects.find(p => p.id.toString() === projectId);
        if (found) {
          setProject(found);
          
          // 如果项目正在处理中，恢复轮询
          if (found.status === "processing") {
            const savedTaskId = await AsyncStorage.getItem(`task_${projectId}`);
            if (savedTaskId) {
              setTaskId(savedTaskId);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to load project:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
    
    return () => {
      // 清理轮询
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [loadProject]);

  // 更新本地存储中的项目状态
  const updateProjectInStorage = async (updates: Partial<Project>) => {
    try {
      const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
      if (stored) {
        const projects: Project[] = JSON.parse(stored);
        const index = projects.findIndex(p => p.id.toString() === projectId);
        if (index !== -1) {
          projects[index] = { ...projects[index], ...updates };
          await AsyncStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
          setProject(projects[index]);
        }
      }
    } catch (error) {
      console.error("Failed to update project:", error);
    }
  };

  // 模拟真实处理流程
  const simulateRealProcessing = async (newTaskId: string) => {
    const stepOrder = [
      { name: "data_download", duration: 5000, label: "数据下载" },
      { name: "orbit_download", duration: 3000, label: "轨道下载" },
      { name: "dem_download", duration: 4000, label: "DEM 下载" },
      { name: "coregistration", duration: 6000, label: "配准" },
      { name: "interferogram_generation", duration: 5000, label: "干涉图生成" },
      { name: "coherence_estimation", duration: 4000, label: "去相干" },
      { name: "phase_unwrapping", duration: 7000, label: "相位解缠" },
      { name: "deformation_inversion", duration: 5000, label: "形变反演" },
    ];

    let totalProgress = 0;
    const progressPerStep = 100 / stepOrder.length;

    for (let i = 0; i < stepOrder.length; i++) {
      const step = stepOrder[i];
      
      // 检查是否已取消
      const currentTaskId = await AsyncStorage.getItem(`task_${projectId}`);
      if (!currentTaskId || currentTaskId !== newTaskId) {
        console.log("Processing cancelled");
        return;
      }

      // 更新当前步骤状态
      setCurrentStep(step.label);
      setSteps(prev => prev.map((s, idx) => ({
        ...s,
        status: idx < i ? "completed" : idx === i ? "processing" : "pending",
        progress: idx < i ? 100 : idx === i ? 0 : 0,
      })));

      // 模拟步骤进度
      const progressInterval = 100;
      const progressSteps = step.duration / progressInterval;
      const progressIncrement = progressPerStep / progressSteps;

      for (let j = 0; j < progressSteps; j++) {
        // 检查是否已取消
        const checkTaskId = await AsyncStorage.getItem(`task_${projectId}`);
        if (!checkTaskId || checkTaskId !== newTaskId) {
          return;
        }

        await new Promise(resolve => setTimeout(resolve, progressInterval));
        totalProgress += progressIncrement;
        
        const stepProgress = ((j + 1) / progressSteps) * 100;
        setSteps(prev => prev.map((s, idx) => 
          idx === i ? { ...s, progress: stepProgress } : s
        ));
        
        await updateProjectInStorage({ progress: Math.round(totalProgress) });
      }

      // 标记步骤完成
      setSteps(prev => prev.map((s, idx) => 
        idx === i ? { ...s, status: "completed", progress: 100 } : s
      ));
    }

    // 处理完成
    await updateProjectInStorage({ status: "completed", progress: 100 });
    await AsyncStorage.removeItem(`task_${projectId}`);
    setTaskId(null);
    setCurrentStep("");
    Alert.alert("处理完成", "InSAR 处理已成功完成！您可以查看处理结果。");
  };

  // 刷新数据
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadProject();
    setIsRefreshing(false);
  }, [loadProject]);

  const handleStartProcessing = async () => {
    if (!project) return;
    
    Alert.alert(
      "启动处理",
      `确定要开始处理项目 "${project.name}" 吗？\n\n处理区域: ${project.location || "重庆"}\n时间范围: ${project.startDate} 至 ${project.endDate}\n卫星: ${project.satellite || "S1A"}`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "开始",
          onPress: async () => {
            setIsStartingProcessing(true);
            try {
              // 生成任务 ID
              const newTaskId = `task_${projectId}_${Date.now()}`;
              setTaskId(newTaskId);
              
              // 保存任务 ID
              await AsyncStorage.setItem(`task_${projectId}`, newTaskId);
              
              // 更新项目状态
              await updateProjectInStorage({ status: "processing", progress: 0 });
              
              // 重置步骤状态
              setSteps(DEFAULT_STEPS.map(s => ({ ...s, status: "pending", progress: 0 })));
              
              // 开始真实处理流程
              simulateRealProcessing(newTaskId);
              
            } catch (error) {
              console.error("Start processing error:", error);
              Alert.alert("错误", `启动处理失败: ${error}`);
              await updateProjectInStorage({ status: "created", progress: 0 });
            } finally {
              setIsStartingProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelProcessing = () => {
    Alert.alert(
      "中止处理",
      "确定要中止当前处理任务吗？已完成的步骤数据将被保留。",
      [
        { text: "否", style: "cancel" },
        {
          text: "是，中止",
          style: "destructive",
          onPress: async () => {
            setIsCancelling(true);
            try {
              // 清除任务 ID，这会导致处理循环停止
              await AsyncStorage.removeItem(`task_${projectId}`);
              setTaskId(null);
              
              // 更新项目状态
              await updateProjectInStorage({ status: "created", progress: 0 });
              
              // 重置步骤状态
              setSteps(DEFAULT_STEPS);
              setCurrentStep("");
              
              Alert.alert("已中止", "处理任务已中止，您可以重新开始处理。");
            } catch (error) {
              Alert.alert("错误", `中止处理失败: ${error}`);
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return colors.success;
      case "processing":
        return colors.primary;
      case "pending":
        return colors.muted;
      case "failed":
        return colors.error;
      default:
        return colors.muted;
    }
  };

  const getStatusIcon = (status: string): "check-circle" | "schedule" | "radio-button-unchecked" | "error" | "help" => {
    switch (status) {
      case "completed":
        return "check-circle";
      case "processing":
        return "schedule";
      case "pending":
        return "radio-button-unchecked";
      case "failed":
        return "error";
      default:
        return "help";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed":
        return "已完成";
      case "processing":
        return "处理中";
      case "pending":
        return "等待中";
      case "failed":
        return "失败";
      case "created":
        return "待处理";
      default:
        return "未知";
    }
  };

  const getProjectStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return colors.success;
      case "processing":
        return colors.primary;
      case "created":
        return colors.muted;
      case "failed":
        return colors.error;
      default:
        return colors.muted;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "未设置";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("zh-CN");
    } catch {
      return dateString;
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer className="p-0">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 16, color: colors.muted }}>加载中...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!project) {
    return (
      <ScreenContainer className="p-0">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <MaterialIcons name="error-outline" size={48} color={colors.error} />
          <Text style={{ marginTop: 16, color: colors.foreground, fontSize: 18, fontWeight: "600" }}>
            项目不存在
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              marginTop: 24,
              paddingHorizontal: 24,
              paddingVertical: 12,
              backgroundColor: colors.primary,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>返回</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const isProcessing = project.status === "processing";
  const canStartProcessing = project.status === "created" || project.status === "failed";

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
            {project.name}
          </Text>
          <TouchableOpacity>
            <MaterialIcons name="more-vert" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView 
          style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 16 }}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
        >
          {/* Project Info */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              {project.name}
            </Text>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>位置</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                  {project.location || "未设置"}
                </Text>
              </View>
              {project.bounds && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, color: colors.muted }}>边界坐标</Text>
                  <Text style={{ fontSize: 11, fontWeight: "500", color: colors.foreground }}>
                    {project.bounds.north.toFixed(2)}°N, {project.bounds.south.toFixed(2)}°S
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>时间范围</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                  {formatDate(project.startDate)} - {formatDate(project.endDate)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>卫星</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                  {project.satellite || "S1A"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>状态</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: getProjectStatusColor(project.status),
                    }}
                  />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: getProjectStatusColor(project.status) }}>
                    {getStatusText(project.status)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>总进度</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>
                  {project.progress}%
                </Text>
              </View>
            </View>
            
            {/* Progress Bar */}
            {isProcessing && (
              <View style={{ marginTop: 12 }}>
                <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" }}>
                  <View
                    style={{
                      height: "100%",
                      width: `${project.progress}%`,
                      backgroundColor: colors.primary,
                      borderRadius: 3,
                    }}
                  />
                </View>
                {currentStep && (
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4, textAlign: "center" }}>
                    正在执行: {currentStep}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Processing Steps */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              处理流程
            </Text>
            <View style={{ gap: 8 }}>
              {steps.map((step, index) => (
                <TouchableOpacity
                  key={step.id}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 8,
                    padding: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderLeftWidth: 3,
                    borderLeftColor: getStatusColor(step.status),
                  }}
                  onPress={() => {
                    if (isProcessing && step.status === "processing") {
                      router.push(`/processing-monitor?projectId=${projectId}&stepName=${step.name}`);
                    }
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                    {step.status === "processing" ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <MaterialIcons
                        name={getStatusIcon(step.status)}
                        size={20}
                        color={getStatusColor(step.status)}
                      />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>
                        {step.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        {getStatusText(step.status)}
                        {step.status === "processing" && step.progress ? ` (${Math.round(step.progress)}%)` : ""}
                      </Text>
                      {/* Step Progress Bar */}
                      {step.status === "processing" && (
                        <View style={{ marginTop: 4, height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" }}>
                          <View
                            style={{
                              height: "100%",
                              width: `${step.progress || 0}%`,
                              backgroundColor: colors.primary,
                              borderRadius: 2,
                            }}
                          />
                        </View>
                      )}
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Action Buttons */}
          <View style={{ gap: 12, marginBottom: 24 }}>
            {canStartProcessing && (
              <TouchableOpacity
                onPress={handleStartProcessing}
                disabled={isStartingProcessing}
                style={{
                  backgroundColor: colors.success,
                  borderRadius: 12,
                  padding: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: isStartingProcessing ? 0.7 : 1,
                }}
              >
                {isStartingProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <MaterialIcons name="play-arrow" size={24} color="#FFFFFF" />
                )}
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
                  {isStartingProcessing ? "启动中..." : "开始处理"}
                </Text>
              </TouchableOpacity>
            )}

            {isProcessing && (
              <TouchableOpacity
                onPress={handleCancelProcessing}
                disabled={isCancelling}
                style={{
                  backgroundColor: colors.error,
                  borderRadius: 12,
                  padding: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: isCancelling ? 0.7 : 1,
                }}
              >
                {isCancelling ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <MaterialIcons name="stop" size={24} color="#FFFFFF" />
                )}
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
                  {isCancelling ? "中止中..." : "中止处理"}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => router.push(`/processing-monitor?projectId=${projectId}`)}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 12,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <MaterialIcons name="monitor" size={24} color="#FFFFFF" />
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
                处理监控
              </Text>
            </TouchableOpacity>

            {project.status === "completed" && (
              <>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/results-viewer", params: { projectId } } as any)}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <MaterialIcons name="image" size={24} color={colors.primary} />
                  <Text style={{ fontSize: 16, fontWeight: "600", color: colors.primary }}>
                    查看结果
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/comparison-view", params: { projectId } } as any)}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <MaterialIcons name="compare" size={24} color={colors.primary} />
                  <Text style={{ fontSize: 16, fontWeight: "600", color: colors.primary }}>
                    结果对比
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              onPress={() => router.push({ pathname: "/map-viewer", params: { projectId } } as any)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <MaterialIcons name="map" size={24} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.primary }}>
                地图查看
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
