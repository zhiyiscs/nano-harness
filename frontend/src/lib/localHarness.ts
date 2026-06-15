import type {
  CodegenResponse,
  ConstraintResult,
  GraphNode,
  HarnessGraph,
  RunResponse,
  TemplateSummary,
  ToolName,
  ValidationIssue,
} from "../types";

type TaskConfig = {
  question: string;
  expected_answer: string;
  success_metric: string;
  dataset: string;
};

type MemoryConfig = {
  pool_limit: number;
  curated_limit: number;
  include_history: boolean;
};

type ContextConfig = {
  include_task: boolean;
  include_pool: boolean;
  include_curated: boolean;
  include_history: boolean;
  token_budget: number;
};

type PolicyConfig = {
  policy_kind: "mock" | "scripted";
  max_steps: number;
  explanation: string;
};

type Action = {
  name: string;
  args: Record<string, unknown>;
};

const TOY_CORPUS: Record<string, string> = {
  doc_map:
    "Harvard Square distance notes: Crimson Brew Cafe is a 6 minute walk from Harvard Yard. Charles River Coffee is a 12 minute walk. Museum Street Tea is an 8 minute walk.",
  doc_hours:
    "Saturday hours: Crimson Brew Cafe closes at 22:30. Charles River Coffee closes at 23:00. Museum Street Tea closes at 20:30.",
  doc_amenities:
    "Amenities: Crimson Brew Cafe has Wi-Fi, quiet tables, and vegetarian pastries. Charles River Coffee has Wi-Fi but no vegetarian snacks. Museum Street Tea has vegetarian snacks but no Wi-Fi.",
  doc_reviews:
    "Recent reviews: Crimson Brew Cafe is quiet after 20:00 and works well for laptop study. Charles River Coffee is crowded on Saturday nights. Museum Street Tea has limited seating.",
  doc_old_blog:
    "Old student blog from 2021: Crimson Brew Cafe used to close at 20:00. This page may be outdated and should be checked against current hours.",
};

const TOOL_LABELS: Record<ToolName, string> = {
  search_corpus: "Search Tool",
  read_doc: "Read Tool",
  curate: "Curate Tool",
  verify: "Verify Tool",
  finish: "Finish Tool",
};

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  search_corpus: "Find candidate documents.",
  read_doc: "Open a document using an id stored in memory.",
  curate: "Keep compact evidence in context.",
  verify: "Check a claim against memory.",
  finish: "Return the final answer.",
};

const DEFAULT_TASK: TaskConfig = {
  question:
    "Which cafe near Harvard Yard is within 10 minutes, open after 21:00 on Saturday, and has Wi-Fi plus vegetarian snacks?",
  expected_answer: "Crimson Brew Cafe 6 minute 22:30 Wi-Fi vegetarian",
  success_metric: "contains_expected_answer",
  dataset: "toy_retrieval",
};

const DEFAULT_MEMORY: MemoryConfig = {
  pool_limit: 5,
  curated_limit: 3,
  include_history: true,
};

const DEFAULT_CONTEXT: ContextConfig = {
  include_task: true,
  include_pool: true,
  include_curated: true,
  include_history: true,
  token_budget: 1200,
};

