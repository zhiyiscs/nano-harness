import type { TraceStep, RunResponse } from "../types";

type Lang = "zh" | "en";

interface OutputPanelProps {
  runResult?: RunResponse;
  generatedCode: string;
  isRunning: boolean;
  error?: string;
  lang: Lang;
}

const ACTION_LABELS: Record<string, string> = {
  search_corpus: "Search",
  read_doc: "Read",
  curate: "Save note",
  verify: "Verify",
  finish: "Answer",
};

const ACTION_LABELS_ZH: Record<string, string> = {
  search_corpus: "搜索资料",
  read_doc: "阅读资料",
  curate: "保存重点",
  verify: "核对说法",
  finish: "提交答案",
};

function actionLabel(name: string, lang: Lang): string {
  return (lang === "zh" ? ACTION_LABELS_ZH : ACTION_LABELS)[name] ?? name;
}

function actionToneClass(name: string): string {
  return `action-${name}`;
}

const DOC_LABELS: Record<Lang, Record<string, string>> = {
  zh: {
    doc_map: "哈佛周边距离资料",
    doc_hours: "营业时间资料",
    doc_amenities: "设施资料",
    doc_reviews: "顾客评论资料",
    doc_old_blog: "过期博客资料",
  },
  en: {
    doc_map: "Harvard area distance notes",
    doc_hours: "Opening hours",
    doc_amenities: "Amenities guide",
    doc_reviews: "Customer reviews",
    doc_old_blog: "Outdated blog post",
  },
};

const DOC_PREVIEWS: Record<Lang, Record<string, string>> = {
  zh: {
    doc_map: "列出几家咖啡店到 Harvard Yard 的步行距离。",
    doc_hours: "列出几家咖啡店周六晚上的关门时间。",
    doc_amenities: "列出 Wi-Fi、安静座位和素食点心等条件。",
    doc_reviews: "补充周六晚上的噪音、座位和适合办公程度。",
    doc_old_blog: "包含旧营业时间，适合用来说明为什么要核对资料。",
  },
  en: {
    doc_map: "Lists walking distances from several cafes to Harvard Yard.",
    doc_hours: "Lists Saturday closing times for the candidate cafes.",
    doc_amenities: "Lists Wi-Fi, quiet seating, and vegetarian snacks.",
    doc_reviews: "Adds notes about noise, seating, and laptop suitability.",
    doc_old_blog: "Contains old hours and shows why verification can matter.",
  },
};

function docLabel(docId: string, lang: Lang): string {
  return DOC_LABELS[lang][docId] ?? docId;
}

function docPreview(docId: string, lang: Lang): string | undefined {
  return DOC_PREVIEWS[lang][docId];
}

function formatDocList(docIds: string[], lang: Lang): string {
  if (docIds.length === 0) {
    return lang === "zh" ? "【空】" : "[None]";
  }
  return docIds.map((docId) => docLabel(docId, lang)).join(lang === "zh" ? "、" : ", ");
}

function formatDocPreviewList(docIds: string[], lang: Lang): string {
  const items = docIds
    .map((docId) => {
      const preview = docPreview(docId, lang);
      if (lang === "zh") {
        return preview ? `• ${docLabel(docId, lang)}：${preview}` : `• ${docLabel(docId, lang)}`;
      }
      return preview ? `• ${docLabel(docId, lang)}: ${preview}` : `• ${docLabel(docId, lang)}`;
    })
    .join("\n");
  return items || (lang === "zh" ? "【空】" : "[None]");
}

function formatInlineOrBullets(label: string, value: string, lang: Lang): string {
  const emptyValues = new Set(["【空】", "[None]"]);
  if (emptyValues.has(value)) {
    return `${label}${lang === "zh" ? "：" : ": "}${value}`;
  }
  const separator = lang === "zh" ? "、" : ", ";
  const items = value.split(separator).filter(Boolean);
  if (items.length <= 1) {
    return `${label}${lang === "zh" ? "：" : ": "}${value}`;
  }
  return `${label}${lang === "zh" ? "：" : ":"}\n${items.map((item) => `  • ${item}`).join("\n")}`;
}

