import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// 地图类型
type MapType = "satellite" | "terrain" | "street";

// 叠加层类型
type OverlayType = "velocity" | "interferogram" | "coherence" | "none";

// 模拟的 InSAR 结果数据
interface InSAROverlay {
  id: string;
  type: OverlayType;
  name: string;
  bounds: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  statistics: {
    min: number;
    max: number;
    mean: number;
    unit: string;
  };
  colormap: string;
}

// 颜色条组件
function ColorBar({
  min,
  max,
  unit,
  colormap,
  colors,
}: {
  min: number;
  max: number;
  unit: string;
  colormap: string;
  colors: ReturnType<typeof useColors>;
}) {
  const getGradientColors = () => {
    switch (colormap) {
      case "coolwarm":
        return ["#3B4CC0", "#FFFFFF", "#B40426"];
      case "jet":
        return ["#00007F", "#0000FF", "#00FFFF", "#FFFF00", "#FF0000", "#7F0000"];
      case "viridis":
        return ["#440154", "#3B528B", "#21918C", "#5DC863", "#FDE725"];
      default:
        return ["#440154", "#FDE725"];
    }
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 8,
        padding: 12,
        marginTop: 12,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          color: colors.foreground,
          marginBottom: 8,
        }}
      >
        颜色条 ({unit})
      </Text>
      <View
        style={{
          height: 20,
          borderRadius: 4,
          flexDirection: "row",
          overflow: "hidden",
        }}
      >
        {getGradientColors().map((color, index) => (
          <View
            key={index}
            style={{
              flex: 1,
              backgroundColor: color,
            }}
          />
        ))}
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 4,
        }}
      >
        <Text style={{ fontSize: 10, color: colors.muted }}>{min.toFixed(1)}</Text>
        <Text style={{ fontSize: 10, color: colors.muted }}>
          {((min + max) / 2).toFixed(1)}
        </Text>
        <Text style={{ fontSize: 10, color: colors.muted }}>{max.toFixed(1)}</Text>
      </View>
    </View>
  );
}

