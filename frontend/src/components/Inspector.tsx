import { useEffect, useState } from "react";

import type { GraphNode } from "../types";

interface InspectorProps {
  selectedNode?: GraphNode;
  selectedEdge?: {
    id: string;
    source: string;
    target: string;
    label?: string;
  };
  onUpdateConfig: (nodeId: string, config: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}

type FieldKind = "text" | "textarea" | "number" | "checkbox" | "select";

interface FieldDefinition {
  key: string;
  label: string;
  help: string;
  kind: FieldKind;
  options?: Array<{ value: string; label: string }>;
}

const FIELD_DEFINITIONS: Record<string, FieldDefinition> = {
  question: {
    key: "question",
    label: "Question",
    help: "任务：告诉 AI 要解决什么问题。",
    kind: "textarea",
  },
  expected_answer: {
    key: "expected_answer",
    label: "Expected Answer",
    help: "评分关键词：模拟评分员会检查答案是否命中这些重点。",
    kind: "text",
  },
  success_metric: {
    key: "success_metric",
    label: "Success Metric",
    help: "How this toy run should be scored.",
    kind: "select",
    options: [
      { value: "constraint_checklist", label: "Constraint checklist" },
      { value: "contains_expected_answer", label: "Contains expected answer" },
      { value: "exact_match", label: "Exact match" },
      { value: "label_match", label: "Label match" },
    ],
  },
  dataset: {
    key: "dataset",
    label: "Dataset",
    help: "The built-in toy dataset for this demo.",
    kind: "select",
    options: [
      { value: "toy_retrieval", label: "Toy retrieval" },
      { value: "toy_text_classification", label: "Toy text classification" },
    ],
  },
  policy_kind: {
    key: "policy_kind",
    label: "Decision Maker Kind",
    help: "技术上这个组件叫 policy：负责选择下一步动作。Mock = 教学用固定脚本，方便观察 AI 工作流每一步，不是真实大模型。",
    kind: "select",
    options: [
      { value: "mock", label: "Mock policy" },
      { value: "scripted", label: "Scripted policy" },
    ],
  },
  max_steps: {
    key: "max_steps",
    label: "Max Steps",
    help: "Maximum number of tool/action turns before stopping.",
    kind: "number",
  },
  explanation: {
    key: "explanation",
    label: "Teaching Note",
    help: "A short explanation shown for this block.",
    kind: "textarea",
  },
  pool_limit: {
    key: "pool_limit",
    label: "Candidate Pool Limit",
    help: "记忆最多保留多少篇候选资料。",
    kind: "number",
  },
  curated_limit: {
    key: "curated_limit",
    label: "Curated Evidence Limit",
    help: "最多保留多少条整理好的关键证据。",
    kind: "number",
  },
  include_history: {
    key: "include_history",
    label: "Include History",
    help: "Show recent actions and observations in context.",
    kind: "checkbox",
  },
  include_task: {
    key: "include_task",
    label: "Include Task",
    help: "把任务写进模型能看到的上下文。",
    kind: "checkbox",
  },
  include_pool: {
    key: "include_pool",
    label: "Include Candidate Pool",
    help: "把候选资料列表写进上下文。",
    kind: "checkbox",
  },
  include_curated: {
    key: "include_curated",
    label: "Include Curated Evidence",
    help: "把整理好的证据笔记写进上下文。",
    kind: "checkbox",
  },
  token_budget: {
    key: "token_budget",
    label: "Context Budget",
    help: "上下文长度预算：模型一次能看到的内容上限。",
    kind: "number",
  },
  tool_name: {
    key: "tool_name",
    label: "Tool",
    help: "The action this tool block exposes.",
    kind: "select",
    options: [
      { value: "search_corpus", label: "Search corpus" },
      { value: "read_doc", label: "Read document" },
      { value: "curate", label: "Curate evidence" },
      { value: "verify", label: "Verify claim" },
      { value: "finish", label: "Finish" },
    ],
  },
  enabled: {
    key: "enabled",
    label: "Enabled",
    help: "Disabled tools remain on the canvas but cannot be used.",
    kind: "checkbox",
  },
  description: {
    key: "description",
    label: "Description",
    help: "What this block contributes to the harness.",
    kind: "textarea",
  },
  primary_metric: {
    key: "primary_metric",
    label: "Primary Metric",
    help: "The main metric shown after a run.",
    kind: "select",
    options: [
      { value: "constraint_checklist", label: "Constraint checklist" },
      { value: "contains_expected_answer", label: "Contains expected answer" },
      { value: "label_match", label: "Label match" },
      { value: "exact_match", label: "Exact match" },
    ],
  },
  track_costs: {
    key: "track_costs",
    label: "Track Costs",
    help: "Show simple cost-like metrics such as context length and tool calls.",
    kind: "checkbox",
  },
};

const TOOL_LABELS: Record<string, string> = {
  search_corpus: "Search Tool",
  read_doc: "Read Tool",
  curate: "Curate Tool",
  verify: "Verify Tool",
  finish: "Finish Tool",
};

function humanizeKey(key: string): string {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getFieldDefinition(key: string, value: unknown): FieldDefinition {
  if (FIELD_DEFINITIONS[key]) {
    return FIELD_DEFINITIONS[key];
  }
  return {
    key,
    label: humanizeKey(key),
    help: "Custom setting for this block.",
    kind: typeof value === "number" ? "number" : typeof value === "boolean" ? "checkbox" : "text",
  };
}

function blockSummary(node: GraphNode): string {
  switch (node.type) {
    case "task":
      return "Define the input and what success means.";
    case "model_policy":
      return "Choose the next action. Technically, this component is the policy.";
    case "memory":
      return "Control what state is kept between tool calls.";
    case "tool":
      return "Expose one action the policy can call.";
    case "context_builder":
      return "Choose what gets rendered into the model context.";
    case "evaluator":
      return "Score the run and report simple metrics.";
    default:
      return "Configure this harness block.";
  }
}

function previewLabel(node: GraphNode, config: Record<string, unknown>): string {
  if (node.type === "tool") {
    return TOOL_LABELS[String(config.tool_name ?? "")] ?? node.label;
  }
  if (node.type === "model_policy") {
    return String(config.policy_kind ?? "") === "scripted"
      ? "Scripted Decision Maker"
      : "Model / Decision Maker";
  }
  return node.label;
}

export function Inspector({
  selectedNode,
  selectedEdge,
  onUpdateConfig,
  onDeleteNode,
  onDeleteEdge,
}: InspectorProps) {
  const [draftConfig, setDraftConfig] = useState<Record<string, unknown>>({});

  useEffect(() => {
    setDraftConfig(selectedNode?.config ?? {});
  }, [selectedNode]);

  if (selectedEdge) {
    return (
      <aside className="panel inspector">
        <div className="inspector-header">
          <div>
            <h2>Connection</h2>
            <p className="muted">
              <code>{selectedEdge.source}</code> to <code>{selectedEdge.target}</code>
            </p>
          </div>
          <button
            className="danger-button"
            onClick={() => {
              const shouldDelete = window.confirm("Delete this connection?");
              if (shouldDelete) {
                onDeleteEdge(selectedEdge.id);
              }
            }}
            type="button"
          >
            Delete connection
          </button>
        </div>
        <p className="inspector-summary">
          This connection defines how two harness blocks are linked on the canvas.
        </p>
        <div className="edge-details">
          <div>
            <span>From</span>
            <code>{selectedEdge.source}</code>
          </div>
          <div>
            <span>To</span>
            <code>{selectedEdge.target}</code>
          </div>
          {selectedEdge.label && (
            <div>
              <span>Label</span>
              <code>{selectedEdge.label}</code>
            </div>
          )}
        </div>
      </aside>
    );
  }

  if (!selectedNode) {
    return (
      <aside className="panel inspector">
        <h2>Inspector</h2>
        <p className="muted">Select a block to edit its configuration.</p>
      </aside>
    );
  }

  const updateField = (key: string, value: unknown) => {
    const nextConfig = {
      ...draftConfig,
      [key]: value,
    };
    setDraftConfig(nextConfig);
    onUpdateConfig(selectedNode.id, nextConfig);
  };

  const title = previewLabel(selectedNode, draftConfig);

  return (
    <aside className="panel inspector">
      <div className="inspector-header">
        <div>
          <h2>{title}</h2>
          <p className="muted">
            Type: <code>{selectedNode.type}</code>
          </p>
        </div>
        <button
          className="danger-button"
          onClick={() => {
            const shouldDelete = window.confirm(
              `Delete "${selectedNode.label}" and all connected lines?`,
            );
            if (shouldDelete) {
              onDeleteNode(selectedNode.id);
            }
          }}
          type="button"
        >
          Delete block
        </button>
      </div>
      <p className="inspector-summary">{blockSummary(selectedNode)}</p>

      <p className="autosave-note">Changes auto-save as you edit.</p>

      <div className="config-form">
        {Object.entries(draftConfig).map(([key, value]) => {
          const field = getFieldDefinition(key, value);

          return (
            <label className={`config-field ${field.kind === "checkbox" ? "checkbox-field" : ""}`} key={key}>
              <span className="config-label">{field.label}</span>
              <span className="config-help">{field.help}</span>
              {field.kind === "textarea" && (
                <textarea
                  className="compact-textarea"
                  value={String(value ?? "")}
                  onChange={(event) => updateField(key, event.target.value)}
                />
              )}
              {field.kind === "text" && (
                <input
                  value={String(value ?? "")}
                  onChange={(event) => updateField(key, event.target.value)}
                />
              )}
              {field.kind === "number" && (
                <input
                  type="number"
                  value={Number(value ?? 0)}
                  onChange={(event) => updateField(key, Number(event.target.value))}
                />
              )}
              {field.kind === "checkbox" && (
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) => updateField(key, event.target.checked)}
                />
              )}
              {field.kind === "select" && (
                <select
                  value={String(value ?? "")}
                  onChange={(event) => updateField(key, event.target.value)}
                >
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </label>
          );
        })}
      </div>

      <details className="advanced-config">
        <summary>Advanced: raw config</summary>
        <pre>{JSON.stringify(draftConfig, null, 2)}</pre>
      </details>
    </aside>
  );
}
