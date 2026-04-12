export type AgentActionKind =
  | "click"
  | "type"
  | "scroll"
  | "navigate"
  | "keypress"
  | "wait"
  | "unknown";

export type AgentAction = {
  id: string;
  kind: AgentActionKind;
  description: string;
  payload: Record<string, unknown>;
  sensitive?: boolean;
};

export type TraceEventType =
  | "task.started"
  | "screenshot.captured"
  | "action.requested"
  | "approval.required"
  | "action.executed"
  | "task.completed"
  | "task.failed";

export type TraceEvent = {
  id: string;
  type: TraceEventType;
  sessionId: string;
  createdAt: string;
  data: Record<string, unknown>;
};

export type SessionStatus =
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "rejected";

export type AgentSession = {
  id: string;
  task: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  events: TraceEvent[];
  pendingAction?: AgentAction;
};

export type ApprovalDecision = {
  approved: boolean;
  reason?: string;
};

export function createSession(task: string, now = new Date()): AgentSession {
  const createdAt = now.toISOString();

  return {
    id: randomId("session"),
    task,
    status: "running",
    createdAt,
    updatedAt: createdAt,
    events: [],
  };
}

export function createEvent(
  sessionId: string,
  type: TraceEventType,
  data: Record<string, unknown>,
  now = new Date(),
): TraceEvent {
  return {
    id: randomId("event"),
    type,
    sessionId,
    createdAt: now.toISOString(),
    data,
  };
}

export function reduceSession(
  session: AgentSession,
  event: TraceEvent,
): AgentSession {
  const next: AgentSession = {
    ...session,
    updatedAt: event.createdAt,
    events: [...session.events, event],
  };

  if (event.type === "approval.required") {
    const action = event.data.action as AgentAction | undefined;
    return {
      ...next,
      status: "awaiting_approval",
      pendingAction: action,
    };
  }

  if (event.type === "action.executed") {
    return {
      ...next,
      status: "running",
      pendingAction: undefined,
    };
  }

  if (event.type === "task.completed") {
    return {
      ...next,
      status: "completed",
      pendingAction: undefined,
    };
  }

  if (event.type === "task.failed") {
    return {
      ...next,
      status: "failed",
    };
  }

  return next;
}

export function appendEvent(
  session: AgentSession,
  event: TraceEvent,
): AgentSession {
  if (session.id !== event.sessionId) {
    throw new Error(`Event ${event.id} belongs to a different session.`);
  }

  return reduceSession(session, event);
}

export function actionNeedsApproval(action: AgentAction): boolean {
  if (action.sensitive) {
    return true;
  }

  return ["click", "type", "navigate", "keypress"].includes(action.kind);
}

export function serializeSession(session: AgentSession): string {
  return JSON.stringify(session, null, 2);
}

export function deserializeSession(raw: string): AgentSession {
  const parsed = JSON.parse(raw) as AgentSession;

  if (!parsed.id || !parsed.task || !Array.isArray(parsed.events)) {
    throw new Error("Invalid session payload.");
  }

  return parsed;
}

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
