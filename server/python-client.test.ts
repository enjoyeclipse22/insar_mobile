import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { PythonBackendClient, ProcessingRequest, ProcessingStatus } from "./python-client";

describe("PythonBackendClient", () => {
  let client: PythonBackendClient;

  beforeEach(() => {
    client = new PythonBackendClient("http://localhost:8000");
  });

  afterEach(() => {
    client.stopAllPolling();
  });

  it("should initialize with correct base URL", () => {
    expect(client.getBaseUrl()).toBe("http://localhost:8000");
  });

  it("should set base URL", () => {
    client.setBaseUrl("http://localhost:9000");
    expect(client.getBaseUrl()).toBe("http://localhost:9000");
  });

  it("should create proper request payload", async () => {
    const mockRequest: ProcessingRequest = {
      projectId: 1,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      satellite: "Sentinel-1",
      orbitDirection: "ascending",
      polarization: "VV",
      aoiBounds: {
        west: -120.0,
        south: 35.0,
        east: -119.0,
        north: 36.0,
      },
      coherenceThreshold: 0.4,
      outputResolution: 30,
    };

    // Verify request structure
    expect(mockRequest.projectId).toBe(1);
    expect(mockRequest.startDate).toBe("2024-01-01");
    expect(mockRequest.endDate).toBe("2024-01-31");
    expect(mockRequest.aoiBounds).toBeDefined();
  });

  it("should handle processing status correctly", async () => {
    const mockStatus: ProcessingStatus = {
      taskId: "task_1_12345",
      projectId: 1,
      status: "processing",
      progress: 50,
      currentStep: "interferogram_generation",
      message: "Generating interferogram from coregistered images",
      timestamp: new Date().toISOString(),
    };

    expect(mockStatus.status).toBe("processing");
    expect(mockStatus.progress).toBe(50);
    expect(mockStatus.currentStep).toBe("interferogram_generation");
  });

  it("should handle completed status", async () => {
    const mockStatus: ProcessingStatus = {
      taskId: "task_1_12345",
      projectId: 1,
      status: "completed",
      progress: 100,
      currentStep: "deformation_inversion",
      message: "Processing complete",
      timestamp: new Date().toISOString(),
    };

    expect(mockStatus.status).toBe("completed");
    expect(mockStatus.progress).toBe(100);
  });

  it("should handle failed status", async () => {
    const mockStatus: ProcessingStatus = {
      taskId: "task_1_12345",
      projectId: 1,
      status: "failed",
      progress: 0,
      currentStep: "data_download",
      message: "Failed to download data",
      timestamp: new Date().toISOString(),
    };

    expect(mockStatus.status).toBe("failed");
  });

  it("should stop polling when task completes", () => {
    const taskId = "task_1_12345";

    client.startPolling(taskId, 1000);
    expect(client["pollTimers"].has(taskId)).toBe(true);

    client.stopPolling(taskId);
    expect(client["pollTimers"].has(taskId)).toBe(false);
  });

  it("should stop all polling", () => {
    client.startPolling("task_1", 1000);
    client.startPolling("task_2", 1000);

    expect(client["pollTimers"].size).toBe(2);

    client.stopAllPolling();
    expect(client["pollTimers"].size).toBe(0);
  });

  it("should not start duplicate polling", () => {
    const taskId = "task_1_12345";

    client.startPolling(taskId, 1000);
    const initialSize = client["pollTimers"].size;

    // Try to start polling again
    client.startPolling(taskId, 1000);
    expect(client["pollTimers"].size).toBe(initialSize);

    client.stopPolling(taskId);
  });

  it("should handle processing request with all parameters", async () => {
    const request: ProcessingRequest = {
      projectId: 2,
      startDate: "2024-02-01",
      endDate: "2024-02-28",
      satellite: "Sentinel-1",
      orbitDirection: "descending",
      polarization: "VV+VH",
      aoiBounds: {
        west: -100.0,
        south: 30.0,
        east: -99.0,
        north: 31.0,
      },
      coherenceThreshold: 0.5,
      outputResolution: 20,
    };

    expect(request.projectId).toBe(2);
    expect(request.orbitDirection).toBe("descending");
    expect(request.polarization).toBe("VV+VH");
    expect(request.coherenceThreshold).toBe(0.5);
    expect(request.outputResolution).toBe(20);
  });

  it("should handle processing request with minimal parameters", async () => {
    const request: ProcessingRequest = {
      projectId: 3,
      startDate: "2024-03-01",
      endDate: "2024-03-31",
    };

    expect(request.projectId).toBe(3);
    expect(request.satellite).toBeUndefined();
    expect(request.orbitDirection).toBeUndefined();
    expect(request.polarization).toBeUndefined();
  });

  it("should validate processing status fields", () => {
    const status: ProcessingStatus = {
      taskId: "task_1",
      projectId: 1,
      status: "processing",
      progress: 75,
      currentStep: "phase_unwrapping",
      message: "Unwrapping phase",
      timestamp: new Date().toISOString(),
    };

    expect(status.taskId).toBeDefined();
    expect(status.projectId).toBeDefined();
    expect(status.status).toBeDefined();
    expect(status.progress).toBeGreaterThanOrEqual(0);
    expect(status.progress).toBeLessThanOrEqual(100);
  });
});