const DEFAULT_POLICY: PolicyConfig = {
  policy_kind: "mock",
  max_steps: 6,
  explanation: "Choose tool calls from the current context.",
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toolNode(toolName: ToolName, index: number): GraphNode {
  return {
    id: `tool_${toolName}`,
    type: "tool",
    label: TOOL_LABELS[toolName],
    position: { x: 770, y: 40 + index * 90 },
    config: {
      tool_name: toolName,
      enabled: true,
      description: TOOL_DESCRIPTIONS[toolName],
    },
  };
}

function retrievalQaTemplate(): HarnessGraph {
  return {
    name: "Retrieval QA Harness",
    description: "A tiny stateful retrieval harness with memory, tools, context, and evaluation.",
    nodes: [
      {
        id: "task",
        type: "task",
        label: "Task",
        position: { x: 80, y: 220 },
        config: {
          question:
            "I am studying near Harvard University on Saturday night. Which cafe near Harvard Yard is within a 10 minute walk, open after 21:00, and has both Wi-Fi and vegetarian snacks?",
          expected_answer: "Crimson Brew Cafe 6 minute 22:30 Wi-Fi vegetarian",
          success_metric: "contains_expected_answer",
          dataset: "toy_retrieval",
        },
      },
      {
        id: "memory",
        type: "memory",
        label: "Working Memory",
        position: { x: 310, y: 90 },
        config: { pool_limit: 5, curated_limit: 3, include_history: true },
      },
      {
        id: "context",
        type: "context_builder",
        label: "Context Builder",
        position: { x: 310, y: 250 },
        config: {
          include_task: true,
          include_pool: true,
          include_curated: true,
          include_history: true,
          token_budget: 1200,
        },
      },
      {
        id: "policy",
        type: "model_policy",
        label: "Model / Decision Maker",
        position: { x: 540, y: 250 },
        config: {
          policy_kind: "mock",
          max_steps: 7,
          explanation: "Technically, this is the policy: the part that chooses the next action.",
        },
      },
      ...(["search_corpus", "read_doc", "curate", "verify", "finish"] as ToolName[]).map(toolNode),
      {
        id: "evaluator",
        type: "evaluator",
        label: "Evaluator",
        position: { x: 1030, y: 250 },
        config: { primary_metric: "constraint_checklist", track_costs: true },
      },
    ],
    edges: [
      { id: "task-context", source: "task", target: "context", label: "question" },
      { id: "memory-context", source: "memory", target: "context", label: "state" },
      { id: "context-policy", source: "context", target: "policy", label: "prompt" },
      { id: "policy-tools", source: "policy", target: "tool_search_corpus", label: "action" },
      { id: "policy-read", source: "policy", target: "tool_read_doc", label: "action" },
      { id: "policy-curate", source: "policy", target: "tool_curate", label: "action" },
      { id: "policy-verify", source: "policy", target: "tool_verify", label: "action" },
      { id: "policy-finish", source: "policy", target: "tool_finish", label: "action" },
      { id: "finish-evaluator", source: "tool_finish", target: "evaluator", label: "answer" },
    ],
  };
}

function textClassificationTemplate(): HarnessGraph {
  const graph = retrievalQaTemplate();
  graph.name = "Text Classification Memory Harness";
  graph.description = "A classification-flavored template emphasizing memory and learning from examples.";
  graph.nodes = graph.nodes.map((node) => {
    if (node.id === "task") {
      return {
        ...node,
        config: {
          ...node.config,
          question: "Classify this text: 'The patient reports fever and persistent cough.'",
          expected_answer: "symptom diagnosis",
          success_metric: "label_match",
          dataset: "toy_text_classification",
        },
      };
    }
    if (node.id === "memory") {
      return { ...node, config: { ...node.config, pool_limit: 4, curated_limit: 2 } };
    }
    if (node.id === "policy") {
      return {
        ...node,
        config: {
          ...node.config,
          explanation: "Use curated examples as few-shot memory before predicting the label.",
          max_steps: 5,
        },
      };
    }
    return node;
  });
  return graph;
}

const TEMPLATES: Record<string, () => HarnessGraph> = {
  retrieval_qa: retrievalQaTemplate,
  text_classification_memory: textClassificationTemplate,
};

export function listLocalTemplates(): TemplateSummary[] {
  return [
    {
      id: "retrieval_qa",
      name: "Retrieval QA Harness",
      description: "Search, read, curate, and answer from a tiny corpus.",
    },
    {
      id: "text_classification_memory",
      name: "Text Classification Memory Harness",
      description: "Shows how memory can support repeated classification tasks.",
    },
  ];
}

export function getLocalTemplate(templateId: string): HarnessGraph {
  const template = TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown template: ${templateId}`);
  }
  return clone(template());
}

class WorkingMemory {
  pool: string[] = [];
  curated: Record<string, string> = {};
  history: string[] = [];
  docStore: Record<string, string> = {};

  constructor(
    private poolLimit: number,
    private curatedLimit: number,
    readonly includeHistory: boolean,
  ) {}

  addToPool(docIds: string[]): number {
    let added = 0;
    for (const docId of docIds) {
      if (this.pool.includes(docId)) continue;
      if (this.pool.length >= this.poolLimit) break;
      this.pool.push(docId);
      added += 1;
    }
    return added;
  }

  readDoc(docId: string): string {
    if (!this.docStore[docId] && TOY_CORPUS[docId]) {
      this.docStore[docId] = TOY_CORPUS[docId];
    }
    return this.docStore[docId] ?? "(document not found in memory)";
  }

  curate(docId: string, note: string): string {
    if (!this.docStore[docId]) {
      return `Cannot curate ${docId}; read or search it first.`;
    }
    if (!this.curated[docId] && Object.keys(this.curated).length >= this.curatedLimit) {
      return "Curated evidence is full; remove evidence or increase the limit.";
    }
    this.curated[docId] = note;
    return `Curated ${docId}: ${note}`;
  }

  snapshot() {
    return {
      pool: [...this.pool],
      curated: { ...this.curated },
      history: [...this.history],
      doc_store_ids: Object.keys(this.docStore).sort(),
    };
  }

  resetVolatile(): void {
    this.pool = [];
    this.curated = {};
    this.history = [];
    this.docStore = {};
  }
}

function firstConfig<T>(graph: HarnessGraph, type: GraphNode["type"], fallback: T): T {
  const node = graph.nodes.find((item) => item.type === type);
  return node ? ({ ...fallback, ...node.config } as T) : fallback;
}

function presentTypes(graph: HarnessGraph): Set<GraphNode["type"]> {
  return new Set(graph.nodes.map((node) => node.type));
}

function enabledTools(graph: HarnessGraph): Set<string> {
  return new Set(
    graph.nodes
      .filter((node) => node.type === "tool" && node.config.enabled !== false)
      .map((node) => String(node.config.tool_name ?? "")),
  );
}

function graphIssues(graph: HarnessGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const counts = new Map<GraphNode["type"], number>();
  const enabled = enabledTools(graph);

  graph.nodes.forEach((node) => {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  });

  (["task", "model_policy", "memory", "context_builder", "evaluator"] as GraphNode["type"][]).forEach((type) => {
    const count = counts.get(type) ?? 0;
    if (count === 0) {
      issues.push({ level: "error", message: `Missing required ${type} block.` });
    } else if (count > 1) {
      issues.push({ level: "warning", message: `Multiple ${type} blocks; the first will be used.` });
    }
  });

  (["search_corpus", "read_doc", "curate", "finish"] as ToolName[]).forEach((tool) => {
    if (!enabled.has(tool)) {
      issues.push({ level: "error", message: `Missing enabled tool block: ${tool}.` });
    }
  });

  if (graph.edges.length === 0) {
    issues.push({
      level: "warning",
      message: "No edges are connected; the runtime will still use enabled blocks.",
    });
  }

  return issues;
}

function renderContext(config: ContextConfig, task: TaskConfig, memory: WorkingMemory): string {
  const parts: string[] = [];
  if (config.include_task) {
    parts.push(`Task: ${task.question}`);
    parts.push(`Metric: ${task.success_metric}`);
  }
  if (config.include_pool) {
    const poolLines = memory.pool.map((docId) => `- ${docId}: ${(memory.docStore[docId] ?? "").slice(0, 120)}`);
    parts.push(`Candidate pool:\n${poolLines.length ? poolLines.join("\n") : "(empty)"}`);
  }
  if (config.include_curated) {
    const curatedLines = Object.entries(memory.curated).map(([docId, note]) => `- ${docId}: ${note}`);
    parts.push(`Curated evidence:\n${curatedLines.length ? curatedLines.join("\n") : "(empty)"}`);
  }
  if (config.include_history && memory.includeHistory) {
    parts.push(`History:\n${memory.history.length ? memory.history.slice(-6).join("\n") : "(empty)"}`);
  }
  return parts.join("\n\n").slice(0, config.token_budget);
}

function chooseAction(task: TaskConfig, memory: WorkingMemory, step: number, enabled: Set<string>): [Action, string] {
  if (enabled.has("search_corpus") && step === 1) {
    return [{ name: "search_corpus", args: { query: task.question } }, "Search for candidate evidence."];
  }

  const plannedReads = ["doc_map", "doc_hours", "doc_amenities"];
  if (enabled.has("read_doc") && [2, 3, 4].includes(step)) {
    let docId = plannedReads[step - 2];
    if (!memory.pool.includes(docId) && memory.pool.length > 0) {
      docId = memory.pool[Math.min(step - 2, memory.pool.length - 1)];
    }
    return [{ name: "read_doc", args: { doc_id: docId } }, "Read the next source needed to check the constraints."];
  }

  if (enabled.has("curate") && Object.keys(memory.docStore).length > 0 && step === 5) {
    return [
      {
        name: "curate",
        args: {
          doc_id: "doc_amenities",
          note:
            "Crimson Brew Cafe matches the constraints: 6 minutes from Harvard Yard, open until 22:30 on Saturday, with Wi-Fi and vegetarian snacks.",
        },
      },
      "Keep the cross-document evidence as a compact note.",
    ];
  }

  if (enabled.has("verify") && Object.keys(memory.curated).length > 0 && step === 6) {
    return [
      { name: "verify", args: { claim: "Crimson Brew Cafe matches all constraints" } },
      "Check the recommendation against the gathered evidence.",
    ];
  }

  if (Object.keys(memory.curated).length > 0) {
    return [
      {
        name: "finish",
        args: {
          answer:
            "Crimson Brew Cafe is the best match: it is a 6 minute walk from Harvard Yard, stays open until 22:30 on Saturday, and has Wi-Fi plus vegetarian snacks.",
        },
      },
      "Enough evidence gathered; answer from the curated note.",
    ];
  }

  if (Object.keys(memory.docStore).length > 0) {
    return [
      {
        name: "finish",
        args: { answer: "I found some sources, but I have not yet organized all constraints into a confident recommendation." },
      },
      "Some evidence was read, but the harness has not curated it yet.",
    ];
  }

  return [
    {
      name: "finish",
      args: {
        answer:
          "Crimson Brew Cafe might be the answer, but I have no sources yet to prove the distance, hours, Wi-Fi, or vegetarian snacks.",
      },
    },
    "No tools or memory to gather evidence, so just guess.",
  ];
}

function runTool(action: Action, memory: WorkingMemory): string {
  if (action.name === "search_corpus") {
    const query = String(action.args.query ?? "").toLowerCase();
    const terms = query
      .split(/\s+/)
      .map((term) => term.replace(/[.,?!]/g, ""))
      .filter((term) => term.length > 2);
    const scored = Object.entries(TOY_CORPUS)
      .map(([docId, text]) => ({
        docId,
        score: terms.filter((term) => text.toLowerCase().includes(term) || docId.includes(term)).length,
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.docId.localeCompare(a.docId));
    const docIds = scored.length ? scored.map((item) => item.docId) : ["doc_harness", "doc_memory"];
    const added = memory.addToPool(docIds);
    return `Found ${docIds.length} candidate docs; added ${added}: ${docIds.slice(0, memory.pool.length || 1).join(", ")}`;
  }

  if (action.name === "read_doc") {
    const docId = String(action.args.doc_id ?? "");
    return `# ${docId}\n${memory.readDoc(docId)}`;
  }

  if (action.name === "curate") {
    return memory.curate(String(action.args.doc_id ?? ""), String(action.args.note ?? "Useful evidence."));
  }

  if (action.name === "verify") {
    const claim = String(action.args.claim ?? "");
    const evidenceText = Object.values(memory.docStore).join(" ").toLowerCase();
    let verdict = "needs more evidence";
    if (claim.toLowerCase().includes("crimson brew")) {
      const required = ["crimson brew", "6 minute", "22:30", "wi-fi", "vegetarian"];
      verdict = required.every((term) => evidenceText.includes(term)) ? "supported" : "needs more evidence";
    } else if (claim && evidenceText.includes(claim.toLowerCase().slice(0, 18))) {
      verdict = "supported";
    }
    return `Verification result for '${claim}': ${verdict}.`;
  }

  if (action.name === "finish") {
    return String(action.args.answer ?? "");
  }

  return `Tool '${action.name}' is not on the canvas yet.`;
}

