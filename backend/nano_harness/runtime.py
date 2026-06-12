"""Executable toy runtime for Nano Harness graphs."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, TypeVar

from .schema import (
    ContextBuilderConfig,
    EvaluatorConfig,
    HarnessGraph,
    MemoryConfig,
    ModelPolicyConfig,
    NodeType,
    RunMetrics,
    RunResponse,
    TaskConfig,
    ToolCall,
    ToolConfig,
    ToolName,
    TraceStep,
)


TOY_CORPUS: dict[str, str] = {
    "doc_map": (
        "Harvard Square distance notes: Crimson Brew Cafe is a 6 minute walk "
        "from Harvard Yard. Charles River Coffee is a 12 minute walk. Museum "
        "Street Tea is an 8 minute walk."
    ),
    "doc_hours": (
        "Saturday hours: Crimson Brew Cafe closes at 22:30. Charles River "
        "Coffee closes at 23:00. Museum Street Tea closes at 20:30."
    ),
    "doc_amenities": (
        "Amenities: Crimson Brew Cafe has Wi-Fi, quiet tables, and vegetarian "
        "pastries. Charles River Coffee has Wi-Fi but no vegetarian snacks. "
        "Museum Street Tea has vegetarian snacks but no Wi-Fi."
    ),
    "doc_reviews": (
        "Recent reviews: Crimson Brew Cafe is quiet after 20:00 and works well "
        "for laptop study. Charles River Coffee is crowded on Saturday nights. "
        "Museum Street Tea has limited seating."
    ),
    "doc_old_blog": (
        "Old student blog from 2021: Crimson Brew Cafe used to close at 20:00. "
        "This page may be outdated and should be checked against current hours."
    ),
}


@dataclass
class WorkingMemory:
    """Tiny two-tier memory inspired by Harness-1's working-memory design."""

    pool_limit: int = 5
    curated_limit: int = 3
    include_history: bool = True
    pool: list[str] = field(default_factory=list)
    curated: dict[str, str] = field(default_factory=dict)
    history: list[str] = field(default_factory=list)
    doc_store: dict[str, str] = field(default_factory=dict)

    def add_to_pool(self, doc_ids: list[str]) -> int:
        added = 0
        for doc_id in doc_ids:
            if doc_id in self.pool:
                continue
            if len(self.pool) >= self.pool_limit:
                break
            self.pool.append(doc_id)
            added += 1
        return added

    def read_doc(self, doc_id: str) -> str:
        if doc_id not in self.doc_store and doc_id in TOY_CORPUS:
            self.doc_store[doc_id] = TOY_CORPUS[doc_id]
        return self.doc_store.get(doc_id, "(document not found in memory)")

    def curate(self, doc_id: str, note: str) -> str:
        if doc_id not in self.doc_store:
            return f"Cannot curate {doc_id}; read or search it first."
        if len(self.curated) >= self.curated_limit and doc_id not in self.curated:
            return "Curated evidence is full; remove evidence or increase the limit."
        self.curated[doc_id] = note
        return f"Curated {doc_id}: {note}"

    def snapshot(self) -> dict[str, Any]:
        return {
            "pool": list(self.pool),
            "curated": dict(self.curated),
            "history": list(self.history),
            "doc_store_ids": sorted(self.doc_store),
        }

    def reset_volatile(self) -> None:
        """Wipe everything kept between steps.

        Used when no Working Memory block is present: the harness "forgets" what
        it found as soon as the step ends, so it cannot accumulate evidence.
        """
        self.pool.clear()
        self.curated.clear()
        self.history.clear()
        self.doc_store.clear()


class Tool(Protocol):
    name: ToolName

    def run(self, memory: WorkingMemory, args: dict[str, Any]) -> str:
        ...


