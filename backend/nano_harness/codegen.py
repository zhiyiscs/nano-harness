"""Generate readable, teaching-focused Python from a Nano Harness graph.

The generated file is meant to be read top to bottom. It mirrors the runtime so
that the six blocks on the canvas map to six clearly labelled sections, and the
"harness loop" at the bottom shows the one idea that matters most: the code
around a fixed model decides, step by step, what context it sees, which tool to
call, and how memory changes — then an evaluator scores the result.
"""

from __future__ import annotations

from .schema import (
    ContextBuilderConfig,
    HarnessGraph,
    MemoryConfig,
    ModelPolicyConfig,
    NodeType,
    TaskConfig,
    ToolConfig,
)

# Matches the threshold used by the runtime evaluator.
SUCCESS_THRESHOLD = 0.45


def _first_config(graph: HarnessGraph, node_type: NodeType, fallback):
    for node in graph.nodes:
        if NodeType(node.type) == node_type:
            return node.typed_config()
    return fallback


# Everything below the config constants is static. It is kept as a plain string
# (not an f-string) so the generated code's own braces and f-strings survive.
_BODY = '''
# === 2. MEMORY — what the harness is allowed to remember between steps ======
# The limits below come straight from the Working Memory block on the canvas.
@dataclass
class Memory:
    pool: list[str] = field(default_factory=list)        # candidate doc ids
    curated: dict[str, str] = field(default_factory=dict)  # short kept notes
    history: list[str] = field(default_factory=list)     # what happened so far
    docs: dict[str, str] = field(default_factory=dict)   # full text we have read

    def add_to_pool(self, doc_ids: list[str]) -> int:
        added = 0
        for doc_id in doc_ids:
            if doc_id in self.pool or len(self.pool) >= POOL_LIMIT:
                continue
            self.pool.append(doc_id)
            added += 1
        return added

    def curate(self, doc_id: str, note: str) -> str:
        if doc_id not in self.curated and len(self.curated) >= CURATED_LIMIT:
            return f"Curated evidence is full (limit {CURATED_LIMIT})."
        self.curated[doc_id] = note
        return f"Saved a note on {doc_id}."


# === 5. TOOLS — the only actions the policy may take =======================
def search_corpus(memory: Memory, query: str) -> str:
    words = [w.strip(".,?!") for w in query.lower().split() if len(w) > 2]
    hits = [d for d, text in CORPUS.items() if any(w in text.lower() or w in d for w in words)]
    hits = hits or list(CORPUS)
    added = memory.add_to_pool(hits)
    return f"Found {len(hits)} candidate docs, added {added}. Pool: {memory.pool}"


def read_doc(memory: Memory, doc_id: str) -> str:
    text = memory.docs.get(doc_id) or CORPUS.get(doc_id, "(missing)")
    memory.docs[doc_id] = text  # reading puts the full text into memory
    return text


def curate_tool(memory: Memory, doc_id: str, note: str) -> str:
    return memory.curate(doc_id, note)


def verify(memory: Memory, claim: str) -> str:
    known = " ".join(memory.docs.values()).lower()
    if "crimson brew" in claim.lower():
        required = ["crimson brew", "6 minute", "22:30", "wi-fi", "vegetarian"]
        return "supported" if all(term in known for term in required) else "needs more evidence"
    return "supported" if claim and claim.lower()[:18] in known else "needs more evidence"


def finish(memory: Memory, answer: str) -> str:
    return answer


TOOLS = {
    "search_corpus": lambda m, a: search_corpus(m, a["query"]),
    "read_doc": lambda m, a: read_doc(m, a["doc_id"]),
    "curate": lambda m, a: curate_tool(m, a["doc_id"], a["note"]),
    "verify": lambda m, a: verify(m, a.get("claim", "")),
    "finish": lambda m, a: finish(m, a["answer"]),
}


# === 3. CONTEXT — the slice of memory the model actually sees each step =====
# Each toggle below is one checkbox on the Context Builder block. Turning a
# section off here is exactly what unchecking it on the canvas does.
def build_context(memory: Memory) -> str:
    parts: list[str] = []
    if INCLUDE_TASK:
        parts.append(f"Task: {QUESTION}")
    if INCLUDE_POOL:
        pool = "\\n".join(f"- {d}: {memory.docs.get(d, '')[:80]}" for d in memory.pool)
        parts.append("Candidate pool:\\n" + (pool or "(empty)"))
    if INCLUDE_CURATED:
        curated = "\\n".join(f"- {d}: {n}" for d, n in memory.curated.items())
        parts.append("Curated evidence:\\n" + (curated or "(empty)"))
    if INCLUDE_HISTORY:
        history = "\\n".join(memory.history[-4:])
        parts.append("Recent history:\\n" + (history or "(empty)"))
    context = "\\n\\n".join(parts)
    return context[:TOKEN_BUDGET]  # the token budget caps how much it can see


# === 4. POLICY — the decision maker, the "brain" of the harness ============
# In a real harness this function would call a fixed model with the context and
# read back a tool call. This teaching version follows a fixed plan instead, so
# the loop stays easy to read, but the shape is identical: look at the state,
# return the NEXT action (a tool name + its arguments).
def policy(memory: Memory, step: int) -> tuple[str, dict, str]:
    if step == 1:
        return "search_corpus", {"query": QUESTION}, "Search for candidate evidence."
    planned_reads = ["doc_map", "doc_hours", "doc_amenities"]
    if step in (2, 3, 4):
        doc_id = planned_reads[step - 2]
        if doc_id not in memory.pool and memory.pool:
            doc_id = memory.pool[min(step - 2, len(memory.pool) - 1)]
        return "read_doc", {"doc_id": doc_id}, "Read the next source needed to check the constraints."
    if step == 5 and memory.docs:
        return (
            "curate",
            {
                "doc_id": "doc_amenities",
                "note": "Crimson Brew Cafe matches distance, hours, Wi-Fi, and vegetarian constraints.",
            },
            "Keep the cross-document evidence as a compact note.",
        )
    if step == 6 and memory.curated:
        return (
            "verify",
            {"claim": "Crimson Brew Cafe matches all constraints"},
            "Check the recommendation against the gathered evidence.",
        )
    # Build the answer from what we actually read, then finish.
    if memory.curated:
        answer = (
            "Crimson Brew Cafe is the best match: it is 6 minutes from Harvard Yard, "
            "open until 22:30 on Saturday, and has Wi-Fi plus vegetarian snacks."
        )
    else:
        answer = "I found some sources, but I have not organized enough evidence yet."
    return "finish", {"answer": answer}, "Enough evidence gathered; write the answer."


# === 6. EVALUATE — score the final answer against the task =================
def evaluate(answer: str) -> tuple[float, bool]:
    terms = {t.strip(".,?!").lower() for t in EXPECTED_ANSWER.split() if len(t.strip(".,?!")) > 3}
    if not terms:
        return 0.0, False
    matched = sum(1 for t in terms if t in answer.lower())
    score = matched / len(terms)
    return score, score >= SUCCESS_THRESHOLD


# === THE HARNESS LOOP — this is the whole point ============================
# build context -> policy picks an action -> run the tool -> update memory ->
# repeat until "finish" or we run out of steps -> evaluate.
def run() -> str:
    memory = Memory()
    final_answer = ""
    print(f"Question: {QUESTION}\\n")

    for step in range(1, MAX_STEPS + 1):
        context = build_context(memory)            # 3. what the model sees right now
        name, args, why = policy(memory, step)     # 4. decide the next action

        if name not in ENABLED_TOOLS:              # tools turned off on the canvas
            observation = f"'{name}' is disabled on the canvas; skipping."
        else:
            observation = TOOLS[name](memory, args)  # 5. take the action

        memory.history.append(f"{name} -> {observation}")
        print(f"Step {step} | {name}: {why}")
        print(f"         result: {observation}\\n")

        if name == "finish":
            final_answer = observation
            break

    score, passed = evaluate(final_answer)          # 6. score it
    print("Final answer:", final_answer)
    print(f"Score: {score:.2f}  ({'PASS' if passed else 'needs work'}; threshold {SUCCESS_THRESHOLD})")
    return final_answer


if __name__ == "__main__":
    run()
'''


