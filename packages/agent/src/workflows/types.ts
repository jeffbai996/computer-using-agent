import type {
  BrowserPolicy,
  WorkflowInputs,
  WorkflowMode,
  WorkflowRunMetadata,
  WorkflowSummary,
} from "@cua/core";

export type WorkflowStartOptions = {
  mode?: WorkflowMode;
  inputs?: WorkflowInputs;
};

export type WorkflowStartPlan = {
  task: string;
  startUrl: string;
  metadata: WorkflowRunMetadata;
};

export type WorkflowDefinition = WorkflowSummary & {
  createStart(options: Required<WorkflowStartOptions>): WorkflowStartPlan;
  fixtureHtml?: () => string;
  policyForMode?: (mode: WorkflowMode, inputs: WorkflowInputs) => BrowserPolicy | undefined;
};

