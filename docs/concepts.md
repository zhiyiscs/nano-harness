# Nano Harness Concepts

Nano Harness teaches the smallest useful version of a harness: the code around a
fixed model that controls context, memory, tools, execution, and evaluation.

## Mapping To Harness-1

Harness-1 is a full research system for stateful retrieval. Nano Harness keeps
only the core teaching concepts:

- `WorkingMemory` becomes a small pool, curated-evidence map, history list, and
  document store.
- Search, read, curate, verify, and finish become draggable tool blocks.
- Context rendering is explicit so learners can see what the model receives.
- The episode trace shows how tool calls update memory over time.

## Mapping To Meta-Harness

Meta-Harness searches over harness designs. Nano Harness does not run that outer
optimization loop yet, but it keeps the same mental model:

- A harness is a candidate design.
- A graph is the candidate's interface and wiring.
- A run produces metrics and traces.
- A generated Python file makes the design inspectable and portable.

## MVP Learning Flow

1. Load the Retrieval QA template.
2. Inspect how task, memory, context, policy, tools, and evaluator connect.
3. Run the graph and watch search, read, curate, and finish actions.
4. Change limits or disable a tool and rerun.
5. Generate Python to see the same design as code.
