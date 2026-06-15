import { useEffect, useRef, useState, type PointerEvent } from "react";

import type { TutorialStage } from "../tutorial";

type Lang = "zh" | "en";

interface TutorialPanelProps {
  stage: TutorialStage;
  index: number;
  total: number;
  isRunning: boolean;
  onBack: () => void;
  onNext: () => void;
  onExit: () => void;
  onRun: () => void;
  lang: Lang;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 10;
const DEFAULT_PANEL_POSITION = { x: 300, y: 140 };
const RESULT_PHASE_STAGE_IDS = new Set([
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

const ZH_STAGE_COPY: Record<
  string,
  {
    thread?: string;
    moduleName: string;
    what: string;
    why: string;
    runHint: string;
    problem: string;
    fix: string;
    tryThis: string;
  }
> = {
  welcome: {
    thread: "什么是 harness？",
    moduleName: "欢迎来到 Nano Harness",
    what: "harness 是包在固定模型外面的代码。它决定模型看到什么（上下文）、步骤之间保存什么（记忆）、能做什么（工具），以及怎样判断结果（评估）。这节课会一步步把它组装起来。",
    why: "同一个模型，不同 harness：没有搜索就只能猜；搜索会找候选资料；记忆会保存结果；上下文决定模型看见什么；整理会保留紧凑证据。",
    runHint: "现在还没有积木。先理解这个概念：模型是固定的；你正在设计它周围的一切。",
    problem: "如果只让固定模型直接回答，它只能凭印象猜。它需要基础设施——也就是 harness——来搜索、阅读、记笔记和检查结果。",
    fix: "下一步，我们会用一个具体的搜索任务来说明这层基础设施为什么重要。",
    tryThis: "这节课会用搜索能力做例子：先看为什么普通 LLM 需要 harness，再理解什么是 harness，最后一步步搭出一个 harness。",
  },
  case_intro: {
    thread: "为什么 LLM 需要搜索",
    moduleName: "这次任务：带着证据找学习咖啡店",
    what: "想象你问模型：我周六晚上在哈佛大学附近学习，Harvard Yard 周围哪家咖啡店步行 10 分钟内、晚上 21:00 后还开门、同时有 Wi-Fi 和素食点心？",
    why: "这里用的是一个玩具文档集合，不是真实联网搜索。咖啡店资料是虚构的，这样我们才能检查每一步，而不是相信黑盒结果。",
    runHint: "现在还没有积木。这张卡先交代任务和玩具资料库。下一步会把具体问题放到画布上。",
    problem: "一次性回答听起来可能很自信，但它可能漏掉某个条件、用了过期营业时间，甚至编出一家店。",
    fix: "我们会一块一块搭出这个 harness：任务、直接回答基线、决策者、搜索、记忆、阅读、上下文、证据笔记、核对和评估。",
    tryThis: "先记住哈佛附近学习咖啡店这个问题。下一步会把第一块「任务」积木放到画布上。",
  },
  intro: {
    thread: "harness 职责：定义目标",
    moduleName: "从问题开始",
    what: "「任务」积木就是今天的问题：怎样不用猜测，而是根据证据回答？先把问题摆出来；后面每一步都围绕它工作。",
    why: "问题清楚后，才更容易判断该搜什么、该保存什么、以及怎样评判最终答案。",
    runHint: "设置面板里应该会显示 question 字段。那就是这次下游任务要回答的问题。",
    problem: "现在还只有一个问题。它还不能搜索、记笔记，也不能检查答案。",
    fix: "接下来会逐步加入这些能力，让答案不来自猜测。",
    tryThis: "画布上蓝色的「任务」积木保存着今天的问题。先读它，再继续搭。",
  },
  baseline: {
    thread: "先亲眼看到失败",
    moduleName: "0. 直接回答会失败",
    what: "先别急着加 harness。让模型直接回答一次：它有问题和提交答案工具，但没有搜索、没有工作记忆、没有来源原文，也没有评估器。",
    why: "这就是痛点。直接回答可能很流畅，但没有证据，也可能漏掉 Wi-Fi、周六营业时间或素食点心这些约束。",
    runHint: "看运行过程和最终答案。因为上下文构建器还没出现，临时的 question 连线表示问题被直接递给决策者。",
    problem: "这个答案本质上是在猜：它不能引用来源，不能检查这些看起来像实时信息的条件，也不能证明每条要求都满足。",
    fix: "接下来会围绕同一个决策者加上 harness，让它能搜索、记住、阅读并核对证据。",
    tryThis: "打开运行过程前，先猜一下直接回答会缺什么：证据、约束，还是两者都缺？",
  },
  policy: {
    thread: "harness 职责：承载固定模型",
    moduleName: "1. 模型 / 决策者",
    what: "这块是面向模型的决策者。技术上它叫 policy：负责根据模型当前能看到的内容，选择下一步动作。",
    why: "模型不会自动知道该搜索什么、该检查什么。这个块负责选择动作；harness 负责控制它看到什么、能用什么工具、保存什么、最后怎么检查。",
    runHint: "这一步还不用运行。注意这条临时 question 连线：上下文构建器出现前，图上先简化表示问题直接进入决策者。",
    problem: "问题只说明目标，但还没有任何东西负责推进这个目标。",
    fix: "决策者给 harness 一个循环：查看当前情况、选择下一步动作、然后继续。",
    tryThis: "高亮的块负责选择动作。后面上下文构建器会替换这条临时 question 连线，变成真正的 prompt 构建路径。",
  },
  search: {
    thread: "harness 职责：给模型工具",
    moduleName: "2. 让它会搜索资料",
    what: "「搜索」是 harness 提供的工具。它会在文档集合里查找可能有帮助的候选资料。",
    why: "如果模型只能依赖自己的记忆，它可能说得很自信却没有证据。搜索是把答案建立在证据上的第一步。",
    runHint: "先看运行过程，而不是最终答案。重点是第一步动作是「搜索」：模型现在有办法去找来源。",
    problem: "没有搜索时，模型很容易直接猜答案。",
    fix: "「搜索」让 harness 能把模型的回答建立在外部证据上。",
    tryThis: "打开运行过程前，先猜下一步应该是“搜索”还是“提交答案”，再看第一步发生了什么。",
  },
  memory: {
    thread: "harness 职责：步骤间持久化",
    moduleName: "3. 加入工作记忆",
    what: "Working Memory 是 harness 维护的工作记忆，也就是多步流程里的状态区。工具会把结果写进去：搜索保存候选文档 id，阅读保存打开过的原文，整理保存短证据笔记。",
    why: "关键点：工作记忆不是模型的输入，也不是模型脑子里的记忆。可以把它想成桌边文件夹；模型这一轮能不能看到，要看下一步有没有把内容复制到递给模型的那页纸上。",
    runHint: "运行后，对比“工作记忆现在保存了”和“这一轮模型实际看到的内容”。前者是仓库里存着什么；后者才是这一步真正发给模型的文字。",
    problem: "如果每一步都从零开始，流程会像失忆一样：它无法把搜索结果、已打开文档或证据笔记留给后面的步骤。",
    fix: "「工作记忆」让后续步骤可以复用前面发现的内容。下一块「上下文构建器」会负责从工作记忆里挑内容，复制到模型这一轮的输入里。",
    tryThis: "点“看运行过程”，先看哪些内容被存进工作记忆，再注意：存进工作记忆 ≠ 模型已经看见。",
  },
  read: {
    thread: "harness 职责：提供原文访问",
    moduleName: "4. 找到后，打开读一读",
    what: "「阅读」工具会打开某个搜索结果，让这个流程看到实际原文。",
    why: "搜索结果只是线索，不是证据。真正能支持答案的是文档里的内容。",
    runHint: "在运行过程里比较“搜索资料”和“阅读资料”。前者负责找候选资料，后者负责打开其中一篇。",
    problem: "找到一篇文档，不等于已经理解它。模型需要检查来源原文。",
    fix: "「阅读」把候选文档变成可用证据。",
    tryThis: "点“看运行过程”，看看它打开了哪一篇资料。",
  },
  context: {
    thread: "harness 职责：控制模型看到什么",
    moduleName: "5. 选择模型能看见什么",
    what: "「上下文构建器」负责生成模型这一轮真正能读到的输入。工作记忆像文件夹；上下文构建器挑出一页纸递给模型；模型只能看这一页。",
    why: "新手最容易混淆这里：工作记忆里有资料，只代表 harness 存着资料；只有被上下文构建器写进 prompt 的文字，才会进入模型视野。",
    runHint: "看高亮的“这一轮模型实际看到的内容”，点开它。这里显示的是那一步真正发给模型的 prompt，而不是工作记忆里的全部内容。",
    problem: "资料存在某处，不等于模型做决定时已经拿在手里。没有上下文构建器，工作记忆就像放在旁边的仓库，模型不会自动进去翻。",
    fix: "「上下文构建器」把问题、候选资料、证据笔记和历史步骤整理成当前这一步的输入。它是工作记忆和模型之间的传送带。",
    tryThis: "点“看运行过程”，再点开高亮那一行，对比：工作记忆里存了什么，和 prompt 里真正交给模型的是什么。",
  },
  curate: {
    thread: "harness 职责：管理信息",
    moduleName: "6. 把重点摘出来",
    what: "「整理」工具会保存有用片段。读完一段较长来源后，它会留下最有帮助的短笔记。",
    why: "真实文档可能很长。流程需要的是重要部分，而不是每一步都携带整篇文档。",
    runHint: "在运行过程里找“整理”步骤。看看它保存了哪条短笔记。",
    problem: "如果每一步都携带所有文档，上下文会变得嘈杂又昂贵。",
    fix: "「整理」把有用来源压缩成模型可以复用的紧凑证据。",
    tryThis: "点“看运行过程”，看看它把哪句话存成了重点。",
  },
  verify: {
    thread: "harness 职责：运行中核对说法",
    moduleName: "7. 逐条核对约束",
    what: "「核对」会在运行过程中用工作记忆检查一个说法。它还不是给整个答案打分。",
    why: "Verify 和 Evaluator 不一样。Verify 是运行中检查一条 claim，比如 21:00 后是否营业、有没有 Wi-Fi、有没有素食点心。Evaluator 是最后给整个 run 打分。",
    runHint: "运行后，在 trace 里找到“核对说法”。它应该检查推荐是否被已有证据支持，但这一步还不应该出现最终分数。",
    problem: "没有核对时，流程可能收集了证据，却直接跳到一个没有被验证过的结论。",
    fix: "「核对」让 harness 在提交最终答案前，先用证据检查一条说法。",
    tryThis: "打开运行过程前，先猜最终回答前应该核对哪一句 claim。",
  },
  evaluator: {
    thread: "harness 职责：衡量结果",
    moduleName: "8. 给整个 run 打分",
    what: "「评估器」是最后的检查员。答案出来后，它用约束清单给整个 run 打分，而不是只看关键词有没有出现。",
    why: "只看到一个答案还不够。清单会把教学目标说清楚：每条约束都应该有证据支持。",
    runHint: "看下面的约束清单：Harvard Yard 附近、10 分钟内、21:00 后营业、Wi-Fi、素食点心。",
    problem: "没有检查时，你只能凭感觉判断答案好不好。",
    fix: "「评估器」把最终答案变成一个可以在运行结束后比较的结果。",
    tryThis: "点“看运行过程”，看看哪些约束通过了，以及证据来自哪里。",
  },
  complete: {
    thread: "所有 harness 职责协同工作",
    moduleName: "9. 完整运行一遍",
    what: "现在这些积木组成了一个完整 harness：模型看到问题、搜索、阅读、记笔记、保留有用片段、提交答案，然后被检查。",
    why: "harness 不神秘。它就是固定模型周围的基础设施，让模型能一步步工作、调用工具，并且过程可观察、可重复、可衡量。",
    runHint: "先看运行过程的动作顺序：搜索、读地图、读营业时间、读设施、保存重点、核对、回答。顺序看懂了，再点“生成代码”看代码版。",
    problem: "一次性聊天回答很难检查，也很难改进。",
    fix: "这就是完整 harness。模型是固定的；你设计的是它周围的一切：任务、记忆、上下文、工具和评估。改任何一块，模型不变，但行为会变。这就是 harness 设计。",
    tryThis: "点“看运行过程”，顺着动作顺序看它怎样一条条核对约束。想看代码长什么样，就再点顶部的“生成代码”。",
  },
  iterate: {
    thread: "harness 设计循环",
    moduleName: "10. 改一处，比一比",
    what: "同一个模型，只改了一处 harness：关掉了「整理」工具。有整理时，模型看到的是紧凑证据；没有整理时，回答会更依赖嘈杂原文，也可能漏约束。",
    why: "这就是 harness 设计循环：改一处、跑一次、比一比。你改进任务效果的方式是改 harness。",
    runHint: "和上一步的分数比一下，再看为什么变了：紧凑证据，还是原始/缺失证据。",
    problem: "不做对比实验，就不知道哪种 harness 设计更好。",
    fix: "在右侧检查器里打开「整理」工具，再跑一次，看清单如何因为模型能看到紧凑的跨文档证据而恢复。",
    tryThis: "点击「整理」积木，在右侧检查器里启用它，然后点运行来对比分数。",
  },
};

function measureHighlight(nodeIds: string[], shouldScroll = false): Rect | null {
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let found = false;
  let firstElement: Element | null = null;

  for (const id of nodeIds) {
    const element = document.querySelector(`.react-flow__node[data-id="${id}"]`);
    if (!element) {
      continue;
    }
    firstElement ??= element;
    const bounds = element.getBoundingClientRect();
    top = Math.min(top, bounds.top);
    left = Math.min(left, bounds.left);
    right = Math.max(right, bounds.right);
    bottom = Math.max(bottom, bounds.bottom);
    found = true;
  }

  if (!found) {
    return null;
  }
  if (shouldScroll) {
    firstElement?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }
  return { top, left, width: right - left, height: bottom - top };
}

function rectForSelector(selector: string, shouldScroll: boolean): Rect | null {
  const element = document.querySelector(selector);
  if (!element) {
    return null;
  }
  if (shouldScroll) {
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }
  const bounds = element.getBoundingClientRect();
  return { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height };
}

function clampPanelPosition(x: number, y: number, element: HTMLElement | null) {
  const margin = 12;
  const width = element?.offsetWidth ?? 380;
  const height = element?.offsetHeight ?? 420;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);

  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  };
}

function placePanelNearRect(rect: Rect | null, element: HTMLElement | null) {
  if (!rect) {
    return clampPanelPosition(DEFAULT_PANEL_POSITION.x, DEFAULT_PANEL_POSITION.y, element);
  }

  const gap = 14;
  const viewportWidth = window.innerWidth;
  const width = element?.offsetWidth ?? 380;
  const height = element?.offsetHeight ?? 260;

  if (rect.width > viewportWidth * 0.55) {
    return clampPanelPosition(rect.left + rect.width - width - gap, rect.top + gap, element);
  }

  const viewportMid = viewportWidth / 2;
  const rightX = rect.left + rect.width + gap;
  const leftX = rect.left - width - gap;
  const x = rect.left > viewportMid ? leftX : rightX;
  const y = rect.top + rect.height / 2 - height / 2;

  return clampPanelPosition(x, y, element);
}

function traceSelectorForStage(stageId: string): string | null {
  const targetByStage: Record<string, { step: number; section?: string }> = {
    baseline: { step: 1, section: "outcome" },
    search: { step: 1, section: "outcome" },
    memory: { step: 1, section: "notebook" },
    read: { step: 2, section: "outcome" },
    context: { step: 1, section: "model-context" },
    curate: { step: 5, section: "notebook" },
    verify: { step: 6, section: "outcome" },
    evaluator: { step: 6, section: "outcome" },
  };
  const target = targetByStage[stageId];
  if (!target) {
    return null;
  }
  const stepSelector = `.trace-card[data-trace-step="${target.step}"]`;
  return target.section ? `${stepSelector} [data-trace-section="${target.section}"]` : stepSelector;
}

export function TutorialPanel({
  stage,
  index,
  total,
  isRunning,
  onBack,
  onNext,
  onExit,
  onRun,
  lang,
}: TutorialPanelProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [position, setPosition] = useState(DEFAULT_PANEL_POSITION);
  const [isDragging, setIsDragging] = useState(false);
  // Phase 0 = explain the new block, phase 1 = look at the auto-run result.
  const [phase, setPhase] = useState(0);
  const [manualPositionKey, setManualPositionKey] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const hasResultPhase = RESULT_PHASE_STAGE_IDS.has(stage.id);
  const phaseCount = hasResultPhase ? 2 : 1;
  const isResultPhase = hasResultPhase && phase === 1;
  const stepKey = `${stage.id}:${phase}`;

  const getTargetRect = (shouldScroll = false) => {
    if (isResultPhase) {
      const traceStepSelector = traceSelectorForStage(stage.id);
      if (!isRunning) {
        if (traceStepSelector) {
          return (
            rectForSelector(traceStepSelector, shouldScroll) ??
            rectForSelector(".run-result-summary", shouldScroll) ??
            rectForSelector(".output", shouldScroll) ??
            measureHighlight(stage.highlightNodeIds, shouldScroll)
          );
        }
        return (
          rectForSelector(".run-result-summary", shouldScroll) ??
          rectForSelector(".run-result-trace", shouldScroll) ??
          rectForSelector(".run-result-final", shouldScroll) ??
          rectForSelector(".output", shouldScroll) ??
          measureHighlight(stage.highlightNodeIds, shouldScroll)
        );
      }
      return (
        rectForSelector(".output", shouldScroll) ??
        measureHighlight(stage.highlightNodeIds, shouldScroll)
      );
    }
    return measureHighlight(stage.highlightNodeIds, shouldScroll);
  };

  useEffect(() => {
    const update = () => {
      setRect(getTargetRect());
    };
    // Re-measure for a short window so the spotlight follows React Flow's
    // fitView animation, then settle into a calm 600ms heartbeat.
    update();
    const timers = [120, 320, 600].map((delay) => window.setTimeout(update, delay));
    const interval = window.setInterval(update, 600);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(interval);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [phase, stage]);

  useEffect(() => {
    setPhase(0);
  }, [stage.id]);

  useEffect(() => {
    setManualPositionKey(null);
  }, [stepKey]);

  useEffect(() => {
    const clamp = () => {
      setPosition((current) => clampPanelPosition(current.x, current.y, cardRef.current));
    };
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  useEffect(() => {
    if (isDragging || manualPositionKey === stepKey) {
      return;
    }
    const targetRect = getTargetRect(true);
    setRect(targetRect);
    setPosition(placePanelNearRect(targetRect, cardRef.current));
    const timer = window.setTimeout(() => {
      const settledRect = getTargetRect();
      setRect(settledRect);
      setPosition(placePanelNearRect(settledRect, cardRef.current));
    }, 320);
    return () => window.clearTimeout(timer);
  }, [isDragging, isRunning, manualPositionKey, phase, stage.id, stepKey]);

  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    event.preventDefault();
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setPosition(
      clampPanelPosition(
        drag.originX + event.clientX - drag.startX,
        drag.originY + event.clientY - drag.startY,
        cardRef.current,
      ),
    );
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    setManualPositionKey(stepKey);
    setIsDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const labels =
    lang === "zh"
      ? {
          exit: "退出",
          focus: "这一步做什么",
          why: "为什么重要",
          tryIt: "试试看",
          result: "运行过程看这里",
          drag: "按住这里可以拖",
          back: "上一步",
          rerun: "重新运行",
          running: "运行中...",
          seeResult: "看运行过程",
          next: "下一步",
          finish: "完成",
        }
      : {
          exit: "Exit",
          focus: "What this does",
          why: "Why it matters",
          tryIt: "Try it",
          result: "Look at the run trace",
          drag: "Drag lesson card",
          back: "Back",
          rerun: "Run again",
          running: "Running...",
          seeResult: "See the trace",
          next: "Next",
          finish: "Finish",
        };

  const visibleStage = lang === "zh" ? (ZH_STAGE_COPY[stage.id] ?? stage) : stage;

  const isFirst = index === 0 && phase === 0;
  const isLast = index === total - 1 && phase === phaseCount - 1;
  const nextLabel = isLast
    ? labels.finish
    : phase === 0 && hasResultPhase
      ? labels.seeResult
      : labels.next;

  const goBack = () => {
    if (phase > 0) {
      setPhase((current) => current - 1);
      return;
    }
    onBack();
  };

  const goNext = () => {
    if (phase < phaseCount - 1) {
      setPhase((current) => current + 1);
      return;
    }
    onNext();
  };

  return (
    <div className="tutorial-root">
      {rect && (
        <div
          className={`tutorial-spotlight ${isResultPhase ? "result" : ""}`}
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
          }}
        />
      )}

      <div
        className={`tutorial-card ${isDragging ? "dragging" : ""}`}
        ref={cardRef}
        style={{ left: position.x, top: position.y }}
      >
        <div
          className="tutorial-head"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title={labels.drag}
        >
          <div className="tour-progress">
            {Array.from({ length: total }).map((_, dotIndex) => (
              <span
                key={dotIndex}
                className={`tour-dot ${dotIndex === index ? "active" : ""} ${
                  dotIndex < index ? "done" : ""
                }`}
              />
            ))}
            <span className="tour-step-count">
              {index + 1} / {total}
            </span>
          </div>
          <span className="tutorial-drag-hint">{labels.drag}</span>
          <button
            className="tutorial-exit"
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onExit}
            aria-label={labels.exit}
          >
            {labels.exit}
          </button>
        </div>

        {(visibleStage as { thread?: string }).thread && (
          <span className="tutorial-thread">{(visibleStage as { thread?: string }).thread}</span>
        )}
        <h3>{visibleStage.moduleName}</h3>

        {isResultPhase ? (
          <div className="tutorial-hint">
            <span>{labels.result}</span>
            <p>{isRunning ? labels.running : visibleStage.runHint}</p>
          </div>
        ) : (
          <>
            <div className="tutorial-focus">
              <span>{labels.focus}</span>
              <p>{visibleStage.what}</p>
            </div>
            <p className="tutorial-note">
              <strong>{labels.why}</strong>
              {visibleStage.why}
            </p>
            <p className="tutorial-note muted">
              <strong>{labels.tryIt}</strong>
              {visibleStage.tryThis}
            </p>
          </>
        )}

        <div className="tutorial-footer">
          <button className="tour-back" type="button" onClick={goBack} disabled={isFirst}>
            {labels.back}
          </button>
          {isResultPhase ? (
            <button className="secondary-button" type="button" onClick={onRun} disabled={isRunning}>
              {isRunning ? labels.running : labels.rerun}
            </button>
          ) : null}
          <span className="tour-spacer" />
          <button type="button" onClick={goNext}>
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
