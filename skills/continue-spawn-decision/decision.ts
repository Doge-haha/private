/**
 * Continue/Spawn Decision Engine
 * 
 * 基于 Claude Code Coordinator 模式的上下文重叠分析器。
 * 决定是继续使用当前 agent 还是开新 agent。
 * 
 * 参考: Claude Code coordinatorMode.ts Section 5 "Choose continue vs. spawn by context overlap"
 */

// ============================================================
// Types
// ============================================================

export interface ToolCall {
  name: string
  input: Record<string, unknown>
  timestamp: number
}

export interface ContextSnapshot {
  sessionId: string
  recentlyReadFiles: string[]      // 最近读取的文件路径
  recentlyWrittenFiles: string[]    // 最近写入的文件路径
  concepts: string[]               // 当前讨论的核心概念（名词/关键词）
  toolCalls: ToolCall[]            // 最近 N 次工具调用
  messageHashes: string[]          // 消息内容哈希（用于消息重叠检测）
  taskDescription: string          // 当前任务描述
  lastNMessages: number            // 基于最近多少条消息做判断
}

export interface TaskContext {
  taskDescription: string
  taskType: 'research' | 'implementation' | 'verification' | 'simple'
  targetFiles?: string[]           // 新任务涉及的目标文件
  expectedConcepts?: string[]       // 新任务涉及的核心概念
}

export interface OverlapScore {
  fileOverlap: number              // 0-1: 目标文件和已读/已写文件的重叠度
  conceptOverlap: number            // 0-1: 概念重叠度
  toolOverlap: number              // 0-1: 工具调用类型重叠度
  messageOverlap: number            // 0-1: 消息语义重叠度（基于哈希）
  weightedScore: number            // 加权总分 0-1
}

export type Recommendation = 'continue' | 'spawn_fresh' | 'uncertain'

export interface Decision {
  recommendation: Recommendation
  confidence: number                // 0-1: 决策置信度
  overlapScore: OverlapScore
  rationale: string                 // 人类可读的决策理由
  suggestedPromptAdjustment?: string // 如果 continue，给出如何补充 prompt
}

export interface ContinueSpawnConfig {
  continueThreshold: number         // >= 此值 → continue（默认 0.6）
  spawnThreshold: number           // <= 此值 → spawn_fresh（默认 0.3）
  weights: {
    file: number                    // 文件重叠权重（默认 0.4）
    concept: number                 // 概念重叠权重（默认 0.3）
    tool: number                    // 工具重叠权重（默认 0.2）
    message: number                 // 消息重叠权重（默认 0.1）
  }
}

const DEFAULT_CONFIG: ContinueSpawnConfig = {
  continueThreshold: 0.6,
  spawnThreshold: 0.3,
  weights: {
    file: 0.4,
    concept: 0.3,
    tool: 0.2,
    message: 0.1,
  },
}

// ============================================================
// Core Functions
// ============================================================

/**
 * 分析当前上下文和新任务之间的重叠度
 */
export function analyzeContextOverlap(
  currentContext: ContextSnapshot,
  newTask: TaskContext,
  config: Partial<ContinueSpawnConfig> = {}
): OverlapScore {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const { weights } = cfg

  // 1. 文件重叠 (40%)
  // 目标文件与已读+已写文件的交集
  const allCurrentFiles = [
    ...currentContext.recentlyReadFiles,
    ...currentContext.recentlyWrittenFiles,
  ]
  const fileOverlap = computeSetOverlap(
    newTask.targetFiles ?? [],
    allCurrentFiles
  )

  // 2. 概念重叠 (30%)
  // 新任务概念与当前上下文中概念的重叠
  const conceptOverlap = computeSetOverlap(
    newTask.expectedConcepts ?? extractConcepts(newTask.taskDescription),
    currentContext.concepts
  )

  // 3. 工具重叠 (20%)
  // 工具调用类型的重叠
  const currentTools = new Set(currentContext.toolCalls.map(t => t.name))
  const recentTools = currentContext.toolCalls.slice(-10).map(t => t.name)
  const toolOverlap = computeListOverlap(newTask.targetFiles ?? [], [
    ...recentTools,
  ]) * 0.3 // 工具重叠影响较小，衰减系数

  // 4. 消息重叠 (10%)
  // 基于任务描述与历史消息的语义相似度（简化版：关键词重叠）
  const messageOverlap = computeSemanticOverlap(
    newTask.taskDescription,
    currentContext.taskDescription
  )

  // 加权总分
  const weightedScore =
    fileOverlap * weights.file +
    conceptOverlap * weights.concept +
    toolOverlap * weights.tool +
    messageOverlap * weights.message

  return {
    fileOverlap: Math.round(fileOverlap * 100) / 100,
    conceptOverlap: Math.round(conceptOverlap * 100) / 100,
    toolOverlap: Math.round(toolOverlap * 100) / 100,
    messageOverlap: Math.round(messageOverlap * 100) / 100,
    weightedScore: Math.round(weightedScore * 100) / 100,
  }
}

