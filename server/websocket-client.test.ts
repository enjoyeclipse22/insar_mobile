import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebSocketClient, LogMessage, ProgressUpdate, TaskCompletion } from "./websocket-client";

describe("WebSocketClient", () => {
  let client: WebSocketClient;

  beforeEach(() => {
    client = new WebSocketClient({
      url: "http://localhost:3001",
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 3,
    });
  });

  afterEach(() => {
    // Only disconnect if socket exists and has disconnect method
    if ((client as any).socket && typeof (client as any).socket.disconnect === 'function') {
      client.disconnect();
    }
  });

  it("should initialize with correct config", () => {
    expect(client).toBeDefined();
    expect(client.isConnectedToServer()).toBe(false);
    expect(client.getSubscribedTasks()).toHaveLength(0);
  });

  it("should track subscribed tasks", () => {
    const taskId = "task_1_12345";

    // Mock socket with disconnect method
    (client as any).socket = {
      emit: vi.fn(),
      disconnect: vi.fn(),
    };
    (client as any).isConnected = true;

    client.subscribeToTask(taskId);
    expect(client.getSubscribedTasks()).toContain(taskId);

    client.unsubscribeFromTask(taskId);
    expect(client.getSubscribedTasks()).not.toContain(taskId);
  });

  it("should not subscribe when not connected", () => {
    const taskId = "task_1_12345";

    (client as any).isConnected = false;
    (client as any).socket = { emit: vi.fn(), disconnect: vi.fn() };

    client.subscribeToTask(taskId);
    expect(client.getSubscribedTasks()).not.toContain(taskId);
  });

  it("should emit log message event", async () => {
    const logMessage: LogMessage = {
      taskId: "task_1_12345",
      timestamp: new Date().toISOString(),
      level: "info",
      message: "Test log message",
    };

    const logPromise = new Promise((resolve) => {
      client.on("task:log", (data) => {
        expect(data.taskId).toBe(logMessage.taskId);
        expect(data.message).toBe(logMessage.message);
        expect(data.level).toBe("info");
        resolve(data);
      });
    });

    (client as any).onTaskLog(logMessage);
    await logPromise;
  });

  it("should emit progress update event", async () => {
    const progressUpdate: ProgressUpdate = {
      taskId: "task_1_12345",
      timestamp: new Date().toISOString(),
      progress: 50,
      currentStep: "interferogram_generation",
      message: "Generating interferogram",
    };

    const progressPromise = new Promise((resolve) => {
      client.on("task:progress", (data) => {
        expect(data.taskId).toBe(progressUpdate.taskId);
        expect(data.progress).toBe(50);
        expect(data.currentStep).toBe("interferogram_generation");
        resolve(data);
      });
    });

    (client as any).onTaskProgress(progressUpdate);
    await progressPromise;
  });

  it("should emit task completion event", async () => {
    const completion: TaskCompletion = {
      taskId: "task_1_12345",
      timestamp: new Date().toISOString(),
      status: "completed",
      results: {
        interferogram: "./data/interferogram.tif",
        unwrappedPhase: "./data/unwrapped.tif",
      },
    };

    const completionPromise = new Promise((resolve) => {
      client.on("task:completed", (data) => {
        expect(data.taskId).toBe(completion.taskId);
        expect(data.status).toBe("completed");
        expect(data.results).toBeDefined();
        resolve(data);
      });
    });

    (client as any).onTaskCompleted(completion);
    await completionPromise;
  });

  it("should emit task failure event", async () => {
    const failure: TaskCompletion = {
      taskId: "task_1_12345",
      timestamp: new Date().toISOString(),
      status: "failed",
      error: "Data download failed",
    };

    const failurePromise = new Promise((resolve) => {
      client.on("task:failed", (data) => {
        expect(data.taskId).toBe(failure.taskId);
        expect(data.status).toBe("failed");
        expect(data.error).toBe("Data download failed");
        resolve(data);
      });
    });

    (client as any).onTaskFailed(failure);
    await failurePromise;
  });

  it("should emit connected event", async () => {
    const connectedPromise = new Promise((resolve) => {
      client.on("connected", () => {
        expect(client.isConnectedToServer()).toBe(true);
        resolve(true);
      });
    });

    (client as any).onConnect();
    await connectedPromise;
  });

  it("should emit disconnected event", async () => {
    (client as any).isConnected = true;

    const disconnectedPromise = new Promise((resolve) => {
      client.on("disconnected", () => {
        expect(client.isConnectedToServer()).toBe(false);
        resolve(true);
      });
    });

    (client as any).onDisconnect();
    await disconnectedPromise;
  });

  it("should handle multiple log messages", () => {
    const logs: LogMessage[] = [];

    client.on("task:log", (data) => {
      logs.push(data);
    });

    const messages = [
      {
        taskId: "task_1",
        timestamp: new Date().toISOString(),
        level: "info" as const,
        message: "Message 1",
      },
      {
        taskId: "task_1",
        timestamp: new Date().toISOString(),
        level: "debug" as const,
        message: "Message 2",
      },
      {
        taskId: "task_1",
        timestamp: new Date().toISOString(),
        level: "error" as const,
        message: "Message 3",
      },
    ];

    messages.forEach((msg) => (client as any).onTaskLog(msg));

    expect(logs).toHaveLength(3);
    expect(logs[0].level).toBe("info");
    expect(logs[1].level).toBe("debug");
    expect(logs[2].level).toBe("error");
  });

  it("should handle progress updates with different values", () => {
    const progressUpdates: ProgressUpdate[] = [];

    client.on("task:progress", (data) => {
      progressUpdates.push(data);
    });

    const updates = [
      {
        taskId: "task_1",
        timestamp: new Date().toISOString(),
        progress: 25,
        currentStep: "data_download",
        message: "Downloading data",
      },
      {
        taskId: "task_1",
        timestamp: new Date().toISOString(),
        progress: 50,
        currentStep: "coregistration",
        message: "Coregistering images",
      },
      {
        taskId: "task_1",
        timestamp: new Date().toISOString(),
        progress: 100,
        currentStep: "completed",
        message: "Processing complete",
      },
    ];

    updates.forEach((update) => (client as any).onTaskProgress(update));

    expect(progressUpdates).toHaveLength(3);
    expect(progressUpdates[0].progress).toBe(25);
    expect(progressUpdates[1].progress).toBe(50);
    expect(progressUpdates[2].progress).toBe(100);
  });

  it("should validate log message structure", () => {
    const logMessage: LogMessage = {
      taskId: "task_1_12345",
      timestamp: new Date().toISOString(),
      level: "warning",
      message: "Warning message",
    };

    expect(logMessage.taskId).toBeDefined();
    expect(logMessage.timestamp).toBeDefined();
    expect(logMessage.level).toBe("warning");
    expect(logMessage.message).toBeDefined();
  });

  it("should validate progress update structure", () => {
    const progressUpdate: ProgressUpdate = {
      taskId: "task_1_12345",
      timestamp: new Date().toISOString(),
      progress: 75,
      currentStep: "phase_unwrapping",
      message: "Unwrapping phase",
    };

    expect(progressUpdate.taskId).toBeDefined();
    expect(progressUpdate.progress).toBeGreaterThanOrEqual(0);
    expect(progressUpdate.progress).toBeLessThanOrEqual(100);
    expect(progressUpdate.currentStep).toBeDefined();
  });

  it("should validate task completion structure", () => {
    const completion: TaskCompletion = {
      taskId: "task_1_12345",
      timestamp: new Date().toISOString(),
      status: "completed",
      results: {
        interferogram: "path/to/interferogram.tif",
        unwrappedPhase: "path/to/unwrapped.tif",
        deformation: "path/to/deformation.tif",
      },
    };

    expect(completion.taskId).toBeDefined();
    expect(completion.status).toBe("completed");
    expect(completion.results).toBeDefined();
    if (completion.results) {
      expect(completion.results.interferogram).toBeDefined();
    }
  });
});
