import {
  createEvent,
  createSession,
  parseDomainList,
  requiresApproval,
  type ActionBatch,
  type AgentSession,
  type BrowserPolicy,
  type BrowserSnapshot,
  type SafetyCheck,
  type TraceEvent,
  type TurnOutcome,
} from "@cua/core";
import type { BrowserExecutor, ModelClient, SessionStore } from "./ports.js";

type AgentServiceOptions = {
  policy?: BrowserPolicy;
  maxTurns?: number;
};

const DEFAULT_MAX_TURNS = 20;

export class AgentService {
  private readonly policy: BrowserPolicy;
  private readonly maxTurns: number;

  constructor(
    private readonly store: SessionStore,
    private readonly model: ModelClient,
    private readonly browser: BrowserExecutor,
    options: AgentServiceOptions = {},
  ) {
    this.policy = options.policy ?? {
      allowDomains: parseDomainList(process.env.CUA_ALLOW_DOMAINS),
      denyDomains: parseDomainList(process.env.CUA_DENY_DOMAINS),
    };
    this.maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  }

  async startTask(task: string): Promise<AgentSession> {
    let session = createSession(task);

    await this.store.create(session);
    session = await this.record(session, "task.started", { task });

    await this.browser.open(session.id);
    session = await this.captureSnapshot(session);

    return this.continueLoop(session);
  }

  async resume(sessionId: string): Promise<AgentSession> {
    let session = await this.requireSession(sessionId);

    if (session.status === "awaiting_approval" || isTerminalStatus(session.status)) {
      return session;
    }

    await this.browser.open(session.id);

    if (!session.latestScreenshotPath) {
      session = await this.captureSnapshot(session);
    }

    return this.continueLoop({ ...session, status: "running" });
  }