const CHECKLIST_DEFINITIONS = [
  {
    id: "near_harvard_yard",
    label: "near Harvard Yard",
    source: "doc_map",
    terms: ["harvard yard", "crimson brew cafe"],
  },
  {
    id: "within_10_min",
    label: "within 10 minute walk",
    source: "doc_map",
    terms: ["6 minute", "crimson brew cafe"],
  },
  {
    id: "open_after_21",
    label: "open after 21:00 on Saturday",
    source: "doc_hours",
    terms: ["22:30", "saturday", "crimson brew cafe"],
  },
  {
    id: "wifi",
    label: "has Wi-Fi",
    source: "doc_amenities",
    terms: ["wi-fi", "crimson brew cafe"],
  },
  {
    id: "vegetarian_snacks",
    label: "has vegetarian snacks",
    source: "doc_amenities",
    terms: ["vegetarian", "crimson brew cafe"],
  },
] as const;

function firstEvidenceSentence(text: string, terms: readonly string[]): string | undefined {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.find((sentence) => terms.every((term) => sentence.toLowerCase().includes(term)));
}

function scoreConstraints(answer: string, memory: WorkingMemory): ConstraintResult[] {
  const answerLower = answer.toLowerCase();
  return CHECKLIST_DEFINITIONS.map((constraint) => {
    const sourceText = memory.docStore[constraint.source] ?? "";
    const sourceLower = sourceText.toLowerCase();
    const evidence = firstEvidenceSentence(sourceText, constraint.terms);
    const hasEvidence = constraint.terms.every((term) => sourceLower.includes(term));
    const answerMentionsCafe = answerLower.includes("crimson brew");
    return {
      id: constraint.id,
      label: constraint.label,
      passed: hasEvidence && answerMentionsCafe,
      evidence,
      source: hasEvidence ? constraint.source : undefined,
    };
  });
}

