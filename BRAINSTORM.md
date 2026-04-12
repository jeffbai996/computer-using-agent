# Brainstorm

This is a working list of directions for `computer-using-agent`.

## Product shapes

1. Browser operator

   Let the agent handle repetitive browser workflows like form filling, account setup, account maintenance, and other annoying but structured tasks.

2. QA runner

   Use computer use as a regression tester that can click through a flow, capture screenshots, and tell you where the experience broke.

3. Research collector

   Have the agent gather structured information from websites that are hard to scrape cleanly, then normalize the results into JSON or markdown.

4. Semi-automated ops copilot

   The agent can draft actions, but a human approves the dangerous ones. Good fit for internal workflow automation and customer support tooling.

5. Desktop helper

   A thin wrapper around screen interaction for tasks where the app has no API, the API is flaky, or the UI is the source of truth.

## Core primitives

- Screenshot timeline
- Action trace
- Approval checkpoint
- Retry / rollback boundaries
- Domain allowlist / denylist
- Session export

## Safety posture

- Default to watch mode on sensitive flows
- Ask before any irreversible action
- Stop on ambiguity rather than improvising
- Make it easy to review what the agent saw and did

## Possible first demo

The cleanest first demo is probably a "web workflow autopilot" that:

- starts from a natural language task
- opens a browser
- executes a narrow flow
- pauses for approval before submitting anything sensitive
- exports a short run log and screenshots

That gives you something useful without pretending the model is bulletproof.

