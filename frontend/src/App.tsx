import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  updateEdge,
  type ConnectionLineType,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";

import { BlockPalette } from "./components/BlockPalette";
import { GuidedTour, type TourStep } from "./components/GuidedTour";
import { HarnessNode } from "./components/HarnessNode";
import { Inspector } from "./components/Inspector";
import { OutputPanel } from "./components/OutputPanel";
import { TutorialPanel } from "./components/TutorialPanel";
import { generateCode, getTemplate, listTemplates, runGraph } from "./lib/api";
import { TUTORIAL_STAGES } from "./tutorial";
import type { GraphNode, HarnessGraph, RunResponse, TemplateSummary } from "./types";

type FlowData = {
  label: string;
  type: GraphNode["type"];
  config: Record<string, unknown>;
};

type FlowNode = Node<FlowData>;
type Lang = "zh" | "en";

const nodeTypes = {
  harnessNode: HarnessNode,
};

const TOUR_STORAGE_KEY = "nano-harness:tour-completed";
const AUTO_RUN_TUTORIAL_STAGE_IDS = new Set([
  "baseline",
  "search",
  "memory",
  "read",
  "context",
  "curate",
  "verify",
  "evaluator",
  "complete",
  "iterate",
]);

function getTourSteps(lang: Lang): TourStep[] {
  if (lang === "en") {
    return [
      {
        title: "Welcome to Nano Harness",
        body: "Imagine a smart intern who forgets things easily. We'll give them a task, tools, notes, and someone to check the work.",
        placement: "center",
      },
      {
        selector: "[data-tour='templates']",
        title: "1. Load a full example",
        body: "This is the finished version. If this is your first time here, the lesson is probably a gentler place to start.",
        placement: "bottom",
      },
      {
        selector: ".palette",
        title: "2. Building blocks",
        body: "These are the spare parts. Later, if you feel like tinkering, you can drag them in and build your own version.",
        placement: "right",
      },
      {
        selector: ".canvas",
        title: "3. The canvas",
        body: "This is the desk. The lesson will put one block here at a time, so the workflow grows in front of you.",
        placement: "bottom",
      },
      {
        selector: ".inspector",
        title: "4. Settings",
        body: "When you click a block, its settings show up here. Tiny changes here can change the next run.",
        placement: "left",
      },
      {
        selector: "[data-tour='run']",
        title: "5. Run",
        body: "This runs whatever is on the canvas. The trace below reads like a little play-by-play.",
        placement: "bottom",
      },
      {
        selector: ".output",
        title: "6. Trace and code",
        body: "The trace is the friendlier place to start. Once the behavior clicks, the Python version is here too.",
        placement: "top",
      },
    ];
  }
  return [
    {
      title: "欢迎来到 Nano Harness",
      body: "你可以把模型想成一个聪明但健忘的实习生。我们慢慢给它配任务、工具、工作记忆，最后再找人验收。",
      placement: "center",
    },
    {
      selector: "[data-tour='templates']",
      title: "1. 加载完整示例",
      body: "这里是成品版。第一次来的话，从“开始学习”慢慢走会轻松很多。",
      placement: "bottom",
    },
    {
      selector: ".palette",
      title: "2. 积木区",
      body: "这里像零件箱。之后如果想自己试着搭，可以从这里拖一块到画布上。",
      placement: "right",
    },
    {
      selector: ".canvas",
      title: "3. 画布",
      body: "这里就是桌面。教程会一块一块放上去，让你看着流程慢慢长出来。",
      placement: "bottom",
    },
    {
      selector: ".inspector",
      title: "4. 设置区",
      body: "点到某个积木时，右边会显示它自己的设置。改一点点，下一次结果可能就不一样。",
      placement: "left",
    },
    {
      selector: "[data-tour='run']",
      title: "5. 运行",
      body: "这里会跑一下当前流程。下面的 Trace 会像小流水账一样告诉你发生了什么。",
      placement: "bottom",
    },
    {
      selector: ".output",
      title: "6. 过程和代码",
      body: "Trace 比较适合先看。等心里有数了，再看看 Generated Python 也不迟。",
      placement: "top",
    },
  ];
}

