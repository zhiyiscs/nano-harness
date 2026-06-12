"""Shared graph schema for the visual builder and runtime."""

from __future__ import annotations

from enum import StrEnum
import re
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class NodeType(StrEnum):
    TASK = "task"
    MODEL_POLICY = "model_policy"
    MEMORY = "memory"
    TOOL = "tool"
    CONTEXT_BUILDER = "context_builder"
    EVALUATOR = "evaluator"


class ToolName(StrEnum):
    SEARCH = "search_corpus"
    READ = "read_doc"
    CURATE = "curate"
    VERIFY = "verify"
    FINISH = "finish"


class Position(BaseModel):
    x: float = 0
    y: float = 0


class TaskConfig(BaseModel):
    question: str = Field(min_length=1)
    expected_answer: str = Field(min_length=1)
    success_metric: str = "exact_match"
    dataset: str = "toy_retrieval"


class ModelPolicyConfig(BaseModel):
    policy_kind: Literal["mock", "scripted"] = "mock"
    max_steps: int = Field(default=6, ge=1, le=20)
    explanation: str = "Choose tool calls from the current context."


class MemoryConfig(BaseModel):
    pool_limit: int = Field(default=5, ge=1, le=20)
    curated_limit: int = Field(default=3, ge=1, le=10)
    include_history: bool = True


class ToolConfig(BaseModel):
    tool_name: ToolName
    enabled: bool = True
    description: str = ""


class ContextBuilderConfig(BaseModel):
    include_task: bool = True
    include_pool: bool = True
    include_curated: bool = True
    include_history: bool = True
    token_budget: int = Field(default=1200, ge=200, le=8000)


class EvaluatorConfig(BaseModel):
    primary_metric: str = "contains_expected_answer"
    track_costs: bool = True


NodeConfig = Annotated[
    TaskConfig
    | ModelPolicyConfig
    | MemoryConfig
    | ToolConfig
    | ContextBuilderConfig
    | EvaluatorConfig,
    Field(discriminator=None),
]


class GraphNode(BaseModel):
    id: str = Field(min_length=1)
    type: NodeType
    label: str = Field(min_length=1)
    position: Position = Field(default_factory=Position)
    config: dict[str, Any] = Field(default_factory=dict)

    @field_validator("id")
    @classmethod
    def id_must_be_simple(cls, value: str) -> str:
        if not re.fullmatch(r"[A-Za-z0-9_-]+", value):
            raise ValueError("node id must contain only letters, numbers, '-' or '_'")
        return value

    def typed_config(self) -> NodeConfig:
        config_by_type: dict[NodeType, type[BaseModel]] = {
            NodeType.TASK: TaskConfig,
            NodeType.MODEL_POLICY: ModelPolicyConfig,
            NodeType.MEMORY: MemoryConfig,
            NodeType.TOOL: ToolConfig,
            NodeType.CONTEXT_BUILDER: ContextBuilderConfig,
            NodeType.EVALUATOR: EvaluatorConfig,
        }
        return config_by_type[self.type].model_validate(self.config)


class GraphEdge(BaseModel):
    id: str = Field(min_length=1)
    source: str = Field(min_length=1)
    target: str = Field(min_length=1)
    label: str = ""


class ValidationIssue(BaseModel):
    level: Literal["error", "warning"]
    message: str
    node_id: str | None = None


class HarnessGraph(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    name: str = "Untitled Harness"
    description: str = ""
    nodes: list[GraphNode]
    edges: list[GraphEdge] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_references(self) -> "HarnessGraph":
        node_ids = {node.id for node in self.nodes}
        if len(node_ids) != len(self.nodes):
            raise ValueError("node ids must be unique")
        for edge in self.edges:
            if edge.source not in node_ids:
                raise ValueError(f"edge {edge.id} has unknown source {edge.source}")
            if edge.target not in node_ids:
                raise ValueError(f"edge {edge.id} has unknown target {edge.target}")
        for node in self.nodes:
            node.typed_config()
        return self

    def issues(self) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        counts = {node_type: 0 for node_type in NodeType}
        enabled_tools: set[str] = set()

        for node in self.nodes:
            counts[NodeType(node.type)] += 1
            if NodeType(node.type) == NodeType.TOOL:
                tool_config = ToolConfig.model_validate(node.config)
                if tool_config.enabled:
                    enabled_tools.add(tool_config.tool_name)

        required_singletons = [
            NodeType.TASK,
            NodeType.MODEL_POLICY,
            NodeType.MEMORY,
            NodeType.CONTEXT_BUILDER,
            NodeType.EVALUATOR,
        ]
        for node_type in required_singletons:
            if counts[node_type] == 0:
                issues.append(
                    ValidationIssue(
                        level="error",
                        message=f"Missing required {node_type.value} block.",
                    )
                )
            elif counts[node_type] > 1:
                issues.append(
                    ValidationIssue(
                        level="warning",
                        message=f"Multiple {node_type.value} blocks; the first will be used.",
                    )
                )

        for tool in [ToolName.SEARCH, ToolName.READ, ToolName.CURATE, ToolName.FINISH]:
            if tool.value not in enabled_tools:
                issues.append(
                    ValidationIssue(
                        level="error",
                        message=f"Missing enabled tool block: {tool.value}.",
                    )
                )

        if not self.edges:
            issues.append(
                ValidationIssue(
                    level="warning",
                    message="No edges are connected; the runtime will still use enabled blocks.",
                )
            )

        return issues

    def has_errors(self) -> bool:
        return any(issue.level == "error" for issue in self.issues())


class RunRequest(BaseModel):
    graph: HarnessGraph


class ToolCall(BaseModel):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)


class TraceStep(BaseModel):
    step: int
    context: str
    action: ToolCall
    observation: str
    memory: dict[str, Any]
    explanation: str


class RunMetrics(BaseModel):
    score: float
    success: bool
    scored: bool = True
    steps: int
    tool_calls: int
    context_chars: int
    curated_docs: int


class RunResponse(BaseModel):
    graph_name: str
    issues: list[ValidationIssue]
    trace: list[TraceStep]
    final_answer: str
    metrics: RunMetrics
    notes: list[str] = Field(default_factory=list)


class CodegenRequest(BaseModel):
    graph: HarnessGraph


class CodegenResponse(BaseModel):
    code: str


class TemplateSummary(BaseModel):
    id: str
    name: str
    description: str