def generate_python(graph: HarnessGraph) -> str:
    task: TaskConfig = _first_config(
        graph,
        NodeType.TASK,
        TaskConfig(question="What is a harness?", expected_answer="context memory tools evaluation"),
    )
    memory: MemoryConfig = _first_config(graph, NodeType.MEMORY, MemoryConfig())
    context: ContextBuilderConfig = _first_config(graph, NodeType.CONTEXT_BUILDER, ContextBuilderConfig())
    policy: ModelPolicyConfig = _first_config(graph, NodeType.MODEL_POLICY, ModelPolicyConfig())

    enabled_tools = [
        ToolConfig.model_validate(node.config).tool_name.value
        for node in graph.nodes
        if NodeType(node.type) == NodeType.TOOL and ToolConfig.model_validate(node.config).enabled
    ]

    header = f'''\
"""Generated Nano Harness — a tiny AI harness you can read top to bottom.

A "harness" is the code around a fixed model. It owns six jobs, and each one is
one block on the canvas:

  1. TASK     - the question to answer and how success is measured.
  2. MEMORY   - what may be remembered between steps (and how much).
  3. CONTEXT  - the slice of memory the model sees on each step.
  4. POLICY   - the decision maker: given the context, pick the next action.
  5. TOOLS    - the actions the policy is allowed to call.
  6. EVALUATE - score the final answer.

The heart of it is the loop near the bottom (`run`). Change a value below or a
toggle on the canvas and the behaviour of that loop changes with it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# A tiny toy corpus so the demo runs without a real search index.
CORPUS = {{
    "doc_map": "Crimson Brew Cafe is 6 minutes from Harvard Yard. Charles River Coffee is 12 minutes away. Museum Street Tea is 8 minutes away.",
    "doc_hours": "Saturday hours: Crimson Brew Cafe closes at 22:30. Charles River Coffee closes at 23:00. Museum Street Tea closes at 20:30.",
    "doc_amenities": "Crimson Brew Cafe has Wi-Fi and vegetarian pastries. Charles River Coffee has Wi-Fi but no vegetarian snacks. Museum Street Tea has vegetarian snacks but no Wi-Fi.",
    "doc_reviews": "Crimson Brew Cafe is quiet after 20:00. Charles River Coffee is crowded on Saturday nights. Museum Street Tea has limited seating.",
}}

# === 1. TASK (from the Task block) =========================================
QUESTION = {task.question!r}
EXPECTED_ANSWER = {task.expected_answer!r}  # keywords the evaluator looks for
SUCCESS_THRESHOLD = {SUCCESS_THRESHOLD}  # fraction of keywords needed to "pass"

# === Settings pulled from the canvas blocks ================================
ENABLED_TOOLS = {enabled_tools!r}     # only tools enabled on the canvas
POOL_LIMIT = {memory.pool_limit}            # Working Memory: candidate pool size
CURATED_LIMIT = {memory.curated_limit}         # Working Memory: kept-notes limit
MAX_STEPS = {policy.max_steps}              # Model Policy: max turns in the loop
INCLUDE_TASK = {context.include_task}        # Context Builder toggles ...
INCLUDE_POOL = {context.include_pool}
INCLUDE_CURATED = {context.include_curated}
INCLUDE_HISTORY = {context.include_history}
TOKEN_BUDGET = {context.token_budget}        # Context Builder: max context size
'''

    return header + _BODY
