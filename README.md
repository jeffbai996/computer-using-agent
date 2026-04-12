# computer-using-agent

An open-source playground for building human-in-the-loop apps on top of OpenAI's computer-use preview tooling.

## Why this repo exists

Computer use is interesting when the work is repetitive, screen-driven, and annoying enough that you would rather hand it to an agent with guardrails than keep doing it yourself.

This repo is meant to stay public, simple, and experiment-friendly while the product shape is still fuzzy.

## What we might build

- A browser operator for repetitive admin tasks
- A QA runner that can click through flows and report where the UI breaks
- A research assistant that collects data from web workflows with an audit trail
- A semi-automated back office copilot that asks for confirmation before risky steps
- A desktop helper for brittle, screen-based tasks that normal APIs do not cover

## Design principles

- Keep the human in the loop for anything destructive, expensive, or irreversible
- Log every meaningful step so failures are debuggable
- Prefer narrow prompts and explicit state over clever autonomy
- Treat preview APIs as moving targets and design for change
- Make the first version boring enough to trust

## Build constraint

OpenAI's current computer-use guide describes `computer-use-preview` as a Responses API model with safety checks built in, so this repo should lean hard into approval checkpoints, trace logs, and watch-mode UX rather than pretending the agent can be fully autonomous out of the gate.

## Brainstorming directions

See [BRAINSTORM.md](./BRAINSTORM.md) for the initial idea space.

## License

MIT. See [LICENSE](./LICENSE).
