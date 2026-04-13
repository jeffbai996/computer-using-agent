import type {
  ActionBatch,
  AgentSession,
  BrowserSnapshot,
  SafetyCheck,
  TraceEvent,
  TurnOutcome,
} from "@cua/core";

export type ModelTurnInput = {
  task: string;
  session: AgentSession;
  snapshot?: BrowserSnapshot;
  acknowledgedSafetyChecks?: SafetyCheck[];
};

export type ModelClient = {
  createTurn(input: ModelTurnInput): Promise<TurnOutcome>;
};

export type BatchExecutionResult = {
  executedActions: ActionBatch["actions"];
  snapshot: BrowserSnapshot;
};

export type BrowserExecutor = {
  open(sessionId: string): Promise<void>;
  captureSnapshot(sessionId: string): Promise<BrowserSnapshot>;
  executeBatch(sessionId: string, batch: ActionBatch): Promise<BatchExecutionResult>;
  close(sessionId: string): Promise<void>;
};

export type SessionExportBundle = {
  projection: AgentSession;
  events: TraceEvent[];
};

export type ScreenshotArtifact = {
  urlPath: string;
  filePath: string;
};

export type SessionStore = {
  create(session: AgentSession): Promise<void>;
  appendEvent(session: AgentSession, event: TraceEvent): Promise<AgentSession>;
  get(sessionId: string): Promise<AgentSession | undefined>;
  list(): Promise<AgentSession[]>;
  export(sessionId: string): Promise<string>;
  saveScreenshot(
    sessionId: string,
    eventId: string,
    snapshot: BrowserSnapshot,
  ): Promise<ScreenshotArtifact>;
  saveRawModelResponse(sessionId: string, eventId: string, response: unknown): Promise<string>;
};
