/**
 * Partial compaction — only compresses recent segments, preserving early summaries.
 */

/**
 * Split messages into "early summary zone" and "recent zone".
 * The early zone is kept as-is (already summarized), only the recent zone is re-summarized.
 */
export function splitForPartialCompaction(
  messages: unknown[],
  ratio = 0.4,
): { earlySummary: string | null; recentMessages: unknown[] } {
  // Look for existing summary markers in messages
  const summaryMarker = "🧹 Compaction summary";

  let lastSummaryIndex = -1;
  let lastSummaryContent = "";

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as Record<string, unknown>;
    const text = extractText(msg);
    if (text?.includes(summaryMarker)) {
      lastSummaryIndex = i;
      lastSummaryContent = text;
    }
  }

  if (lastSummaryIndex >= 0) {
    return {
      earlySummary: lastSummaryContent,
      recentMessages: messages.slice(lastSummaryIndex + 1),
    };
  }

  // No prior summary — split based on ratio
  const cutoff = Math.floor(messages.length * (1 - ratio));
  return {
    earlySummary: null,
    recentMessages: messages.slice(cutoff),
  };
}

/**
 * Merge a previous summary with a new partial summary.
 */
export function mergeSummaries(
  previousSummary: string,
  newPartialSummary: string,
): string {
  return `## 先前压缩摘要\n${previousSummary}\n\n---\n\n## 最近压缩摘要\n${newPartialSummary}`;
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