const defaultEdgeOptions = {
  type: "smoothstep",
  animated: false,
  style: {
    stroke: "#64748b",
    strokeWidth: 2,
  },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "#64748b",
    width: 16,
    height: 16,
  },
};

const NODE_TYPE_ORDER: Record<GraphNode["type"], number> = {
  task: 0,
  memory: 1,
  context_builder: 1,
  model_policy: 2,
  tool: 3,
  evaluator: 4,
};

const TOOL_ORDER: Record<string, number> = {
  search_corpus: 0,
  read_doc: 1,
  curate: 2,
  verify: 3,
  finish: 4,
};

const TOOL_LABELS: Record<string, string> = {
  search_corpus: "Search Tool",
  read_doc: "Read Tool",
  curate: "Curate Tool",
  verify: "Verify Tool",
  finish: "Finish Tool",
};

function labelForNode(type: GraphNode["type"], currentLabel: string, config: Record<string, unknown>): string {
  if (type === "tool") {
    return TOOL_LABELS[String(config.tool_name ?? "")] ?? currentLabel;
  }
  if (type === "model_policy") {
    const policyKind = String(config.policy_kind ?? "");
    return policyKind === "scripted" ? "Scripted Decision Maker" : "Model / Decision Maker";
  }
  if (type === "context_builder") {
    return "Context Builder";
  }
  return currentLabel;
}

function arrangeNodes(nodes: FlowNode[]): FlowNode[] {
  const grouped = new Map<number, FlowNode[]>();
  nodes.forEach((node) => {
    const column = NODE_TYPE_ORDER[node.data.type] ?? 5;
    grouped.set(column, [...(grouped.get(column) ?? []), node]);
  });

  grouped.forEach((items) => {
    items.sort((a, b) => {
      if (a.data.type === "tool" && b.data.type === "tool") {
        const aTool = String(a.data.config.tool_name ?? "");
        const bTool = String(b.data.config.tool_name ?? "");
        return (TOOL_ORDER[aTool] ?? 99) - (TOOL_ORDER[bTool] ?? 99);
      }
      return a.data.type.localeCompare(b.data.type);
    });
  });

  return nodes.map((node) => {
    const column = NODE_TYPE_ORDER[node.data.type] ?? 5;
    const columnNodes = grouped.get(column) ?? [];
    const index = columnNodes.findIndex((item) => item.id === node.id);
    const count = columnNodes.length;
    const x = 80 + column * 230;
    const centerY = 250;
    const spacing = column === 3 ? 86 : 140;
    const y = centerY + (index - (count - 1) / 2) * spacing;

    return {
      ...node,
      position: { x, y },
    };
  });
}

function toFlowNodes(graph: HarnessGraph): FlowNode[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    type: "harnessNode",
    position: node.position,
    data: {
      label: node.label,
      type: node.type,
      config: node.config,
    },
  }));
}

function toFlowEdges(graph: HarnessGraph): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    ...defaultEdgeOptions,
    updatable: true,
  }));
}

function toGraph(name: string, description: string, nodes: FlowNode[], edges: Edge[]): HarnessGraph {
  return {
    name,
    description,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.type,
      label: node.data.label,
      position: node.position,
      config: node.data.config,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: typeof edge.label === "string" ? edge.label : "",
    })),
  };
}

interface AnatomyStatus {
  task: boolean;
  memory: boolean;
  context: boolean;
  model: boolean;
  tools: { present: number; total: number };
  eval: boolean;
}

function harnessAnatomy(nodes: FlowNode[]): AnatomyStatus {
  const nodeTypes = new Set(nodes.map((n) => n.data.type));
  const enabledTools = nodes.filter(
    (n) => n.data.type === "tool" && n.data.config.enabled !== false,
  );
  return {
    task: nodeTypes.has("task"),
    memory: nodeTypes.has("memory"),
    context: nodeTypes.has("context_builder"),
    model: nodeTypes.has("model_policy"),
    tools: { present: enabledTools.length, total: 5 },
    eval: nodeTypes.has("evaluator"),
  };
}

