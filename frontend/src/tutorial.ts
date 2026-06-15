import type { GraphEdge, GraphNode, HarnessGraph } from "./types";

// All nodes of the full Retrieval QA harness, keyed by id. Each tutorial stage
// picks a subset so the canvas visibly grows one module at a time. Ids,
// positions, and configs mirror the backend template in templates.py.
const NODES: Record<string, GraphNode> = {
  task: {
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
  policy: {
    id: "policy",
    type: "model_policy",
    label: "Model Policy",
    position: { x: 540, y: 250 },
    config: {
      policy_kind: "mock",
      max_steps: 7,
      explanation: "Decides the next action from the current context.",
    },
  },
  memory: {
    id: "memory",
    type: "memory",
    label: "Working Memory",
    position: { x: 310, y: 90 },
    config: { pool_limit: 5, curated_limit: 3, include_history: true },
  },
  context: {
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
  evaluator: {
    id: "evaluator",
    type: "evaluator",
    label: "Evaluator",
    position: { x: 1030, y: 250 },
    config: { primary_metric: "contains_expected_answer", track_costs: true },
  },
  tool_search_corpus: {
    id: "tool_search_corpus",
    type: "tool",
    label: "Search Tool",
    position: { x: 770, y: 40 },
    config: { tool_name: "search_corpus", enabled: true, description: "Find candidate documents." },
  },
  tool_read_doc: {
    id: "tool_read_doc",
    type: "tool",
    label: "Read Tool",
    position: { x: 770, y: 130 },
    config: { tool_name: "read_doc", enabled: true, description: "Read a full document from memory." },
  },
  tool_curate: {
    id: "tool_curate",
    type: "tool",
    label: "Curate Tool",
    position: { x: 770, y: 220 },
    config: { tool_name: "curate", enabled: true, description: "Keep compact evidence in context." },
  },
  tool_verify: {
    id: "tool_verify",
    type: "tool",
    label: "Verify Tool",
    position: { x: 770, y: 310 },
    config: { tool_name: "verify", enabled: true, description: "Check a claim against memory." },
  },
  tool_finish: {
    id: "tool_finish",
    type: "tool",
    label: "Finish Tool",
    position: { x: 770, y: 400 },
    config: { tool_name: "finish", enabled: true, description: "Return the final answer." },
  },
};

const EDGES: GraphEdge[] = [
  { id: "task-context", source: "task", target: "context", label: "question" },
  { id: "memory-context", source: "memory", target: "context", label: "state" },
  { id: "context-policy", source: "context", target: "policy", label: "prompt" },
  { id: "policy-search", source: "policy", target: "tool_search_corpus", label: "action" },
  { id: "policy-read", source: "policy", target: "tool_read_doc", label: "action" },
  { id: "policy-curate", source: "policy", target: "tool_curate", label: "action" },
  { id: "policy-verify", source: "policy", target: "tool_verify", label: "action" },
  { id: "policy-finish", source: "policy", target: "tool_finish", label: "action" },
  { id: "finish-evaluator", source: "tool_finish", target: "evaluator", label: "answer" },
];

function buildGraph(name: string, nodeIds: string[]): HarnessGraph {
  const present = new Set(nodeIds);
  return {
    name,
    description: "Tutorial stage",
    nodes: nodeIds.map((id) => NODES[id]),
    edges: EDGES.filter((edge) => present.has(edge.source) && present.has(edge.target)),
  };
}

function buildIterateGraph(): HarnessGraph {
  const nodeIds = [
    "task",
    "policy",
    "memory",
    "context",
    "tool_search_corpus",
    "tool_read_doc",
    "tool_curate",
    "tool_verify",
    "tool_finish",
    "evaluator",
  ];
  const present = new Set(nodeIds);
  const nodes = nodeIds.map((id) => {
    const node = { ...NODES[id] };
    if (id === "tool_curate") {
      node.config = { ...node.config, enabled: false };
    }
    return node;
  });
  return {
    name: "Tutorial - Iterate",
    description: "Tutorial stage",
    nodes,
    edges: EDGES.filter((edge) => present.has(edge.source) && present.has(edge.target)),
  };
}

export interface TutorialStage {
  id: string;
  thread: string;
  moduleName: string;
  what: string;
  why: string;
  runHint: string;
  problem: string;
  fix: string;
  tryThis: string;
  graph: HarnessGraph;
  highlightNodeIds: string[];
}

export const TUTORIAL_STAGES: TutorialStage[] = [
  {
    id: "welcome",
    thread: "What is a harness?",
    moduleName: "Welcome to Nano Harness",
    what: "A harness is the code around a fixed model. It decides what the model sees (context), what it remembers (memory), what it can do (tools), and how to judge the result (evaluation). In this lesson, you will build one from scratch.",
    why: "The model itself stays the same. What changes is the harness — and small harness changes can make a big difference in whether the model succeeds or fails at a real task.",
    runHint: "No blocks yet. First, get the idea: the model is fixed; you are designing everything around it.",
    problem: "If we ask a fixed model to answer directly, it guesses from memory. It needs infrastructure — a harness — to search, read, take notes, and check results.",
    fix: "Next, we will use a concrete search task to see why that infrastructure matters.",
    tryThis: "In this lesson, we will use search capability as the example: first see why a plain LLM needs a harness, then learn what a harness is, and finally build one step by step.",
    graph: buildGraph("Tutorial - Welcome", []),
    highlightNodeIds: [],
  },
  {
    id: "case_intro",
    thread: "Why an LLM needs search",
    moduleName: "The task: find a study cafe with evidence",
    what: "Imagine asking a model: I am studying near Harvard University on Saturday night. Which cafe near Harvard Yard is within a 10 minute walk, open after 21:00, and has both Wi-Fi and vegetarian snacks? If it answers directly, it is likely guessing from memory.",
    why: "A harness is the infrastructure that gives an LLM extra capabilities. Here, the harness will give the fixed model search: it can find sources, read them, keep evidence, and check every constraint.",
    runHint: "Still no blocks. This card sets up the task: direct answering is unreliable, so we will build a small evidence-searching harness.",
    problem: "A one-shot answer may sound confident but miss a constraint, use outdated hours, or invent a cafe.",
    fix: "We will build a harness piece by piece: task, planner, search, memory, reading, context, evidence notes, verification, and evaluation.",
    tryThis: "Keep the Harvard study cafe question in mind. The next card will put the Task block on the canvas.",
    graph: buildGraph("Tutorial - Case", []),
    highlightNodeIds: [],
  },
  {
    id: "intro",
    thread: "Harness job: define the goal",
    moduleName: "Start with the question",
    what: "The Task block is today's question: how can we answer from evidence instead of guessing? Put the question on the table first; every later step works around it.",
    why: "When the question is clear, it is easier to know what to search for, what to remember, and how to judge the final answer.",
    runHint: "The settings panel should show a question field. That is the question this downstream task is trying to answer.",
    problem: "Right now this is only a question. Nothing can search yet, keep notes, or check the answer.",
    fix: "Next we will add those abilities one by one, so the answer does not come from guessing.",
    tryThis: "The blue Task block on the canvas holds today's question. Read it first, then keep building.",
    graph: buildGraph("Tutorial - The Task", ["task"]),
    highlightNodeIds: ["task"],
  },
  {
    id: "policy",
    thread: "Harness job: host the fixed model",
    moduleName: "1. The model lives here",
    what: "Policy is where the model lives. In a real harness, this is a fixed language model — you cannot change its weights. What you can change is everything around it: what it sees, what tools it can call, and what happens after it speaks. Here, a scripted stand-in follows a teaching plan so we can focus on the harness design.",
    why: "This is the core harness insight: you do not retrain the model. You redesign the infrastructure — the harness — and the same model behaves differently.",
    runHint: "No need to run this step yet. Just notice: the model is fixed in this one block. Everything else you build is the harness around it.",
    problem: "The task says what we want, but nothing is choosing how to work on it.",
    fix: "Policy gives the harness a decision loop: look at the current situation, pick the next action, then continue. The model decides; the harness controls what it sees and can do.",
    tryThis: "The highlighted Policy block is where the model sits. Everything else on the canvas is harness infrastructure you design.",
    graph: buildGraph("Tutorial - Just guessing", ["task", "policy", "tool_finish"]),
    highlightNodeIds: ["policy"],
  },
  {
    id: "search",
    thread: "Harness job: give the model a tool",
    moduleName: "2. Let it look things up",
    what: "Search is a tool the harness provides. It looks through a document collection and finds candidates that might help.",
    why: "If the model only relies on its own memory, it can sound confident without evidence. Search is the first step toward grounding the answer.",
    runHint: "Look at the trace first, not the final answer. The important part is that the first action is Search: the model now has a way to look for sources.",
    problem: "Without search, the model is likely to guess.",
    fix: "Search gives the harness a way to ground the model in external evidence.",
    tryThis: "Hit \"See the trace\" below to watch how it looks for sources in the first step.",
    graph: buildGraph("Tutorial - Search first", [
      "task",
      "policy",
      "tool_search_corpus",
      "tool_finish",
    ]),
    highlightNodeIds: ["tool_search_corpus"],
  },
  {
    id: "memory",
    thread: "Harness job: persistence between steps",
    moduleName: "3. Add working memory",
    what: "Working Memory is the state area maintained by the harness during a multi-step run. Tools write results into it: search stores candidate document ids, read stores opened source text, and curate stores short evidence notes.",
    why: "Working Memory is not the model's input, and it is not memory inside the model. It sits beside the model as harness state. The model only sees an item when the harness later copies it into the current prompt.",
    runHint: "After it runs, compare \"Working Memory now\" with \"What the model saw this step\". The first is stored state; the second is the actual prompt sent to the model.",
    problem: "If every step starts from scratch, the workflow behaves like it is forgetful: it cannot keep search results, opened documents, or evidence notes for later.",
    fix: "Working Memory lets later steps reuse what earlier steps discovered. The next block, Context Builder, decides which stored items are copied into the model's input.",
    tryThis: "Hit \"See the trace\" to check what was stored in Working Memory, then notice: stored in memory does not mean seen by the model.",
    graph: buildGraph("Tutorial - With memory", [
      "task",
      "policy",
      "memory",
      "tool_search_corpus",
      "tool_finish",
    ]),
    highlightNodeIds: ["memory"],
  },
  {
    id: "read",
    thread: "Harness job: give access to source text",
    moduleName: "4. Open one document",
    what: "Read opens one of the search results so the workflow can see the actual text.",
    why: "A search result is only a lead, not evidence. The source text is what can support the answer.",
    runHint: "After it runs, compare Search and Read in the trace. One finds candidate sources; the other opens one.",
    problem: "Finding a document is not the same as understanding it. The model needs to inspect the source.",
    fix: "Read turns a candidate document into usable evidence.",
    tryThis: "Hit \"See the trace\" to see which document it opens.",
    graph: buildGraph("Tutorial - Search and read", [
      "task",
      "policy",
      "memory",
      "tool_search_corpus",
      "tool_read_doc",
      "tool_finish",
    ]),
    highlightNodeIds: ["tool_read_doc"],
  },
  {
    id: "context",
    thread: "Harness job: control what the model sees",
    moduleName: "5. Hand the notes to the model",
    what: "Context Builder creates the actual input the model can read on this step. It selects from the task and Working Memory, turns those selected pieces into a prompt, and sends that prompt to the model.",
    why: "This is the easy part to mix up: information can be stored in Working Memory without being visible to the model. Only text copied into the current prompt enters the model's view.",
    runHint: "After it runs, look for the highlighted \"What the model saw this step\" row and expand it. That is the exact input the model received for that step.",
    problem: "Information can exist somewhere without being in front of the model when it makes a decision. Without Context Builder, Working Memory is like a storage area beside the model; the model does not automatically walk over and read it.",
    fix: "Context Builder turns the question, candidate documents, evidence notes, and history into the input for the current step. It is the bridge between Working Memory and the model.",
    tryThis: "Hit \"See the trace\", then open the highlighted row to compare: what is stored in Working Memory versus what was actually placed in the prompt.",
    graph: buildGraph("Tutorial - With context", [
      "task",
      "policy",
      "memory",
      "context",
      "tool_search_corpus",
      "tool_read_doc",
      "tool_finish",
    ]),
    highlightNodeIds: ["context"],
  },
  {
    id: "curate",
    thread: "Harness job: manage information",
    moduleName: "6. Keep the useful bit",
    what: "Curate saves the useful bit. After reading a long source, it keeps the most helpful short note.",
    why: "Real documents can be long. The workflow needs the important part, not the whole document on every step.",
    runHint: "After it runs, find curate in the trace and look at the short note it leaves behind.",
    problem: "If every step carries every document, the context gets noisy and expensive.",
    fix: "Curate turns a useful source into compact evidence the model can reuse.",
    tryThis: "Hit \"See the trace\" to see which sentence it saves as a note.",
    graph: buildGraph("Tutorial - Curated evidence", [
      "task",
      "policy",
      "memory",
      "context",
      "tool_search_corpus",
      "tool_read_doc",
      "tool_curate",
      "tool_finish",
    ]),
    highlightNodeIds: ["tool_curate"],
  },
  {
    id: "evaluator",
    thread: "Harness job: measure the result",
    moduleName: "7. Have someone check it",
    what: "Evaluator is the checker. Once an answer comes back, it applies a simple rule to decide whether this run basically worked.",
    why: "Seeing an answer is not enough. A checker makes it easier to compare whether a change helped.",
    runHint: "After it runs, look for score and pass/fail below. Do not chase perfection yet; just see how feedback works.",
    problem: "Without a checker, you can only judge the answer by feel.",
    fix: "Evaluator turns the final answer into a result you can compare.",
    tryThis: "Hit \"See the trace\" to see the score this answer gets.",
    graph: buildGraph("Tutorial - With evaluation", [
      "task",
      "policy",
      "memory",
      "context",
      "tool_search_corpus",
      "tool_read_doc",
      "tool_curate",
      "tool_finish",
      "evaluator",
    ]),
    highlightNodeIds: ["evaluator"],
  },
  {
    id: "complete",
    thread: "All harness jobs working together",
    moduleName: "8. Run the whole thing",
    what: "Now the blocks form a complete harness: the model sees a question, searches, reads, takes notes, keeps the useful bits, submits an answer, and gets checked.",
    why: "A harness is not magic. It is the infrastructure around a fixed model that lets it work step by step and call tools — visible, repeatable, measurable.",
    runHint: "After it runs, read the trace order first: search, read map, read hours, read amenities, save evidence, verify, answer. Once it clicks, generate the code version.",
    problem: "A one-shot chat answer is hard to inspect or improve.",
    fix: "This is a complete harness. The model is fixed; you designed everything around it: the task, memory, context, tools, and evaluator. Change any piece — the model stays the same but behaves differently. That is harness design.",
    tryThis: "Hit \"See the trace\" and follow how the harness checks each constraint one source at a time. Curious about the code? Try Generate Code in the toolbar.",
    graph: buildGraph("Tutorial - Complete harness", [
      "task",
      "policy",
      "memory",
      "context",
      "tool_search_corpus",
      "tool_read_doc",
      "tool_curate",
      "tool_verify",
      "tool_finish",
      "evaluator",
    ]),
    highlightNodeIds: ["tool_verify", "evaluator"],
  },
  {
    id: "iterate",
    thread: "The harness design cycle",
    moduleName: "9. Change one thing, compare",
    what: "Same model, one harness change: we turned off Curate. Watch the score drop. The model did not get dumber — the harness gave it worse material.",
    why: "This is the harness design cycle: change one thing, measure, compare. You improve the task by improving the harness, not by changing the model.",
    runHint: "Compare this score with the previous run. The model is the same; only the harness changed.",
    problem: "Without iteration, you cannot tell which harness design works better.",
    fix: "Re-enable Curate in the inspector, run again, and watch the score recover. That is harness design in action.",
    tryThis: "Click the Curate Tool block, enable it in the inspector, then hit Run to compare scores.",
    graph: buildIterateGraph(),
    highlightNodeIds: ["tool_curate"],
  },
];
