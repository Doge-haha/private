/**
 * Memory Extractor - Claude Code Style
 * 
 * 双阈值触发 + Safe Point 检测 + Fork 隔离执行
 */

// ============================================================================
// 配置
// ============================================================================

export const MEMORY_EXTRACT_CONFIG = {
  // Token 阈值：上下文增长多少 tokens 后触发提取
  minimumTokensBetweenUpdate: 4000,
  
  // Tool Call 阈值：自上次提取后执行了多少次工具
  minimumToolCallsBetweenUpdates: 8,
  
  // 最长提取间隔（小时）
  maxAgeHours: 24,
  
  // Freshness 警告阈值（天）
  freshnessWarnAfterDays: 1,
}

// ============================================================================
// 类型定义
// ============================================================================

export interface MemoryType {
  name: string
  description: string
  type: 'user' | 'feedback' | 'project' | 'reference'
  created: string
  updated: string
  content: string
}

export interface ExtractContext {
  messages: any[]
  lastExtractTimestamp?: number
  lastExtractTokenCount?: number
  lastExtractToolCallCount?: number
}

// ============================================================================
// 核心函数
// ============================================================================

/**
 * Safe Point 检测：检查最后一条消息是否可以安全提取
 * 
 * 如果最后一条 assistant 消息包含 tool_call，说明工具正在执行中，
 * 此时提取会丢失上下文（用户看不到工具结果）。
 * 
 * @returns true 如果可以安全提取
 */
export function hasToolCallsInLastAssistantTurn(messages: any[]): boolean {
  if (messages.length === 0) return false
  
  const lastMessage = messages[messages.length - 1]
  if (lastMessage?.type !== 'assistant') return false
  
  const content = lastMessage?.message?.content
  if (!Array.isArray(content)) return false
  
  return content.some(block => block.type === 'tool_use')
}

/**
 * 计算 Tool Calls 数量
 */
export function countToolCallsSince(messages: any[], sinceTimestamp?: number): number {
  let toolCallCount = 0
  let foundStart = sinceTimestamp === undefined
  
  for (const message of messages) {
    if (!foundStart) {
      if (message.timestamp === sinceTimestamp) {
        foundStart = true
      }
      continue
    }
    
    if (message.type === 'assistant') {
      const content = message.message?.content
      if (Array.isArray(content)) {
        toolCallCount += content.filter(block => block.type === 'tool_use').length
      }
    }
  }
  
  return toolCallCount
}

/**
 * 估算 Token 数量（简化版，实际应调用 tokenCount）
 */
export function estimateTokenCount(messages: any[]): number {
  // 简单估算：每条消息平均 100 tokens
  // 实际应使用 OpenClaw 的 tokenCount 函数
  return messages.length * 100
}

/**
 * 判断是否应该提取记忆
 * 
 * 触发条件（满足其一）：
 * 1. Token 增长达到阈值 AND Tool Call 达到阈值
 * 2. Token 增长达到阈值 AND 最后一条是纯文本（自然断点）
 */