/**
 * 根据重叠度决定 Continue 还是 Spawn Fresh
 */
export function shouldContinueVsSpawn(
  overlap: OverlapScore,
  taskType: TaskContext['taskType'],
  config: Partial<ContinueSpawnConfig> = {}
): Decision {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const { continueThreshold, spawnThreshold } = cfg

  // verification 类型强制 spawn_fresh（独立验证原则）
  if (taskType === 'verification') {
    return {
      recommendation: 'spawn_fresh',
      confidence: 1.0,
      overlapScore: overlap,
      rationale:
        'verification 类型任务强制 Spawn Fresh。验证者必须独立于实现者，不能继承任何实现上下文。',
    }
  }

  // simple 类型直接 spawn_fresh
  if (taskType === 'simple') {
    return {
      recommendation: 'spawn_fresh',
      confidence: 1.0,
      overlapScore: overlap,
      rationale: 'simple 类型任务无需上下文，直接 Spawn Fresh。',
    }
  }

  // === 方案B: 文件重叠 ≥ 0.5 时强制 continue ===
  // 文件重叠是上下文的硬信号——同一个文件的工作意味着
  // 有可复用的变量结构、函数签名、上下文理解。
  // 即使概念不重叠，只要文件重叠就 continue。
  if (overlap.fileOverlap >= 0.5) {
    return {
      recommendation: 'continue',
      confidence: overlap.fileOverlap,
      overlapScore: overlap,
      rationale: `文件重叠度 ${(overlap.fileOverlap * 100).toFixed(0)}% ≥ 50%，强制 Continue。` +
        `同一文件的上下文有复用价值（变量结构、函数签名、调用关系），` +
        `新任务可直接继承，无需重新探索。`,
      suggestedPromptAdjustment: '在 Continue 消息中明确标注本次改动与已有上下文的关系，便于 Worker 精准定位。',
    }
  }

  // research 类型降低 continue 门槛（研究噪声会污染实现）
  const effectiveThreshold = taskType === 'research'
    ? continueThreshold - 0.15
    : continueThreshold

  if (overlap.weightedScore >= effectiveThreshold) {
    const confidence = (overlap.weightedScore - effectiveThreshold) / (1 - effectiveThreshold)
    return {
      recommendation: 'continue',
      confidence: Math.round(confidence * 100) / 100,
      overlapScore: overlap,
      rationale: buildContinueRationale(overlap, taskType),
      suggestedPromptAdjustment: buildPromptAdjustment(overlap, taskType),
    }
  }

  if (overlap.weightedScore <= spawnThreshold) {
    const confidence = (spawnThreshold - overlap.weightedScore) / spawnThreshold
    return {
      recommendation: 'spawn_fresh',
      confidence: Math.round(Math.min(confidence * 100) / 100, 1),
      overlapScore: overlap,
      rationale: buildSpawnRationale(overlap, taskType),
    }
  }

  // 中间地带：基于 taskType 软判断
  return {
    recommendation: taskType === 'implementation' ? 'continue' : 'spawn_fresh',
    confidence: 0.5,
    overlapScore: overlap,
    rationale: buildMiddleGroundRationale(overlap, taskType),
  }
}

/**
 * 生成人类可读的决策理由
 */
