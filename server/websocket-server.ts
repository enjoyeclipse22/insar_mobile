/**
 * WebSocket Server for Real-time Processing Logs
 * Handles bidirectional communication between client and server
 */

import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import * as db from "./db";

interface ClientConnection {
  ws: WebSocket;
  projectId: number;
  userId: number;
}

export class ProcessingWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, ClientConnection> = new Map();
  private logSubscriptions: Map<number, Set<string>> = new Map(); // projectId -> clientIds

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/api/ws/processing" });
    this.setupHandlers();
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupHandlers(): void {
    this.wss.on("connection", (ws: WebSocket, req: any) => {
      const clientId = this.generateClientId();

      ws.on("message", async (data: string) => {
        try {
          const message = JSON.parse(data);
          await this.handleMessage(clientId, ws, message);
        } catch (error) {
          console.error("WebSocket message error:", error);
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid message format",
            })
          );
        }
      });

      ws.on("close", () => {
        this.handleDisconnect(clientId);
      });

      ws.on("error", (error: any) => {
        console.error("WebSocket error:", error);
      });

      // Send welcome message
      ws.send(
        JSON.stringify({
          type: "connected",
          clientId,
          timestamp: new Date().toISOString(),
        })
      );
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(clientId: string, ws: WebSocket, message: any): Promise<void> {
    const { type, projectId, userId } = message;

    switch (type) {
      case "subscribe":
        this.subscribeToProject(clientId, ws, projectId, userId);
        break;

      case "unsubscribe":
        this.unsubscribeFromProject(clientId, projectId);
        break;

      case "ping":
        ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
        break;

      default:
        ws.send(JSON.stringify({ type: "error", message: `Unknown message type: ${type}` }));
    }
  }

  /**
   * Subscribe to project logs
   */
  private subscribeToProject(clientId: string, ws: WebSocket, projectId: number, userId: number): void {
    const client: ClientConnection = { ws, projectId, userId };
    this.clients.set(clientId, client);

    if (!this.logSubscriptions.has(projectId)) {
      this.logSubscriptions.set(projectId, new Set());
    }
    this.logSubscriptions.get(projectId)!.add(clientId);

    ws.send(
      JSON.stringify({
        type: "subscribed",
        projectId,
        timestamp: new Date().toISOString(),
      })
    );

    console.log(`Client ${clientId} subscribed to project ${projectId}`);
  }

  /**
   * Unsubscribe from project logs
   */
  private unsubscribeFromProject(clientId: string, projectId: number): void {
    const subscribers = this.logSubscriptions.get(projectId);
    if (subscribers) {
      subscribers.delete(clientId);
    }

    const client = this.clients.get(clientId);
    if (client) {
      client.ws.send(
        JSON.stringify({
          type: "unsubscribed",
          projectId,
          timestamp: new Date().toISOString(),
        })
      );
    }

    console.log(`Client ${clientId} unsubscribed from project ${projectId}`);
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      const subscribers = this.logSubscriptions.get(client.projectId);
      if (subscribers) {
        subscribers.delete(clientId);
      }
    }

    this.clients.delete(clientId);
    console.log(`Client ${clientId} disconnected`);
  }

  /**
   * Broadcast log to all subscribers of a project
   */
  async broadcastLog(projectId: number, log: any): Promise<void> {
    const subscribers = this.logSubscriptions.get(projectId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const message = JSON.stringify({
      type: "log",
      projectId,
      log: {
        id: log.id,
        logLevel: log.logLevel,
        message: log.message,
        timestamp: log.timestamp,
      },
      timestamp: new Date().toISOString(),
    });

    for (const clientId of subscribers) {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  /**
   * Broadcast project status update
   */
  async broadcastProjectStatus(projectId: number, status: any): Promise<void> {
    const subscribers = this.logSubscriptions.get(projectId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const message = JSON.stringify({
      type: "status_update",
      projectId,
      status: {
        status: status.status,
        progress: status.progress,
        updatedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });

    for (const clientId of subscribers) {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.clients.size;
  }

  /**
   * Get subscribers for a project
   */
  getProjectSubscribers(projectId: number): number {
    return this.logSubscriptions.get(projectId)?.size || 0;
  }
}

// Global WebSocket server instance
let wsServer: ProcessingWebSocketServer | null = null;

/**
 * Initialize WebSocket server
 */
export function initializeWebSocketServer(httpServer: Server): ProcessingWebSocketServer {
  if (!wsServer) {
    wsServer = new ProcessingWebSocketServer(httpServer);
  }
  return wsServer;
}

/**
 * Get WebSocket server instance
 */
export function getWebSocketServer(): ProcessingWebSocketServer | null {
  return wsServer;
}

/**
 * Broadcast log event (called from database layer)
 */
export async function broadcastProcessingLog(projectId: number, log: any): Promise<void> {
  if (wsServer) {
    await wsServer.broadcastLog(projectId, log);
  }
}

/**
 * Broadcast project status update
 */
export async function broadcastProjectStatusUpdate(projectId: number, status: any): Promise<void> {
  if (wsServer) {
    await wsServer.broadcastProjectStatus(projectId, status);
  }
}
