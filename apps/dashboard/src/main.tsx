import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  AgentSession,
  TraceEvent,
  WorkflowInputs,
  WorkflowMode,
  WorkflowSummary,
} from "@cua/core";
import "./styles.css";

type ApiState = {
  sessions: AgentSession[];
  workflows: WorkflowSummary[];
  selected?: AgentSession;
  error?: string;
};

type WorkflowLauncherState = {
  workflowId: string;
  mode: WorkflowMode;
  inputs: Record<string, string>;
};

function App() {
  const [task, setTask] = useState("");
  const [state, setState] = useState<ApiState>({ sessions: [], workflows: [] });
  const [launcher, setLauncher] = useState<WorkflowLauncherState>({
    workflowId: "food-order",
    mode: "fixture",
    inputs: {},
  });
  const [isBusy, setIsBusy] = useState(false);

  async function refresh(selectedId = state.selected?.id) {
    const [sessions, workflows] = await Promise.all([
      fetchJson<AgentSession[]>("/api/sessions"),
      fetchJson<WorkflowSummary[]>("/api/workflows"),
    ]);
    const selected = selectedId
      ? await fetchJson<AgentSession>(`/api/sessions/${selectedId}`)
      : sessions[0];

    setState({ sessions, workflows, selected });

    if (!workflows.some((workflow) => workflow.id === launcher.workflowId) && workflows[0]) {
      setLauncher((current) => ({
        ...current,
        workflowId: workflows[0].id,
        mode: workflows[0].defaultMode,
      }));
    }
  }

  useEffect(() => {
    refresh().catch((error: unknown) => {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error),
      }));
    });
  }, []);

  async function startTask() {
    if (!task.trim()) {
      return;
    }

    setIsBusy(true);
    try {
      const session = await fetchJson<AgentSession>("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      setTask("");
      await refresh(session.id);
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function startWorkflow() {
    const workflow = state.workflows.find((item) => item.id === launcher.workflowId);

    if (!workflow) {
      return;
    }

    setIsBusy(true);
    try {
      const session = await fetchJson<AgentSession>(
        `/api/workflows/${workflow.id}/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: launcher.mode,
            inputs: workflowInputs(workflow, launcher.inputs),
          }),
        },
      );
      await refresh(session.id);
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function decide(approved: boolean) {
    const selected = state.selected;

    if (!selected) {
      return;
    }

    setIsBusy(true);
    try {
      const endpoint = approved ? "approve" : "reject";
      await fetchJson<AgentSession>(`/api/sessions/${selected.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: approved ? undefined : "Rejected in dashboard" }),
      });
      await refresh(selected.id);
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  function showError(error: unknown) {
    setState((current) => ({
      ...current,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  const selectedWorkflow =
    state.workflows.find((workflow) => workflow.id === launcher.workflowId) ??
    state.workflows[0];
  const screenshotEvent = [...(state.selected?.events ?? [])]
    .reverse()
    .find((event) => event.type === "browser.snapshot_captured");

  return (
    <main className="shell">
      <section className="command-strip" aria-label="Task launcher">
        <div>
          <p className="eyebrow">Local CUA console</p>
          <h1>Run narrow browser jobs with approval gates.</h1>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void startTask();
          }}
        >
          <input
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="Example: open a browser and click the mock button"
          />
          <button disabled={isBusy || !task.trim()}>Start</button>
        </form>
      </section>

      {selectedWorkflow ? (
        <WorkflowLauncher
          busy={isBusy}
          launcher={launcher}
          workflow={selectedWorkflow}
          workflows={state.workflows}
          onChange={setLauncher}
          onStart={() => void startWorkflow()}
        />
      ) : null}

      {state.error ? <p className="error">{state.error}</p> : null}

      <section className="workspace" aria-label="Agent workspace">
        <aside className="sessions">
          <h2>Sessions</h2>
          {state.sessions.map((session) => (
            <button
              key={session.id}
              className={session.id === state.selected?.id ? "session active" : "session"}
              onClick={() => void refresh(session.id)}
            >
              <span>{session.workflow?.title ?? session.task}</span>
              <small>
                {session.status}
                {session.workflow ? ` - ${session.workflow.mode}` : ""}
              </small>
            </button>
          ))}
        </aside>

        <section className="run-panel" aria-label="Selected session">
          {state.selected ? (
            <>
              <div className="run-header">
                <div>
                  <p className="eyebrow">
                    {state.selected.workflow
                      ? `${state.selected.workflow.title} / ${state.selected.status}`
                      : state.selected.status}
                  </p>
                  <h2>{state.selected.task}</h2>
                </div>
                <div className="approval-bar">
                  <button
                    disabled={isBusy || state.selected.status !== "awaiting_approval"}
                    onClick={() => void decide(true)}
                  >
                    Approve
                  </button>
                  <button
                    className="secondary"
                    disabled={isBusy || state.selected.status !== "awaiting_approval"}
                    onClick={() => void decide(false)}
                  >
                    Reject
                  </button>
                </div>
              </div>

              <div className="screen-and-trace">
                <figure className="screen">
                  {screenshotEvent ? (
                    <img
                      src={String(
                        (screenshotEvent.data.snapshot as { screenshotPath?: string })
                          .screenshotPath,
                      )}
                      alt="Latest agent screenshot"
                    />
                  ) : (
                    <figcaption>No screenshot captured yet.</figcaption>
                  )}
                </figure>
                <div className="side-stack">
                  <ApprovalCard session={state.selected} />
                  <EventTrace events={state.selected.events} />
                </div>
              </div>
            </>
          ) : (
            <p className="empty">Start a task or workflow to create the first local session.</p>
          )}
        </section>
      </section>
    </main>
  );
}

function WorkflowLauncher({
  busy,
  launcher,
  workflow,
  workflows,
  onChange,
  onStart,
}: {
  busy: boolean;
  launcher: WorkflowLauncherState;
  workflow: WorkflowSummary;
  workflows: WorkflowSummary[];
  onChange: (state: WorkflowLauncherState) => void;
  onStart: () => void;
}) {
  return (
    <section className="workflow-panel" aria-label="Workflow launcher">
      <div>
        <p className="eyebrow">Workflow pack</p>
        <h2>{workflow.title}</h2>
        <p>{workflow.description}</p>
      </div>
      <div className="workflow-controls">
        <label>
          Workflow
          <select
            value={launcher.workflowId}
            onChange={(event) => {
              const nextWorkflow = workflows.find((item) => item.id === event.target.value);
              onChange({
                workflowId: event.target.value,
                mode: nextWorkflow?.defaultMode ?? "fixture",
                inputs: {},
              });
            }}
          >
            {workflows.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mode
          <select
            value={launcher.mode}
            onChange={(event) =>
              onChange({ ...launcher, mode: event.target.value as WorkflowMode })
            }
          >
            {workflow.modes.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
        {workflow.inputFields.map((field) => (
          <label key={field.name}>
            {field.label}
            {field.kind === "textarea" ? (
              <textarea
                value={launcher.inputs[field.name] ?? String(field.defaultValue ?? "")}
                placeholder={field.placeholder}
                onChange={(event) =>
                  onChange({
                    ...launcher,
                    inputs: { ...launcher.inputs, [field.name]: event.target.value },
                  })
                }
              />
            ) : (
              <input
                type={field.kind === "number" ? "number" : "text"}
                value={launcher.inputs[field.name] ?? String(field.defaultValue ?? "")}
                placeholder={field.placeholder}
                onChange={(event) =>
                  onChange({
                    ...launcher,
                    inputs: { ...launcher.inputs, [field.name]: event.target.value },
                  })
                }
              />
            )}
          </label>
        ))}
        <button disabled={busy} onClick={onStart}>
          Start workflow
        </button>
      </div>
    </section>
  );
}

function ApprovalCard({ session }: { session: AgentSession }) {
  if (!session.pendingActionBatch) {
    return (
      <section className="approval-card">
        <strong>No pending approval</strong>
        <span>{session.status}</span>
      </section>
    );
  }

  return (
    <section className="approval-card waiting">
      <strong>Approval required</strong>
      <span>{session.pendingActionBatch.actions.length} pending actions</span>
      {session.pendingSafetyChecks?.map((check) => (
        <small key={check.id}>{check.message}</small>
      ))}
    </section>
  );
}

function EventTrace({ events }: { events: TraceEvent[] }) {
  return (
    <ol className="trace">
      {events.map((event) => (
        <li key={event.id}>
          <strong>{event.type}</strong>
          <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
        </li>
      ))}
    </ol>
  );
}

function workflowInputs(
  workflow: WorkflowSummary,
  rawInputs: Record<string, string>,
): WorkflowInputs {
  return Object.fromEntries(
    workflow.inputFields.map((field) => {
      const raw = rawInputs[field.name] ?? field.defaultValue ?? "";
      return [
        field.name,
        field.kind === "number" && raw !== "" ? Number(raw) : String(raw),
      ];
    }),
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