// 地图控制按钮组件
function MapControls({
  onZoomIn,
  onZoomOut,
  onResetView,
  onLocate,
  colors,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onLocate: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        position: "absolute",
        right: 16,
        top: 100,
        gap: 8,
      }}
    >
      <TouchableOpacity
        onPress={onZoomIn}
        style={{
          backgroundColor: colors.surface,
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <MaterialIcons name="add" size={24} color={colors.foreground} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onZoomOut}
        style={{
          backgroundColor: colors.surface,
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <MaterialIcons name="remove" size={24} color={colors.foreground} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onResetView}
        style={{
          backgroundColor: colors.surface,
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <MaterialIcons name="crop-free" size={24} color={colors.foreground} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onLocate}
        style={{
          backgroundColor: colors.surface,
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <MaterialIcons name="my-location" size={24} color={colors.foreground} />
      </TouchableOpacity>
    </View>
  );
}

// 叠加层选择器组件
function OverlaySelector({
  overlays,
  selectedOverlay,
  onSelectOverlay,
  colors,
}: {
  overlays: InSAROverlay[];
  selectedOverlay: string | null;
  onSelectOverlay: (id: string | null) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: colors.foreground,
          marginBottom: 8,
        }}
      >
        叠加层
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={() => onSelectOverlay(null)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 16,
              backgroundColor:
                selectedOverlay === null ? colors.primary : colors.background,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: selectedOverlay === null ? "#FFFFFF" : colors.foreground,
              }}
            >
              无
            </Text>
          </TouchableOpacity>
          {overlays.map((overlay) => (
            <TouchableOpacity
              key={overlay.id}
              onPress={() => onSelectOverlay(overlay.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor:
                  selectedOverlay === overlay.id
                    ? colors.primary
                    : colors.background,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color:
                    selectedOverlay === overlay.id
                      ? "#FFFFFF"
                      : colors.foreground,
                }}
              >
                {overlay.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// 地图类型选择器
function MapTypeSelector({
  mapType,
  onSelectMapType,
  colors,
}: {
  mapType: MapType;
  onSelectMapType: (type: MapType) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const mapTypes: { type: MapType; label: string; icon: string }[] = [
    { type: "satellite", label: "卫星", icon: "satellite" },
    { type: "terrain", label: "地形", icon: "terrain" },
    { type: "street", label: "街道", icon: "map" },
  ];

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: colors.foreground,
          marginBottom: 8,
        }}
      >
        底图类型
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {mapTypes.map((item) => (
          <TouchableOpacity
            key={item.type}
            onPress={() => onSelectMapType(item.type)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor:
                mapType === item.type ? colors.primary : colors.background,
              alignItems: "center",
              gap: 4,
            }}
          >
            <MaterialIcons
              name={item.icon as any}
              size={20}
              color={mapType === item.type ? "#FFFFFF" : colors.foreground}
            />
            <Text
              style={{
                fontSize: 11,
                color: mapType === item.type ? "#FFFFFF" : colors.foreground,
              }}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// 透明度滑块
function OpacitySlider({
  value,
  onChange,
  colors,
}: {
  value: number;
  onChange: (value: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
          叠加层透明度
        </Text>
        <Text style={{ fontSize: 14, color: colors.muted }}>
          {Math.round(value * 100)}%
        </Text>
      </View>
      <View
        style={{
          height: 4,
          backgroundColor: colors.border,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${value * 100}%`,
            height: "100%",
            backgroundColor: colors.primary,
          }}
        />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <TouchableOpacity
            key={v}
            onPress={() => onChange(v)}
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 4,
              backgroundColor: Math.abs(value - v) < 0.1 ? colors.primary : colors.background,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                color: Math.abs(value - v) < 0.1 ? "#FFFFFF" : colors.muted,
              }}
            >
              {Math.round(v * 100)}%
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// 点击查询结果面板
function QueryResultPanel({
  result,
  onClose,
  colors,
}: {
  result: { lon: number; lat: number; value: number; unit: string } | null;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  if (!result) return null;

  return (
    <View
      style={{
        position: "absolute",
        bottom: 100,
        left: 16,
        right: 16,
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>
          查询结果
        </Text>
        <TouchableOpacity onPress={onClose}>
          <MaterialIcons name="close" size={20} color={colors.muted} />
        </TouchableOpacity>
      </View>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, color: colors.muted }}>经度</Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
            {result.lon.toFixed(6)}°
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, color: colors.muted }}>纬度</Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
            {result.lat.toFixed(6)}°
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, color: colors.muted }}>形变速率</Text>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: result.value > 0 ? colors.error : colors.success,
            }}
          >
            {result.value > 0 ? "+" : ""}
            {result.value.toFixed(2)} {result.unit}
          </Text>
        </View>
      </View>
    </View>
  );
}

// 模拟地图视图组件
function SimulatedMapView({
  mapType,
  overlay,
  opacity,
  zoom,
  center,
  onTap,
  colors,
}: {
  mapType: MapType;
  overlay: InSAROverlay | null;
  opacity: number;
  zoom: number;
  center: { lon: number; lat: number };
  onTap: (lon: number, lat: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const getMapBackground = () => {
    switch (mapType) {
      case "satellite":
        return "#1a3a1a";
      case "terrain":
        return "#e8dcc8";
      case "street":
        return "#f0f0f0";
    }
  };

  const getOverlayColor = () => {
    if (!overlay) return "transparent";
    switch (overlay.type) {
      case "velocity":
        return `rgba(180, 4, 38, ${opacity * 0.6})`;
      case "interferogram":
        return `rgba(255, 255, 0, ${opacity * 0.5})`;
      case "coherence":
        return `rgba(93, 200, 99, ${opacity * 0.5})`;
      default:
        return "transparent";
    }
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(0.5, Math.min(3, e.scale));
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    });

  const tapGesture = Gesture.Tap()
    .onEnd((e) => {
      // 模拟点击位置转换为经纬度
      const tapLon = center.lon + (e.x - SCREEN_WIDTH / 2) * 0.0001 / scale.value;
      const tapLat = center.lat - (e.y - 200) * 0.0001 / scale.value;
      onTap(tapLon, tapLat);
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View
          style={[
            {
              flex: 1,
              backgroundColor: getMapBackground(),
              overflow: "hidden",
            },
            animatedStyle,
          ]}
        >
          {/* 模拟地图网格 */}
          <View style={{ flex: 1, position: "relative" }}>
            {/* 网格线 */}
            {Array.from({ length: 10 }).map((_, i) => (
              <View
                key={`h-${i}`}
                style={{
                  position: "absolute",
                  top: `${i * 10}%`,
                  left: 0,
                  right: 0,
                  height: 1,
                  backgroundColor:
                    mapType === "satellite"
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(0,0,0,0.1)",
                }}
              />
            ))}
            {Array.from({ length: 10 }).map((_, i) => (
              <View
                key={`v-${i}`}
                style={{
                  position: "absolute",
                  left: `${i * 10}%`,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  backgroundColor:
                    mapType === "satellite"
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(0,0,0,0.1)",
                }}
              />
            ))}

            {/* InSAR 叠加层 */}
            {overlay && (
              <View
                style={{
                  position: "absolute",
                  top: "20%",
                  left: "20%",
                  right: "20%",
                  bottom: "30%",
                  backgroundColor: getOverlayColor(),
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: colors.primary,
                  opacity: opacity,
                }}
              >
                {/* 模拟形变图案 */}
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 30,
                      backgroundColor: "rgba(180, 4, 38, 0.8)",
                    }}
                  />
                  <View
                    style={{
                      position: "absolute",
                      width: 100,
                      height: 100,
                      borderRadius: 50,
                      borderWidth: 2,
                      borderColor: "rgba(180, 4, 38, 0.5)",
                    }}
                  />
                  <View
                    style={{
                      position: "absolute",
                      width: 140,
                      height: 140,
                      borderRadius: 70,
                      borderWidth: 2,
                      borderColor: "rgba(180, 4, 38, 0.3)",
                    }}
                  />
                </View>
              </View>
            )}

            {/* 中心标记 */}
            <View
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                marginLeft: -12,
                marginTop: -12,
              }}
            >
              <MaterialIcons name="add" size={24} color={colors.primary} />
            </View>

            {/* 坐标显示 */}
            <View
              style={{
                position: "absolute",
                bottom: 8,
                left: 8,
                backgroundColor: "rgba(0,0,0,0.6)",
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 4,
              }}
            >
              <Text style={{ fontSize: 10, color: "#FFFFFF" }}>
                {center.lat.toFixed(4)}°N, {center.lon.toFixed(4)}°E | 缩放: {zoom}
              </Text>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

export default function MapViewerScreen() {
  const router = useRouter();
  const colors = useColors();
  const { projectId } = useLocalSearchParams();

  // 状态
  const [mapType, setMapType] = useState<MapType>("satellite");
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.7);
  const [zoom, setZoom] = useState(10);
  const [center, setCenter] = useState({ lon: 37.0, lat: 37.5 });
  const [showControls, setShowControls] = useState(true);
  const [queryResult, setQueryResult] = useState<{
    lon: number;
    lat: number;
    value: number;
    unit: string;
  } | null>(null);

  // 模拟叠加层数据
  const overlays: InSAROverlay[] = [
    {
      id: "velocity",
      type: "velocity",
      name: "形变速率",
      bounds: { minLon: 36.5, minLat: 37.0, maxLon: 38.0, maxLat: 38.5 },
      statistics: { min: -50, max: 30, mean: -5.2, unit: "mm/yr" },
      colormap: "coolwarm",
    },
    {
      id: "interferogram",
      type: "interferogram",
      name: "干涉图",
      bounds: { minLon: 36.5, minLat: 37.0, maxLon: 38.0, maxLat: 38.5 },
      statistics: { min: -3.14, max: 3.14, mean: 0, unit: "rad" },
      colormap: "jet",
    },
    {
      id: "coherence",
      type: "coherence",
      name: "相干图",
      bounds: { minLon: 36.5, minLat: 37.0, maxLon: 38.0, maxLat: 38.5 },
      statistics: { min: 0, max: 1, mean: 0.65, unit: "" },
      colormap: "viridis",
    },
  ];

  const selectedOverlay = overlays.find((o) => o.id === selectedOverlayId) || null;

  // 地图控制函数
  const handleZoomIn = () => setZoom((z) => Math.min(z + 1, 18));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 1, 1));
  const handleResetView = () => {
    setZoom(10);
    setCenter({ lon: 37.0, lat: 37.5 });
  };
  const handleLocate = () => {
    // 定位到数据中心
    if (selectedOverlay) {
      const bounds = selectedOverlay.bounds;
      setCenter({
        lon: (bounds.minLon + bounds.maxLon) / 2,
        lat: (bounds.minLat + bounds.maxLat) / 2,
      });
    }
  };

  // 点击查询
  const handleMapTap = (lon: number, lat: number) => {
    if (selectedOverlay) {
      // 模拟查询结果
      const value = -10 + Math.random() * 20;
      setQueryResult({
        lon,
        lat,
        value,
        unit: selectedOverlay.statistics.unit,
      });
    }
  };

  return (
    <ScreenContainer className="p-0">
      <View style={{ backgroundColor: colors.background, flex: 1 }}>
        {/* Header */}
        <View
          style={{
            backgroundColor: colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 12,
            paddingTop: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#FFFFFF" }}>
            地图查看
          </Text>
          <TouchableOpacity onPress={() => setShowControls(!showControls)}>
            <MaterialIcons
              name={showControls ? "layers-clear" : "layers"}
              size={24}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>

        {/* 地图视图 */}
        <View style={{ flex: 1, position: "relative" }}>
          <SimulatedMapView
            mapType={mapType}
            overlay={selectedOverlay}
            opacity={opacity}
            zoom={zoom}
            center={center}
            onTap={handleMapTap}
            colors={colors}
          />

          {/* 地图控制按钮 */}
          <MapControls
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetView={handleResetView}
            onLocate={handleLocate}
            colors={colors}
          />

          {/* 查询结果面板 */}
          <QueryResultPanel
            result={queryResult}
            onClose={() => setQueryResult(null)}
            colors={colors}
          />
        </View>

        {/* 控制面板 */}
        {showControls && (
          <View
            style={{
              backgroundColor: colors.background,
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* 叠加层选择 */}
              <OverlaySelector
                overlays={overlays}
                selectedOverlay={selectedOverlayId}
                onSelectOverlay={setSelectedOverlayId}
                colors={colors}
              />

              {/* 底图类型 */}
              <MapTypeSelector
                mapType={mapType}
                onSelectMapType={setMapType}
                colors={colors}
              />

              {/* 透明度控制 */}
              {selectedOverlay && (
                <OpacitySlider
                  value={opacity}
                  onChange={setOpacity}
                  colors={colors}
                />
              )}

              {/* 颜色条 */}
              {selectedOverlay && (
                <ColorBar
                  min={selectedOverlay.statistics.min}
                  max={selectedOverlay.statistics.max}
                  unit={selectedOverlay.statistics.unit}
                  colormap={selectedOverlay.colormap}
                  colors={colors}
                />
              )}
            </ScrollView>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}