function scoreAnswer(task: TaskConfig, answer: string, memory?: WorkingMemory): [number, boolean, ConstraintResult[] | undefined] {
  if (task.success_metric === "constraint_checklist" && memory) {
    const constraints = scoreConstraints(answer, memory);
    const passed = constraints.filter((constraint) => constraint.passed).length;
    const score = constraints.length > 0 ? passed / constraints.length : 0;
    return [score, score === 1, constraints];
  }

  const expectedTerms = task.expected_answer
    .split(/\s+/)
    .map((term) => term.replace(/[.,?!]/g, "").toLowerCase())
    .filter((term) => term.length > 3);
  if (expectedTerms.length === 0) {
    return [0, false, undefined];
  }
  const answerLower = answer.toLowerCase();
  const matched = expectedTerms.filter((term) => answerLower.includes(term)).length;
  const score = matched / expectedTerms.length;
  return [score, score >= 0.45, undefined];
}

export function runLocalGraph(graph: HarnessGraph): RunResponse {
  const issues = graphIssues(graph);
  const present = presentTypes(graph);
  const hasMemory = present.has("memory");
  const hasContext = present.has("context_builder");
  const hasEvaluator = present.has("evaluator");
  const task = firstConfig(graph, "task", DEFAULT_TASK);
  const memoryConfig = firstConfig(graph, "memory", DEFAULT_MEMORY);
  const policyConfig = firstConfig(graph, "model_policy", DEFAULT_POLICY);
  const contextConfig = firstConfig(graph, "context_builder", DEFAULT_CONTEXT);
  const memory = new WorkingMemory(memoryConfig.pool_limit, memoryConfig.curated_limit, memoryConfig.include_history);
  const enabled = enabledTools(graph);
  const notes: string[] = [];

  if (!hasMemory) {
    notes.push("No Working Memory block: the harness forgets what it finds between steps, so it cannot gather evidence. Add Working Memory.");
  }
  if (!hasContext) {
    notes.push("No Context Builder block: the model sees nothing each step. Add a Context Builder to render the task and memory into what the model reads.");
  }
  if (!hasEvaluator) {
    notes.push("No Evaluator block: the answer is produced but never scored. Add an Evaluator to measure whether the harness did well.");
  }
  (["search_corpus", "read_doc", "curate", "finish"] as ToolName[]).forEach((tool) => {
    if (!enabled.has(tool)) notes.push(`No ${tool} tool on the canvas yet.`);
  });

  const trace: RunResponse["trace"] = [];
  let finalAnswer = "";
  let totalContextChars = 0;

  for (let step = 1; step <= policyConfig.max_steps; step += 1) {
    const context = hasContext ? renderContext(contextConfig, task, memory) : "(no context builder: the model sees nothing this step)";
    totalContextChars += context.length;

    const [action, explanation] = chooseAction(task, memory, step, enabled);
    const observation = enabled.has(action.name) ? runTool(action, memory) : `Tool '${action.name}' is not on the canvas yet.`;
    memory.history.push(`${action.name}(${JSON.stringify(action.args)}) -> ${observation.slice(0, 160)}`);

    if (action.name === "finish") {
      finalAnswer = observation;
    }

    trace.push({
      step,
      context,
      action,
      observation,
      memory: memory.snapshot(),
      explanation,
    });

    if (!hasMemory) {
      memory.resetVolatile();
    }
    if (action.name === "finish") {
      break;
    }
  }

  const unscored: [number, boolean, ConstraintResult[] | undefined] = [0, false, undefined];
  const [score, success, constraints] = hasEvaluator
    ? scoreAnswer({ ...task, success_metric: "constraint_checklist" }, finalAnswer, memory)
    : unscored;
  return {
    graph_name: graph.name,
    issues,
    trace,
    final_answer: finalAnswer,
    notes,
    metrics: {
      score,
      success,
      scored: hasEvaluator,
      primary_metric: hasEvaluator ? "constraint_checklist" : task.success_metric,
      constraints,
      steps: trace.length,
      tool_calls: trace.length,
      context_chars: totalContextChars,
      curated_docs: Object.keys(memory.curated).length,
    },
  };
}

