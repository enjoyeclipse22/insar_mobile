import { ScrollView, Text, View, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useState, useCallback } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { trpc } from "@/lib/trpc";
import { RealMapSelector } from "@/components/real-map-selector";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PROJECTS_STORAGE_KEY = "insar_projects";

// 地图区域选择组件
function MapAreaSelector({
  bounds,
  onBoundsChange,
  colors,
}: {
  bounds: { north: number; south: number; east: number; west: number };
  onBoundsChange: (bounds: { north: number; south: number; east: number; west: number }) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectionBox, setSelectionBox] = useState({ x: 50, y: 50, width: 100, height: 80 });

  // 将像素坐标转换为地理坐标
  const pixelToGeo = useCallback((x: number, y: number, containerWidth: number, containerHeight: number) => {
    const lon = -180 + (x / containerWidth) * 360;
    const lat = 90 - (y / containerHeight) * 180;
    return { lon, lat };
  }, []);

  // 预设区域
  const presetAreas = [
    { name: "土耳其地震区", north: 38.5, south: 36.5, east: 38.0, west: 35.5 },
    { name: "加州断层带", north: 36.5, south: 35.0, east: -117.0, west: -119.0 },
    { name: "日本富士山", north: 35.8, south: 35.0, east: 139.0, west: 138.0 },
    { name: "冰岛火山区", north: 64.5, south: 63.5, east: -18.0, west: -20.0 },
  ];

  return (
    <View>
      {/* 预设区域快速选择 */}
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
        快速选择预设区域：
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {presetAreas.map((area) => (
            <TouchableOpacity
              key={area.name}
              onPress={() => onBoundsChange(area)}
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

      {/* 地图区域显示 */}
      <View
        style={{
          height: 200,
          backgroundColor: "#1a365d",
          borderRadius: 12,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* 简化的世界地图背景 */}
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>世界地图</Text>
          {/* 经纬度网格 */}
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={`h-${i}`}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: `${i * 25}%`,
                height: 1,
                backgroundColor: "rgba(255,255,255,0.1)",
              }}
            />
          ))}
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={`v-${i}`}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${i * 25}%`,
                width: 1,
                backgroundColor: "rgba(255,255,255,0.1)",
              }}
            />
          ))}
        </View>

        {/* 选中区域标记 */}
        <View
          style={{
            position: "absolute",
            left: "30%",
            top: "30%",
            width: "40%",
            height: "40%",
            borderWidth: 2,
            borderColor: colors.primary,
            backgroundColor: "rgba(10, 126, 164, 0.3)",
            borderRadius: 4,
          }}
        >
          <View
            style={{
              position: "absolute",
              top: -20,
              left: 0,
              right: 0,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 10, color: "#FFFFFF" }}>
              {bounds.north.toFixed(2)}°N
            </Text>
          </View>
          <View
            style={{
              position: "absolute",
              bottom: -20,
              left: 0,
              right: 0,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 10, color: "#FFFFFF" }}>
              {bounds.south.toFixed(2)}°N
            </Text>
          </View>
        </View>

        {/* 提示文字 */}
        <View
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            right: 8,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
            {bounds.west.toFixed(2)}°E
          </Text>
          <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
            {bounds.east.toFixed(2)}°E
          </Text>
        </View>
      </View>

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

export default function CreateProjectScreen() {
  const router = useRouter();
  const colors = useColors();
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState("");
  const [location, setLocation] = useState("");
  const [bounds, setBounds] = useState({ north: 38.5, south: 36.5, east: 38.0, west: 35.5 });
  // 默认时间范围：最近 3 个月
  const getDefaultDates = () => {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    const threeMonthsAgo = new Date(today);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const startDate = threeMonthsAgo.toISOString().split('T')[0];
    return { startDate, endDate };
  };
  const defaultDates = getDefaultDates();
  const [startDate, setStartDate] = useState(defaultDates.startDate);
  const [endDate, setEndDate] = useState(defaultDates.endDate);
  const [satellite, setSatellite] = useState("S1A");
  const [orbit, setOrbit] = useState<"ascending" | "descending">("ascending");
  const [polarization, setPolarization] = useState("VV");
  const [isCreating, setIsCreating] = useState(false);

  // tRPC mutation for creating project
  const createProjectMutation = trpc.insar.createProject.useMutation({
    onSuccess: (data) => {
      setIsCreating(false);
      // 直接跳转到项目详情页，不显示弹窗
      router.replace(`/project/${data.id}`);
    },
    onError: (error) => {
      setIsCreating(false);
      Alert.alert("错误", `创建项目失败: ${error.message}`);
    },
  });

  const handleNext = () => {
    // 验证当前步骤
    if (step === 1) {
      if (!projectName.trim()) {
        Alert.alert("提示", "请输入项目名称");
        return;
      }
      if (!location.trim()) {
        Alert.alert("提示", "请输入处理区域名称");
        return;
      }
    }
    if (step === 2) {
      if (!startDate.trim() || !endDate.trim()) {
        Alert.alert("提示", "请输入开始和结束日期");
        return;
      }
      // 验证日期格式
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        Alert.alert("提示", "日期格式应为 YYYY-MM-DD");
        return;
      }
    }
    if (step < 4) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      router.back();
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);
    
    // 构建位置描述，包含边界坐标
    const locationWithBounds = `${location} (${bounds.south.toFixed(2)}°N-${bounds.north.toFixed(2)}°N, ${bounds.west.toFixed(2)}°E-${bounds.east.toFixed(2)}°E)`;
    
    // 生成本地项目 ID
    const localId = Date.now();
    
    // 创建项目数据
    const projectData = {
      id: localId,
      name: projectName,
      description: `InSAR processing project for ${location}`,
      location: locationWithBounds,
      startDate,
      endDate,
      satellite,
      orbitDirection: orbit,
      polarization,
      status: "created",
      progress: 0,
      createdAt: new Date().toISOString(),
      bounds,
    };
    
    try {
      // 保存到本地存储
      const stored = await AsyncStorage.getItem(PROJECTS_STORAGE_KEY);
      const projects = stored ? JSON.parse(stored) : [];
      projects.push(projectData);
      await AsyncStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
      
      setIsCreating(false);
      // 跳转到项目详情页
      router.replace(`/project/${localId}`);
    } catch (error) {
      setIsCreating(false);
      Alert.alert("错误", `创建项目失败: ${error}`);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 16 }}>
              基本信息
            </Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                项目名称
              </Text>
              <TextInput
                placeholder="例如：Turkey Earthquake 2023"
                placeholderTextColor={colors.muted}
                value={projectName}
                onChangeText={setProjectName}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                处理区域名称
              </Text>
              <TextInput
                placeholder="例如：Central Turkey"
                placeholderTextColor={colors.muted}
                value={location}
                onChangeText={setLocation}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                选择处理区域
              </Text>
              <RealMapSelector bounds={bounds} onBoundsChange={setBounds} />
            </View>
          </View>
        );

      case 2:
        return (
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 16 }}>
              数据参数
            </Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                开始日期
              </Text>
              <TextInput
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                value={startDate}
                onChangeText={setStartDate}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                结束日期
              </Text>
              <TextInput
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                value={endDate}
                onChangeText={setEndDate}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                卫星选择
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {["S1A", "S1B"].map((sat) => (
                  <TouchableOpacity
                    key={sat}
                    onPress={() => setSatellite(sat)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 8,
                      backgroundColor: satellite === sat ? colors.primary : colors.surface,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: satellite === sat ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: satellite === sat ? "#FFFFFF" : colors.foreground,
                      }}
                    >
                      {sat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        );

      case 3:
        return (
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 16 }}>
              处理参数
            </Text>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                轨道方向
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["ascending", "descending"] as const).map((orb) => (
                  <TouchableOpacity
                    key={orb}
                    onPress={() => setOrbit(orb)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 8,
                      backgroundColor: orbit === orb ? colors.primary : colors.surface,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: orbit === orb ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: orbit === orb ? "#FFFFFF" : colors.foreground,
                      }}
                    >
                      {orb === "ascending" ? "升轨" : "降轨"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                极化方式
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {["VV", "VH"].map((pol) => (
                  <TouchableOpacity
                    key={pol}
                    onPress={() => setPolarization(pol)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 8,
                      backgroundColor: polarization === pol ? colors.primary : colors.surface,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: polarization === pol ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: polarization === pol ? "#FFFFFF" : colors.foreground,
                      }}
                    >
                      {pol}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        );

      case 4:
        return (
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 16 }}>
              确认参数
            </Text>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                gap: 12,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>项目名称</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {projectName}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>处理区域</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {location}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View>
                <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 4 }}>边界坐标</Text>
                <Text style={{ fontSize: 12, color: colors.foreground }}>
                  北纬: {bounds.north.toFixed(2)}° | 南纬: {bounds.south.toFixed(2)}°
                </Text>
                <Text style={{ fontSize: 12, color: colors.foreground }}>
                  东经: {bounds.east.toFixed(2)}° | 西经: {bounds.west.toFixed(2)}°
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>时间范围</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {startDate} 至 {endDate}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>卫星</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {satellite}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>轨道方向</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {orbit === "ascending" ? "升轨" : "降轨"}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>极化方式</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                  {polarization}
                </Text>
              </View>
            </View>
          </View>
        );

      default:
        return null;
    }
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
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#FFFFFF", marginBottom: 12 }}>
            新建项目
          </Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            {[1, 2, 3, 4].map((s) => (
              <View
                key={s}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: s <= step ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
                }}
              />
            ))}
          </View>
          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 8 }}>
            第 {step} 步，共 4 步
          </Text>
        </View>

        {/* Content */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 24 }}>
          {renderStep()}
        </ScrollView>

        {/* Footer */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingVertical: 16,
            flexDirection: "row",
            gap: 12,
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <TouchableOpacity
            onPress={handleBack}
            disabled={isCreating}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 8,
              backgroundColor: colors.surface,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
              opacity: isCreating ? 0.5 : 1,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>
              {step === 1 ? "取消" : "上一步"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={step === 4 ? handleCreate : handleNext}
            disabled={isCreating}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 8,
              backgroundColor: colors.primary,
              alignItems: "center",
              opacity: isCreating ? 0.7 : 1,
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {isCreating && <ActivityIndicator size="small" color="#FFFFFF" />}
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
              {isCreating ? "创建中..." : step === 4 ? "创建项目" : "下一步"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}
