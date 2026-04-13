export type ComputerActionKind =
  | "click"
  | "double_click"
  | "scroll"
  | "type"
  | "wait"
  | "keypress"
  | "drag"
  | "move"
  | "screenshot"
  | "unknown";

export type ComputerAction = {
  id: string;
  kind: ComputerActionKind;
  description: string;
  payload: Record<string, unknown>;
  raw?: unknown;
  sensitive?: boolean;
};

export type ActionBatch = {
  id: string;
  actions: ComputerAction[];
  description: string;
  callId?: string;
  responseId?: string;
};

export type BrowserSnapshot = {
  mimeType: "image/png";
  base64?: string;
  screenshotPath?: string;
  localPath?: string;
  currentUrl: string;
  title: string;
  viewport: {
    width: number;
    height: number;
  };
  capturedAt: string;
};

export type SafetyCheck = {
  id: string;
  code: string;
  message: string;
};

export type TurnOutcome =
  | {
      type: "action_batch";
      batch: ActionBatch;
      responseId?: string;
      safetyChecks?: SafetyCheck[];
      rawResponsePath?: string;
      rawResponse?: unknown;
    }
  | {
      type: "completed";
      message: string;
      responseId?: string;
      rawResponsePath?: string;
      rawResponse?: unknown;
    }
  | {
      type: "blocked";
      reason: string;
      responseId?: string;
      safetyChecks?: SafetyCheck[];
      rawResponsePath?: string;
      rawResponse?: unknown;
    }
  | {
      type: "needs_screenshot";
      responseId?: string;
      callId?: string;
      rawResponsePath?: string;
      rawResponse?: unknown;
    };

export type TraceEventType =
  | "task.started"
  | "browser.snapshot_captured"
  | "model.turn_requested"
  | "model.turn_received"
  | "action_batch.requested"
  | "approval.required"
  | "action_batch.executed"
  | "safety.blocked"
  | "task.completed"
  | "task.failed"
  | "task.rejected";

export type TraceEvent = {
  id: string;
  sequence: number;
  type: TraceEventType;
  sessionId: string;
  createdAt: string;
  data: Record<string, unknown>;
};

export type SessionStatus =
  | "running"
  | "awaiting_approval"
  | "blocked"
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
  latestScreenshotPath?: string;
  latestScreenshotLocalPath?: string;
  currentUrl?: string;
  title?: string;
  viewport?: BrowserSnapshot["viewport"];
  pendingActionBatch?: ActionBatch;
  pendingSafetyChecks?: SafetyCheck[];
  previousResponseId?: string;
  previousComputerCallId?: string;
  lastError?: string;
  rawModelResponsePath?: string;
};

export type ApprovalDecision = {
  approved: boolean;
  reason?: string;
};

export type BrowserPolicy = {
  allowDomains?: string[];
  denyDomains?: string[];
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
  session: AgentSession | { id: string; events?: TraceEvent[] },
  type: TraceEventType,
  data: Record<string, unknown>,
  now = new Date(),
): TraceEvent {
  return {
    id: randomId("event"),
    sequence: (session.events?.length ?? 0) + 1,
    type,
    sessionId: session.id,
    createdAt: now.toISOString(),
    data,
  };
}