export function generateLocalCode(graph: HarnessGraph): CodegenResponse {
  const task = firstConfig(graph, "task", DEFAULT_TASK);
  const memory = firstConfig(graph, "memory", DEFAULT_MEMORY);
  const context = firstConfig(graph, "context_builder", DEFAULT_CONTEXT);
  const policy = firstConfig(graph, "model_policy", DEFAULT_POLICY);
  const enabled = [...enabledTools(graph)];
  const code = `"""Generated Nano Harness - a tiny AI harness you can read top to bottom."""

from dataclasses import dataclass, field

CORPUS = {
    "doc_map": "Crimson Brew Cafe is 6 minutes from Harvard Yard.",
    "doc_hours": "Crimson Brew Cafe closes at 22:30 on Saturday.",
    "doc_amenities": "Crimson Brew Cafe has Wi-Fi and vegetarian pastries.",
}

QUESTION = ${JSON.stringify(task.question)}
EXPECTED_ANSWER = ${JSON.stringify(task.expected_answer)}
ENABLED_TOOLS = ${JSON.stringify(enabled)}
POOL_LIMIT = ${memory.pool_limit}
CURATED_LIMIT = ${memory.curated_limit}
MAX_STEPS = ${policy.max_steps}
INCLUDE_TASK = ${context.include_task ? "True" : "False"}
INCLUDE_POOL = ${context.include_pool ? "True" : "False"}
INCLUDE_CURATED = ${context.include_curated ? "True" : "False"}
INCLUDE_HISTORY = ${context.include_history ? "True" : "False"}
TOKEN_BUDGET = ${context.token_budget}

@dataclass
class Memory:
    pool: list[str] = field(default_factory=list)
    curated: dict[str, str] = field(default_factory=dict)
    history: list[str] = field(default_factory=list)
    docs: dict[str, str] = field(default_factory=dict)

def build_context(memory: Memory) -> str:
    parts = []
    if INCLUDE_TASK:
        parts.append(f"Task: {QUESTION}")
    if INCLUDE_POOL:
        parts.append(f"Pool: {memory.pool}")
    if INCLUDE_CURATED:
        parts.append(f"Curated: {memory.curated}")
    if INCLUDE_HISTORY:
        parts.append(f"History: {memory.history[-4:]}")
    return "\\n\\n".join(parts)[:TOKEN_BUDGET]

def run() -> str:
    memory = Memory()
    final_answer = ""
    for step in range(1, MAX_STEPS + 1):
        context = build_context(memory)
        if step == 1:
            name, args = "search_corpus", {"query": QUESTION}
            observation = f"Found docs: {list(CORPUS)}"
            memory.pool = list(CORPUS)[:POOL_LIMIT]
        elif step in (2, 3, 4):
            name = "read_doc"
            doc_id = memory.pool[min(step - 2, len(memory.pool) - 1)] if memory.pool else "doc_map"
            args = {"doc_id": doc_id}
            observation = CORPUS.get(doc_id, "(missing)")
            memory.docs[doc_id] = observation
        elif step == 5:
            name, args = "curate", {"doc_id": "doc_amenities"}
            observation = "Saved compact evidence."
            memory.curated["doc_amenities"] = "Distance, hours, Wi-Fi, and vegetarian snacks all match."
        else:
            name = "finish"
            args = {"answer": "Crimson Brew Cafe is the best match: 6 minutes away, open until 22:30, with Wi-Fi and vegetarian snacks."}
            observation = args["answer"]
            final_answer = observation
        if name not in ENABLED_TOOLS:
            observation = f"{name} is disabled on the canvas."
        memory.history.append(f"{name}: {observation}")
        print(f"Step {step}: {name} -> {observation}")
        if name == "finish":
            break
    return final_answer

if __name__ == "__main__":
    run()
`;
  return { code };
}
