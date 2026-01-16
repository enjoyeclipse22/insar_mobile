import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * InSAR Project queries
 */

export async function getUserProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const { desc } = await import("drizzle-orm");
  return db
    .select()
    .from(insarProjects)
    .where(eq(insarProjects.userId, userId))
    .orderBy(desc(insarProjects.createdAt));
}

export async function getProjectById(projectId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(insarProjects).where(eq(insarProjects.id, projectId));
  return result[0] || null;
}

export async function createProject(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 插入数据，让数据库自动生成 ID
  const result = await db.insert(insarProjects).values(data);
  
  // 获取插入后的 ID
  const insertId = result[0].insertId;
  
  return { id: insertId, ...data };
}

export async function updateProject(projectId: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(insarProjects).set(data).where(eq(insarProjects.id, projectId));
}

export async function deleteProject(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(insarProjects).where(eq(insarProjects.id, projectId));
}

/**
 * Processing Steps queries
 */

export async function getProjectSteps(projectId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(processingSteps).where(eq(processingSteps.projectId, projectId));
}

export async function createProcessingStep(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(processingSteps).values(data);
  return data.id || null;
}

export async function updateProcessingStep(stepId: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(processingSteps).set(data).where(eq(processingSteps.id, stepId));
}

/**
 * Processing Results queries
 */

export async function getProjectResults(projectId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(processingResults).where(eq(processingResults.projectId, projectId));
}

export async function createProcessingResult(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(processingResults).values(data);
  return data.id || null;
}

/**
 * Processing Logs queries
 */

export async function getProjectLogs(projectId: number, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];

  const { desc } = await import("drizzle-orm");
  return db
    .select()
    .from(processingLogs)
    .where(eq(processingLogs.projectId, projectId))
    .orderBy(desc(processingLogs.timestamp))
    .limit(limit);
}

export async function addProcessingLog(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(processingLogs).values(data);
  return data.id || null;
}

// Import InSAR tables
import {
  insarProjects,
  processingSteps,
  processingResults,
  processingLogs,
} from "../drizzle/schema";
