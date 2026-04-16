import type {
  WorkflowInputs,
  WorkflowMode,
  WorkflowSummary,
} from "@cua/core";
import { foodOrderWorkflow } from "./food-order.js";
import type { WorkflowDefinition, WorkflowStartPlan } from "./types.js";

const workflows: WorkflowDefinition[] = [foodOrderWorkflow];

export function listWorkflowSummaries(): WorkflowSummary[] {
  return workflows.map(toSummary);
}

export function getWorkflowSummary(workflowId: string): WorkflowSummary | undefined {
  const workflow = getWorkflow(workflowId);
  return workflow ? toSummary(workflow) : undefined;
}

export function createWorkflowStart(
  workflowId: string,
  options: { mode?: WorkflowMode; inputs?: WorkflowInputs } = {},
): WorkflowStartPlan {
  const workflow = getWorkflow(workflowId);

  if (!workflow) {
    throw new Error(`Unknown workflow ${workflowId}.`);
  }

  const mode = options.mode ?? workflow.defaultMode;

  if (!workflow.modes.includes(mode)) {
    throw new Error(`Workflow ${workflowId} does not support mode ${mode}.`);
  }

  return workflow.createStart({
    mode,
    inputs: options.inputs ?? {},
  });
}

export function getWorkflowFixtureHtml(workflowId: string): string | undefined {
  return getWorkflow(workflowId)?.fixtureHtml?.();
}

function getWorkflow(workflowId: string): WorkflowDefinition | undefined {
  return workflows.find((workflow) => workflow.id === workflowId);
}

function toSummary(workflow: WorkflowDefinition): WorkflowSummary {
  return {
    id: workflow.id,
    title: workflow.title,
    description: workflow.description,
    modes: workflow.modes,
    defaultMode: workflow.defaultMode,
    inputFields: workflow.inputFields,
  };
}

export type { WorkflowDefinition, WorkflowStartPlan } from "./types.js";

