import { redisClient } from "../config/redis.config.js";
import type { RefreshTokenStore } from "../../application/dtos/auth.dto.js";

/** Stores active refresh-session references in Redis (with in-memory fallback if Redis is offline). */
export class RedisRefreshTokenStore implements RefreshTokenStore {
  private inMemoryMap = new Map<string, { userId: string; expiresAt: number }>();
  private inMemoryUserSessions = new Map<string, Set<string>>();

  public async save(sessionId: string, userId: string, ttlSeconds: number): Promise<void> {
    try {
      if (redisClient.status === "ready") {
        await redisClient.set(`refresh_token:${sessionId}`, userId, "EX", ttlSeconds);
        await redisClient.sadd(`refresh_user:${userId}`, sessionId);
        return;
      }
    } catch {
      // Fall through to memory store
    }
    this.inMemoryMap.set(sessionId, { userId, expiresAt: Date.now() + ttlSeconds * 1000 });
    if (!this.inMemoryUserSessions.has(userId)) {
      this.inMemoryUserSessions.set(userId, new Set());
    }
    this.inMemoryUserSessions.get(userId)!.add(sessionId);
  }

  public async consume(sessionId: string): Promise<string | null> {
    try {
      if (redisClient.status === "ready") {
        const value = await redisClient.get(`refresh_token:${sessionId}`);
        if (value) await redisClient.del(`refresh_token:${sessionId}`);
        return value;
      }
    } catch {
      // Fall through to memory store
    }
    const item = this.inMemoryMap.get(sessionId);
    if (!item) return null;
    this.inMemoryMap.delete(sessionId);
    if (item.expiresAt < Date.now()) return null;
    return item.userId;
  }

  public async delete(sessionId: string): Promise<void> {
    try {
      if (redisClient.status === "ready") {
        await redisClient.del(`refresh_token:${sessionId}`);
      }
    } catch {
      // ignore
    }
    this.inMemoryMap.delete(sessionId);
  }

  public async revokeAll(userId: string): Promise<void> {
    try {
      if (redisClient.status === "ready") {
        const ids = await redisClient.smembers(`refresh_user:${userId}`);
        if (ids.length) await redisClient.del(...ids.map((id) => `refresh_token:${id}`));
        await redisClient.del(`refresh_user:${userId}`);
      }
    } catch {
      // ignore
    }
    const sessions = this.inMemoryUserSessions.get(userId);
    if (sessions) {
      for (const id of sessions) {
        this.inMemoryMap.delete(id);
      }
      this.inMemoryUserSessions.delete(userId);
    }
  }
}
