import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useRef, useEffect } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Image,
  FlatList,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

interface ComparisonResult {
  id: string;
  name: string;
  method: string;
  imageUrl: string;
  statistics: {
    mean: number;
    std: number;
    min: number;
    max: number;
  };
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const IMAGE_WIDTH = (SCREEN_WIDTH - 48) / 2;

export default function ComparisonViewScreen() {
  const router = useRouter();
  const colors = useColors();
  const { projectId } = useLocalSearchParams();

  const [selectedResults, setSelectedResults] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"side-by-side" | "overlay" | "swipe">("side-by-side");
  const [syncZoom, setSyncZoom] = useState(true);
  const [showDifference, setShowDifference] = useState(false);

  // 模拟不同大气校正方法的结果
  const [results] = useState<ComparisonResult[]>([
    {
      id: "1",
      name: "原始干涉图",
      method: "none",
      imageUrl: "https://via.placeholder.com/300x300/1a5276/ffffff?text=Original",
      statistics: { mean: 0.15, std: 1.23, min: -3.14, max: 3.14 },
    },
    {
      id: "2",
      name: "DEM 高度改正",
      method: "dem_correction",
      imageUrl: "https://via.placeholder.com/300x300/27ae60/ffffff?text=DEM",
      statistics: { mean: 0.08, std: 0.95, min: -2.85, max: 2.91 },
    },
    {
      id: "3",
      name: "ERA5 大气改正",
      method: "era5",
      imageUrl: "https://via.placeholder.com/300x300/8e44ad/ffffff?text=ERA5",
      statistics: { mean: 0.05, std: 0.78, min: -2.45, max: 2.52 },
    },
    {
      id: "4",
      name: "GACOS 大气改正",
      method: "gacos",
      imageUrl: "https://via.placeholder.com/300x300/e74c3c/ffffff?text=GACOS",
      statistics: { mean: 0.03, std: 0.65, min: -2.12, max: 2.18 },
    },
    {
      id: "5",
      name: "时空滤波改正",
      method: "spatiotemporal",
      imageUrl: "https://via.placeholder.com/300x300/f39c12/ffffff?text=ST-Filter",
      statistics: { mean: 0.02, std: 0.52, min: -1.85, max: 1.92 },
    },
  ]);

  // 计算差异统计
  const calculateDifference = () => {
    if (selectedResults.length !== 2) return null;

    const result1 = results.find((r) => r.id === selectedResults[0]);
    const result2 = results.find((r) => r.id === selectedResults[1]);

    if (!result1 || !result2) return null;

    return {
      meanDiff: Math.abs(result1.statistics.mean - result2.statistics.mean),
      stdDiff: Math.abs(result1.statistics.std - result2.statistics.std),
      improvement: ((result1.statistics.std - result2.statistics.std) / result1.statistics.std * 100),
    };
  };

  const difference = calculateDifference();

  const toggleResultSelection = (id: string) => {
    if (selectedResults.includes(id)) {
      setSelectedResults(selectedResults.filter((r) => r !== id));
    } else if (selectedResults.length < 2) {
      setSelectedResults([...selectedResults, id]);
    } else {
      // 替换第一个选择
      setSelectedResults([selectedResults[1], id]);
    }
  };

  const getSelectedResults = () => {
    return selectedResults.map((id) => results.find((r) => r.id === id)).filter(Boolean) as ComparisonResult[];
  };

  const renderResultCard = ({ item }: { item: ComparisonResult }) => {
    const isSelected = selectedResults.includes(item.id);
    const selectionIndex = selectedResults.indexOf(item.id);

    return (
      <TouchableOpacity
        onPress={() => toggleResultSelection(item.id)}
        style={{
          backgroundColor: isSelected ? colors.primary + "20" : colors.surface,
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          borderWidth: isSelected ? 2 : 1,
          borderColor: isSelected ? colors.primary : colors.border,
        }}
      >
        <View className="flex-row items-center">
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: isSelected ? colors.primary : colors.border,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            {isSelected && (
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>
                {selectionIndex + 1}
              </Text>
            )}
          </View>
          <View className="flex-1">
            <Text className="text-foreground font-semibold">{item.name}</Text>
            <Text className="text-muted text-xs mt-1">
              σ = {item.statistics.std.toFixed(3)} rad
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-muted text-xs">
              μ = {item.statistics.mean.toFixed(3)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSideBySideView = () => {
    const selected = getSelectedResults();
    if (selected.length < 2) {
      return (
        <View className="flex-1 items-center justify-center p-8">
          <MaterialIcons name="compare" size={64} color={colors.muted} />
          <Text className="text-muted text-center mt-4">
            请选择两个结果进行对比
          </Text>
        </View>
      );
    }

    return (
      <View className="flex-1">
        <View className="flex-row px-4 gap-4">
          {selected.map((result, index) => (
            <View key={result.id} style={{ width: IMAGE_WIDTH }}>
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Image
                  source={{ uri: result.imageUrl }}
                  style={{ width: IMAGE_WIDTH, height: IMAGE_WIDTH }}
                  resizeMode="cover"
                />
                <View className="p-3">
                  <Text className="text-foreground font-semibold text-sm" numberOfLines={1}>
                    {result.name}
                  </Text>
                  <View className="flex-row justify-between mt-2">
                    <Text className="text-muted text-xs">σ: {result.statistics.std.toFixed(3)}</Text>
                    <Text className="text-muted text-xs">μ: {result.statistics.mean.toFixed(3)}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* 差异统计 */}
        {difference && showDifference && (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 16,
              marginHorizontal: 16,
              marginTop: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text className="text-foreground font-semibold mb-3">差异分析</Text>
            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <Text className="text-muted text-xs">均值差异</Text>
                <Text className="text-foreground font-bold text-lg">
                  {difference.meanDiff.toFixed(4)}
                </Text>
                <Text className="text-muted text-xs">rad</Text>
              </View>
              <View className="items-center flex-1">
                <Text className="text-muted text-xs">标准差差异</Text>
                <Text className="text-foreground font-bold text-lg">
                  {difference.stdDiff.toFixed(4)}
                </Text>
                <Text className="text-muted text-xs">rad</Text>
              </View>
              <View className="items-center flex-1">
                <Text className="text-muted text-xs">改善程度</Text>
                <Text
                  style={{
                    color: difference.improvement > 0 ? colors.success : colors.error,
                    fontWeight: "bold",
                    fontSize: 18,
                  }}
                >
                  {difference.improvement > 0 ? "+" : ""}{difference.improvement.toFixed(1)}%
                </Text>
                <Text className="text-muted text-xs">标准差</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScreenContainer className="flex-1">
      {/* 头部 */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <TouchableOpacity onPress={() => router.back()} className="p-2">
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text className="text-foreground font-bold text-lg">结果对比</Text>
        <TouchableOpacity
          onPress={() => setShowDifference(!showDifference)}
          className="p-2"
        >
          <MaterialIcons
            name={showDifference ? "analytics" : "analytics"}
            size={24}
            color={showDifference ? colors.primary : colors.muted}
          />
        </TouchableOpacity>
      </View>

      {/* 视图模式选择 */}
      <View className="flex-row px-4 py-3 gap-2">
        {[
          { mode: "side-by-side", icon: "view-column", label: "并排" },
          { mode: "overlay", icon: "layers", label: "叠加" },
          { mode: "swipe", icon: "compare", label: "滑动" },
        ].map((item) => (
          <TouchableOpacity
            key={item.mode}
            onPress={() => setViewMode(item.mode as typeof viewMode)}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 8,
              backgroundColor: viewMode === item.mode ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor: viewMode === item.mode ? colors.primary : colors.border,
            }}
          >
            <MaterialIcons
              name={item.icon as any}
              size={16}
              color={viewMode === item.mode ? "#fff" : colors.muted}
            />
            <Text
              style={{
                marginLeft: 4,
                fontSize: 12,
                color: viewMode === item.mode ? "#fff" : colors.muted,
              }}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 同步缩放开关 */}
      <View className="flex-row items-center justify-between px-4 py-2">
        <Text className="text-muted text-sm">同步缩放和平移</Text>
        <TouchableOpacity
          onPress={() => setSyncZoom(!syncZoom)}
          style={{
            width: 48,
            height: 28,
            borderRadius: 14,
            backgroundColor: syncZoom ? colors.primary : colors.border,
            justifyContent: "center",
            paddingHorizontal: 2,
          }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: "#fff",
              transform: [{ translateX: syncZoom ? 20 : 0 }],
            }}
          />
        </TouchableOpacity>
      </View>

      {/* 对比视图 */}
      <View className="flex-1">
        {renderSideBySideView()}
      </View>

      {/* 结果选择列表 */}
      <View
        style={{
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          maxHeight: 280,
        }}
      >
        <View className="flex-row items-center justify-between px-4 py-3">
          <Text className="text-foreground font-semibold">选择对比结果</Text>
          <Text className="text-muted text-sm">
            已选 {selectedResults.length}/2
          </Text>
        </View>
        <FlatList
          data={results}
          renderItem={renderResultCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </ScreenContainer>
  );
}
