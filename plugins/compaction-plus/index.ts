/**
 * @council/compaction-plus — Enhanced compaction provider for OpenClaw.
 *
 * Features:
 * 1. 9-segment structured summaries (Claude Code style)
 * 2. Partial compaction — preserves early summaries
 * 3. Circuit breaker — auto-degrades on repeated failures
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { registerCompactionProvider } from "openclaw/plugin-sdk/src/plugins/compaction-provider";
import { CircuitBreaker } from "./src/circuit-breaker.js";
import {
  buildStructuredSummaryPrompt,
  validateStructuredSummary,
} from "./src/summarizer.js";
import {
  splitForPartialCompaction,
  mergeSummaries,
} from "./src/partial.js";

export default definePluginEntry({
  id: "compaction-plus",
  name: "Compaction Plus",
  description:
    "Enhanced compaction with 9-segment structured summaries, partial compaction, and circuit-breaker protection",

  register(api) {
    const breaker = new CircuitBreaker(3, 60_000);

    api.registerCompactionProvider({
      id: "compaction-plus",
      label: "Compaction Plus (9-segment + circuit breaker)",

      async summarize(params) {
        const {
          messages,
          signal,
          customInstructions,
          previousSummary,
          compressionRatio = 0.4,
        } = params;

        // Circuit breaker check
        if (!breaker.isAvailable) {
          throw new Error(
            `[compaction-plus] Circuit breaker is OPEN (${breaker.status.failures} consecutive failures). Falling back to built-in compaction.`,
          );
        }

        // Partial compaction: split messages and preserve prior summaries
        const { earlySummary, recentMessages } = splitForPartialCompaction(
          messages,
          compressionRatio,
        );

        const messagesToSummarize =
          recentMessages.length > 0 ? recentMessages : messages;

        // Build the structured summary prompt
        const prompt = buildStructuredSummaryPrompt(
          messagesToSummarize,
          previousSummary ?? earlySummary ?? undefined,
          customInstructions,
        );

        // Use the agent's model to generate the summary
        // We delegate to OpenClaw's built-in LLM via the prompt content
        // The provider receives raw messages; we return a structured summary request
        // that OpenClaw's compaction pipeline will use with the configured model.

        try {
          // Generate the summary by calling the model through OpenClaw's stream API
          const summary = await generateSummary(api, prompt, signal);

          // Validate the summary has all 9 segments
          const validation = validateStructuredSummary(summary);
          if (!validation.valid) {
            console.warn(
              `[compaction-plus] Summary missing segments: ${validation.missing.join(", ")}`,
            );
          }

          // Merge with early summary if partial compaction was used
          const finalSummary = earlySummary
            ? mergeSummaries(earlySummary, summary)
            : summary;

          breaker.recordSuccess();
          return finalSummary;
        } catch (err) {
          breaker.recordFailure();
          throw err;
        }
      },
    });
  },
});

/**
 * Generate a summary using OpenClaw's model inference.
 * Falls back to a deterministic extractive summary if model call fails.
 */
async function generateSummary(
  api: unknown,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  // Attempt to use the runtime model client if available
  try {
    const runtime = (api as Record<string, unknown>).runtime as
      | Record<string, unknown>
      | undefined;

    if (runtime?.stream && typeof runtime.stream === "function") {
      let result = "";
      for await (const chunk of (runtime.stream as (p: unknown) => AsyncIterable<unknown>)({
        messages: [{ role: "user", content: prompt }],
        signal,
      })) {
        const c = chunk as Record<string, unknown>;
        if (typeof c.text === "string") result += c.text;
        if (typeof c.content === "string") result += c.content;
      }
      if (result.trim()) return result.trim();
    }
  } catch {
    // Fall through to extractive fallback
  }

  // Fallback: extractive summary from raw messages
  return buildExtractiveFallback(prompt);
}

/**
 * Deterministic extractive fallback — no model needed.
 * Extracts key lines from the message history.
 */
function buildExtractiveFallback(rawPrompt: string): string {
  let messages: unknown[] = [];
  try {
    // The prompt ends with the message history after "## 对话历史\n"
    const idx = rawPrompt.lastIndexOf("## 对话历史\n");
    if (idx >= 0) {
      messages = JSON.parse(rawPrompt.slice(idx + "## 对话历史\n".length));
    }
  } catch {
    // Can't parse — return minimal summary
  }

  const userMsgs: string[] = [];
  const assistantMsgs: string[] = [];

  for (const m of messages) {
    const msg = m as Record<string, unknown>;
    const role = msg.role as string;
    const text = extractText(msg);
    if (!text) continue;

    if (role === "user") {
      userMsgs.push(text.slice(0, 200));
    } else if (role === "assistant" && !msg.tool_calls) {
      assistantMsgs.push(text.slice(0, 200));
    }
  }

  return [
    "## 目标与意图",
    userMsgs.length > 0 ? userMsgs[0] : "无",
    "## 关键概念",
    "无",
    "## 文件与代码",
    "无",
    "## 错误与修复",
    "无",
    "## 问题解决",
    "无",
    "## 所有用户消息",
    userMsgs.length > 0 ? userMsgs.map((m, i) => `${i + 1}. ${m}`).join("\n") : "无",
    "## 待办任务",
    "无",
    "## 当前工作",
    assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : "无",
    "## 下一步",
    "无",
  ].join("\n\n");
}

function extractText(msg: Record<string, unknown>): string | undefined {
  if (typeof msg.content === "string") return msg.content;
  if (typeof msg.text === "string") return msg.text;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((b: Record<string, unknown>) => b.type === "text")
      .map((b: Record<string, unknown>) => b.text)
      .join("\n");
  }
  return undefined;
}