export function buildDecisionRationale(
  decision: Decision,
  currentContext: ContextSnapshot,
  newTask: TaskContext
): string {
  const lines = [
    `[${decision.recommendation.toUpperCase()}] 置信度: ${(decision.confidence * 100).toFixed(0)}%`,
    '',
    '重叠度分析：',
    `  - 文件重叠: ${(decision.overlapScore.fileOverlap * 100).toFixed(0)}% (权重 40%)`,
    `  - 概念重叠: ${(decision.overlapScore.conceptOverlap * 100).toFixed(0)}% (权重 30%)`,
    `  - 工具重叠: ${(decision.overlapScore.toolOverlap * 100).toFixed(0)}% (权重 20%)`,
    `  - 消息重叠: ${(decision.overlapScore.messageOverlap * 100).toFixed(0)}% (权重 10%)`,
    `  - 加权总分: ${(decision.overlapScore.weightedScore * 100).toFixed(0)}%`,
    '',
    decision.rationale,
    '',
    `当前任务: ${currentContext.taskDescription}`,
    `新任务: ${newTask.taskDescription}`,
    `任务类型: ${newTask.taskType}`,
  ]

  if (newTask.targetFiles && newTask.targetFiles.length > 0) {
    lines.push(`目标文件: ${newTask.targetFiles.join(', ')}`)
  }

  return lines.join('\n')
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * 计算两个集合的重叠系数 (Jaccard index)
 */
function computeSetOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  
  const setA = new Set(a.map(normalizePath))
  const setB = new Set(b.map(normalizePath))
  
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])
  
  return intersection.size / union.size
}

/**
 * 计算列表之间的重叠系数（简化版）
 */
function computeListOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setB = new Set(b.map(String))
  const matches = a.filter(item => setB.has(String(item)))
  return matches.length / Math.max(a.length, b.length)
}

/**
 * 简化的语义重叠计算（基于词重叠）
 */
function computeSemanticOverlap(text1: string, text2: string): number {
  if (!text1 || !text2) return 0
  
  const words1 = normalizeWords(text1)
  const words2 = normalizeWords(text2)
  
  if (words1.length === 0 || words2.length === 0) return 0
  
  const set1 = new Set(words1)
  const set2 = new Set(words2)
  
  const intersection = new Set([...set1].filter(w => set2.has(w)))
  const union = new Set([...set1, ...set2])
  
  return intersection.size / union.size
}

/**
 * 规范化文件路径（提取文件名和目录）
 */
