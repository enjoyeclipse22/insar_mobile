/**
 * 真实 InSAR 处理 API 路由
 * 提供 WebSocket 实时日志流和处理控制接口
 * 使用 RealInSARProcessor 进行真实处理
 */

import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { RealInSARProcessor, ProcessingConfig, ProcessingLog, ProcessingResult } from "./real-insar-processor";

// 处理任务存储
interface ProcessingTask {
  id: string;
  projectId: number;
  projectName: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  currentStep: string;
  logs: ProcessingLog[];
  startTime: Date;
  endTime?: Date;
  error?: string;
  processor?: RealInSARProcessor;
  result?: ProcessingResult;
}

const processingTasks = new Map<string, ProcessingTask>();

/**
 * 启动真实 InSAR 处理
 */
async function startRealProcessing(
  projectId: number,
  projectName: string,
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  },
  startDate: string,
  endDate: string,
  satellite: string,
  orbitDirection: string,
  polarization: string
): Promise<string> {
  const taskId = `task_${projectId}_${Date.now()}`;

  // 创建处理配置
  const config: ProcessingConfig = {
    projectId: taskId,
    projectName: projectName || `项目 ${projectId}`,
    bounds,
    startDate: startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    endDate: endDate || new Date().toISOString().split("T")[0],
    satellite: (satellite as "Sentinel-1A" | "Sentinel-1B" | "Sentinel-1") || "Sentinel-1",
    orbitDirection: (orbitDirection as "ascending" | "descending" | "both") || "both",
    polarization: (polarization as "VV" | "VH" | "VV+VH") || "VV+VH",
    resolution: 30,
    coherenceThreshold: 0.3,
  };

  // 创建处理器
  const processor = new RealInSARProcessor(config);

  const task: ProcessingTask = {
    id: taskId,
    projectId,
    projectName: config.projectName,
    status: "pending",
    progress: 0,
    currentStep: "初始化",
    logs: [],
    startTime: new Date(),
    processor,
  };

  processingTasks.set(taskId, task);

  // 监听日志事件
  processor.on("log", (log: ProcessingLog) => {
    task.logs.push(log);
    task.currentStep = log.step;
    if (log.progress !== undefined) {
      task.progress = log.progress;
    }
  });

  // 异步执行处理
  (async () => {
    try {
      task.status = "processing";

      // 运行真实 InSAR 处理
      const result = await processor.process();

      // 更新任务状态
      task.status = result.success ? "completed" : "failed";
      task.progress = result.success ? 100 : task.progress;
      task.endTime = result.endTime;
      task.error = result.error;
      task.result = result;
    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.endTime = new Date();
    }
  })();

  return taskId;
}

/**
 * 取消处理
 */
function cancelProcessing(taskId: string): boolean {
  const task = processingTasks.get(taskId);
  if (!task) {
    return false;
  }

  if (task.processor) {
    task.processor.cancel();
  }

  task.status = "cancelled";
  task.endTime = new Date();

  return true;
}

/**
 * 检查数据可用性（不下载，只查询）
 */
async function checkDataAvailability(
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  },
  startDate: string,
  endDate: string,
  satellite: string,
  orbitDirection: string
): Promise<{
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
}> {
  const ASF_API_TOKEN = process.env.ASF_API_TOKEN;
  if (!ASF_API_TOKEN) {
    return {
      available: false,
      productCount: 0,
      products: [],
      dateRange: null,
      orbitDirections: [],
      message: "ASF API Token 未配置",
      recommendation: "请在设置中配置 ASF API Token",
    };
  }

  // 构建搜索参数
  const searchParams = new URLSearchParams({
    platform: satellite === "Sentinel-1" ? "Sentinel-1" : satellite,
    processingLevel: "SLC",
    beamMode: "IW",
    bbox: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    start: startDate,
    end: endDate,
    maxResults: "50",
    output: "json",
  });

  const searchUrl = `https://api.daac.asf.alaska.edu/services/search/param?${searchParams.toString()}`;

  try {
    const response = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${ASF_API_TOKEN}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        available: false,
        productCount: 0,
        products: [],
        dateRange: null,
        orbitDirections: [],
        message: `ASF API 请求失败: HTTP ${response.status}`,
        recommendation: "请检查网络连接或 API Token 是否有效",
      };
    }

    let results = await response.json();
    
    // 展平双层嵌套数组
    if (Array.isArray(results) && results.length > 0 && Array.isArray(results[0])) {
      results = results.flat(2);
    }

    if (!Array.isArray(results) || results.length === 0) {
      return {
        available: false,
        productCount: 0,
        products: [],
        dateRange: null,
        orbitDirections: [],
        message: "未找到符合条件的 Sentinel-1 数据",
        recommendation: "建议扩大时间范围或区域范围，或检查时间范围是否为过去日期",
      };
    }

    // 解析产品信息
    const products = results.map((r: any) => ({
      name: r.granuleName || r.fileName || "unknown",
      date: r.startTime ? r.startTime.split("T")[0] : "unknown",
      orbit: r.flightDirection || "unknown",
      polarization: r.polarization || "VV",
    }));

    // 统计日期范围
    const dates = products
      .map((p: any) => p.date)
      .filter((d: string) => d !== "unknown")
      .sort();
    const dateRange = dates.length > 0 ? { earliest: dates[0], latest: dates[dates.length - 1] } : null;

    // 统计轨道方向
    const orbitDirections = [...new Set(products.map((p: any) => p.orbit).filter((o: string) => o !== "unknown"))];

    // 判断数据是否充足
    const productCount = results.length;
    const available = productCount >= 2;

    let message: string;
    let recommendation: string;

    if (productCount === 0) {
      message = "未找到任何 Sentinel-1 数据";
      recommendation = "请检查时间范围是否为过去日期，或扩大搜索区域";
    } else if (productCount === 1) {
      message = "只找到 1 个产品，无法进行干涉处理";
      recommendation = "干涉处理需要至少 2 个产品，请扩大时间范围";
    } else if (productCount < 5) {
      message = `找到 ${productCount} 个产品，可以进行基础干涉处理`;
      recommendation = "建议扩大时间范围以获取更多数据，提高处理质量";
    } else {
      message = `找到 ${productCount} 个产品，数据充足`;
      recommendation = "可以开始 InSAR 处理";
    }

    return {
      available,
      productCount,
      products: products.slice(0, 10), // 只返回前 10 个
      dateRange,
      orbitDirections,
      message,
      recommendation,
    };
  } catch (error) {
    return {
      available: false,
      productCount: 0,
      products: [],
      dateRange: null,
      orbitDirections: [],
      message: `查询失败: ${error instanceof Error ? error.message : "未知错误"}`,
      recommendation: "请检查网络连接",
    };
  }
}

