/**
 * 数据可用性预检组件
 * 在处理前检查所选区域的 Sentinel-1 数据可用性
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { getApiBaseUrl } from "@/constants/oauth";

interface DataAvailabilityResult {
  available: boolean;
  productCount: number;
  products: Array<{
    name: string;
    date: string;
    orbit: string;
    polarization: string;
  }>;
  dateRange: { earliest: string; latest: string } | null;
  orbitDirections: string[];
  message: string;
  recommendation: string;
}

interface DataAvailabilityCheckProps {
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  startDate: string;
  endDate: string;
  satellite?: string;
  orbitDirection?: string;
  onResult?: (result: DataAvailabilityResult) => void;
  autoCheck?: boolean;
}

export function DataAvailabilityCheck({
  bounds,
  startDate,
  endDate,
  satellite = "Sentinel-1",
  orbitDirection = "both",
  onResult,
  autoCheck = true,
}: DataAvailabilityCheckProps) {
  const colors = useColors();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DataAvailabilityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const checkAvailability = async () => {
    setLoading(true);
    setError(null);

    try {
      const apiBaseUrl = getApiBaseUrl();
      const input = JSON.stringify({
        json: {
          bounds,
          startDate,
          endDate,
          satellite,
          orbitDirection,
        },
      });

      const response = await fetch(
        `${apiBaseUrl}/api/trpc/realInsar.checkDataAvailability?input=${encodeURIComponent(input)}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const checkResult = data?.result?.data?.json as DataAvailabilityResult;

      if (checkResult) {
        setResult(checkResult);
        onResult?.(checkResult);
      } else {
        throw new Error("无效的响应格式");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "检查失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoCheck && bounds && startDate && endDate) {
      checkAvailability();
    }
  }, [bounds.north, bounds.south, bounds.east, bounds.west, startDate, endDate, satellite, orbitDirection]);

  const getStatusColor = () => {
    if (!result) return colors.muted;
    if (result.productCount === 0) return colors.error;
    if (result.productCount === 1) return colors.warning;
    if (result.productCount < 5) return colors.warning;
    return colors.success;
  };

  const getStatusIcon = (): keyof typeof Ionicons.glyphMap => {
    if (!result) return "help-circle-outline";
    if (result.productCount === 0) return "close-circle";
    if (result.productCount === 1) return "warning";
    if (result.productCount < 5) return "alert-circle";
    return "checkmark-circle";
  };

  if (loading) {
    return (
      <View className="bg-surface rounded-xl p-4 border border-border">
        <View className="flex-row items-center gap-3">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text className="text-foreground">正在检查数据可用性...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View className="bg-surface rounded-xl p-4 border border-border">
        <View className="flex-row items-center gap-3">
          <Ionicons name="alert-circle" size={24} color={colors.error} />
          <View className="flex-1">
            <Text className="text-foreground font-medium">检查失败</Text>
            <Text className="text-muted text-sm">{error}</Text>
          </View>
          <TouchableOpacity
            onPress={checkAvailability}
            className="bg-primary px-3 py-1.5 rounded-lg"
          >
            <Text className="text-background text-sm">重试</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!result) {
    return (
      <View className="bg-surface rounded-xl p-4 border border-border">
        <TouchableOpacity
          onPress={checkAvailability}
          className="flex-row items-center justify-center gap-2"
        >
          <Ionicons name="search" size={20} color={colors.primary} />
          <Text className="text-primary font-medium">检查数据可用性</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-xl border border-border overflow-hidden">
      {/* 头部状态 */}
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        className="p-4 flex-row items-center gap-3"
        style={{ backgroundColor: result.available ? `${colors.success}10` : `${colors.warning}10` }}
      >
        <Ionicons name={getStatusIcon()} size={28} color={getStatusColor()} />
        <View className="flex-1">
          <Text className="text-foreground font-semibold">{result.message}</Text>
          <Text className="text-muted text-sm mt-0.5">{result.recommendation}</Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.muted}
        />
      </TouchableOpacity>

      {/* 详细信息 */}
      {expanded && (
        <View className="p-4 border-t border-border">
          {/* 统计信息 */}
          <View className="flex-row gap-4 mb-4">
            <View className="flex-1 bg-background rounded-lg p-3">
              <Text className="text-muted text-xs">产品数量</Text>
              <Text className="text-foreground text-xl font-bold">{result.productCount}</Text>
            </View>
            {result.dateRange && (
              <View className="flex-1 bg-background rounded-lg p-3">
                <Text className="text-muted text-xs">时间范围</Text>
                <Text className="text-foreground text-sm font-medium">
                  {result.dateRange.earliest}
                </Text>
                <Text className="text-muted text-xs">至 {result.dateRange.latest}</Text>
              </View>
            )}
          </View>

          {/* 轨道方向 */}
          {result.orbitDirections.length > 0 && (
            <View className="mb-4">
              <Text className="text-muted text-xs mb-2">可用轨道方向</Text>
              <View className="flex-row gap-2">
                {result.orbitDirections.map((dir) => (
                  <View key={dir} className="bg-primary/10 px-3 py-1 rounded-full">
                    <Text className="text-primary text-sm">
                      {dir === "ASCENDING" ? "升轨" : dir === "DESCENDING" ? "降轨" : dir}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 产品列表 */}
          {result.products.length > 0 && (
            <View>
              <Text className="text-muted text-xs mb-2">最近产品（前 {result.products.length} 个）</Text>
              <ScrollView style={{ maxHeight: 200 }}>
                {result.products.map((product, index) => (
                  <View
                    key={index}
                    className="bg-background rounded-lg p-3 mb-2"
                  >
                    <Text className="text-foreground text-sm font-medium" numberOfLines={1}>
                      {product.name}
                    </Text>
                    <View className="flex-row gap-4 mt-1">
                      <Text className="text-muted text-xs">📅 {product.date}</Text>
                      <Text className="text-muted text-xs">
                        🛰️ {product.orbit === "ASCENDING" ? "升轨" : product.orbit === "DESCENDING" ? "降轨" : product.orbit}
                      </Text>
                      <Text className="text-muted text-xs">📡 {product.polarization}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 刷新按钮 */}
          <TouchableOpacity
            onPress={checkAvailability}
            className="mt-4 flex-row items-center justify-center gap-2 py-2"
          >
            <Ionicons name="refresh" size={16} color={colors.primary} />
            <Text className="text-primary text-sm">重新检查</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
