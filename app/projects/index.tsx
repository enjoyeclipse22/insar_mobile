import { ScrollView, Text, View, TouchableOpacity, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

interface Project {
  id: string;
  name: string;
  location: string;
  status: "processing" | "completed" | "failed";
  createdAt: string;
  progress: number;
}

export default function ProjectsScreen() {
  const router = useRouter();
  const colors = useColors();

  const projects: Project[] = [
    {
      id: "1",
      name: "Turkey Earthquake 2023",
      location: "Central Turkey",
      status: "completed",
      createdAt: "2024-01-10",
      progress: 100,
    },
    {
      id: "2",
      name: "Volcano Monitoring",
      location: "Ecuador",
      status: "processing",
      createdAt: "2024-01-12",
      progress: 65,
    },
    {
      id: "3",
      name: "Subsidence Analysis",
      location: "California, USA",
      status: "completed",
      createdAt: "2024-01-08",
      progress: 100,
    },
  ];

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

  const getStatusIcon = (status: string) => {
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
      default:
        return "未知";
    }
  };

  const renderProjectCard = (project: Project) => (
    <TouchableOpacity
      key={project.id}
      onPress={() => router.push(`../project/${project.id}`)}
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
            📍 {project.location}
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
            {project.createdAt}
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
            所有项目
          </Text>
          <TouchableOpacity onPress={() => router.push("../create-project")}>
            <MaterialIcons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Projects List */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 16 }}>
          {projects.map(renderProjectCard)}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
