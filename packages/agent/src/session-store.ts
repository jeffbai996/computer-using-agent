import { mkdir, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  appendEvent,
  deserializeSession,
  serializeExport,
  type AgentSession,
  type BrowserSnapshot,
  type TraceEvent,
} from "@cua/core";
import type { SessionStore } from "./ports.js";
import type { ScreenshotArtifact } from "./ports.js";

type ProjectionRow = {
  projection_json: string;
};

type EventRow = {
  event_json: string;
};

export class SqliteSessionStore implements SessionStore {
  private readonly db: DatabaseSync;
  private readonly artifactDir: string;

  constructor(private readonly dataDir = process.env.CUA_DATA_DIR ?? ".cua-data") {
    this.artifactDir = path.join(dataDir, "artifacts");
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(this.artifactDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, "sessions.sqlite"));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_projection (
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        projection_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        event_json TEXT NOT NULL,
        UNIQUE(session_id, sequence)
      );
    `);
  }

  async create(session: AgentSession): Promise<void> {
    this.saveProjection(session);
  }

  async appendEvent(session: AgentSession, event: TraceEvent): Promise<AgentSession> {
    const next = appendEvent(session, event);

    this.db
      .prepare(
        `
        INSERT INTO session_events (id, session_id, sequence, type, created_at, event_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        event.id,
        event.sessionId,
        event.sequence,
        event.type,
        event.createdAt,
        JSON.stringify(event),
      );

    this.saveProjection(next);
    return next;
  }

  async get(sessionId: string): Promise<AgentSession | undefined> {
    const row = this.db
      .prepare("SELECT projection_json FROM session_projection WHERE id = ?")
      .get(sessionId) as ProjectionRow | undefined;

    return row ? deserializeSession(row.projection_json) : undefined;
  }

  async list(): Promise<AgentSession[]> {
    const rows = this.db
      .prepare("SELECT projection_json FROM session_projection ORDER BY updated_at DESC")
      .all() as ProjectionRow[];

    return rows.map((row) => deserializeSession(row.projection_json));
  }

  async export(sessionId: string): Promise<string> {
    const projection = await this.get(sessionId);

    if (!projection) {
      throw new Error(`Unknown session ${sessionId}.`);
    }

    const events = this.eventsForSession(sessionId);

    return serializeExport({
      projection,
      events,
      artifactsBasePath: path.join(this.artifactDir, sessionId),
      exportedAt: new Date().toISOString(),
    });
  }

  async saveScreenshot(
    sessionId: string,
    eventId: string,
    snapshot: BrowserSnapshot,
  ): Promise<ScreenshotArtifact> {
    if (!snapshot.base64) {
      throw new Error("Cannot save screenshot without base64 image data.");
    }

    const screenshotDir = path.join(this.artifactDir, sessionId, "screenshots");
    const screenshotPath = path.join(screenshotDir, `${eventId}.png`);

    await mkdir(screenshotDir, { recursive: true });
    await writeFile(screenshotPath, Buffer.from(snapshot.base64, "base64"));

    return {
      urlPath: `/api/artifacts/${sessionId}/screenshots/${eventId}.png`,
      filePath: screenshotPath,
    };
  }

  async saveRawModelResponse(
    sessionId: string,
    eventId: string,
    response: unknown,
  ): Promise<string> {
    const responseDir = path.join(this.artifactDir, sessionId, "model");
    const responsePath = path.join(responseDir, `${eventId}.json`);

    await mkdir(responseDir, { recursive: true });
    await writeFile(responsePath, JSON.stringify(response, null, 2));

    return responsePath;
  }

  private saveProjection(session: AgentSession): void {
    this.db
      .prepare(
        `
        INSERT INTO session_projection (
          id,
          task,
          status,
          created_at,
          updated_at,
          projection_json
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          task = excluded.task,
          status = excluded.status,
          updated_at = excluded.updated_at,
          projection_json = excluded.projection_json
      `,
      )
      .run(
        session.id,
        session.task,
        session.status,
        session.createdAt,
        session.updatedAt,
        JSON.stringify(session, null, 2),
      );
  }

  private eventsForSession(sessionId: string): TraceEvent[] {
    const rows = this.db
      .prepare("SELECT event_json FROM session_events WHERE session_id = ? ORDER BY sequence ASC")
      .all(sessionId) as EventRow[];

    return rows.map((row) => JSON.parse(row.event_json) as TraceEvent);
  }
}
