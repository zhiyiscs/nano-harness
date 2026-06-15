export type NodeType =
  | "task"
  | "model_policy"
  | "memory"
  | "tool"
  | "context_builder"
  | "evaluator";

export type ToolName = "search_corpus" | "read_doc" | "curate" | "verify" | "finish";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface HarnessGraph {
  name: string;
  description: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
}

export interface ValidationIssue {
  level: "error" | "warning";
  message: string;
  node_id?: string | null;
}

export interface TraceStep {
  step: number;
  context: string;
  action: {
    name: string;
    args: Record<string, unknown>;
  };
  observation: string;
  memory: {
    pool: string[];
    curated: Record<string, string>;
    history: string[];
    doc_store_ids: string[];
  };
  explanation: string;
}

export interface ConstraintResult {
  id: string;
  label: string;
  passed: boolean;
  evidence?: string;
  source?: string;
}

export interface RunResponse {
  graph_name: string;
  issues: ValidationIssue[];
  trace: TraceStep[];
  final_answer: string;
  notes: string[];
  metrics: {
    score: number;
    success: boolean;
    scored: boolean;
    primary_metric?: string;
    constraints?: ConstraintResult[];
    steps: number;
    tool_calls: number;
    context_chars: number;
    curated_docs: number;
  };
}

export interface CodegenResponse {
  code: string;
}
