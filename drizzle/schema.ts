import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// InSAR Projects table
export const insarProjects = mysqlTable("insar_projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 255 }),
  status: mysqlEnum("status", ["created", "processing", "completed", "failed"]).default("created").notNull(),
  progress: int("progress").default(0).notNull(),
  startDate: varchar("startDate", { length: 10 }),
  endDate: varchar("endDate", { length: 10 }),
  satellite: varchar("satellite", { length: 50 }),
  orbitDirection: mysqlEnum("orbitDirection", ["ascending", "descending"]),
  polarization: varchar("polarization", { length: 10 }),
  coherenceThreshold: varchar("coherenceThreshold", { length: 10 }).default("0.4"),
  outputResolution: int("outputResolution"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

// Processing Steps table
export const processingSteps = mysqlTable("processing_steps", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  stepName: varchar("stepName", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  progress: int("progress").default(0).notNull(),
  startTime: timestamp("startTime"),
  endTime: timestamp("endTime"),
  duration: int("duration"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Processing Results table
export const processingResults = mysqlTable("processing_results", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  resultType: mysqlEnum("resultType", [
    "interferogram",
    "coherence",
    "deformation",
    "dem",
    "unwrapped_phase",
    "los_displacement",
  ]).notNull(),
  fileUrl: varchar("fileUrl", { length: 512 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileSize: int("fileSize"),
  format: varchar("format", { length: 50 }),
  minValue: varchar("minValue", { length: 50 }),
  maxValue: varchar("maxValue", { length: 50 }),
  meanValue: varchar("meanValue", { length: 50 }),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Processing Logs table
export const processingLogs = mysqlTable("processing_logs", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  stepId: int("stepId"),
  logLevel: mysqlEnum("logLevel", ["debug", "info", "warning", "error"]).default("info").notNull(),
  message: text("message").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Export types
export type InsarProject = typeof insarProjects.$inferSelect;
export type InsertInsarProject = typeof insarProjects.$inferInsert;

export type ProcessingStep = typeof processingSteps.$inferSelect;
export type InsertProcessingStep = typeof processingSteps.$inferInsert;

export type ProcessingResult = typeof processingResults.$inferSelect;
export type InsertProcessingResult = typeof processingResults.$inferInsert;

export type ProcessingLog = typeof processingLogs.$inferSelect;
export type InsertProcessingLog = typeof processingLogs.$inferInsert;
