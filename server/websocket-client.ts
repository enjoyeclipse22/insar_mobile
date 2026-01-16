/**
 * WebSocket Client for Real-time Processing Updates
 * Handles real-time log streaming and progress updates from Python backend
 */

import { EventEmitter } from "events";

export interface WebSocketConfig {
  url: string;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  reconnectionAttempts?: number;
}

export interface LogMessage {
  taskId: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "debug";
  message: string;
}

export interface ProgressUpdate {
  taskId: string;
  timestamp: string;
  progress: number;
  currentStep: string;
  message: string;
}

export interface TaskCompletion {
  taskId: string;
  timestamp: string;
  status: "completed" | "failed";
  results?: Record<string, any>;
  error?: string;
}

export class WebSocketClient extends EventEmitter {
  private socket: any = null;
  private config: WebSocketConfig;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private subscribedTasks: Set<string> = new Set();

  constructor(config: WebSocketConfig) {
    super();
    this.config = {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      ...config,
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    try {
      // Dynamically import socket.io-client
      const { io } = await import("socket.io-client");

      this.socket = io(this.config.url, {
        reconnection: this.config.reconnection,
        reconnectionDelay: this.config.reconnectionDelay,
        reconnectionDelayMax: this.config.reconnectionDelayMax,
        reconnectionAttempts: this.config.reconnectionAttempts,
      });

      // Register event handlers
      this.socket.on("connect", () => this.onConnect());
      this.socket.on("disconnect", () => this.onDisconnect());
      this.socket.on("connection_response", (data: any) => this.onConnectionResponse(data));
      this.socket.on("subscribed", (data: any) => this.onSubscribed(data));
      this.socket.on("unsubscribed", (data: any) => this.onUnsubscribed(data));
      this.socket.on("task:log", (data: LogMessage) => this.onTaskLog(data));
      this.socket.on("task:progress", (data: ProgressUpdate) => this.onTaskProgress(data));
      this.socket.on("task:completed", (data: TaskCompletion) => this.onTaskCompleted(data));
      this.socket.on("task:failed", (data: TaskCompletion) => this.onTaskFailed(data));
      this.socket.on("task:error", (data: any) => this.onTaskError(data));
      this.socket.on("error", (data: any) => this.onError(data));
      this.socket.on("heartbeat", () => this.onHeartbeat());

      console.log(`WebSocket client connecting to ${this.config.url}`);
    } catch (error) {
      console.error("Failed to load socket.io-client:", error);
      throw error;
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.isConnected = false;
      console.log("WebSocket client disconnected");
    }
  }

  /**
   * Subscribe to task updates
   */
  subscribeToTask(taskId: string): void {
    if (!this.isConnected) {
      console.warn("WebSocket not connected, cannot subscribe to task");
      return;
    }

    if (this.subscribedTasks.has(taskId)) {
      console.warn(`Already subscribed to task ${taskId}`);
      return;
    }

    this.socket.emit("subscribe_task", { task_id: taskId });
    this.subscribedTasks.add(taskId);
    console.log(`Subscribed to task ${taskId}`);
  }

  /**
   * Unsubscribe from task updates
   */
  unsubscribeFromTask(taskId: string): void {
    if (!this.isConnected) {
      console.warn("WebSocket not connected, cannot unsubscribe from task");
      return;
    }

    this.socket.emit("unsubscribe_task", { task_id: taskId });
    this.subscribedTasks.delete(taskId);
    console.log(`Unsubscribed from task ${taskId}`);
  }

  /**
   * Check if connected
   */
  isConnectedToServer(): boolean {
    return this.isConnected;
  }

  /**
   * Get subscribed tasks
   */
  getSubscribedTasks(): string[] {
    return Array.from(this.subscribedTasks);
  }

  // Event handlers

  private onConnect(): void {
    this.isConnected = true;
    this.reconnectAttempts = 0;
    console.log("WebSocket connected");
    this.emit("connected");
  }

  private onDisconnect(): void {
    this.isConnected = false;
    console.log("WebSocket disconnected");
    this.emit("disconnected");
  }

  private onConnectionResponse(data: any): void {
    console.log("Connection response:", data);
    this.emit("connection:response", data);
  }

  private onSubscribed(data: any): void {
    console.log(`Subscribed to task ${data.task_id}`);
    this.emit("task:subscribed", data);
  }

  private onUnsubscribed(data: any): void {
    console.log(`Unsubscribed from task ${data.task_id}`);
    this.emit("task:unsubscribed", data);
  }

  private onTaskLog(data: LogMessage): void {
    console.log(`[${data.level.toUpperCase()}] ${data.message}`);
    this.emit("task:log", data);
  }

  private onTaskProgress(data: ProgressUpdate): void {
    console.log(
      `Task ${data.taskId}: ${data.currentStep} (${data.progress.toFixed(0)}%)`
    );
    this.emit("task:progress", data);
  }

  private onTaskCompleted(data: TaskCompletion): void {
    console.log(`Task ${data.taskId} completed`);
    this.emit("task:completed", data);
    this.subscribedTasks.delete(data.taskId);
  }

  private onTaskFailed(data: TaskCompletion): void {
    console.error(`Task ${data.taskId} failed: ${data.error}`);
    this.emit("task:failed", data);
    this.subscribedTasks.delete(data.taskId);
  }

  private onTaskError(data: any): void {
    console.error(`Task error: ${data.error}`);
    this.emit("task:error", data);
  }

  private onError(data: any): void {
    console.error("WebSocket error:", data);
    this.emit("error", data);
  }

  private onHeartbeat(): void {
    // Heartbeat received, connection is alive
    this.emit("heartbeat");
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(config?: WebSocketConfig): WebSocketClient {
  if (!wsClient && config) {
    wsClient = new WebSocketClient(config);
  }
  return wsClient!;
}

export function createWebSocketClient(config: WebSocketConfig): WebSocketClient {
  wsClient = new WebSocketClient(config);
  return wsClient;
}

export function resetWebSocketClient(): void {
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
}