class SearchCorpusTool:
    name = ToolName.SEARCH

    def run(self, memory: WorkingMemory, args: dict[str, Any]) -> str:
        query = str(args.get("query", "")).lower()
        terms = {term.strip(".,?!") for term in query.split() if len(term) > 2}
        scored: list[tuple[int, str]] = []
        for doc_id, text in TOY_CORPUS.items():
            score = sum(1 for term in terms if term in text.lower() or term in doc_id)
            if score:
                scored.append((score, doc_id))
        if not scored:
            scored = [(1, "doc_harness"), (1, "doc_memory")]
        doc_ids = [doc_id for _, doc_id in sorted(scored, reverse=True)]
        added = memory.add_to_pool(doc_ids)
        return f"Found {len(doc_ids)} candidate docs; added {added}: {', '.join(doc_ids[:memory.pool_limit])}"


class ReadDocTool:
    name = ToolName.READ

    def run(self, memory: WorkingMemory, args: dict[str, Any]) -> str:
        doc_id = str(args.get("doc_id", ""))
        text = memory.read_doc(doc_id)
        return f"# {doc_id}\n{text}"


class CurateTool:
    name = ToolName.CURATE

    def run(self, memory: WorkingMemory, args: dict[str, Any]) -> str:
        doc_id = str(args.get("doc_id", ""))
        note = str(args.get("note", "Useful evidence."))
        return memory.curate(doc_id, note)


class VerifyTool:
    name = ToolName.VERIFY

    def run(self, memory: WorkingMemory, args: dict[str, Any]) -> str:
        claim = str(args.get("claim", ""))
        evidence_text = " ".join(memory.doc_store.values()).lower()
        if "crimson brew" in claim.lower():
            required = ["crimson brew", "6 minute", "22:30", "wi-fi", "vegetarian"]
            verdict = "supported" if all(term in evidence_text for term in required) else "needs more evidence"
        else:
            verdict = "supported" if claim.lower() and claim.lower()[:18] in evidence_text else "needs more evidence"
        return f"Verification result for '{claim}': {verdict}."


class FinishTool:
    name = ToolName.FINISH

    def run(self, memory: WorkingMemory, args: dict[str, Any]) -> str:
        return str(args.get("answer", ""))


class ContextBuilder:
    def __init__(self, config: ContextBuilderConfig):
        self.config = config

    def render(self, task: TaskConfig, memory: WorkingMemory) -> str:
        parts: list[str] = []
        if self.config.include_task:
            parts.append(f"Task: {task.question}")
            parts.append(f"Metric: {task.success_metric}")
        if self.config.include_pool:
            pool_lines = [f"- {doc_id}: {memory.doc_store.get(doc_id, '')[:120]}" for doc_id in memory.pool]
            parts.append("Candidate pool:\n" + ("\n".join(pool_lines) if pool_lines else "(empty)"))
        if self.config.include_curated:
            curated_lines = [f"- {doc_id}: {note}" for doc_id, note in memory.curated.items()]
            parts.append("Curated evidence:\n" + ("\n".join(curated_lines) if curated_lines else "(empty)"))
        if self.config.include_history and memory.include_history:
            parts.append("History:\n" + ("\n".join(memory.history[-6:]) if memory.history else "(empty)"))
        text = "\n\n".join(parts)
        return text[: self.config.token_budget]


