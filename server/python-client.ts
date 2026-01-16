/**
 * Python Backend Client
 * Handles communication with the Python InSAR processing service
 */

import axios, { AxiosInstance } from "axios";
import { EventEmitter } from "events";

export interface ProcessingRequest {
  projectId: number;
  startDate: string;
  endDate: string;
  satellite?: string;
  orbitDirection?: "ascending" | "descending";
  polarization?: string;
  aoiBounds?: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  coherenceThreshold?: number;
  outputResolution?: number;
}

export interface ProcessingStatus {
  taskId: string;
  projectId: number;
  status: "queued" | "downloading" | "processing" | "completed" | "failed";
  progress: number;
  currentStep: string;
  message: string;
  timestamp: string;
}

export interface ProcessingResult {
  taskId: string;
  projectId: number;
  status: string;
  results: {
    interferogram?: string;
    unwrappedPhase?: string;
    deformation?: string;
    dem?: string;
    dataFiles?: string[];
    coregisteredFiles?: string[];
  };
  logs: Array<{
    timestamp: string;
    level: string;
    message: string;
  }>;
  timestamp: string;
}

export class PythonBackendClient extends EventEmitter {
  private client: AxiosInstance;
  private baseUrl: string;
  private statusPollInterval: number = 5000; // 5 seconds
  private pollTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(baseUrl: string = "http://localhost:8000") {
    super();
    this.baseUrl = baseUrl;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error("Python backend error:", error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check if Python backend is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.client.get("/health");
      return response.status === 200;
    } catch (error) {
      console.error("Python backend health check failed:", error);
      return false;
    }
  }

  /**
   * Start an InSAR processing task
   */
  async startProcessing(request: ProcessingRequest): Promise<string> {
    try {
      const payload = {
        project_id: request.projectId,
        start_date: request.startDate,
        end_date: request.endDate,
        satellite: request.satellite || "Sentinel-1",
        orbit_direction: request.orbitDirection || "ascending",
        polarization: request.polarization || "VV",
        aoi_bounds: request.aoiBounds,
        coherence_threshold: request.coherenceThreshold || 0.4,
        output_resolution: request.outputResolution || 30,
      };

      const response = await this.client.post("/process", payload);
      const taskId = response.data.task_id;

      console.log(`Processing task started: ${taskId}`);
      this.emit("task:started", { taskId, projectId: request.projectId });

      return taskId;
    } catch (error) {
      console.error("Failed to start processing:", error);
      throw error;
    }
  }

  /**
   * Get current status of a processing task
   */
  async getStatus(taskId: string): Promise<ProcessingStatus> {
    try {
      const response = await this.client.get(`/status/${taskId}`);

      return {
        taskId: response.data.task_id,
        projectId: response.data.project_id,
        status: response.data.status,
        progress: response.data.progress,
        currentStep: response.data.current_step,
        message: response.data.message,
        timestamp: response.data.timestamp,
      };
    } catch (error) {
      console.error(`Failed to get status for task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Get results of a completed processing task
   */
  async getResults(taskId: string): Promise<ProcessingResult> {
    try {
      const response = await this.client.get(`/results/${taskId}`);

      return {
        taskId: response.data.task_id,
        projectId: response.data.project_id,
        status: response.data.status,
        results: {
          interferogram: response.data.results.interferogram,
          unwrappedPhase: response.data.results.unwrapped_phase,
          deformation: response.data.results.deformation,
          dem: response.data.results.dem,
          dataFiles: response.data.results.data_files,
          coregisteredFiles: response.data.results.coregistered_files,
        },
        logs: response.data.logs,
        timestamp: response.data.timestamp,
      };
    } catch (error) {
      console.error(`Failed to get results for task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Get logs for a processing task
   */
  async getLogs(taskId: string, limit: number = 100): Promise<Array<any>> {
    try {
      const response = await this.client.get(`/logs/${taskId}`, {
        params: { limit },
      });

      return response.data.logs;
    } catch (error) {
      console.error(`Failed to get logs for task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Start polling for task status updates
   */
  startPolling(taskId: string, interval: number = this.statusPollInterval): void {
    if (this.pollTimers.has(taskId)) {
      console.warn(`Already polling task ${taskId}`);
      return;
    }

    console.log(`Starting to poll task ${taskId} every ${interval}ms`);

    const pollTask = async () => {
      try {
        const status = await this.getStatus(taskId);
        this.emit("task:status", status);

        if (status.status === "completed") {
          console.log(`Task ${taskId} completed`);
          this.stopPolling(taskId);
          this.emit("task:completed", status);

          // Fetch final results
          try {
            const results = await this.getResults(taskId);
            this.emit("task:results", results);
          } catch (error) {
            console.error("Failed to fetch results:", error);
          }
        } else if (status.status === "failed") {
          console.error(`Task ${taskId} failed`);
          this.stopPolling(taskId);
          this.emit("task:failed", status);
        }
      } catch (error) {
        console.error(`Error polling task ${taskId}:`, error);
        this.emit("task:error", { taskId, error });
      }
    };

    // Poll immediately, then at intervals
    pollTask();
    const timer = setInterval(pollTask, interval);
    this.pollTimers.set(taskId, timer);
  }

  /**
   * Stop polling for a task
   */
  stopPolling(taskId: string): void {
    const timer = this.pollTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(taskId);
      console.log(`Stopped polling task ${taskId}`);
    }
  }

  /**
   * Stop all polling
   */
  stopAllPolling(): void {
    this.pollTimers.forEach((timer) => clearInterval(timer));
    this.pollTimers.clear();
    console.log("Stopped all polling");
  }

  /**
   * Get base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Set base URL
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
    this.client.defaults.baseURL = url;
    console.log(`Python backend URL set to: ${url}`);
  }
}

// Singleton instance
let pythonClient: PythonBackendClient | null = null;

export function getPythonClient(baseUrl?: string): PythonBackendClient {
  if (!pythonClient) {
    pythonClient = new PythonBackendClient(baseUrl || process.env.PYTHON_BACKEND_URL || "http://localhost:8000");
  }
  return pythonClient;
}

export function resetPythonClient(): void {
  if (pythonClient) {
    pythonClient.stopAllPolling();
    pythonClient = null;
  }
}
