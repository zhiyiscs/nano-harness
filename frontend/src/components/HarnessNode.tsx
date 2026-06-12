import { Handle, Position, type NodeProps } from "reactflow";

import type { GraphNode } from "../types";

type HarnessNodeData = {
  label: string;
  type: GraphNode["type"];
  config: Record<string, unknown>;
};

const TYPE_LABELS: Record<GraphNode["type"], string> = {
  task: "Task",
  model_policy: "Policy",
  memory: "Memory",
  tool: "Tool",
  context_builder: "Context",
  evaluator: "Evaluator",
};

export function HarnessNode({ data, selected }: NodeProps<HarnessNodeData>) {
  return (
    <div className={`harness-node node-${data.type} ${selected ? "selected" : ""}`}>
      <Handle className="node-handle input-handle" position={Position.Left} type="target" />
      <div className="node-content">
        <div className="node-kicker">{TYPE_LABELS[data.type]}</div>
        <div className="node-title">{data.label}</div>
      </div>
      <Handle className="node-handle output-handle" position={Position.Right} type="source" />
    </div>
  );
}
