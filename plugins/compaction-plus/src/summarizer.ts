/**
 * 9-segment structured summarizer — Claude Code style.
 * Produces a structured summary with distinct sections for maximum context preservation.
 */

/** The canonical 9 segments */
const SEGMENTS = [
  "目标与意图",
  "关键概念",
  "文件与代码",
  "错误与修复",
  "问题解决",
  "所有用户消息",
  "待办任务",
  "当前工作",
  "下一步",
] as const;

export interface SummarySegment {
  title: (typeof SEGMENTS)[number];
  content: string;
}

/**
 * Build a structured summary prompt from raw messages.
 * Extracts key information and organizes into 9 segments.
 */
export function buildStructuredSummaryPrompt(
  messages: unknown[],
  previousSummary?: string,
  customInstructions?: string,
): string {
  const messageBlock = JSON.stringify(messages, null, 2);

  let prompt = `## 任务
分析以下对话历史，生成一份 9 段式结构化摘要。

## 摘要格式
按以下 9 个段输出，每段用 \`##\` 标题：

1. **目标与意图**：用户的核心请求和意图
2. **关键概念**：涉及的技术栈、框架、设计模式
3. **文件与代码**：读取/修改/创建的文件，关键代码片段
4. **错误与修复**：遇到的错误及解决方案
5. **问题解决**：已解决的问题和进行中的排查
6. **所有用户消息**：用户的每条非工具消息（理解意图变化的关键）
7. **待办任务**：显式要求的工作
8. **当前工作**：压缩前正在做什么（精确到文件和代码）
9. **下一步**：直接相关的下一步操作

## 规则
- 每段内容精炼，不重复
- 保留关键标识符（文件名、函数名、变量名）
- 用户消息原文保留，不要意译
- 如果某段无内容，写"无"
`;

  if (previousSummary) {
    prompt += `\n## 先前摘要\n保留先前摘要中的关键信息，与新内容合并：\n\n${previousSummary}\n`;
  }

  if (customInstructions) {
    prompt += `\n## 额外指令\n${customInstructions}\n`;
  }

  prompt += `\n## 对话历史\n${messageBlock}\n`;

  return prompt;
}

/**
 * Validate that a summary contains all 9 segments.
 */
export function validateStructuredSummary(summary: string): {
  valid: boolean;
  missing: string[];
} {
  const missing = SEGMENTS.filter(
    (s) => !summary.includes(s),
  );
  return { valid: missing.length === 0, missing };
}

/**
 * Attempt to extract a specific segment from a summary.
 */
export function extractSegment(
  summary: string,
  segmentTitle: string,
): string | undefined {
  // Match ## Segment Title ... until next ## or end
  const regex = new RegExp(
    `##\\s*${escapeRegex(segmentTitle)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    "m",
  );
  const match = summary.match(regex);
  return match?.[1]?.trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { SEGMENTS };