/**
 * 真实 InSAR 处理路由
 */
export const realInsarRouter = router({
  // 数据可用性检查（预检）
  checkDataAvailability: publicProcedure
    .input(
      z.object({
        bounds: z.object({
          north: z.number(),
          south: z.number(),
          east: z.number(),
          west: z.number(),
        }),
        startDate: z.string(),
        endDate: z.string(),
        satellite: z.string().optional().default("Sentinel-1"),
        orbitDirection: z.string().optional().default("both"),
      })
    )
    .query(async ({ input }) => {
      return await checkDataAvailability(
        input.bounds,
        input.startDate,
        input.endDate,
        input.satellite,
        input.orbitDirection
      );
    }),

  // 启动处理
  startProcessing: publicProcedure
    .input(
      z.object({
        projectId: z.number(),
        projectName: z.string().optional(),
        bounds: z.object({
          north: z.number(),
          south: z.number(),
          east: z.number(),
          west: z.number(),
        }),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        satellite: z.string().optional(),
        orbitDirection: z.string().optional(),
        polarization: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const taskId = await startRealProcessing(
        input.projectId,
        input.projectName || `项目 ${input.projectId}`,
        input.bounds,
        input.startDate || "",
        input.endDate || "",
        input.satellite || "Sentinel-1",
        input.orbitDirection || "both",
        input.polarization || "VV+VH"
      );
      return { taskId, message: "处理已启动" };
    }),

  // 获取处理状态
  getStatus: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(({ input }) => {
      const task = processingTasks.get(input.taskId);
      if (!task) {
        return null;
      }

      return {
        id: task.id,
        projectId: task.projectId,
        projectName: task.projectName,
        status: task.status,
        progress: task.progress,
        currentStep: task.currentStep,
        startTime: task.startTime,
        endTime: task.endTime,
        error: task.error,
        logCount: task.logs.length,
      };
    }),

  // 获取处理日志
  getLogs: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
        offset: z.number().optional().default(0),
        limit: z.number().optional().default(100),
      })
    )
    .query(({ input }) => {
      const task = processingTasks.get(input.taskId);
      if (!task) {
        return { logs: [], total: 0 };
      }

      const logs = task.logs.slice(input.offset, input.offset + input.limit);
      return {
        logs,
        total: task.logs.length,
      };
    }),

  // 取消处理
  cancelProcessing: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(({ input }) => {
      const success = cancelProcessing(input.taskId);
      return { success, message: success ? "处理已取消" : "任务不存在" };
    }),

  // 获取处理结果
  getResult: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(({ input }) => {
      const task = processingTasks.get(input.taskId);
      if (!task || !task.result) {
        return null;
      }

      return task.result;
    }),

  // 列出所有任务
  listTasks: publicProcedure.query(() => {
    const tasks: Array<{
      id: string;
      projectId: number;
      projectName: string;
      status: string;
      progress: number;
      currentStep: string;
      startTime: Date;
      endTime?: Date;
    }> = [];

    processingTasks.forEach((task) => {
      tasks.push({
        id: task.id,
        projectId: task.projectId,
        projectName: task.projectName,
        status: task.status,
        progress: task.progress,
        currentStep: task.currentStep,
        startTime: task.startTime,
        endTime: task.endTime,
      });
    });

    return tasks.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }),

  // 运行重庆测试
  runChongqingTest: publicProcedure.mutation(async () => {
    const { runChongqingTest } = await import("./real-insar-processor");
    const result = await runChongqingTest();
    return result;
  }),
});
