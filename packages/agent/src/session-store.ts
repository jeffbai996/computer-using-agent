import { mkdir, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  deserializeSession,
  serializeSession,
  type AgentSession,
} from "@cua/core";
import type { Screenshot, SessionStore } from "./ports.js";

export class SqliteSessionStore implements SessionStore {
  private readonly db: DatabaseSync;
  private readonly artifactDir: string;

  constructor(dataDir = process.env.CUA_DATA_DIR ?? ".cua-data") {
    this.artifactDir = path.join(dataDir, "artifacts");
    mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, "sessions.sqlite"));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        json TEXT NOT NULL
      );
    `);
  }

  async create(session: AgentSession): Promise<void> {
    await this.save(session);
  }

  async save(session: AgentSession): Promise<void> {
    const statement = this.db.prepare(`
      INSERT INTO sessions (id, task, status, updated_at, json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task = excluded.task,
        status = excluded.status,
        updated_at = excluded.updated_at,
        json = excluded.json
    `);

    statement.run(
      session.id,
      session.task,
      session.status,
      session.updatedAt,
      serializeSession(session),
    );
  }

  async get(sessionId: string): Promise<AgentSession | undefined> {
    const row = this.db
      .prepare("SELECT json FROM sessions WHERE id = ?")
      .get(sessionId) as { json: string } | undefined;

    return row ? deserializeSession(row.json) : undefined;
  }

  async list(): Promise<AgentSession[]> {
    const rows = this.db
      .prepare("SELECT json FROM sessions ORDER BY updated_at DESC")
      .all() as { json: string }[];

    return rows.map((row) => deserializeSession(row.json));
  }

  async export(sessionId: string): Promise<string> {
    const session = await this.get(sessionId);

    if (!session) {
      throw new Error(`Unknown session ${sessionId}.`);
    }

    return serializeSession(session);
  }

  async saveScreenshot(
    sessionId: string,
    eventId: string,
    screenshot: Screenshot,
  ): Promise<string> {
    const screenshotDir = path.join(this.artifactDir, sessionId, "screenshots");
    const screenshotPath = path.join(screenshotDir, `${eventId}.png`);

    await mkdir(screenshotDir, { recursive: true });
    await writeFile(screenshotPath, Buffer.from(screenshot.base64, "base64"));

    return `/api/artifacts/${sessionId}/screenshots/${eventId}.png`;
  }
}
