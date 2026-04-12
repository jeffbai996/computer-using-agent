import type { AgentAction, AgentSession } from "@cua/core";

export type Screenshot = {
  mimeType: "image/png";
  base64: string;
};

export type ModelStep =
  | {
      type: "action";
      action: AgentAction;
    }
  | {
      type: "complete";
      message: string;
    };

export type ModelInput = {
  task: string;
  session: AgentSession;
  screenshot?: Screenshot;
};

export type ModelClient = {
  nextStep(input: ModelInput): Promise<ModelStep>;
};

export type BrowserExecutor = {
  open(): Promise<void>;
  captureScreenshot(): Promise<Screenshot>;
  execute(action: AgentAction): Promise<void>;
  close(): Promise<void>;
};

export type SessionStore = {
  create(session: AgentSession): Promise<void>;
  save(session: AgentSession): Promise<void>;
  get(sessionId: string): Promise<AgentSession | undefined>;
  list(): Promise<AgentSession[]>;
  export(sessionId: string): Promise<string>;
  saveScreenshot(sessionId: string, eventId: string, screenshot: Screenshot): Promise<string>;
};
