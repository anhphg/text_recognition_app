import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, ocrResults, InsertOcrResult } from "../drizzle/schema";
import { ENV } from './_core/env';

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
      values.role = 'admin';
      updateSet.role = 'admin';
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
 * Get all OCR results for a user
 */
export async function getUserOcrResults(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get OCR results: database not available");
    return [];
  }

  try {
    const results = await db
      .select()
      .from(ocrResults)
      .where(eq(ocrResults.userId, userId))
      .orderBy((t) => desc(t.createdAt));
    return results;
  } catch (error) {
    console.error("[Database] Failed to get OCR results:", error);
    throw error;
  }
}

/**
 * Save OCR result to database
 */
export async function saveOcrResult(result: InsertOcrResult) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save OCR result: database not available");
    return undefined;
  }

  try {
    await db.insert(ocrResults).values(result);
    return result;
  } catch (error) {
    console.error("[Database] Failed to save OCR result:", error);
    throw error;
  }
}

/**
 * Delete OCR result by ID
 */
export async function deleteOcrResult(id: number, userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete OCR result: database not available");
    return false;
  }

  try {
    // Ensure user can only delete their own results
    const result = await db
      .delete(ocrResults)
      .where(and(eq(ocrResults.id, id), eq(ocrResults.userId, userId)));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete OCR result:", error);
    throw error;
  }
}
