/**
 * Task Queue Manager using Node.js event emitter
 * In production, this would use Celery/Redis for distributed processing
 */

import { EventEmitter } from "events";
import * as db from "./db";
import { startProcessing, ProcessingConfig } from "./insar-processor";

interface Task {
  id: string;
  projectId: number;
  type: "insar_processing";
  config: ProcessingConfig;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

class TaskQueue extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private processing: boolean = false;
  private queue: Task[] = [];

  /**
   * Add a new task to the queue
   */
  async addTask(projectId: number, config: ProcessingConfig): Promise<string> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const task: Task = {
      id: taskId,
      projectId,
      type: "insar_processing",
      config,
      status: "pending",
      createdAt: new Date(),
    };

    this.tasks.set(taskId, task);
    this.queue.push(task);

    await db.addProcessingLog({
      projectId,
      logLevel: "info",
      message: `Task ${taskId} added to queue`,
    });

    this.processQueue();
    return taskId;
  }

  /**
   * Process tasks in the queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      try {
        task.status = "processing";
        task.startedAt = new Date();

        await db.updateProject(task.projectId, {
          status: "processing",
          progress: 0,
        });

        await db.addProcessingLog({
          projectId: task.projectId,
          logLevel: "info",
          message: `Task ${task.id} started processing`,
        });

        // Execute the InSAR processing pipeline
        await startProcessing(task.config);

        task.status = "completed";
        task.completedAt = new Date();

        await db.addProcessingLog({
          projectId: task.projectId,
          logLevel: "info",
          message: `Task ${task.id} completed successfully`,
        });

        this.emit("task_completed", task);
      } catch (error) {
        task.status = "failed";
        task.completedAt = new Date();
        task.error = error instanceof Error ? error.message : String(error);

        await db.updateProject(task.projectId, {
          status: "failed",
        });

        await db.addProcessingLog({
          projectId: task.projectId,
          logLevel: "error",
          message: `Task ${task.id} failed: ${task.error}`,
        });

        this.emit("task_failed", task);
      }
    }

    this.processing = false;
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks for a project
   */
  getProjectTasks(projectId: number): Task[] {
    return Array.from(this.tasks.values()).filter((t) => t.projectId === projectId);
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === "pending") {
      this.queue = this.queue.filter((t) => t.id !== taskId);
      task.status = "failed";
      task.error = "Cancelled by user";
      return true;
    }

    return false;
  }
}

// Global task queue instance
export const taskQueue = new TaskQueue();

/**
 * Start processing a project asynchronously
 */
export async function startProjectProcessing(projectId: number, config: ProcessingConfig): Promise<string> {
  return taskQueue.addTask(projectId, config);
}

/**
 * Get task status
 */
export function getTaskStatus(taskId: string) {
  return taskQueue.getTaskStatus(taskId);
}

/**
 * Listen to task events
 */
export function onTaskCompleted(callback: (task: Task) => void) {
  taskQueue.on("task_completed", callback);
}

export function onTaskFailed(callback: (task: Task) => void) {
  taskQueue.on("task_failed", callback);
}
