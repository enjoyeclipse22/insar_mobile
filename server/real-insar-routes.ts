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
 * 真实 InSAR 处理路由
 */
export const realInsarRouter = router({
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