function normalizePath(p: string): string {
  return p
    .replace(/^~\//, '')
    .replace(/^\.\//, '')
    .replace(/\/[^\/]+$/, '')  // 提取目录
    .toLowerCase()
}

/**
 * 从文本中提取核心概念（名词/关键词）
 */
function extractConcepts(text: string): string[] {
  // 简化实现：提取连续的数字字母序列
  const matches = text.match(/[a-zA-Z][a-zA-Z0-9]{2,}/g) ?? []
  // 过滤停用词
  const stopWords = new Set([
    'the', 'this', 'that', 'with', 'from', 'have', 'has', 'will',
    'would', 'could', 'should', 'there', 'their', 'what', 'which',
    'when', 'where', 'how', 'why', 'and', 'for', 'not', 'are',
    'was', 'were', 'been', 'being', 'can', 'may', 'just', 'like',
    '使用', '这个', '那个', '什么', '如何', '为什么', '以及',
  ])
  return [...new Set(matches.filter(w => !stopWords.has(w.toLowerCase())))]
}

/**
 * 规范化文本（提取词干）
 */
function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
}

// ============================================================
// Rationale Builders
// ============================================================

function buildContinueRationale(overlap: OverlapScore, taskType: string): string {
  const parts: string[] = []
  
  if (overlap.fileOverlap >= 0.5) {
    parts.push('目标文件与当前上下文高度重叠（文件层面有可复用上下文）')
  }
  if (overlap.conceptOverlap >= 0.5) {
    parts.push('概念重叠度高（讨论主题一致）')
  }
  
  if (taskType === 'implementation') {
    return `implementation 任务 + 高重叠 → Continue。` + parts.join('；')
  }
  
  return `重叠度 ${(overlap.weightedScore * 100).toFixed(0)}% → Continue。` + parts.join('；')
}

function buildSpawnRationale(overlap: OverlapScore, taskType: string): string {
  const parts: string[] = []
  
  if (overlap.fileOverlap < 0.3) {
    parts.push('目标文件与当前上下文无关（文件层面无重叠）')
  }
  if (overlap.conceptOverlap < 0.3) {
    parts.push('概念重叠度低（讨论主题变化）')
  }
  
  if (taskType === 'research') {
    return `research 任务 + 低重叠 → Spawn Fresh。探索任务倾向于干净上下文，避免研究噪声污染。` + (parts.length > 0 ? '；' + parts.join('；') : '')
  }
  
  return `重叠度 ${(overlap.weightedScore * 100).toFixed(0)}% → Spawn Fresh。` + parts.join('；')
}

function buildMiddleGroundRationale(overlap: OverlapScore, taskType: string): string {
  if (taskType === 'implementation') {
    return `implementation 任务 + 中等重叠 → 软性 Continue。上文中有部分可复用，但需要明确补充新任务的具体上下文。`
  }
  return `重叠度 ${(overlap.weightedScore * 100).toFixed(0)}% 处于中间地带 → Spawn Fresh。宁可干净开局也不要带噪声。`
}

function buildPromptAdjustment(overlap: OverlapScore, taskType: string): string {
  if (overlap.fileOverlap < 0.5) {
    return '补充新任务涉及的具体文件路径和行号，使 Worker 有明确目标。'
  }
  if (overlap.conceptOverlap < 0.5) {
    return '在 Continue 消息中补充新任务的核心概念和预期结果。'
  }
  return '上下文重叠充分，Continue 时简述任务变更即可。'
}

// ============================================================
// Utility: Context Capture (for OpenClaw integration)
// ============================================================

/**
 * 从当前 OpenClaw session 抓取上下文快照
 * 
 * OpenClaw 集成点：
 * - recentlyReadFiles: 从消息历史中提取 Read tool 调用的文件路径
 * - recentlyWrittenFiles: 从消息历史中提取 Write/Edit tool 调用的文件路径  
 * - concepts: 从最后 N 条用户消息中提取核心概念
 * - toolCalls: 从最后 N 条消息中提取工具调用记录
 * - messageHashes: 消息内容哈希
 */
export async function captureContextSnapshot(
  sessionId: string,
  recentMessages: Array<{ role: string; content: string | Array<unknown>; tool_calls?: unknown[] }>,
  taskDescription: string
): Promise<ContextSnapshot> {
  const recentlyReadFiles: string[] = []
  const recentlyWrittenFiles: string[] = []
  const toolCalls: ToolCall[] = []
  const concepts: string[] = []
  const messageHashes: string[] = []

  for (const msg of recentMessages.slice(-20)) { // 最近 20 条消息
    // 提取消息哈希
    if (typeof msg.content === 'string') {
      messageHashes.push(hashString(msg.content.slice(0, 200)))
    }

    // 提取工具调用
    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls as Array<{ name: string; input: Record<string, unknown> }>) {
        toolCalls.push({
          name: tc.name,
          input: tc.input,
          timestamp: Date.now(),
        })

        // 提取文件路径
        if (tc.name === 'Read' && tc.input?.file_path) {
          recentlyReadFiles.push(String(tc.input.file_path))
        }
        if ((tc.name === 'Write' || tc.name === 'Edit') && tc.input?.file_path) {
          recentlyWrittenFiles.push(String(tc.input.file_path))
        }
      }
    }
  }

  // 从最后一条用户消息中提取概念
  const lastUserMsg = [...recentMessages].reverse().find(m => m.role === 'user')
  if (lastUserMsg && typeof lastUserMsg.content === 'string') {
    concepts.push(...extractConcepts(lastUserMsg.content))
  }

  return {
    sessionId,
    recentlyReadFiles: [...new Set(recentlyReadFiles)],
    recentlyWrittenFiles: [...new Set(recentlyWrittenFiles)],
    concepts: [...new Set(concepts)],
    toolCalls,
    messageHashes,
    taskDescription,
    lastNMessages: Math.min(recentMessages.length, 20),
  }
}

/**
 * 简单字符串哈希（用于消息去重）
 */
function hashString(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return h.toString(36)
}

// ============================================================
// Exports
// ============================================================

export { DEFAULT_CONFIG, type ContinueSpawnConfig }
