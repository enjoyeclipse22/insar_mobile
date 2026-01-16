import { describe, it, expect, beforeEach, vi } from "vitest";
import { InSARProcessor, ProcessingConfig } from "./insar-processor";
import * as db from "./db";

// Mock the database module
vi.mock("./db", () => ({
  updateProject: vi.fn(),
  createProcessingStep: vi.fn(),
  updateProcessingStep: vi.fn(),
  createProcessingResult: vi.fn(),
  getProjectSteps: vi.fn(),
  addProcessingLog: vi.fn(),
}));

describe("InSARProcessor", () => {
  let processor: InSARProcessor;
  let config: ProcessingConfig;

  beforeEach(() => {
    config = {
      projectId: 1,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      satellite: "Sentinel-1",
      orbitDirection: "ascending",
      polarization: "VV",
      coherenceThreshold: 0.4,
      outputResolution: 30,
    };

    processor = new InSARProcessor(config);

    // Mock database functions
    vi.mocked(db.updateProject).mockResolvedValue(undefined);
    vi.mocked(db.createProcessingStep).mockResolvedValue(1);
    vi.mocked(db.updateProcessingStep).mockResolvedValue(undefined);
    vi.mocked(db.createProcessingResult).mockResolvedValue(1);
    vi.mocked(db.getProjectSteps).mockResolvedValue([
      { id: 1, projectId: 1, stepName: "data_download", status: "completed", progress: 100, startTime: null, endTime: null, duration: null, errorMessage: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, projectId: 1, stepName: "coregistration", status: "completed", progress: 100, startTime: null, endTime: null, duration: null, errorMessage: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 3, projectId: 1, stepName: "interferogram_generation", status: "completed", progress: 100, startTime: null, endTime: null, duration: null, errorMessage: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 4, projectId: 1, stepName: "phase_unwrapping", status: "completed", progress: 100, startTime: null, endTime: null, duration: null, errorMessage: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 5, projectId: 1, stepName: "deformation_inversion", status: "completed", progress: 100, startTime: null, endTime: null, duration: null, errorMessage: null, createdAt: new Date(), updatedAt: new Date() },
    ] as any);
    vi.mocked(db.addProcessingLog).mockResolvedValue(undefined);
  });

  it("should initialize with correct configuration", () => {
    expect(processor).toBeDefined();
  });

  it("should process project successfully", async () => {
    await processor.processProject();

    // Verify project was updated to completed
    expect(vi.mocked(db.updateProject)).toHaveBeenCalledWith(1, {
      status: "completed",
      progress: 100,
    });

    // Verify processing steps were created
    expect(vi.mocked(db.createProcessingStep)).toHaveBeenCalled();

    // Verify logs were added
    expect(vi.mocked(db.addProcessingLog)).toHaveBeenCalled();
  }, { timeout: 15000 });

  it("should handle processing errors gracefully", async () => {
    // Mock a failure in the processing
    vi.mocked(db.createProcessingStep).mockRejectedValueOnce(new Error("Database error"));

    try {
      await processor.processProject();
    } catch (error) {
      // Expected to throw
    }

    // Verify project was marked as failed
    expect(vi.mocked(db.updateProject)).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: "failed" })
    );
  });

  it("should log processing steps", async () => {
    await processor.processProject();

    // Verify that logs were created for each step
    const logCalls = vi.mocked(db.addProcessingLog).mock.calls;
    expect(logCalls.length).toBeGreaterThan(0);

    // Check for specific log messages
    const messages = logCalls.map((call) => call[0].message);
    expect(messages.some((msg) => msg.includes("data_download"))).toBe(true);
    expect(messages.some((msg) => msg.includes("completed"))).toBe(true);
  }, { timeout: 15000 });

  it("should create processing results", async () => {
    await processor.processProject();

    // Verify that results were created
    expect(vi.mocked(db.createProcessingResult)).toHaveBeenCalled();

    // Check for expected result types
    const resultCalls = vi.mocked(db.createProcessingResult).mock.calls;
    const resultTypes = resultCalls.map((call) => call[0].resultType);

    expect(resultTypes).toContain("interferogram");
    expect(resultTypes).toContain("unwrapped_phase");
    expect(resultTypes).toContain("los_displacement");
  }, { timeout: 15000 });
});
