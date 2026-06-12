"""Built-in teaching templates for the Nano Harness builder."""

from __future__ import annotations

from .schema import GraphEdge, GraphNode, HarnessGraph, Position, TemplateSummary


def retrieval_qa_template() -> HarnessGraph:
    return HarnessGraph(
        name="Retrieval QA Harness",
        description="A tiny stateful retrieval harness with memory, tools, context, and evaluation.",
        nodes=[
            GraphNode(
                id="task",
                type="task",
                label="Task",
                position=Position(x=80, y=220),
                config={
                    "question": (
                        "I am studying near Harvard University on Saturday night. "
                        "Which cafe near Harvard Yard is within a 10 minute walk, "
                        "open after 21:00, and has both Wi-Fi and vegetarian snacks?"
                    ),
                    "expected_answer": "Crimson Brew Cafe 6 minute 22:30 Wi-Fi vegetarian",
                    "success_metric": "contains_expected_answer",
                    "dataset": "toy_retrieval",
                },
            ),
            GraphNode(
                id="memory",
                type="memory",
                label="Working Memory",
                position=Position(x=310, y=90),
                config={"pool_limit": 5, "curated_limit": 3, "include_history": True},
            ),
            GraphNode(
                id="context",
                type="context_builder",
                label="Context Builder",
                position=Position(x=310, y=250),
                config={
                    "include_task": True,
                    "include_pool": True,
                    "include_curated": True,
                    "include_history": True,
                    "token_budget": 1200,
                },
            ),
            GraphNode(
                id="policy",
                type="model_policy",
                label="Model Policy",
                position=Position(x=540, y=250),
                config={
                    "policy_kind": "mock",
                    "max_steps": 7,
                    "explanation": "A deterministic teaching policy checks distance, hours, amenities, then answers.",
                },
            ),
            *[
                GraphNode(
                    id=f"tool_{tool_name}",
                    type="tool",
                    label=label,
                    position=Position(x=770, y=40 + index * 90),
                    config={
                        "tool_name": tool_name,
                        "enabled": True,
                        "description": description,
                    },
                )
                for index, (tool_name, label, description) in enumerate(
                    [
                        ("search_corpus", "Search Tool", "Find candidate documents."),
                        ("read_doc", "Read Tool", "Inspect a full document from memory."),
                        ("curate", "Curate Tool", "Keep compact evidence in context."),
                        ("verify", "Verify Tool", "Check a claim against memory."),
                        ("finish", "Finish Tool", "Return the final answer."),
                    ]
                )
            ],
            GraphNode(
                id="evaluator",
                type="evaluator",
                label="Evaluator",
                position=Position(x=1030, y=250),
                config={"primary_metric": "contains_expected_answer", "track_costs": True},
            ),
        ],
        edges=[
            GraphEdge(id="task-context", source="task", target="context", label="question"),
            GraphEdge(id="memory-context", source="memory", target="context", label="state"),
            GraphEdge(id="context-policy", source="context", target="policy", label="prompt"),
            GraphEdge(id="policy-tools", source="policy", target="tool_search_corpus", label="action"),
            GraphEdge(id="policy-read", source="policy", target="tool_read_doc", label="action"),
            GraphEdge(id="policy-curate", source="policy", target="tool_curate", label="action"),
            GraphEdge(id="policy-verify", source="policy", target="tool_verify", label="action"),
            GraphEdge(id="policy-finish", source="policy", target="tool_finish", label="action"),
            GraphEdge(id="finish-evaluator", source="tool_finish", target="evaluator", label="answer"),
        ],
    )


def text_classification_template() -> HarnessGraph:
    graph = retrieval_qa_template()
    graph.name = "Text Classification Memory Harness"
    graph.description = "A classification-flavored template emphasizing memory and learning from examples."
    for node in graph.nodes:
        if node.id == "task":
            node.config.update(
                {
                    "question": "Classify this text: 'The patient reports fever and persistent cough.'",
                    "expected_answer": "symptom diagnosis",
                    "success_metric": "label_match",
                    "dataset": "toy_text_classification",
                }
            )
        if node.id == "memory":
            node.config.update({"pool_limit": 4, "curated_limit": 2})
        if node.id == "policy":
            node.config.update(
                {
                    "explanation": "Use curated examples as few-shot memory before predicting the label.",
                    "max_steps": 5,
                }
            )
    return graph


TEMPLATES = {
    "retrieval_qa": retrieval_qa_template,
    "text_classification_memory": text_classification_template,
}


def template_summaries() -> list[TemplateSummary]:
    return [
        TemplateSummary(
            id="retrieval_qa",
            name="Retrieval QA Harness",
            description="Search, read, curate, and answer from a tiny corpus.",
        ),
        TemplateSummary(
            id="text_classification_memory",
            name="Text Classification Memory Harness",
            description="Shows how memory can support repeated classification tasks.",
        ),
    ]


def get_template(template_id: str) -> HarnessGraph:
    try:
        return TEMPLATES[template_id]()
    except KeyError as exc:
        raise ValueError(f"Unknown template: {template_id}") from exc
