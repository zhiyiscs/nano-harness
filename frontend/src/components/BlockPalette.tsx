import type { NodeType, ToolName } from "../types";

type Lang = "zh" | "en";

interface BlockDefinition {
  type: NodeType;
  label: string;
  description: string;
  defaults: Record<string, unknown>;
}

const toolDefaults = (toolName: ToolName, description: string) => ({
  tool_name: toolName,
  enabled: true,
  description,
});

const CORE_BLOCKS_BY_LANG: Record<Lang, BlockDefinition[]> = {
  zh: [
  {
    type: "task",
    label: "Task",
    description: "任务：告诉 AI 要解决什么问题，以及怎样算成功。",
    defaults: {
      question: "What is a harness?",
      expected_answer: "context memory tools evaluation",
      success_metric: "contains_expected_answer",
      dataset: "toy_retrieval",
    },
  },
  {
    type: "model_policy",
    label: "Model / Decision Maker",
    description: "决策者：看当前情况，决定下一步该做什么。Mock 是教学用固定脚本，不是真实大模型。",
    defaults: {
      policy_kind: "mock",
      max_steps: 6,
      explanation: "Choose tool calls from the current context.",
    },
  },
  {
    type: "memory",
    label: "Working Memory",
    description: "记忆：给 AI 准备可保存、可查询的资料和历史。",
    defaults: { pool_limit: 5, curated_limit: 3, include_history: true },
  },
  {
    type: "context_builder",
    label: "Context Builder",
    description: "上下文整理器：把任务和有用资料拼成模型能看的内容。",
    defaults: {
      include_task: true,
      include_pool: true,
      include_curated: true,
      include_history: true,
      token_budget: 1200,
    },
  },
  {
    type: "evaluator",
    label: "Evaluator",
    description: "评分员：用约束清单检查最终结果。",
    defaults: { primary_metric: "constraint_checklist", track_costs: true },
  },
  ],
  en: [
    {
      type: "task",
      label: "Task",
      description: "Task: tell the AI what problem to solve and what success means.",
      defaults: {
        question: "What is a harness?",
        expected_answer: "context memory tools evaluation",
        success_metric: "contains_expected_answer",
        dataset: "toy_retrieval",
      },
    },
    {
      type: "model_policy",
      label: "Model / Decision Maker",
      description: "Decision maker: chooses the next step. Mock is a teaching script, not a real model.",
      defaults: {
        policy_kind: "mock",
        max_steps: 6,
        explanation: "Choose tool calls from the current context.",
      },
    },
    {
      type: "memory",
      label: "Working Memory",
      description: "Memory: stores searchable information and recent history for the AI.",
      defaults: { pool_limit: 5, curated_limit: 3, include_history: true },
    },
    {
      type: "context_builder",
      label: "Context Builder",
      description: "Context organizer: turns useful memory into text the model can see.",
      defaults: {
        include_task: true,
        include_pool: true,
        include_curated: true,
        include_history: true,
        token_budget: 1200,
      },
    },
    {
      type: "evaluator",
      label: "Evaluator",
      description: "Grader: checks the final result against a constraint checklist.",
      defaults: { primary_metric: "constraint_checklist", track_costs: true },
    },
  ],
};

const TOOL_BLOCKS_BY_LANG: Record<Lang, BlockDefinition[]> = {
  zh: [
  {
    type: "tool",
    label: "Search Tool",
    description: "工具：去资料里搜索可能有用的文档。",
    defaults: toolDefaults("search_corpus", "Search for useful documents."),
  },
  {
    type: "tool",
    label: "Read Tool",
    description: "工具：用工作记忆里的文档 id 打开资料。",
    defaults: toolDefaults("read_doc", "Open a document using an id stored in memory."),
  },
  {
    type: "tool",
    label: "Curate Tool",
    description: "工具：把关键证据整理成短笔记。",
    defaults: toolDefaults("curate", "Keep a short evidence note in context."),
  },
  {
    type: "tool",
    label: "Verify Tool",
    description: "工具：用已有资料检查说法是否有依据。",
    defaults: toolDefaults("verify", "Check a claim against memory."),
  },
  {
    type: "tool",
    label: "Finish Tool",
    description: "工具：提交最终回答。",
    defaults: toolDefaults("finish", "Return the final answer."),
  },
  ],
  en: [
    {
      type: "tool",
      label: "Search Tool",
      description: "Tool: search the toy documents for useful evidence.",
      defaults: toolDefaults("search_corpus", "Search for useful documents."),
    },
    {
      type: "tool",
      label: "Read Tool",
      description: "Tool: open a document using an id stored in memory.",
      defaults: toolDefaults("read_doc", "Open a document using an id stored in memory."),
    },
    {
      type: "tool",
      label: "Curate Tool",
      description: "Tool: save key evidence as a short note.",
      defaults: toolDefaults("curate", "Keep a short evidence note in context."),
    },
    {
      type: "tool",
      label: "Verify Tool",
      description: "Tool: check a claim against remembered evidence.",
      defaults: toolDefaults("verify", "Check a claim against memory."),
    },
    {
      type: "tool",
      label: "Finish Tool",
      description: "Tool: submit the final answer.",
      defaults: toolDefaults("finish", "Return the final answer."),
    },
  ],
};

function PaletteSection({
  title,
  description,
  blocks,
}: {
  title: string;
  description: string;
  blocks: BlockDefinition[];
}) {
  return (
    <section className="palette-section">
      <div className="palette-section-header">
        <h2>{title}</h2>
        <p className="muted">{description}</p>
      </div>
      <div className="block-list">
        {blocks.map((block, index) => (
          <div
            className={`block-card ${block.type === "tool" ? "tool-card" : ""}`}
            draggable
            key={`${block.type}-${block.label}-${index}`}
            title={block.description}
            onDragStart={(event) => {
              event.dataTransfer.setData("application/nano-harness-block", JSON.stringify(block));
              event.dataTransfer.effectAllowed = "move";
            }}
          >
            <strong>{block.label}</strong>
            <span className="block-tooltip">{block.description}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function BlockPalette({ lang = "zh" }: { lang?: Lang }) {
  const coreBlocks = CORE_BLOCKS_BY_LANG[lang];
  const toolBlocks = TOOL_BLOCKS_BY_LANG[lang];
  return (
    <aside className="panel palette">
      <PaletteSection
        blocks={coreBlocks}
        description={lang === "zh" ? "AI 工作流的核心积木。" : "The core blocks of an AI workflow."}
        title="Harness Blocks"
      />
      <PaletteSection
        blocks={toolBlocks}
        description={lang === "zh" ? "AI 可以调用的小能力。" : "Small abilities the AI workflow can call."}
        title="Tools"
      />
    </aside>
  );
}