export function shouldExtractMemory(
  messages: any[],
  lastExtractInfo: { tokenCount: number; timestamp: number; toolCallCount: number } | null
): { should: boolean; reason: string } {
  // 检查 Safe Point
  if (hasToolCallsInLastAssistantTurn(messages)) {
    return { should: false, reason: '最后消息包含 tool_call，等待自然断点' }
  }
  
  // 计算当前状态
  const currentTokenCount = estimateTokenCount(messages)
  const currentToolCallCount = countToolCallsSince(messages, lastExtractInfo?.timestamp)
  
  // Token 增长
  const tokenDelta = lastExtractInfo 
    ? currentTokenCount - lastExtractInfo.tokenCount 
    : currentTokenCount
  
  // 检查 Token 阈值
  const hasMetTokenThreshold = tokenDelta >= MEMORY_EXTRACT_CONFIG.minimumTokensBetweenUpdate
  
  // 检查 Tool Call 阈值
  const toolCallsSinceLast = lastExtractInfo 
    ? currentToolCallCount - lastExtractInfo.toolCallCount 
    : currentToolCallCount
  const hasMetToolCallThreshold = toolCallsSinceLast >= MEMORY_EXTRACT_CONFIG.minimumToolCallsBetweenUpdates
  
  // 检查时间
  const hoursSinceLastExtract = lastExtractInfo 
    ? (Date.now() - lastExtractInfo.timestamp) / (1000 * 60 * 60) 
    : Infinity
  const hasMetTimeThreshold = hoursSinceLastExtract >= MEMORY_EXTRACT_CONFIG.maxAgeHours
  
  // 触发条件
  if (hasMetTokenThreshold && hasMetToolCallThreshold) {
    return { should: true, reason: `Token 增长 ${tokenDelta} + Tool Calls ${toolCallsSinceLast}` }
  }
  
  if (hasMetTokenThreshold && !hasToolCallsInLastAssistantTurn(messages)) {
    return { should: true, reason: `Token 增长 ${tokenDelta}（自然断点）` }
  }
  
  if (hasMetTimeThreshold) {
    return { should: true, reason: `超过 ${MEMORY_EXTRACT_CONFIG.maxAgeHours} 小时未提取` }
  }
  
  return { 
    should: false, 
    reason: `Token: ${tokenDelta}/${MEMORY_EXTRACT_CONFIG.minimumTokensBetweenUpdate}, ToolCalls: ${toolCallsSinceLast}/${MEMORY_EXTRACT_CONFIG.minimumToolCallsBetweenUpdates}` 
  }
}

/**
 * 获取 Freshness 警告文本
 */
export function memoryFreshnessText(mtimeMs: number): string {
  const ageMs = Date.now() - mtimeMs
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))
  
  if (ageDays <= MEMORY_EXTRACT_CONFIG.freshnessWarnAfterDays) {
    return ''
  }
  
  return `⚠️ 此记忆已创建 ${ageDays} 天，可能过时。验证后再使用。`
}

// ============================================================================
// 提取执行（需要 sessions_spawn）
// ============================================================================

/**
 * 构建记忆提取 Prompt
 */
export function buildMemoryExtractionPrompt(currentMemory: string, newMessages: any[]): string {
  return `你是记忆提取专家。从以下消息中提取关键信息到记忆文件。

## 4 类记忆定义

1. **user**: 用户角色、偏好、知识
   - 用户透露的职业、背景
   - 表达的工具/语言偏好

2. **feedback**: 用户的纠正和确认
   - 必须包含 **Why:**（用户给的原因）
   - 必须包含 **How to apply:**（应用场景）

3. **project**: 项目状态、目标、截止日期
   - 日期使用 ISO 格式（如"周四" → "2026-04-10"）

4. **reference**: 外部系统指针
   - 系统名、URL、用途

## 规则

- 只提取无法从代码/文件推导的信息
- feedback 必须包含 **Why:** 和 **How to apply:**
- 检查与现有记忆是否冲突，冲突时保留更新的

## 当前记忆文件内容
${currentMemory || '(空)'}

## 新消息
${formatMessagesForPrompt(newMessages)}

## 输出
更新 memory/types/{type}/ 下的文件，遵循 frontmatter 规范。
`
}

/**
 * 格式化消息为文本
 */
function formatMessagesForPrompt(messages: any[]): string {
  return messages.map(m => {
    const role = m.type === 'user' ? 'User' : 'Assistant'
    const content = typeof m.message?.content === 'string' 
      ? m.message.content 
      : JSON.stringify(m.message?.content, null, 2)
    return `[${role}]\n${content}`
  }).join('\n\n')
}

/**
 * 记忆提取主函数（供 sessions_spawn 调用）
 */
export async function extractMemoryTask(messages: any[]): Promise<void> {
  const { should, reason } = shouldExtractMemory(messages, null)
  
  if (!should) {
    console.log('[Memory Extractor] 不满足提取条件:', reason)
    return
  }
  
  console.log('[Memory Extractor] 开始提取:', reason)
  
  // TODO: 实现实际的提取逻辑
  // 1. 读取现有记忆
  // 2. 构建提取 prompt
  // 3. 调用 LLM 提取
  // 4. 更新记忆文件
  // 5. 更新 INDEX.md
}
