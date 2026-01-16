import { ScrollView, Text, View, TouchableOpacity, Switch } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useState } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function SettingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const colorScheme = useColorScheme();
  const [darkMode, setDarkMode] = useState(colorScheme === "dark");
  const [autoCleanup, setAutoCleanup] = useState(true);
  const [notifications, setNotifications] = useState(true);

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
            设置
          </Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Content */}
        <ScrollView style={{ flex: 1 }}>
          {/* Display Settings */}
          <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              显示
            </Text>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    深色模式
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    使用深色主题
                  </Text>
                </View>
                <Switch value={darkMode} onValueChange={setDarkMode} />
              </View>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    语言
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    简体中文
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
              </View>
            </View>
          </View>

          {/* Processing Settings */}
          <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              处理
            </Text>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    处理线程数
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    自动检测
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
              </View>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    内存限制
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    自动
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
              </View>
            </View>
          </View>

          {/* Storage Settings */}
          <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              存储
            </Text>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    自动清理过期数据
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    删除 30 天前的临时文件
                  </Text>
                </View>
                <Switch value={autoCleanup} onValueChange={setAutoCleanup} />
              </View>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    清空缓存
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    删除所有缓存文件
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
              </View>
            </View>
          </View>

          {/* Notifications */}
          <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              通知
            </Text>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    处理完成提醒
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    处理完成时发送通知
                  </Text>
                </View>
                <Switch value={notifications} onValueChange={setNotifications} />
              </View>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    错误提醒
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    处理出错时发送通知
                  </Text>
                </View>
                <Switch value={true} onValueChange={() => {}} />
              </View>
            </View>
          </View>

          {/* About */}
          <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 12 }}>
              关于
            </Text>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  应用版本
                </Text>
                <Text style={{ fontSize: 14, color: colors.muted }}>1.0.0</Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  许可证
                </Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
              </View>
            </View>
          </View>

          {/* Feedback */}
          <View style={{ paddingHorizontal: 24, paddingVertical: 16, marginBottom: 24 }}>
            <TouchableOpacity
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <MaterialIcons name="feedback" size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.primary }}>
                反馈和支持
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