export function reduceSession(session: AgentSession, event: TraceEvent): AgentSession {
  if (session.id !== event.sessionId) {
    throw new Error(`Event ${event.id} belongs to a different session.`);
  }

  if (isTerminalStatus(session.status) && mutatesTerminalSession(event.type)) {
    throw new Error(`Cannot apply ${event.type} to terminal session ${session.id}.`);
  }

  const next: AgentSession = {
    ...session,
    updatedAt: event.createdAt,
    events: [...session.events, event],
  };

  if (event.type === "browser.snapshot_captured") {
    const snapshot = event.data.snapshot as BrowserSnapshot | undefined;

    return {
      ...next,
      latestScreenshotPath: snapshot?.screenshotPath ?? next.latestScreenshotPath,
      latestScreenshotLocalPath: snapshot?.localPath ?? next.latestScreenshotLocalPath,
      currentUrl: snapshot?.currentUrl ?? next.currentUrl,
      title: snapshot?.title ?? next.title,
      viewport: snapshot?.viewport ?? next.viewport,
    };
  }

  if (event.type === "model.turn_received") {
    const outcome = event.data.outcome as TurnOutcome | undefined;

    return {
      ...next,
      previousResponseId: outcome?.responseId ?? next.previousResponseId,
      previousComputerCallId:
        outcome?.type === "needs_screenshot"
          ? outcome.callId ?? next.previousComputerCallId
          : next.previousComputerCallId,
      rawModelResponsePath: outcome?.rawResponsePath ?? next.rawModelResponsePath,
    };
  }

  if (event.type === "action_batch.requested") {
    const batch = event.data.batch as ActionBatch | undefined;

    return {
      ...next,
      pendingActionBatch: batch ?? next.pendingActionBatch,
      previousResponseId: batch?.responseId ?? next.previousResponseId,
      previousComputerCallId: batch?.callId ?? next.previousComputerCallId,
    };
  }

  if (event.type === "approval.required") {
    return {
      ...next,
      status: "awaiting_approval",
      pendingActionBatch:
        (event.data.batch as ActionBatch | undefined) ?? next.pendingActionBatch,
      pendingSafetyChecks: event.data.safetyChecks as SafetyCheck[] | undefined,
    };
  }

  if (event.type === "action_batch.executed") {
    return {
      ...next,
      status: "running",
      pendingActionBatch: undefined,
      pendingSafetyChecks: undefined,
    };
  }

  if (event.type === "safety.blocked") {
    return {
      ...next,
      status: "blocked",
      lastError: String(event.data.reason ?? "Blocked by safety policy."),
      pendingSafetyChecks: event.data.safetyChecks as SafetyCheck[] | undefined,
    };
  }

  if (event.type === "task.completed") {
    return {
      ...next,
      status: "completed",
      pendingActionBatch: undefined,
      pendingSafetyChecks: undefined,
    };
  }

  if (event.type === "task.failed") {
    return {
      ...next,
      status: "failed",
      lastError: String(event.data.reason ?? "Task failed."),
    };
  }

  if (event.type === "task.rejected") {
    return {
      ...next,
      status: "rejected",
      pendingActionBatch: undefined,
      pendingSafetyChecks: undefined,
      lastError: String(event.data.reason ?? "Rejected by user."),
    };
  }

  return next;
}

export function appendEvent(session: AgentSession, event: TraceEvent): AgentSession {
  return reduceSession(session, event);
}

export function projectSession(seed: AgentSession, events: TraceEvent[]): AgentSession {
  const initial: AgentSession = {
    ...seed,
    events: [],
    pendingActionBatch: undefined,
    pendingSafetyChecks: undefined,
  };

  return events.reduce<AgentSession>((session, event) => reduceSession(session, event), initial);
}

export function requiresApproval(
  batch: ActionBatch,
  snapshot?: Pick<BrowserSnapshot, "currentUrl">,
  policy: BrowserPolicy = {},
): { required: boolean; reasons: string[] } {
  const reasons = new Set<string>();

  for (const action of batch.actions) {
    if (action.sensitive) {
      reasons.add("sensitive model action");
    }

    if (action.kind === "unknown") {
      reasons.add("unknown action");
    }

    if (["click", "double_click", "type", "keypress", "drag"].includes(action.kind)) {
      reasons.add(`${action.kind} changes page state`);
    }

    const targetDomain = actionTargetDomain(action) ?? domainForUrl(snapshot?.currentUrl);

    if (targetDomain && domainDenied(targetDomain, policy)) {
      reasons.add(`domain denied: ${targetDomain}`);
    }

    if (targetDomain && policy.allowDomains?.length && !domainAllowed(targetDomain, policy)) {
      reasons.add(`domain not allowlisted: ${targetDomain}`);
    }
  }

  return {
    required: reasons.size > 0,
    reasons: [...reasons],
  };
}

export function parseDomainList(raw: string | undefined): string[] | undefined {
  const values = raw
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return values?.length ? values : undefined;
}

export function serializeExport(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
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

function isTerminalStatus(status: SessionStatus): boolean {
  return ["completed", "failed", "rejected"].includes(status);
}

function mutatesTerminalSession(type: TraceEventType): boolean {
  return [
    "model.turn_requested",
    "model.turn_received",
    "action_batch.requested",
    "approval.required",
    "action_batch.executed",
    "safety.blocked",
  ].includes(type);
}

function actionTargetDomain(action: ComputerAction): string | undefined {
  const url = action.payload.url;
  return typeof url === "string" ? domainForUrl(url) : undefined;
}

function domainForUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function domainAllowed(domain: string, policy: BrowserPolicy): boolean {
  return Boolean(
    policy.allowDomains?.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`)),
  );
}

function domainDenied(domain: string, policy: BrowserPolicy): boolean {
  return Boolean(
    policy.denyDomains?.some((denied) => domain === denied || domain.endsWith(`.${denied}`)),
  );
}