class MockPolicy:
    """Deterministic teaching policy that adapts to the tools that are enabled.

    A real harness would call a fixed model here and read back a tool call. This
    version follows a fixed plan (search -> read -> curate -> finish) but only
    uses tools that exist on the canvas, so a minimal harness still does
    something sensible (it just guesses) and we can teach why each module helps.
    """

    def __init__(self, config: ModelPolicyConfig):
        self.config = config

    def choose(
        self,
        task: TaskConfig,
        memory: WorkingMemory,
        step: int,
        enabled: set[str],
    ) -> tuple[ToolCall, str]:
        if ToolName.SEARCH.value in enabled and step == 1:
            return (
                ToolCall(name=ToolName.SEARCH, args={"query": task.question}),
                "Search for candidate evidence.",
            )
        planned_reads = ["doc_map", "doc_hours", "doc_amenities"]
        if ToolName.READ.value in enabled and step in (2, 3, 4):
            doc_id = planned_reads[step - 2]
            if doc_id not in memory.pool and memory.pool:
                doc_id = memory.pool[min(step - 2, len(memory.pool) - 1)]
            return (
                ToolCall(name=ToolName.READ, args={"doc_id": doc_id}),
                "Read the next source needed to check the constraints.",
            )
        if ToolName.CURATE.value in enabled and memory.doc_store and step == 5:
            return (
                ToolCall(
                    name=ToolName.CURATE,
                    args={
                        "doc_id": "doc_amenities",
                        "note": (
                            "Crimson Brew Cafe matches the constraints: 6 minutes "
                            "from Harvard Yard, open until 22:30 on Saturday, "
                            "with Wi-Fi and vegetarian snacks."
                        ),
                    },
                ),
                "Keep the cross-document evidence as a compact note.",
            )
        if ToolName.VERIFY.value in enabled and memory.curated and step == 6:
            return (
                ToolCall(
                    name=ToolName.VERIFY,
                    args={"claim": "Crimson Brew Cafe matches all constraints"},
                ),
                "Check the recommendation against the gathered evidence.",
            )

        # Nothing left to gather: answer from whatever we actually read.
        if memory.curated:
            answer = (
                "Crimson Brew Cafe is the best match: it is a 6 minute walk from "
                "Harvard Yard, stays open until 22:30 on Saturday, and has "
                "Wi-Fi plus vegetarian snacks."
            )
            explanation = "Enough evidence gathered; answer from the curated note."
        elif memory.doc_store:
            answer = (
                "I found some sources, but I have not yet organized all constraints "
                "into a confident recommendation."
            )
            explanation = "Some evidence was read, but the harness has not curated it yet."
        else:
            answer = "I am not sure yet - I have nothing to look at."
            explanation = "No tools or memory to gather evidence, so just guess."
        return (
            ToolCall(name=ToolName.FINISH, args={"answer": answer}),
            explanation,
        )


class Evaluator:
    def __init__(self, config: EvaluatorConfig):
        self.config = config

    def score(self, task: TaskConfig, answer: str) -> tuple[float, bool]:
        expected_terms = {
            term.strip(".,?!").lower()
            for term in task.expected_answer.split()
            if len(term.strip(".,?!")) > 3
        }
        answer_lower = answer.lower()
        if not expected_terms:
            return 0.0, False
        matched = sum(1 for term in expected_terms if term in answer_lower)
        score = matched / len(expected_terms)
        return score, score >= 0.45


T = TypeVar("T")


def _first_config(graph: HarnessGraph, node_type: NodeType, fallback: T) -> T:
    for node in graph.nodes:
        if NodeType(node.type) == node_type:
            return node.typed_config()  # type: ignore[return-value]
    return fallback


def _enabled_tools(graph: HarnessGraph) -> dict[str, Tool]:
    tool_classes: dict[ToolName, Tool] = {
        ToolName.SEARCH: SearchCorpusTool(),
        ToolName.READ: ReadDocTool(),
        ToolName.CURATE: CurateTool(),
        ToolName.VERIFY: VerifyTool(),
        ToolName.FINISH: FinishTool(),
    }
    enabled: dict[str, Tool] = {}
    for node in graph.nodes:
        if NodeType(node.type) != NodeType.TOOL:
            continue
        config = ToolConfig.model_validate(node.config)
        if config.enabled:
            enabled[config.tool_name.value] = tool_classes[config.tool_name]
    return enabled


def _present_types(graph: HarnessGraph) -> set[NodeType]:
    return {NodeType(node.type) for node in graph.nodes}


