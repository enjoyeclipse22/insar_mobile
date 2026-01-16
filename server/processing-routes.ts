/**
 * Processing-related tRPC routes
 * Handles starting, monitoring, and managing InSAR processing tasks
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { startProjectProcessing, getTaskStatus } from "./task-queue";
import { ProcessingConfig } from "./insar-processor";

export const processingRouter = router({
  /**
   * Start processing a project
   */
  startProcessing: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
        satellite: z.string(),
        orbitDirection: z.enum(["ascending", "descending"]),
        polarization: z.string(),
        coherenceThreshold: z.number().optional(),
        outputResolution: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Update project status to processing
      await db.updateProject(input.projectId, {
        status: "processing",
        progress: 0,
      });

      // Create processing configuration
      const config: ProcessingConfig = {
        projectId: input.projectId,
        startDate: input.startDate,
        endDate: input.endDate,
        satellite: input.satellite,
        orbitDirection: input.orbitDirection,
        polarization: input.polarization,
        coherenceThreshold: input.coherenceThreshold || 0.4,
        outputResolution: input.outputResolution || 30,
      };

      // Start async processing
      const taskId = await startProjectProcessing(input.projectId, config);

      return {
        success: true,
        taskId,
        projectId: input.projectId,
      };
    }),

  /**
   * Get processing task status
   */
  getTaskStatus: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(({ input }) => {
      const task = getTaskStatus(input.taskId);
      return task || { error: "Task not found" };
    }),

  /**
   * Get project processing logs
   */
  getProcessingLogs: protectedProcedure
    .input(z.object({ projectId: z.number(), limit: z.number().optional() }))
    .query(({ input }) => {
      return db.getProjectLogs(input.projectId, input.limit);
    }),

  /**
   * Get processing steps for a project
   */
  getProcessingSteps: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(({ input }) => {
      return db.getProjectSteps(input.projectId);
    }),

  /**
   * Get processing results for a project
   */
  getProcessingResults: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(({ input }) => {
      return db.getProjectResults(input.projectId);
    }),

  /**
   * Cancel processing task
   */
  cancelProcessing: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input }) => {
      await db.updateProject(input.projectId, {
        status: "failed",
      });

      await db.addProcessingLog({
        projectId: input.projectId,
        logLevel: "warning",
        message: "Processing cancelled by user",
      });

      return { success: true };
    }),
});
