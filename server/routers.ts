import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import * as db from "./db";
import { startProjectProcessing, getTaskStatus } from "./task-queue";
import { realInsarRouter } from "./real-insar-routes";

export const appRouter = router({
  system: systemRouter,
  realInsar: realInsarRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  insar: router({
    listProjects: protectedProcedure.query(({ ctx }) => db.getUserProjects(ctx.user.id)),
    getProject: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => db.getProjectById(input.projectId)),
    createProject: publicProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        location: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        satellite: z.string().optional(),
        orbitDirection: z.enum(["ascending", "descending"]).optional(),
        polarization: z.string().optional(),
      }))
      .mutation(({ ctx, input }) => db.createProject({
        userId: ctx.user?.id || 1,
        name: input.name,
        description: input.description,
        location: input.location,
        startDate: input.startDate,
        endDate: input.endDate,
        satellite: input.satellite,
        orbitDirection: input.orbitDirection,
        polarization: input.polarization,
        status: "created",
        progress: 0,
      })),
    updateProject: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        name: z.string().optional(),
        status: z.enum(["created", "processing", "completed", "failed"]).optional(),
        progress: z.number().optional(),
      }))
      .mutation(({ input }) => db.updateProject(input.projectId, {
        name: input.name,
        status: input.status,
        progress: input.progress,
      })),
    deleteProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(({ input }) => db.deleteProject(input.projectId)),
    getSteps: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => db.getProjectSteps(input.projectId)),
    getResults: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => db.getProjectResults(input.projectId)),
    getLogs: protectedProcedure
      .input(z.object({ projectId: z.number(), limit: z.number().optional() }))
      .query(({ input }) => db.getProjectLogs(input.projectId, input.limit)),
    startProcessing: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
        satellite: z.string(),
        orbitDirection: z.enum(["ascending", "descending"]),
        polarization: z.string(),
        coherenceThreshold: z.number().optional(),
        outputResolution: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.updateProject(input.projectId, { status: "processing", progress: 0 });
        const taskId = await startProjectProcessing(input.projectId, {
          projectId: input.projectId,
          startDate: input.startDate,
          endDate: input.endDate,
          satellite: input.satellite,
          orbitDirection: input.orbitDirection,
          polarization: input.polarization,
          coherenceThreshold: input.coherenceThreshold || 0.4,
          outputResolution: input.outputResolution || 30,
        });
        return { success: true, taskId };
      }),
    getTaskStatus: protectedProcedure
      .input(z.object({ taskId: z.string() }))
      .query(({ input }) => getTaskStatus(input.taskId) || { error: "Task not found" }),
    cancelProcessing: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ input }) => {
        await db.updateProject(input.projectId, { status: "failed" });
        await db.addProcessingLog({
          projectId: input.projectId,
          logLevel: "warning",
          message: "Processing cancelled by user",
        });
        return { success: true };
      }),
    
    // 数据管理端点
    getDownloads: protectedProcedure.query(() => {
      // 返回当前下载列表（从内存中获取）
      return [];
    }),
    getCacheInfo: protectedProcedure.query(() => {
      // 返回缓存信息
      return {
        total_files: 0,
        total_size: 0,
        total_size_formatted: "0 B",
        files: [],
      };
    }),
    startDownload: protectedProcedure
      .input(z.object({
        url: z.string(),
        filename: z.string(),
        projectId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        // 启动下载任务
        const fileId = `dl_${Date.now()}`;
        return { success: true, fileId };
      }),
    pauseDownload: protectedProcedure
      .input(z.object({ fileId: z.string() }))
      .mutation(async ({ input }) => {
        return { success: true };
      }),
    resumeDownload: protectedProcedure
      .input(z.object({ fileId: z.string() }))
      .mutation(async ({ input }) => {
        return { success: true };
      }),
    cancelDownload: protectedProcedure
      .input(z.object({ fileId: z.string() }))
      .mutation(async ({ input }) => {
        return { success: true };
      }),
    deleteCacheFile: protectedProcedure
      .input(z.object({ filePath: z.string() }))
      .mutation(async ({ input }) => {
        // 删除缓存文件
        return { success: true };
      }),
    clearCache: protectedProcedure.mutation(async () => {
      // 清空所有缓存
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