function missingParts(nodes: FlowNode[], lang: Lang): string[] {
  const nodeTypes = new Set(nodes.map((node) => node.data.type));
  const tools = new Set(
    nodes
      .filter((node) => node.data.type === "tool" && node.data.config.enabled !== false)
      .map((node) => String(node.data.config.tool_name ?? "")),
  );
  const missing: string[] = [];
  if (!nodeTypes.has("model_policy")) missing.push(lang === "zh" ? "决策者" : "Decision Maker");
  if (!nodeTypes.has("memory")) missing.push(lang === "zh" ? "记忆" : "Memory");
  if (!nodeTypes.has("context_builder")) missing.push(lang === "zh" ? "上下文" : "Context");
  if (!nodeTypes.has("evaluator")) missing.push(lang === "zh" ? "评分员" : "Evaluator");
  for (const [tool, label] of [
    ["search_corpus", lang === "zh" ? "搜索工具" : "Search"],
    ["read_doc", lang === "zh" ? "阅读工具" : "Read"],
    ["curate", lang === "zh" ? "整理工具" : "Curate"],
    ["finish", lang === "zh" ? "提交工具" : "Finish"],
  ]) {
    if (!tools.has(tool)) {
      missing.push(lang === "zh" ? label : `${label} tool`);
    }
  }
  return missing;
}