  async approve(sessionId: string): Promise<AgentSession> {
    const session = await this.requireSession(sessionId);

    if (!session.pendingActionBatch) {
      throw new Error(`Session ${sessionId} has no pending action batch.`);
    }

    await this.browser.open(session.id);
    let result;
    try {
      result = await this.browser.executeBatch(session.id, session.pendingActionBatch);
    } catch (error) {
      return this.record(session, "safety.blocked", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    let next = await this.record(session, "action_batch.executed", {
      batch: session.pendingActionBatch,
      approved: true,
      executedActions: result.executedActions,
    });

    next = await this.persistSnapshot(next, result.snapshot);

    return this.continueLoop(next);
  }

  async reject(sessionId: string, reason = "Rejected by user"): Promise<AgentSession> {
    const session = await this.requireSession(sessionId);

    return this.record(session, "task.rejected", {
      reason,
      pendingActionBatch: session.pendingActionBatch,
    });
  }

  async listSessions(): Promise<AgentSession[]> {
    return this.store.list();
  }

  async getSession(sessionId: string): Promise<AgentSession | undefined> {
    return this.store.get(sessionId);
  }

  async exportSession(sessionId: string): Promise<string> {
    return this.store.export(sessionId);
  }

  private async continueLoop(session: AgentSession): Promise<AgentSession> {
    let next = session;

    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      if (next.status !== "running") {
        return next;
      }

      next = await this.record(next, "model.turn_requested", {
        turn: turn + 1,
        previousResponseId: next.previousResponseId,
      });

      const outcome = await this.model.createTurn({
        task: next.task,
        session: next,
        snapshot: snapshotForSession(next),
        acknowledgedSafetyChecks: next.pendingSafetyChecks,
      });

      next = await this.recordModelOutcome(next, outcome);

      if (outcome.type === "completed") {
        return this.record(next, "task.completed", {
          message: outcome.message,
          responseId: outcome.responseId,
        });
      }

      if (outcome.type === "blocked") {
        return this.record(next, "safety.blocked", {
          reason: outcome.reason,
          responseId: outcome.responseId,
          safetyChecks: outcome.safetyChecks,
        });
      }

      if (outcome.type === "needs_screenshot") {
        next = await this.captureSnapshot(next);
        continue;
      }

      next = await this.handleActionBatch(next, outcome.batch, outcome.safetyChecks);
    }

    return this.record(next, "task.failed", {
      reason: `Stopped after ${this.maxTurns} model turns.`,
    });
  }

  private async handleActionBatch(
    session: AgentSession,
    batch: ActionBatch,
    safetyChecks: SafetyCheck[] = [],
  ): Promise<AgentSession> {
    let next = await this.record(session, "action_batch.requested", { batch });
    const policyDecision = requiresApproval(batch, snapshotForSession(next), this.policy);
    const allSafetyChecks = [
      ...safetyChecks,
      ...policyDecision.reasons.map((reason) => ({
        id: `policy_${reason.replace(/\W+/g, "_").toLowerCase()}`,
        code: "approval_required",
        message: reason,
      })),
    ];

    if (policyDecision.required || allSafetyChecks.length > 0) {
      return this.record(next, "approval.required", {
        batch,
        safetyChecks: allSafetyChecks,
      });
    }

    let result;
    try {
      result = await this.browser.executeBatch(next.id, batch);
    } catch (error) {
      return this.record(next, "safety.blocked", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    next = await this.record(next, "action_batch.executed", {
      batch,
      approved: false,
      executedActions: result.executedActions,
    });

    return this.persistSnapshot(next, result.snapshot);
  }

  private async captureSnapshot(session: AgentSession): Promise<AgentSession> {
    const snapshot = await this.browser.captureSnapshot(session.id);
    return this.persistSnapshot(session, snapshot);
  }

  private async persistSnapshot(
    session: AgentSession,
    snapshot: BrowserSnapshot,
  ): Promise<AgentSession> {
    const event = createEvent(session, "browser.snapshot_captured", {});
    const artifact = await this.store.saveScreenshot(session.id, event.id, snapshot);
    const persistedSnapshot: BrowserSnapshot = {
      ...snapshot,
      base64: undefined,
      screenshotPath: artifact.urlPath,
      localPath: artifact.filePath,
    };

    return this.store.appendEvent(session, {
      ...event,
      data: {
        snapshot: persistedSnapshot,
      },
    });
  }

  private async recordModelOutcome(
    session: AgentSession,
    outcome: TurnOutcome,
  ): Promise<AgentSession> {
    const event = createEvent(session, "model.turn_received", {});
    const rawResponsePath =
      outcome.rawResponse === undefined
        ? outcome.rawResponsePath
        : await this.store.saveRawModelResponse(session.id, event.id, outcome.rawResponse);
    const cleanOutcome = { ...outcome, rawResponse: undefined, rawResponsePath };

    return this.store.appendEvent(session, {
      ...event,
      data: {
        outcome: cleanOutcome,
      },
    });
  }

  private async record(
    session: AgentSession,
    type: Parameters<typeof createEvent>[1],
    data: Record<string, unknown>,
  ): Promise<AgentSession> {
    return this.store.appendEvent(session, createEvent(session, type, data));
  }

  private async requireSession(sessionId: string): Promise<AgentSession> {
    const session = await this.store.get(sessionId);

    if (!session) {
      throw new Error(`Unknown session ${sessionId}.`);
    }

    return session;
  }
}

function snapshotForSession(session: AgentSession): BrowserSnapshot | undefined {
  if (!session.latestScreenshotPath || !session.currentUrl || !session.viewport) {
    return undefined;
  }

  return {
    mimeType: "image/png",
    screenshotPath: session.latestScreenshotPath,
    localPath: session.latestScreenshotLocalPath,
    currentUrl: session.currentUrl,
    title: session.title ?? "",
    viewport: session.viewport,
    capturedAt: session.updatedAt,
  };
}

function isTerminalStatus(status: AgentSession["status"]): boolean {
  return ["completed", "failed", "rejected"].includes(status);
}
