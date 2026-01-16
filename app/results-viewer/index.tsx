import { ScrollView, Text, View, TouchableOpacity, Dimensions } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useEffect } from "react";
import { Image as ExpoImage } from "expo-image";

interface ProcessingResult {
  id: number;
  resultType: "interferogram" | "coherence" | "deformation" | "dem" | "unwrapped_phase" | "los_displacement";
  fileName: string;
  fileSize: number;
  format: string;
  minValue?: string;
  maxValue?: string;
  meanValue?: string;
  createdAt: string;
  imagePath?: string;
}

const { width: screenWidth } = Dimensions.get("window");

export default function ResultsViewerScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams();
  const projectId = params.projectId as string;

  const [selectedResult, setSelectedResult] = useState<ProcessingResult | null>(null);
  const [colorScale, setColorScale] = useState<"viridis" | "jet" | "gray">("viridis");
  const [imageLoading, setImageLoading] = useState(false);

  // 真实的处理结果，使用生成的图像
  const results: ProcessingResult[] = [
    {
      id: 1,
      resultType: "interferogram",
      fileName: "interferogram.png",
      fileSize: 1494719,
      format: "PNG",
      minValue: "-π",
      maxValue: "π",
      createdAt: new Date().toISOString(),
      imagePath: "/insar-results/interferogram.png",
    },
    {
      id: 2,
      resultType: "coherence",
      fileName: "coherence.png",
      fileSize: 675235,
      format: "PNG",
      minValue: "0.0",
      maxValue: "1.0",
      createdAt: new Date().toISOString(),
      imagePath: "/insar-results/coherence.png",
    },
    {
      id: 3,
      resultType: "unwrapped_phase",
      fileName: "unwrapped_phase.png",
      fileSize: 823068,
      format: "PNG",
      minValue: "-150 rad",
      maxValue: "150 rad",
      createdAt: new Date().toISOString(),
      imagePath: "/insar-results/unwrapped_phase.png",
    },
    {
      id: 4,
      resultType: "deformation",
      fileName: "deformation.png",
      fileSize: 1099041,
      format: "PNG",
      minValue: "-671 mm",
      maxValue: "701 mm",
      meanValue: "28 mm",
      createdAt: new Date().toISOString(),
      imagePath: "/insar-results/deformation.png",
    },
  ];

  // 默认选中第一个结果
  useEffect(() => {
    if (results.length > 0 && !selectedResult) {
      setSelectedResult(results[0]);
    }
  }, []);

  const getResultLabel = (type: string) => {
    const labels: Record<string, string> = {
      interferogram: "干涉图",
      coherence: "相干图",
      deformation: "形变图",
      dem: "DEM",
      unwrapped_phase: "解缠相位",
      los_displacement: "LOS 位移",
    };
    return labels[type] || type;
  };

  const getResultDescription = (type: string) => {
    const descriptions: Record<string, string> = {
      interferogram: "显示地震前后相位差异的条纹图案，每个条纹周期代表约2.8cm的形变",
      coherence: "表示两幅SAR影像的相似程度，亮区域表示高相干性",
      deformation: "地表形变量，红色表示远离卫星（下沉），蓝色表示靠近卫星（抬升）",
      unwrapped_phase: "解缠后的连续相位值，用于计算实际形变量",
    };
    return descriptions[type] || "";
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case "interferogram":
        return "image";
      case "coherence":
        return "blur-on";
      case "deformation":
        return "trending-up";
      case "dem":
        return "terrain";
      case "unwrapped_phase":
        return "waves";
      case "los_displacement":
        return "arrow-forward";
      default:
        return "image";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const renderResult = (result: ProcessingResult) => (
    <TouchableOpacity
      key={result.id}
      onPress={() => {
        setSelectedResult(result);
        setImageLoading(true);
      }}
      style={{
        marginBottom: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: selectedResult?.id === result.id ? colors.primary : colors.surface,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: selectedResult?.id === result.id ? colors.primary : colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <MaterialIcons
          name={getResultIcon(result.resultType)}
          size={20}
          color={selectedResult?.id === result.id ? "#FFFFFF" : colors.primary}
        />
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: selectedResult?.id === result.id ? "#FFFFFF" : colors.foreground,
            marginLeft: 8,
            flex: 1,
          }}
        >
          {getResultLabel(result.resultType)}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: selectedResult?.id === result.id ? "#FFFFFF" : colors.muted,
          }}
        >
          {formatFileSize(result.fileSize)}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 12,
          color: selectedResult?.id === result.id ? "#FFFFFF" : colors.muted,
        }}
      >
        {result.fileName} • {result.format}
      </Text>
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
            处理结果
          </Text>
          <TouchableOpacity>
            <MaterialIcons name="download" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* 数据信息横幅 */}
        <View
          style={{
            backgroundColor: colors.surface,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary, marginBottom: 4 }}>
            土耳其地震区域 InSAR 分析
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>
            主影像: 2023-02-04 | 从影像: 2023-02-09 | 形变范围: -671 ~ 701 mm
          </Text>
        </View>

        <ScrollView style={{ flex: 1 }}>
          {/* Visualization Area */}
          {selectedResult ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
              {/* 图像显示区域 */}
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  overflow: "hidden",
                  marginBottom: 16,
                }}
              >
                {selectedResult.imagePath ? (
                  <ExpoImage
                    source={{ uri: selectedResult.imagePath }}
                    style={{
                      width: screenWidth - 32,
                      height: (screenWidth - 32) * 0.8,
                    }}
                    contentFit="contain"
                    onLoadStart={() => setImageLoading(true)}
                    onLoadEnd={() => setImageLoading(false)}
                    transition={200}
                  />
                ) : (
                  <View
                    style={{
                      width: screenWidth - 32,
                      height: (screenWidth - 32) * 0.8,
                      backgroundColor: colors.border,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <MaterialIcons name={getResultIcon(selectedResult.resultType)} size={64} color={colors.muted} />
                    <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12 }}>
                      {getResultLabel(selectedResult.resultType)} 预览
                    </Text>
                  </View>
                )}
                
                {/* 图像加载指示器 */}
                {imageLoading && (
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: "rgba(0,0,0,0.3)",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 14 }}>加载中...</Text>
                  </View>
                )}
              </View>

              {/* 结果描述 */}
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>
                  {getResultLabel(selectedResult.resultType)}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
                  {getResultDescription(selectedResult.resultType)}
                </Text>
              </View>

              {/* Result Details */}
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 12 }}>
                  数值信息
                </Text>

                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {selectedResult.minValue && (
                    <View style={{ width: "50%", marginBottom: 12 }}>
                      <Text style={{ fontSize: 11, color: colors.muted }}>最小值</Text>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginTop: 2 }}>
                        {selectedResult.minValue}
                      </Text>
                    </View>
                  )}

                  {selectedResult.maxValue && (
                    <View style={{ width: "50%", marginBottom: 12 }}>
                      <Text style={{ fontSize: 11, color: colors.muted }}>最大值</Text>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginTop: 2 }}>
                        {selectedResult.maxValue}
                      </Text>
                    </View>
                  )}

                  {selectedResult.meanValue && (
                    <View style={{ width: "50%", marginBottom: 12 }}>
                      <Text style={{ fontSize: 11, color: colors.muted }}>平均值</Text>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginTop: 2 }}>
                        {selectedResult.meanValue}
                      </Text>
                    </View>
                  )}

                  <View style={{ width: "50%", marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>文件大小</Text>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginTop: 2 }}>
                      {formatFileSize(selectedResult.fileSize)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Color Scale Selection */}
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 12 }}>
                  颜色方案
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["viridis", "jet", "gray"] as const).map((scale) => (
                    <TouchableOpacity
                      key={scale}
                      onPress={() => setColorScale(scale)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        backgroundColor: colorScale === scale ? colors.primary : colors.border,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: colorScale === scale ? "#FFFFFF" : colors.foreground,
                          textTransform: "capitalize",
                        }}
                      >
                        {scale}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Action Buttons */}
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: colors.primary,
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <MaterialIcons name="download" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFFFFF" }}>
                    下载
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.push("/map-viewer")}
                  style={{
                    flex: 1,
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
                  <MaterialIcons name="map" size={20} color={colors.primary} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary }}>
                    地图叠加
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 24, paddingVertical: 32 }}>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center" }}>
                请选择一个结果进行查看
              </Text>
            </View>
          )}

          {/* Results List */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 12 }}>
              全部结果
            </Text>
            {results.map(renderResult)}
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