export default function App() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [graphName, setGraphName] = useState("Nano Harness");
  const [description, setDescription] = useState("");
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [runResult, setRunResult] = useState<RunResponse>();
  const [generatedCode, setGeneratedCode] = useState("");
  const [error, setError] = useState<string>();
  const [isRunning, setIsRunning] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialStage, setTutorialStage] = useState(0);
  const [lang, setLang] = useState<Lang>("zh");
  const [fitViewRequest, setFitViewRequest] = useState(0);
  const reactFlow = useRef<ReactFlowInstance | null>(null);

  const graph = useMemo(
    () => toGraph(graphName, description, nodes, edges),
    [description, edges, graphName, nodes],
  );
  // Keep the latest graph available to the auto-run effect without making the
  // effect depend on every node/edge change (which would re-run constantly).
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const missing = useMemo(() => missingParts(nodes, lang), [lang, nodes]);
  const anatomy = useMemo(() => harnessAnatomy(nodes), [nodes]);
  const copy = useMemo(
    () =>
      lang === "zh"
        ? {
            subtitle:
              "这是一节零基础小教程：同一个固定模型，加上不同的 harness（搜索、笔记、上下文、评估），就能带着证据回答问题。纯模拟演示，不用 API Key。",
            loadExample: "加载完整示例",
            run: "运行",
            autoArrange: "自动整理",
            generateCode: "生成代码",
            startLearning: "开始学习（推荐）",
            startLearningTitle: "零基础课程：不用先懂任何概念，跟着看每一步在做什么，最后你就知道 harness 是什么了。",
            guide: "? 认识界面",
            guideTitle: "先认认路：看看每个区域是干嘛的。",
            complete: "可以完整运行",
            completeTitle: "关键积木都到齐了，可以完整跑一遍。",
            missingPrefix: "还缺：",
            canvasHint: "跟着教程走就好：每多一块积木，harness 就多一个能力。",
          }
        : {
            subtitle:
              "A beginner lesson: same fixed model, different harness (search, memory, context, evaluation) = different results. Assemble one step by step to see why. Just a simulation, no API key needed.",
            loadExample: "Load full example",
            run: "Run",
            autoArrange: "Auto arrange",
            generateCode: "Generate code",
            startLearning: "Start learning (recommended)",
            startLearningTitle: "Beginner lesson: follow each step and by the end you will know what a harness is and why it matters.",
            guide: "? Interface guide",
            guideTitle: "Quick tour: get your bearings before building.",
            complete: "Complete",
            completeTitle: "The key blocks are all here.",
            missingPrefix: "Missing: ",
            canvasHint: "Follow the lesson: each block adds one capability to the harness.",
          },
    [lang],
  );

  const selectedNode = useMemo(() => {
    const node = nodes.find((candidate) => candidate.id === selectedNodeId);
    if (!node) {
      return undefined;
    }
    return {
      id: node.id,
      type: node.data.type,
      label: node.data.label,
      position: node.position,
      config: node.data.config,
    };
  }, [nodes, selectedNodeId]);

  const selectedEdge = useMemo(() => {
    const edge = edges.find((candidate) => candidate.id === selectedEdgeId);
    if (!edge) {
      return undefined;
    }
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: typeof edge.label === "string" ? edge.label : undefined,
    };
  }, [edges, selectedEdgeId]);

  const loadTemplate = useCallback(async (templateId: string) => {
    try {
      setError(undefined);
      const template = await getTemplate(templateId);
      setGraphName(template.name);
      setDescription(template.description);
      setNodes(arrangeNodes(toFlowNodes(template)));
      setEdges(toFlowEdges(template));
      setSelectedNodeId(undefined);
      setSelectedEdgeId(undefined);
      setRunResult(undefined);
      setGeneratedCode("");
      setTutorialActive(false);
      setFitViewRequest((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load template.");
    }
  }, []);

  const loadStage = useCallback((stageIndex: number) => {
    const stage = TUTORIAL_STAGES[stageIndex];
    if (!stage) {
      return;
    }
    setError(undefined);
    setGraphName(stage.graph.name);
    setDescription(stage.graph.description);
    setNodes(toFlowNodes(stage.graph));
    setEdges(toFlowEdges(stage.graph));
    setSelectedNodeId(undefined);
    setSelectedEdgeId(undefined);
    setRunResult(undefined);
    setGeneratedCode("");
    setFitViewRequest((current) => current + 1);
  }, []);

  const startTutorial = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTutorialActive(true);
    setTutorialStage(0);
    loadStage(0);
  }, [loadStage]);

  const openTour = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTourOpen(true);
  }, []);

  const exitTutorial = useCallback(() => {
    setTutorialActive(false);
  }, []);

  const goToStage = useCallback(
    (stageIndex: number) => {
      if (stageIndex < 0) {
        return;
      }
      if (stageIndex >= TUTORIAL_STAGES.length) {
        setTutorialActive(false);
        return;
      }
      setTutorialStage(stageIndex);
      loadStage(stageIndex);
    },
    [loadStage],
  );

  useEffect(() => {
    // Land on the first stage that actually has blocks so the canvas is not
    // blank before the lesson starts (the welcome stage is intentionally empty).
    const firstWithNodes = TUTORIAL_STAGES.findIndex((item) => item.graph.nodes.length > 0);
    loadStage(firstWithNodes === -1 ? 0 : firstWithNodes);
    listTemplates()
      .then((items) => {
        setTemplates(items);
      })
      .catch((caught) => {
        setError(
          caught instanceof Error
            ? `Backend unavailable: ${caught.message}`
            : "Backend unavailable.",
        );
      });
  }, [loadStage]);

  useEffect(() => {
    if (fitViewRequest === 0 || nodes.length === 0) {
      return;
    }

    let frame = 0;
    const timer = window.setTimeout(() => {
      frame = window.requestAnimationFrame(() => {
        reactFlow.current?.fitView({ padding: 0.22, duration: 300, includeHiddenNodes: false });
      });
    }, 80);

    return () => {
      window.clearTimeout(timer);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [edges.length, fitViewRequest, nodes.length]);

  const closeTour = useCallback(() => {
    setTourOpen(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {
      // Ignore storage failures; the tour simply reappears next visit.
    }
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current) as FlowNode[]);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) =>
      addEdge(
        {
          ...connection,
          id: `${connection.source}-${connection.target}-${Date.now()}`,
          ...defaultEdgeOptions,
          updatable: true,
        },
        current,
      ),
    );
  }, []);

  const onEdgeUpdate = useCallback((oldEdge: Edge, newConnection: Connection) => {
    setEdges((current) => updateEdge(oldEdge, newConnection, current));
  }, []);

  const autoArrange = useCallback(() => {
    setNodes((current) => arrangeNodes(current));
    setFitViewRequest((current) => current + 1);
  }, []);

  const updateNodeConfig = useCallback((nodeId: string, config: Record<string, unknown>) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                label: labelForNode(node.data.type, node.data.label, config),
                config,
              },
            }
          : node,
      ),
    );
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) =>
      current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    );
    setSelectedNodeId((current) => (current === nodeId ? undefined : current));
    setSelectedEdgeId(undefined);
    setRunResult(undefined);
    setGeneratedCode("");
  }, []);

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges((current) => current.filter((edge) => edge.id !== edgeId));
    setSelectedEdgeId((current) => (current === edgeId ? undefined : current));
    setRunResult(undefined);
    setGeneratedCode("");
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const payload = event.dataTransfer.getData("application/nano-harness-block");
    if (!payload || !reactFlow.current) {
      return;
    }
    const block = JSON.parse(payload) as {
      type: GraphNode["type"];
      label: string;
      defaults: Record<string, unknown>;
    };
    const position = reactFlow.current.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    const id = `${block.type}-${Date.now()}`;
    setNodes((current) => [
      ...current,
      {
        id,
        type: "harnessNode",
        position,
        data: {
          label: block.label,
          type: block.type,
          config: block.defaults,
        },
      },
    ]);
    setSelectedNodeId(id);
    setSelectedEdgeId(undefined);
  }, []);

  const runGraphFor = useCallback(async (target: HarnessGraph) => {
    try {
      setIsRunning(true);
      setError(undefined);
      setRunResult(await runGraph(target));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Run failed.");
    } finally {
      setIsRunning(false);
    }
  }, []);

  const handleRun = useCallback(() => {
    void runGraphFor(graphRef.current);
  }, [runGraphFor]);

  // While the lesson is active, run each stage automatically once its blocks
  // have settled, so the trace appears without the learner hunting for a button.
  useEffect(() => {
    if (!tutorialActive) {
      return;
    }
    const stage = TUTORIAL_STAGES[tutorialStage];
    if (!stage || !AUTO_RUN_TUTORIAL_STAGE_IDS.has(stage.id)) {
      return;
    }
    setRunResult(undefined);
    const timer = window.setTimeout(() => {
      void runGraphFor(stage.graph);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [tutorialActive, tutorialStage, runGraphFor]);

  const handleGenerateCode = useCallback(async () => {
    try {
      setError(undefined);
      const response = await generateCode(graph);
      setGeneratedCode(response.code);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Code generation failed.");
    }
  }, [graph]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-copy">
          <h1>Nano Harness</h1>
          <p>{copy.subtitle}</p>
        </div>
        <div className="primary-actions">
          <div className="language-toggle" aria-label="Language">
            <button className={lang === "zh" ? "active" : ""} onClick={() => setLang("zh")} type="button">
              中文
            </button>
            <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")} type="button">
              EN
            </button>
          </div>
          <button className="tutorial-button" title={copy.startLearningTitle} onClick={startTutorial} type="button">
            {copy.startLearning}
          </button>
          <button className="guide-button" title={copy.guideTitle} onClick={openTour} type="button">
            {copy.guide}
          </button>
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar-group">
          <select
            aria-label={copy.loadExample}
            data-tour="templates"
            onChange={(event) => void loadTemplate(event.target.value)}
            defaultValue=""
          >
            <option value="" disabled>
              {copy.loadExample}
            </option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <button data-tour="run" onClick={handleRun} type="button">
            {copy.run}
          </button>
          {tutorialActive ? (
            <span className="harness-anatomy" title={lang === "zh" ? "Harness 结构进度" : "Harness anatomy"}>
              <span className={`anatomy-pill ${anatomy.task ? "filled" : ""}`}>Task</span>
              <span className={`anatomy-pill ${anatomy.memory ? "filled" : ""}`}>{lang === "zh" ? "Memory" : "Memory"}</span>
              <span className={`anatomy-pill ${anatomy.context ? "filled" : ""}`}>Context</span>
              <span className={`anatomy-pill ${anatomy.model ? "filled" : ""}`}>{lang === "zh" ? "Model" : "Model"}</span>
              <span className={`anatomy-pill ${anatomy.tools.present > 0 ? "filled" : ""}`}>
                Tools {anatomy.tools.present}/{anatomy.tools.total}
              </span>
              <span className={`anatomy-pill ${anatomy.eval ? "filled" : ""}`}>Eval</span>
            </span>
          ) : (
            <span
              className={`missing-status ${missing.length === 0 ? "complete" : ""}`}
              title={missing.length === 0 ? copy.completeTitle : `${copy.missingPrefix}${missing.join(lang === "zh" ? "、" : ", ")}`}
            >
              {missing.length === 0
                ? copy.complete
                : `${copy.missingPrefix}${missing.slice(0, 3).join(lang === "zh" ? "、" : ", ")}${missing.length > 3 ? "..." : ""}`}
            </span>
          )}
        </div>
        <div className="toolbar-group">
          <button className="secondary-button" onClick={autoArrange} type="button">
            {copy.autoArrange}
          </button>
          <button data-tour="generate" onClick={handleGenerateCode} type="button">
            {copy.generateCode}
          </button>
        </div>
      </div>

      <section className="workspace">
        <BlockPalette lang={lang} />
        <main
          className="canvas"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={handleDrop}
        >
          <div className="graph-meta">
            <input
              aria-label="Graph name"
              value={graphName}
              onChange={(event) => setGraphName(event.target.value)}
            />
            <input
              aria-label="Graph description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="canvas-hint">{copy.canvasHint}</div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeUpdate={onEdgeUpdate}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(undefined);
            }}
            edgesUpdatable
            edgesFocusable
            edgeUpdaterRadius={18}
            nodesConnectable
            panOnDrag
            zoomOnScroll={false}
            connectionLineType={"smoothstep" as ConnectionLineType}
            connectionLineStyle={{ stroke: "#64748b", strokeWidth: 2 }}
            onInit={(instance) => {
              reactFlow.current = instance;
            }}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(undefined);
            }}
            onPaneClick={() => {
              setSelectedNodeId(undefined);
              setSelectedEdgeId(undefined);
            }}
            fitView
          >
            <Controls />
            <Background />
          </ReactFlow>
        </main>
        <Inspector
          selectedEdge={selectedEdge}
          selectedNode={selectedNode}
          onDeleteEdge={deleteEdge}
          onUpdateConfig={updateNodeConfig}
          onDeleteNode={deleteNode}
        />
      </section>

      {tutorialActive && TUTORIAL_STAGES[tutorialStage] ? (
        <TutorialPanel
          key={TUTORIAL_STAGES[tutorialStage].id}
          stage={TUTORIAL_STAGES[tutorialStage]}
          index={tutorialStage}
          total={TUTORIAL_STAGES.length}
          isRunning={isRunning}
          onBack={() => goToStage(tutorialStage - 1)}
          onNext={() => goToStage(tutorialStage + 1)}
          onExit={exitTutorial}
          onRun={handleRun}
          lang={lang}
        />
      ) : null}

      <OutputPanel
        runResult={runResult}
        generatedCode={generatedCode}
        isRunning={isRunning}
        error={error}
        lang={lang}
      />

      <GuidedTour steps={getTourSteps(lang)} open={tourOpen} onClose={closeTour} />
    </div>
  );
}
