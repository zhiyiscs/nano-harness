from nano_harness.codegen import generate_python
from nano_harness.runtime import run_graph
from nano_harness.templates import get_template


def test_template_runs_successfully() -> None:
    graph = get_template("retrieval_qa")

    result = run_graph(graph)

    assert not any(issue.level == "error" for issue in result.issues)
    assert result.metrics.success
    assert result.metrics.steps >= 6
    assert result.trace[0].action.name == "search_corpus"
    assert "crimson brew cafe" in result.final_answer.lower()


def test_missing_tool_runs_but_notes_the_gap() -> None:
    graph = get_template("retrieval_qa")
    graph.nodes = [
        node
        for node in graph.nodes
        if not (node.type == "tool" and node.config.get("tool_name") == "finish")
    ]

    result = run_graph(graph)

    # Degrades gracefully: it still runs and tells the learner what is missing.
    assert result.trace != []
    assert any("finish" in note for note in result.notes)


def test_no_memory_block_forgets_between_steps() -> None:
    graph = get_template("retrieval_qa")
    graph.nodes = [node for node in graph.nodes if node.type != "memory"]

    result = run_graph(graph)

    assert result.trace != []
    assert any("Working Memory" in note for note in result.notes)
    # Whatever search found does not survive into a later step.
    assert result.trace[-1].memory["pool"] == []


def test_no_evaluator_block_is_not_scored() -> None:
    graph = get_template("retrieval_qa")
    graph.nodes = [node for node in graph.nodes if node.type != "evaluator"]

    result = run_graph(graph)

    assert result.trace != []
    assert result.metrics.scored is False
    assert any("Evaluator" in note for note in result.notes)


def test_minimal_harness_just_guesses() -> None:
    graph = get_template("retrieval_qa")
    # Keep only task, policy, and the finish tool.
    graph.nodes = [
        node
        for node in graph.nodes
        if node.type in {"task", "model_policy"}
        or (node.type == "tool" and node.config.get("tool_name") == "finish")
    ]
    graph.edges = []

    result = run_graph(graph)

    assert result.trace != []
    assert result.trace[-1].action.name == "finish"
    assert result.metrics.scored is False


def test_codegen_contains_task_and_run_function() -> None:
    graph = get_template("retrieval_qa")

    code = generate_python(graph)

    assert "def run()" in code
    assert "Harvard University" in code
    # The generated file should teach the harness loop and its core pieces.
    assert "def policy(" in code
    assert "def build_context(" in code
    assert "def evaluate(" in code
    assert "for step in range(1, MAX_STEPS + 1):" in code


def test_codegen_reflects_canvas_config() -> None:
    graph = get_template("retrieval_qa")
    for node in graph.nodes:
        if node.type == "memory":
            node.config["pool_limit"] = 9
        if node.type == "context_builder":
            node.config["include_history"] = False

    code = generate_python(graph)

    # Editing a block on the canvas must change the generated constants.
    assert "POOL_LIMIT = 9" in code
    assert "INCLUDE_HISTORY = False" in code


def test_generated_code_is_executable() -> None:
    graph = get_template("retrieval_qa")

    code = generate_python(graph)

    namespace: dict[str, object] = {}
    exec(compile(code, "generated_harness.py", "exec"), namespace)
    answer = namespace["run"]()  # type: ignore[operator]

    assert isinstance(answer, str)
    assert "crimson brew cafe" in answer.lower()
