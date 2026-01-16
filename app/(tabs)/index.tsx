import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useState, useEffect, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface Project {
  id: number;
  name: string;
  location: string;
  status: string;
  createdAt: string;
  progress: number;
}

const PROJECTS_STORAGE_KEY = "insar_projects";

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 从本地存储加载项目
  const loadProjects = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
      if (stored) {
        const projects = JSON.parse(stored);
        // 按创建时间倒序排列
        projects.sort((a: Project, b: Project) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setRecentProjects(projects);
      }
    } catch (error) {
      console.error("Failed to load projects:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 页面获得焦点时重新加载数据
  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [loadProjects])
  );

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return colors.success;
      case "processing":
        return colors.primary;
      case "failed":
        return colors.error;
      default:
        return colors.muted;
    }
  };

  const getStatusIcon = (status: string): "check-circle" | "hourglass-empty" | "error" | "help" => {
    switch (status) {
      case "completed":
        return "check-circle";
      case "processing":
        return "hourglass-empty";
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
      case "failed":
        return "失败";
      case "created":
        return "待处理";
      default:
        return "未知";
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("zh-CN");
    } catch {
      return dateString;
    }
  };

  const renderProjectCard = (project: Project) => (
    <TouchableOpacity
      key={project.id}
      onPress={() => router.push(`/project/${project.id}`)}
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: getStatusColor(project.status),
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginBottom: 4 }}>
            {project.name}
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>
            📍 {project.location || "未指定位置"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MaterialIcons name={getStatusIcon(project.status)} size={14} color={getStatusColor(project.status)} />
            <Text style={{ fontSize: 12, color: getStatusColor(project.status) }}>
              {getStatusText(project.status)}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
            {formatDate(project.createdAt)}
          </Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>
            {project.progress}%
          </Text>
        </View>
      </View>
      {project.status === "processing" && (
        <View style={{ marginTop: 12, height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" }}>
          <View
            style={{
              height: "100%",
              width: `${project.progress}%`,
              backgroundColor: colors.primary,
              borderRadius: 2,
            }}
          />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <ScreenContainer className="p-0">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={{ backgroundColor: colors.background }}>
        {/* Hero Section */}
        <View
          style={{
            backgroundColor: colors.primary,
            paddingHorizontal: 24,
            paddingVertical: 32,
            paddingTop: 24,
          }}
        >
          <Text style={{ fontSize: 28, fontWeight: "700", color: "#FFFFFF", marginBottom: 8 }}>
            InSAR Pro
          </Text>
          <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 16 }}>
            干涉合成孔径雷达数据处理平台
          </Text>

          {/* Quick Stats */}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(255,255,255,0.15)",
                borderRadius: 8,
                padding: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: "700", color: "#FFFFFF" }}>
                {recentProjects.length}
              </Text>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>
                项目总数
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(255,255,255,0.15)",
                borderRadius: 8,
                padding: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: "700", color: "#FFFFFF" }}>
                {recentProjects.filter((p) => p.status === "completed").length}
              </Text>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>
                已完成
              </Text>
            </View>
          </View>
        </View>

        {/* Main Content */}
        <View style={{ paddingHorizontal: 24, paddingVertical: 24 }}>
          {/* New Project Button */}
          <TouchableOpacity
            onPress={() => router.push("../create-project")}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 12,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 24,
            }}
          >
            <MaterialIcons name="add" size={24} color="#FFFFFF" />
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
              新建项目
            </Text>
          </TouchableOpacity>

          {/* Recent Projects */}
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>
                最近项目
              </Text>
              <TouchableOpacity onPress={() => router.push("../projects")}>
                <Text style={{ fontSize: 14, color: colors.primary, fontWeight: "500" }}>
                  查看全部 →
                </Text>
              </TouchableOpacity>
            </View>
            {isLoading ? (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 24,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8 }}>
                  加载中...
                </Text>
              </View>
            ) : recentProjects.length > 0 ? (
              recentProjects.slice(0, 5).map(renderProjectCard)
            ) : (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 24,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialIcons name="inbox" size={40} color={colors.muted} />
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8 }}>
                  暂无项目，点击上方按钮创建
                </Text>
              </View>
            )}
          </View>

          {/* Quick Links */}
          <View style={{ gap: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>
              快速操作
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/data-manager")}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    backgroundColor: colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialIcons name="storage" size={20} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    数据管理
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    管理存储空间
                  </Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/settings")}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    backgroundColor: colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialIcons name="settings" size={20} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    设置
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    应用配置和偏好
                  </Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