function describeExplanation(explanation: string, lang: Lang): string {
  if (lang !== "zh") {
    return explanation;
  }
  const translations: Record<string, string> = {
    "Search for candidate evidence.": "先找可能有用的资料。",
    "Read the top candidate document.": "打开最可能有用的一篇资料。",
    "Keep a compact note so it stays visible in the context.": "把重点保存成短笔记，后面更容易继续使用。",
    "Enough evidence gathered; answer from what we read.": "已经读到一些证据，可以根据资料回答。",
    "No tools or memory to gather evidence, so just guess.": "现在还缺少查资料或记住资料的能力，所以只能猜。",
    "Read the next source needed to check the constraints.": "打开下一篇资料，用来检查题目里的约束。",
    "Keep the cross-document evidence as a compact note.": "把跨文档证据保存成一条紧凑笔记。",
    "Check the recommendation against the gathered evidence.": "用已经收集到的证据核对推荐是否成立。",
    "Enough evidence gathered; answer from the curated note.": "证据已经足够；根据整理过的短笔记回答。",
    "Some evidence was read, but the harness has not curated it yet.": "已经读到一些证据，但 harness 还没有把它整理成短笔记。",
  };
  return translations[explanation] ?? explanation;
}

function describeObservation(step: TraceStep, lang: Lang): string {
  if (lang !== "zh") {
    return step.observation;
  }
  const { name } = step.action;
  if (name === "search_corpus") {
    const docIds = formatDocList(step.memory.pool, lang);
    return `找到并写入工作记忆的候选资料：${docIds}`;
  }
  if (name === "read_doc") {
    return step.observation.replace(/^# (.+)\n/, (_, docId: string) => `打开的资料 ${docLabel(docId, lang)}：\n`);
  }
  if (name === "curate") {
    return step.observation.replace(
      /^Curated (.+?): /,
      (_, docId: string) => `保存的重点（来自 ${docLabel(docId, lang)}）：`,
    );
  }
  if (name === "verify") {
    return step.observation.replace("Verification result", "核对结果");
  }
  return step.observation;
}

function describeStepIntent(step: TraceStep, lang: Lang): string {
  const { name, args } = step.action;
  const value = (key: string) => String(args[key] ?? "").trim();
  if (lang === "zh") {
    switch (name) {
      case "search_corpus":
        return `先去资料库里找可能支持这个问题的证据：“${value("query")}”。`;
      case "read_doc":
        return `打开最可能有用的一篇资料：${docLabel(value("doc_id"), lang)}。`;
      case "curate":
        return `把 ${docLabel(value("doc_id"), lang)} 里的关键信息保存成短笔记。`;
      case "verify":
        return `检查这个说法有没有被工作记忆里的资料支持：“${value("claim")}”。`;
      case "finish":
        return "根据当前能看到的资料提交最终回答。";
      default:
        return describeExplanation(step.explanation, lang);
    }
  }
  switch (name) {
    case "search_corpus":
      return `Search the document collection for evidence about “${value("query")}”.`;
    case "read_doc":
      return `Open the most useful candidate: ${docLabel(value("doc_id"), lang)}.`;
    case "curate":
      return `Save the key information from ${docLabel(value("doc_id"), lang)} as a short note.`;
    case "verify":
      return `Check whether the claim is supported: “${value("claim")}”.`;
    case "finish":
      return "Submit an answer using the material currently available.";
    default:
      return describeExplanation(step.explanation, lang);
  }
}

function describeModelInputSummary(context: string, lang: Lang): string {
  if (!context) {
    return lang === "zh" ? "这一轮还没有递给模型的内容。" : "Nothing was sent to the model this step.";
  }
  if (context.startsWith("(no context builder")) {
    return lang === "zh"
      ? "还没有上下文构建器；模型没有拿到由工作记忆整理出的 prompt。"
      : "No Context Builder yet; the model did not receive a prompt assembled from memory.";
  }
  const sections: string[] = [];
  if (context.includes("Task:")) sections.push(lang === "zh" ? "任务问题" : "task");
  if (context.includes("Candidate pool:")) sections.push(lang === "zh" ? "候选资料" : "candidate pool");
  if (context.includes("Curated evidence:")) sections.push(lang === "zh" ? "整理后的证据" : "curated evidence");
  if (context.includes("History:")) sections.push(lang === "zh" ? "历史步骤" : "recent history");
  if (sections.length === 0) {
    return lang === "zh" ? "上下文构建器递给模型一段 prompt。" : "The Context Builder sent a prompt to the model.";
  }
  return lang === "zh"
    ? `这一轮递给模型的那页纸包含：${sections.join("、")}。`
    : `The page sent to the model included: ${sections.join(", ")}.`;
}

function describeStepOutcome(step: TraceStep, lang: Lang): string {
  const { name, args } = step.action;
  const value = (key: string) => String(args[key] ?? "").trim();
  if (name === "search_corpus") {
    const count = step.memory.pool.length;
    if (lang === "zh") {
      return `找到了 ${count} 篇候选资料：\n${formatDocPreviewList(step.memory.pool, lang)}`;
    }
    return `Found ${count} candidate documents:\n${formatDocPreviewList(step.memory.pool, lang)}`;
  }
  if (name === "read_doc") {
    const docId = value("doc_id");
    const preview = docPreview(docId, lang);
    if (lang === "zh") {
      return `${docLabel(docId, lang)}已经打开。${preview ? `这篇资料的重点：${preview}` : describeObservation(step, lang)}`;
    }
    return `${docLabel(docId, lang)} was opened. ${preview ? `Main idea: ${preview}` : describeObservation(step, lang)}`;
  }
  if (name === "curate") {
    const docId = value("doc_id");
    const note = String(args.note ?? "").trim();
    if (lang === "zh") {
      return `已从 ${docLabel(docId, lang)} 保存一条短笔记：${note || "关键证据短笔记"}。`;
    }
    return `Saved a short note from ${docLabel(docId, lang)}: ${note || "Key evidence"}.`;
  }
  if (name === "verify") {
    return describeObservation(step, lang);
  }
  if (name === "finish") {
    if (lang === "zh") {
      return `已经提交回答：${describeFinalAnswer(step.observation, lang)}`;
    }
    return `Submitted answer: ${describeFinalAnswer(step.observation, lang)}`;
  }
  return describeObservation(step, lang);
}

function describeModelChoice(step: TraceStep, lang: Lang): string {
  const intent = describeStepIntent(step, lang);
  const outcome = describeStepOutcome(step, lang);
  if (lang === "zh") {
    return `${intent}\n结果：${outcome}`;
  }
  return `${intent}\nResult: ${outcome}`;
}

function describeNotebookState(step: TraceStep, lang: Lang): string {
  const candidates = formatDocList(step.memory.pool, lang);
  const storedDocs = step.memory.doc_store_ids.map((docId) => docLabel(docId, lang)).join(lang === "zh" ? "、" : ", ");
  const notes = Object.entries(step.memory.curated);
  if (lang === "zh") {
    const sections = [formatInlineOrBullets("候选资料", candidates, lang)];
    if (storedDocs) {
      sections.push(formatInlineOrBullets("已读全文", storedDocs, lang));
    }
    if (notes.length > 0) {
      const curated = notes.map(([docId]) => docLabel(docId, lang)).join("、");
      sections.push(formatInlineOrBullets("保存的重点", curated, lang));
    }
    if (!storedDocs) {
      sections.push("下一步：用“阅读”工具打开这些候选资料。");
    } else if (notes.length === 0) {
      sections.push("下一步：用“整理”工具把多份资料压成短笔记。");
    }
    return sections.join("\n");
  }
  const sections = [formatInlineOrBullets("Candidates", candidates, lang)];
  if (storedDocs) {
    sections.push(formatInlineOrBullets("Full docs read", storedDocs, lang));
  }
  if (notes.length > 0) {
    const curated = notes.map(([docId]) => docLabel(docId, lang)).join(", ");
    sections.push(formatInlineOrBullets("Curated notes", curated, lang));
  }
  if (!storedDocs) {
    sections.push("Next: use the Read tool to open these candidates.");
  } else if (notes.length === 0) {
    sections.push("Next: use Curate to compress the sources into a short note.");
  }
  return sections.join("\n");
}

function describeStageLimitation(step: TraceStep, lang: Lang): string | undefined {
  const hasCuratedNotes = Object.keys(step.memory.curated).length > 0;
  if (lang === "zh") {
    switch (step.action.name) {
      case "search_corpus":
        return "资料已经找到，但如果还没有“阅读”工具，模型还不能真正打开资料看内容。";
      case "read_doc":
        return step.step < 4
          ? "这只是其中一份资料。这个问题有多个条件，还需要继续阅读营业时间和设施资料。"
          : "关键资料已经读完。下一块常见能力是“整理”：把多份资料压缩成后面能反复使用的短笔记。";
      case "curate":
        return "重点已经保存，后面的回答就不必每次重新读整篇资料。";
      case "finish":
        return hasCuratedNotes
          ? "这次回答已经带着整理过的重点。现在可以看评估结果，比较这个 harness 是否有效。"
          : "这次回答没有经过“整理”步骤；这正好可以用来比较不同 harness 设计的效果。";
      default:
        return undefined;
    }
  }
  switch (step.action.name) {
    case "search_corpus":
      return "Candidates are found, but without a Read tool the model cannot inspect the full source text yet.";
    case "read_doc":
      return step.step < 4
        ? "This is only one source. The question has multiple constraints, so the harness still needs more sources."
        : "The key sources are open. The next useful capability is Curate: compress multiple sources into a reusable note.";
    case "curate":
      return "The useful bit is saved, so later steps do not need to carry the whole document again.";
    case "finish":
      return hasCuratedNotes
        ? "This answer used curated evidence. Check the evaluator to compare whether this harness worked."
        : "This answer skipped curation, which is useful for comparing harness designs.";
    default:
      return undefined;
  }
}

function describeRunNote(note: string, lang: Lang): string {
  if (lang !== "zh") {
    return note;
  }
  if (note.startsWith("No Working Memory block")) {
    return "还没有工作记忆：搜索到的资料不会稳定留到下一步。";
  }
  if (note.startsWith("No Context Builder block")) {
    return "还没有上下文构建器：模型每一步实际看到的材料还不完整。";
  }
  if (note.startsWith("No Evaluator block")) {
    return "还没有检查员：答案会生成，但暂时不会被打分。";
  }
  if (note.startsWith("No search_corpus tool")) {
    return "还没有搜索资料工具。";
  }
  if (note.startsWith("No read_doc tool")) {
    return "还没有阅读资料工具。";
  }
  if (note.startsWith("No curate tool")) {
    return "还没有保存重点工具。";
  }
  if (note.startsWith("No finish tool")) {
    return "还没有提交答案工具。";
  }
  return note;
}

function describeFinalAnswer(answer: string, lang: Lang): string {
  if (lang === "zh" && answer === "I am not sure yet - I have nothing to look at.") {
    return "暂时还没有足够资料回答。";
  }
  if (
    lang === "zh" &&
    answer ===
      "Crimson Brew Cafe might be the answer, but I have no sources yet to prove the distance, hours, Wi-Fi, or vegetarian snacks."
  ) {
    return "Crimson Brew Cafe 可能是答案，但现在还没有来源能证明距离、营业时间、Wi-Fi 或素食点心。";
  }
  return answer;
}

function constraintLabel(label: string, lang: Lang): string {
  if (lang !== "zh") {
    return label;
  }
  const labels: Record<string, string> = {
    "near Harvard Yard": "Harvard Yard 附近",
    "within 10 minute walk": "步行 10 分钟内",
    "open after 21:00 on Saturday": "周六 21:00 后营业",
    "has Wi-Fi": "有 Wi-Fi",
    "has vegetarian snacks": "有素食点心",
  };
  return labels[label] ?? label;
}

function constraintSource(source: string | undefined, lang: Lang): string {
  if (!source) {
    return lang === "zh" ? "缺少证据" : "missing evidence";
  }
  return docLabel(source, lang);
}

function formatMemory(step: TraceStep, lang: Lang): string {
  if (lang !== "zh") {
    return JSON.stringify({ args: step.action.args, memory: step.memory }, null, 2);
  }
  const pool = step.memory.pool.length ? step.memory.pool.map((docId) => docLabel(docId, lang)).join("、") : "【空】";
  const storedDocs = step.memory.doc_store_ids.length
    ? step.memory.doc_store_ids.map((docId) => docLabel(docId, lang)).join("、")
    : "【空】";
  const notes = Object.entries(step.memory.curated);
  const curated = notes.length
    ? notes.map(([docId, note]) => `${docLabel(docId, lang)}: ${note}`).join("\n")
    : "【空】";
  return [
    "说明：这里是 harness 暂存的 Working Memory，也就是工作记忆。它是步骤之间保存状态的地方，不等于模型输入；模型这一轮只看到“这一轮模型实际看到的内容”里列出的 prompt。",
    `工作记忆里的候选资料：${pool}`,
    `工作记忆里已有全文的资料：${storedDocs}`,
    `保存的重点：\n${curated}`,
  ].join("\n\n");
}

function formatContext(context: string, lang: Lang): string {
  if (lang !== "zh") {
    return context || "(nothing)";
  }
  if (!context) {
    return "这一轮还没有递给模型的内容。";
  }
  if (context.startsWith("(no context builder")) {
    return "还没有上下文构建器：这一轮模型实际拿到的材料还不完整。";
  }
  return context
    .replace(/^Task:/gm, "问题：")
    .replace(/^Metric:/gm, "检查标准：")
    .replace(/^Candidate pool:/gm, "从工作记忆放入 prompt 的候选资料：")
    .replace(/^Curated evidence:/gm, "保存的重点：")
    .replace(/^History:/gm, "前面几步做过的事：")
    .replace(/\(empty\)/g, "【空】");
}

function isExpectedBuildUpIssue(message: string): boolean {
  return /^Missing required .+ block\.$/.test(message) || /^Missing enabled tool block: .+\.$/.test(message);
}

export function OutputPanel({ runResult, generatedCode, isRunning, error, lang }: OutputPanelProps) {
  const visibleIssues = runResult?.issues.filter((issue) => !isExpectedBuildUpIssue(issue.message)) ?? [];
  const labels =
    lang === "zh"
      ? {
          trace: "运行过程",
          running: "正在运行这个 harness...",
          success: "成功",
          needsWork: "需要改进",
          notScored: "未评分",
          score: "分数",
          steps: "步",
          summaryPrefix: "这个工作流运行了",
          turns: "轮，保留了",
          notes: "条重点笔记。递给模型的文字长度：",
          chars: "字符。",
          checklist: "约束清单",
          pass: "通过",
          fail: "未通过",
          evidence: "证据",
          source: "来源",
          finalAnswer: "最终回答",
          modelSaw: "这一轮真正发给模型的 prompt",
          raw: "查看工作记忆（不等于模型输入）",
          empty: "点击运行当前图。",
          code: "生成的 Python",
          codeEmpty: "点击“生成代码”查看这个积木设计对应的小型 Python harness。",
          step: "第",
          stepSuffix: " 步",
          modelChose: "模型因此选择了什么",
          sentToModel: "模型实际看见什么",
          stored: "系统存了什么",
          limitation: "现在的限制",
          errorLabel: "错误",
          warningLabel: "提示",
        }
      : {
          trace: "Run Trace",
          running: "Running the harness...",
          success: "Success",
          needsWork: "Needs work",
          notScored: "Not scored",
          score: "Score",
          steps: "steps",
          summaryPrefix: "The harness took",
          turns: "turns and kept",
          notes: "notes. Context size:",
          chars: "characters.",
          checklist: "Constraint checklist",
          pass: "Pass",
          fail: "Fail",
          evidence: "Evidence",
          source: "Source",
          finalAnswer: "Final answer",
          modelSaw: "What the model saw this step",
          raw: "Show Working Memory",
          empty: "Click Run to execute the current graph.",
          code: "Generated Python",
          codeEmpty: "Click Generate Code to preview a small Python harness.",
          step: "Step",
          stepSuffix: "",
          modelChose: "Model chose",
          sentToModel: "Sent to model",
          stored: "Stored in memory",
          limitation: "Current limitation",
          errorLabel: "error",
          warningLabel: "warning",
        };
  return (
    <section className="output">
      <div className="output-column">
        <h2>{labels.trace}</h2>
        {isRunning && <p className="muted">{labels.running}</p>}
        {error && <p className="error">{error}</p>}
        {runResult ? (
          <>
            <div className="metrics run-result-summary">
              {runResult.metrics.scored ? (
                <>
                  <span className={`metric-result ${runResult.metrics.success ? "ok" : "warn"}`}>
                    {runResult.metrics.success ? labels.success : labels.needsWork}
                  </span>
                  <span>{labels.score} {runResult.metrics.score.toFixed(2)} / 1.00</span>
                </>
              ) : (
                <span className="metric-result neutral">{labels.notScored}</span>
              )}
              <span>{runResult.metrics.steps} {labels.steps}</span>
            </div>
            <p className="metrics-note">
              {labels.summaryPrefix} {runResult.metrics.steps} {labels.turns}{" "}
              {runResult.metrics.curated_docs} {labels.notes}{" "}
              {runResult.metrics.context_chars.toLocaleString()} {labels.chars}
            </p>

            {runResult.metrics.constraints && runResult.metrics.constraints.length > 0 && (
              <div className="run-notes" data-trace-section="checklist">
                <p className="run-note">
                  <strong>{labels.checklist}</strong>
                </p>
                {runResult.metrics.constraints.map((constraint) => (
                  <p className="run-note" key={constraint.id}>
                    <strong>{constraint.passed ? labels.pass : labels.fail}</strong>{" "}
                    {constraintLabel(constraint.label, lang)}
                    <br />
                    {labels.source}: {constraintSource(constraint.source, lang)}
                    {constraint.evidence ? (
                      <>
                        <br />
                        {labels.evidence}: {constraint.evidence}
                      </>
                    ) : null}
                  </p>
                ))}
              </div>
            )}

            {runResult.notes.length > 0 && (
              <div className="run-notes">
                {runResult.notes.map((note, index) => (
                  <p key={`${note}-${index}`} className="run-note">
                    {describeRunNote(note, lang)}
                  </p>
                ))}
              </div>
            )}

            {visibleIssues.length > 0 && (
              <div className="issues">
                {visibleIssues.map((issue, index) => (
                  <p key={`${issue.message}-${index}`} className={issue.level}>
                    {(issue.level === "error" ? labels.errorLabel : labels.warningLabel)}: {issue.message}
                  </p>
                ))}
              </div>
            )}

            <div className="trace-list run-result-trace">
              {runResult.trace.map((step) => (
                <article className="trace-card" data-trace-step={step.step} key={step.step}>
                  <header>
                    <strong>
                      {labels.step} {step.step}{lang === "zh" ? labels.stepSuffix : ""}
                    </strong>
                    <span className={`action-badge ${actionToneClass(step.action.name)}`}>
                      {actionLabel(step.action.name, lang)}
                    </span>
                  </header>
                  <div className="trace-teaching-grid">
                    <div className="trace-teaching-item" data-trace-section="notebook">
                      <span className="trace-teaching-label">{labels.stored}</span>
                      <p>{describeNotebookState(step, lang)}</p>
                    </div>
                    <div className="trace-teaching-item" data-trace-section="model-context-summary">
                      <span className="trace-teaching-label">{labels.sentToModel}</span>
                      <p>{describeModelInputSummary(step.context, lang)}</p>
                    </div>
                    <div className="trace-teaching-item" data-trace-section="outcome">
                      <span className="trace-teaching-label">{labels.modelChose}</span>
                      <p>{describeModelChoice(step, lang)}</p>
                    </div>
                    {describeStageLimitation(step, lang) ? (
                      <div className="trace-teaching-item trace-limitation" data-trace-section="limitation">
                        <span className="trace-teaching-label">{labels.limitation}</span>
                        <p>{describeStageLimitation(step, lang)}</p>
                      </div>
                    ) : null}
                  </div>
                  <details className="trace-context" data-trace-section="model-context">
                    <summary>{labels.modelSaw}</summary>
                    <pre>{formatContext(step.context, lang)}</pre>
                  </details>
                  <details className="trace-details">
                    <summary>{labels.raw}</summary>
                    <pre>{formatMemory(step, lang)}</pre>
                  </details>
                </article>
              ))}
            </div>

            {runResult.final_answer && (
              <div className="final-answer run-result-final">
                <span className="final-answer-label">{labels.finalAnswer}</span>
                <p>{describeFinalAnswer(runResult.final_answer, lang)}</p>
              </div>
            )}
          </>
        ) : (
          !isRunning && <p className="muted">{labels.empty}</p>
        )}
      </div>
      <div className="output-column">
        <h2>{labels.code}</h2>
        {generatedCode ? (
          <pre className="code-preview">{generatedCode}</pre>
        ) : (
          <p className="muted">{labels.codeEmpty}</p>
        )}
      </div>
    </section>
  );
}
