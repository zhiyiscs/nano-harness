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
  "search",
  "memory",
  "read",
  "context",
  "curate",
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
    what: "harness 是包裹在固定模型外面的那层代码。它决定模型看到什么（上下文）、记住什么（记忆）、能做什么（工具）、以及用什么标准检查结果（评估）。这节课会从零搭一个。",
    why: "模型本身不变，变的是 harness。小小的 harness 改动，可能决定模型能不能完成一个具体任务。",
    runHint: "这一屏先不用看积木。先记住：模型是固定的，你要设计的是包围它的一切。",
    problem: "如果只让固定模型直接回答，它只能凭印象猜。它需要基础设施——也就是 harness——来搜索、阅读、记笔记和检查结果。",
    fix: "下一步我们会用一个具体的搜索任务来说明：为什么这层基础设施很重要。",
    tryThis: "这节课会用“赋予 LLM 搜索功能”做例子：先看为什么普通 LLM 需要 harness，再理解什么是 harness，最后一步步搭出一个 harness。",
  },
  case_intro: {
    thread: "为什么 LLM 需要 search 功能",
    moduleName: "这次任务：带着证据找学习咖啡店",
    what: "想象你直接问模型：我周六晚上在哈佛大学附近学习，Harvard Yard 周围哪家咖啡店步行 10 分钟内、晚上 9 点后还开门、同时有 Wi-Fi 和素食点心？如果模型直接回答，它很可能是在凭印象猜。",
    why: "harness 是给 LLM 增加能力的基础设施。这里的 harness 会赋予固定模型搜索功能：让它能查资料、读资料、留下证据，并逐条检查约束。",
    runHint: "这一屏还是先不用看积木。先记住任务：直接回答不可靠，所以我们要搭一个会找证据的小型 harness。",
    problem: "一次性回答听起来可能很自信，但它可能漏掉某个条件、用了过期营业时间，甚至编出一家店。",
    fix: "接下来我们会一块一块搭出这个 harness：任务、下一步指挥、搜索、记忆、阅读、上下文、证据笔记、核对和评估。",
    tryThis: "先记住哈佛附近学习咖啡店这个问题。下一步会把第一块「任务」积木放到画布上。",
  },
  intro: {
    thread: "harness 职责：定义目标",
    moduleName: "先确定今天要解决的问题",
    what: "这块「任务」积木写的是今天要回答的问题：怎样根据资料给出有依据的答案？先把题目摆在桌面上，后面每一步都围着它展开。",
    why: "问题越清楚，后面该查什么、该记什么、最后怎么判断答得好不好，才不会跑偏。",
    runHint: "右侧会看到“问题”字段，意思是“这次下游任务要回答的问题”。先确认问题是什么，再继续往下搭。",
    problem: "现在还只是一个题目。它还不会自己查资料，也不会留下笔记，更没人检查答案。",
    fix: "接下来我们会一点点补上这些能力，让回答不只是凭感觉猜。",
    tryThis: "画布上蓝框里的「任务」积木，就是这次要回答的问题。先看清楚它，再往下搭。",
  },
  policy: {
    thread: "harness 职责：承载固定模型",
    moduleName: "1. 模型住在这里",
    what: "「策略」积木是模型住的地方。在真实的 harness 里，这里放的是一个固定的语言模型——你改不了它的权重。你能改的是它周围的一切：它看到什么、能调用什么工具、以及它说完话之后发生什么。这里用了一个教学用的脚本替身，让我们专注于 harness 设计。",
    why: "这是 harness 的核心洞察：你不重新训练模型，而是重新设计基础设施——也就是 harness——同一个模型就会表现不同。",
    runHint: "这一步先不用运行。只需记住：模型固定在这一块里，其他一切都是你设计的 harness。",
    problem: "问题只说明目标，但还没有任何东西负责推进这个目标。",
    fix: "「策略」积木给 harness 一个决策循环：看当前情况、选下一步、再继续。模型做决定，harness 控制它看到什么和能做什么。",
    tryThis: "高亮的这块「策略」，就是模型住的地方。画布上其他所有东西，都是你设计的 harness 基础设施。",
  },
  search: {
    thread: "harness 职责：给模型工具",
    moduleName: "2. 让它会搜索资料",
    what: "「搜索」是一个工具。它不是另一个模型，而是 harness 提供给模型的一个工具，用来先找可能有用的文档。",
    why: "如果只靠模型脑子里的印象，它可能说得很像真的，但其实没根据。搜索是找证据的第一步。",
    runHint: "先看运行过程，不要看最终回答。这里重点是第一步出现“搜索资料”，表示它已经会去资料库里找相关内容了。",
    problem: "没有搜索时，模型很容易直接猜答案。",
    fix: "「搜索」让 harness 能带着模型去找外部证据，而不是凭印象回答。",
    tryThis: "点下方的“看运行过程”，看看它第一步怎么去找资料。",
  },
  memory: {
    thread: "harness 职责：步骤间持久化",
    moduleName: "3. 给它一个临时笔记本",
    what: "「记忆」积木的作用是“记住刚才发生了什么”。它会暂时保存搜索结果和中间发现。",
    why: "harness 通常是一小步一小步运行的。没有笔记本，下一步就可能忘了上一步搜到了什么。",
    runHint: "现在再看运行过程：搜索结果会留在“临时笔记本”里，后面的阅读工具才能接着打开资料。",
    problem: "如果每一步都从零开始，流程会像失忆一样。",
    fix: "「记忆」让每一步的发现可以被后面的步骤继续使用。",
    tryThis: "点“看运行过程”，看看这次搜到的资料有没有被留下来。",
  },
  read: {
    thread: "harness 职责：提供原文访问",
    moduleName: "4. 找到后，打开读一读",
    what: "「阅读」工具的作用是打开资料。「搜索」只告诉它哪篇可能有用，「阅读」才会把具体内容打开给它看。",
    why: "搜索结果只是线索，不是证据。真正能支持答案的是文档里的内容。",
    runHint: "在运行过程里比较“搜索资料”和“阅读资料”。前者负责找候选资料，后者负责打开其中一篇。",
    problem: "只知道“有一篇资料可能相关”，还不能说明这篇资料到底支持什么。",
    fix: "「阅读」把候选资料变成模型当前可以看到的具体文字。",
    tryThis: "点“看运行过程”，看看它打开了哪一篇资料。",
  },
  context: {
    thread: "harness 职责：控制模型看到什么",
    moduleName: "5. 把该看的内容递给模型",
    what: "「上下文构建器」的作用是“整理给模型看的材料”。它从问题和笔记里挑出当前最需要的内容，拼成一小段提示。",
    why: "模型每一步只能看到当前输入，不会自动读取旁边的笔记本。必须把重要内容放进它当前能读到的文字里。",
    runHint: "看绿色框住的“这一轮模型实际看到的内容”，点开它。这里就是那一步模型真正拿到的输入。",
    problem: "资料存在某处，不等于模型做决定时已经拿在手里。",
    fix: "「上下文构建器」会把问题、笔记和证据整理成当前这一步的输入。",
    tryThis: "点“看运行过程”，再点开绿色框住的那一行，对比一下：资料在笔记本里，和模型真正拿到输入，是两件事。",
  },
  curate: {
    thread: "harness 职责：管理信息",
    moduleName: "6. 把重点摘出来",
    what: "「整理」工具的作用是“摘重点”。读到一大段资料后，它会把最有用的一小句保存成短笔记。",
    why: "真实资料会很长，不能每一步都把整篇文章塞给模型。保留重点，后面才更清楚。",
    runHint: "在运行过程里找“整理”步骤。看看它保存了哪条短笔记。",
    problem: "资料越堆越多，模型反而可能抓不住重点。",
    fix: "「整理」把长资料压缩成可复用的小证据。",
    tryThis: "点“看运行过程”，看看它把哪句话存成了重点。",
  },
  evaluator: {
    thread: "harness 职责：衡量结果",
    moduleName: "7. 最后检查答案",
    what: "「评估器」是“检查员”。答案出来后，它会用一个简单标准判断：这次回答大概过不过关。",
    why: "只看答案很难知道流程有没有变好。加了检查，才方便比较不同搭法的效果。",
    runHint: "看下面的分数和“成功 / 需要改进”。先不用追求完美，重点是看懂它怎么反馈。",
    problem: "没有检查时，你只能凭感觉判断答案好不好。",
    fix: "「评估器」把最终回答变成一个可以比较的结果。",
    tryThis: "点“看运行过程”，看看这次答案拿了多少分。",
  },
  complete: {
    thread: "所有 harness 职责协同工作",
    moduleName: "8. 完整运行一遍",
    what: "现在这些积木合在一起，就是一个完整的 harness：模型会看问题、查资料、读资料、记笔记、整理重点、交答案、再检查。这里的 「提交」只是最后的“提交答案”出口。",
    why: "harness 不神秘，就是围绕固定模型的基础设施——让它能一步步工作、调用工具——可观察、可重复、可衡量。",
    runHint: "先看运行过程的动作顺序：搜索、读地图、读营业时间、读设施、保存重点、核对、回答。顺序看懂了，再点“生成代码”看代码版。",
    problem: "一次性聊天回答很难知道它查了什么、漏了什么，也不方便改进。",
    fix: "这就是一个完整的 harness。模型是固定的，你设计的是它周围的一切：任务、记忆、上下文、工具、评估。改任何一块——模型不变，但行为不同。这就是 harness 设计。",
    tryThis: "点“看运行过程”，顺着动作顺序看它怎样一条条核对约束。想看代码长什么样，就再点顶部的“生成代码”。",
  },
  iterate: {
    thread: "harness 设计循环",
    moduleName: "9. 改一处，比一比",
    what: "同一个模型，只改了一处 harness：关掉了「整理」工具。看看分数怎么变。模型没变笨——是 harness 给它的材料变差了。",
    why: "这就是 harness 设计循环：改一处、跑一次、比一比。你改进任务效果的方式不是换模型，而是改 harness。",
    runHint: "和上一步的分数比一下。模型没变，只是 harness 变了。",
    problem: "不做对比实验，就不知道哪种 harness 设计更好。",
    fix: "在右侧检查器里打开「整理」工具，再跑一次，看分数回升。这就是 harness 设计的实际操作。",
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
    search: { step: 1, section: "outcome" },
    memory: { step: 1, section: "notebook" },
    read: { step: 2, section: "outcome" },
    context: { step: 1, section: "model-context" },
    curate: { step: 5, section: "notebook" },
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
