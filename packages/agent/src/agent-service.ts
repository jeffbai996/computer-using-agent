import {
  actionNeedsApproval,
  appendEvent,
  createEvent,
  createSession,
  type AgentSession,
} from "@cua/core";
import type { BrowserExecutor, ModelClient, SessionStore } from "./ports.js";

export class AgentService {
  constructor(
    private readonly store: SessionStore,
    private readonly model: ModelClient,
    private readonly browser: BrowserExecutor,
  ) {}

  async startTask(task: string): Promise<AgentSession> {
    let session = createSession(task);

    await this.store.create(session);
    session = await this.record(session, "task.started", { task });

    await this.browser.open();
    session = await this.captureScreenshot(session);

    return this.requestNextStep(session);
  }

  async approve(sessionId: string): Promise<AgentSession> {
    const session = await this.requireSession(sessionId);

    if (!session.pendingAction) {
      throw new Error(`Session ${sessionId} has no pending action.`);
    }

    await this.browser.open();
    await this.browser.execute(session.pendingAction);

    const updated = await this.record(session, "action.executed", {
      action: session.pendingAction,
      approved: true,
    });

    return this.requestNextStep(updated);
  }

  async reject(sessionId: string, reason = "Rejected by user"): Promise<AgentSession> {
    const session = await this.requireSession(sessionId);

    const updated = await this.record(session, "task.failed", {
      reason,
      rejected: true,
    });

    return {
      ...updated,
      status: "rejected",
      pendingAction: undefined,
    };
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

  private async requestNextStep(session: AgentSession): Promise<AgentSession> {
    const step = await this.model.nextStep({ task: session.task, session });

    if (step.type === "complete") {
      return this.record(session, "task.completed", { message: step.message });
    }

    let next = await this.record(session, "action.requested", {
      action: step.action,
    });

    if (actionNeedsApproval(step.action)) {
      next = await this.record(next, "approval.required", {
        action: step.action,
      });
      return next;
    }

    await this.browser.execute(step.action);
    next = await this.record(next, "action.executed", {
      action: step.action,
      approved: false,
    });

    return this.requestNextStep(next);
  }

  private async captureScreenshot(session: AgentSession): Promise<AgentSession> {
    const screenshot = await this.browser.captureScreenshot();
    const event = createEvent(session.id, "screenshot.captured", {});
    const screenshotPath = await this.store.saveScreenshot(session.id, event.id, screenshot);

    return this.save(
      appendEvent(session, {
        ...event,
        data: {
          mimeType: screenshot.mimeType,
          screenshotPath,
        },
      }),
    );
  }

  private async record(
    session: AgentSession,
    type: Parameters<typeof createEvent>[1],
    data: Record<string, unknown>,
  ): Promise<AgentSession> {
    return this.save(appendEvent(session, createEvent(session.id, type, data)));
  }

  private async save(session: AgentSession): Promise<AgentSession> {
    await this.store.save(session);
    return session;
  }

  private async requireSession(sessionId: string): Promise<AgentSession> {
    const session = await this.store.get(sessionId);

    if (!session) {
      throw new Error(`Unknown session ${sessionId}.`);
    }

    return session;
  }
}