def run_graph(graph: HarnessGraph) -> RunResponse:
    """Run the harness with whatever blocks exist.

    Instead of refusing to run an incomplete graph, the runtime degrades
    gracefully so a learner can build the harness up one module at a time and
    feel why each module matters:

    - No Working Memory  -> the harness forgets between steps.
    - No Context Builder -> the model sees nothing each step.
    - No Evaluator       -> the answer is produced but not scored.
    """
    issues = graph.issues()
    present = _present_types(graph)
    has_memory = NodeType.MEMORY in present
    has_context = NodeType.CONTEXT_BUILDER in present
    has_evaluator = NodeType.EVALUATOR in present

    task = _first_config(
        graph,
        NodeType.TASK,
        TaskConfig(
            question=(
                "Which cafe near Harvard Yard is within 10 minutes, open after "
                "21:00 on Saturday, and has Wi-Fi plus vegetarian snacks?"
            ),
            expected_answer="Crimson Brew Cafe 6 minute 22:30 Wi-Fi vegetarian",
        ),
    )
    memory_config = _first_config(graph, NodeType.MEMORY, MemoryConfig())
    policy_config = _first_config(graph, NodeType.MODEL_POLICY, ModelPolicyConfig())
    context_config = _first_config(graph, NodeType.CONTEXT_BUILDER, ContextBuilderConfig())
    evaluator_config = _first_config(graph, NodeType.EVALUATOR, EvaluatorConfig())

    memory = WorkingMemory(
        pool_limit=memory_config.pool_limit,
        curated_limit=memory_config.curated_limit,
        include_history=memory_config.include_history,
    )
    context_builder = ContextBuilder(context_config)
    policy = MockPolicy(policy_config)
    evaluator = Evaluator(evaluator_config)
    tools = _enabled_tools(graph)
    enabled = set(tools)

    notes: list[str] = []
    if not has_memory:
        notes.append(
            "No Working Memory block: the harness forgets what it finds between "
            "steps, so it cannot gather evidence. Add Working Memory."
        )
    if not has_context:
        notes.append(
            "No Context Builder block: the model sees nothing each step. Add a "
            "Context Builder to render the task and memory into what the model reads."
        )
    if not has_evaluator:
        notes.append(
            "No Evaluator block: the answer is produced but never scored. Add an "
            "Evaluator to measure whether the harness did well."
        )
    for required_tool in (ToolName.SEARCH, ToolName.READ, ToolName.CURATE, ToolName.FINISH):
        if required_tool.value not in enabled:
            notes.append(f"No {required_tool.value} tool on the canvas yet.")

    trace: list[TraceStep] = []
    final_answer = ""
    total_context_chars = 0

    for step in range(1, policy_config.max_steps + 1):
        if has_context:
            context = context_builder.render(task, memory)
        else:
            context = "(no context builder: the model sees nothing this step)"
        total_context_chars += len(context)

        action, explanation = policy.choose(task, memory, step, enabled)
        tool = tools.get(action.name)
        if tool is None:
            observation = f"Tool '{action.name}' is not on the canvas yet."
        else:
            observation = tool.run(memory, action.args)
        memory.history.append(f"{action.name}({action.args}) -> {observation[:160]}")

        if action.name == ToolName.FINISH:
            final_answer = observation

        trace.append(
            TraceStep(
                step=step,
                context=context,
                action=action,
                observation=observation,
                memory=memory.snapshot(),
                explanation=explanation,
            )
        )

        # Without a memory block, nothing carries over to the next step.
        if not has_memory:
            memory.reset_volatile()

        if action.name == ToolName.FINISH:
            break

    if has_evaluator:
        score, success = evaluator.score(task, final_answer)
        scored = True
    else:
        score, success, scored = 0.0, False, False

    return RunResponse(
        graph_name=graph.name,
        issues=issues,
        trace=trace,
        final_answer=final_answer,
        notes=notes,
        metrics=RunMetrics(
            score=score,
            success=success,
            scored=scored,
            steps=len(trace),
            tool_calls=len(trace),
            context_chars=total_context_chars,
            curated_docs=len(memory.curated),
        ),
    )
