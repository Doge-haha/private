/**
 * Memory Recall - 记忆召回模块
 * 
 * 从 typed memory 中检索相关记忆，并在需要时注入上下文。
 */

import { readdir, readFile, stat } from 'fs/promises'
import { join, basename } from 'path'

// ============================================================================
// 场景触发配置
// ============================================================================

export const SCENE_TRIGGERS = {
  memory: ['记忆', 'memory', 'typed', '提取', '召回', '持久化'],
  project: ['项目', '任务', '进度', '当前', '进行中', '状态'],
  user: ['我喜欢', '我习惯', '我希望', '我的偏好', '背景'],
  feedback: ['不要', '应该', '纠正', '确认', '对', '错'],
  reference: ['Linear', 'Jira', 'GitHub', '飞书', 'Notion', 'Slack'],
  tech: ['方案', '对比', '选型', 'Claude Code', 'OpenClaw', '架构'],
};

export const SCENE_TO_TYPES: Record<string, string[]> = {
  memory: ['user', 'project'],
  project: ['project'],
  user: ['user'],
  feedback: ['feedback'],
  reference: ['reference'],
  tech: ['user', 'project'],
};

// ============================================================================
// 配置
// ============================================================================

export const MEMORY_RECALL_CONFIG = {
  // 召回的记忆数量上限
  maxMemories: 5,
  
  // Freshness 警告阈值（天）
  freshnessWarnAfterDays: 1,
  
  // 记忆类型目录
  typesDir: 'memory/types',
};

// ============================================================================
// 类型定义
// ============================================================================

export interface MemoryEntry {
  path: string
  name: string
  type: 'user' | 'feedback' | 'project' | 'reference'
  description: string
  created: string
  updated: string
  content: string
  mtimeMs: number
  ageDays: number
  freshness: 'fresh' | 'stale'
}

// ============================================================================
// 场景检测
// ============================================================================

/**
 * 从消息中检测触发场景
 */
export function detectScene(message: string): string[] {
  const lowerMsg = message.toLowerCase()
  const scenes: string[] = []
  
  for (const [scene, keywords] of Object.entries(SCENE_TRIGGERS)) {
    const matched = keywords.some(kw => {
      const lowerKw = kw.toLowerCase()
      // 单字符且非英文，跳过（容易误匹配）
      if (lowerKw.length === 1 && !/[a-z]/i.test(lowerKw)) {
        return false
      }
      return lowerMsg.includes(lowerKw)
    })
    
    if (matched) {
      scenes.push(scene)
    }
  }
  
  return scenes
}

/**
 * 根据场景获取应召回的类型
 */
export function getTypesForScene(scenes: string[]): string[] {
  const types = new Set<string>()
  for (const scene of scenes) {
    const sceneTypes = SCENE_TO_TYPES[scene]
    if (sceneTypes) {
      sceneTypes.forEach(t => types.add(t))
    }
  }
  return Array.from(types)
}

// ============================================================================
// 核心函数
// ============================================================================

/**
 * 计算记忆年龄（天）
 */
function memoryAgeDays(mtimeMs: number): number {
  return Math.floor((Date.now() - mtimeMs) / (1000 * 60 * 60 * 24))
}

/**
 * 解析 frontmatter
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>
  body: string
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return { frontmatter: {}, body: content }
  }
  
  const [, frontmatterStr, body] = match
  const frontmatter: Record<string, string> = {}
  
  frontmatterStr.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':')
    if (key && valueParts.length) {
      frontmatter[key.trim()] = valueParts.join(':').trim()
    }
  })
  
  return { frontmatter, body }
}

/**
 * 读取单个记忆文件
 */
async function readMemoryFile(filePath: string): Promise<MemoryEntry | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const { frontmatter } = parseFrontmatter(content)
    const stats = await stat(filePath)
    const mtimeMs = stats.mtimeMs
    const ageDays = memoryAgeDays(mtimeMs)
    
    return {
      path: filePath,
      name: frontmatter.name || basename(filePath, '.md'),
      type: (frontmatter.type as any) || 'user',
      description: frontmatter.description || '',
      created: frontmatter.created || new Date(stats.birthtime).toISOString(),
      updated: frontmatter.updated || new Date(mtimeMs).toISOString(),
      content,
      mtimeMs,
      ageDays,
      freshness: ageDays <= MEMORY_RECALL_CONFIG.freshnessWarnAfterDays ? 'fresh' : 'stale',
    }
  } catch {
    return null
  }
}

/**
 * 扫描所有记忆文件
 */
export async function scanAllMemories(typesDir: string): Promise<MemoryEntry[]> {
  const memories: MemoryEntry[] = []
  const types = ['user', 'feedback', 'project', 'reference']
  
  for (const type of types) {
    const typeDir = join(typesDir, type)
    try {
      const files = await readdir(typeDir)
      for (const file of files) {
        if (file.endsWith('.md') && file !== 'INDEX.md') {
          const entry = await readMemoryFile(join(typeDir, file))
          if (entry) {
            memories.push(entry)
          }
        }
      }
    } catch {
      // 目录不存在，跳过
    }
  }
  
  // 按更新时间排序（最新的在前）
  return memories.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/**
 * 关键词匹配记忆
 */
function matchesKeyword(memory: MemoryEntry, keywords: string[]): boolean {
  const searchText = [
    memory.name,
    memory.description,
    memory.content,
  ].join(' ').toLowerCase()
  
  return keywords.some(kw => searchText.includes(kw.toLowerCase()))
}

/**
 * 召回相关记忆
 */
export async function recallMemories(
  query: string,
  typesDir: string = MEMORY_RECALL_CONFIG.typesDir
): Promise<MemoryEntry[]> {
  const allMemories = await scanAllMemories(typesDir)
  const keywords = query.split(/\s+/).filter(k => k.length > 2)
  
  if (keywords.length === 0) {
    // 无关键词，返回最新的记忆
    return allMemories.slice(0, MEMORY_RECALL_CONFIG.maxMemories)
  }
  
  // 匹配关键词的记忆优先
  const matched = allMemories.filter(m => matchesKeyword(m, keywords))
  const unmatched = allMemories.filter(m => !matchesKeyword(m, keywords))
  
  // 合并结果
  return [...matched, ...unmatched].slice(0, MEMORY_RECALL_CONFIG.maxMemories)
}

/**
 * 根据场景召回记忆（场景触发模式）
 */
export async function recallByScene(
  message: string,
  typesDir: string = MEMORY_RECALL_CONFIG.typesDir
): Promise<MemoryEntry[]> {
  const scenes = detectScene(message)
  if (scenes.length === 0) {
    return [] // 没有触发场景，不召回
  }
  
  const targetTypes = getTypesForScene(scenes)
  const allMemories = await scanAllMemories(typesDir)
  
  // 筛选匹配类型的记忆
  const filtered = allMemories.filter(m => targetTypes.includes(m.type))
  
  return filtered.slice(0, MEMORY_RECALL_CONFIG.maxMemories)
}

/**
 * 生成召回记忆的上下文文本
 */
export function formatMemoriesForContext(memories: MemoryEntry[]): string {
  if (memories.length === 0) {
    return ''
  }
  
  const sections = memories.map(m => {
    const freshnessNote = m.freshness === 'stale' 
      ? `\n> ⚠️ 此记忆已创建 ${m.ageDays} 天，可能过时。` 
      : ''
    
    return `[${m.type}] ${m.name}
${m.description}${freshnessNote}
---
${m.content}`
  })
  
  return `<relevant-memories>
${sections.join('\n\n')}
</relevant-memories>`
}

/**
 * 完整召回流程
 */
export async function getRelevantMemoriesContext(
  query: string,
  typesDir: string = MEMORY_RECALL_CONFIG.typesDir
): Promise<string> {
  const memories = await recallMemories(query, typesDir)
  return formatMemoriesForContext(memories)
}

// ============================================================================
// CLI 工具函数
// ============================================================================

/**
 * 打印记忆列表
 */
export function printMemoryList(memories: MemoryEntry[]): void {
  console.log('\n📋 记忆列表:\n')
  
  const byType = {
    user: memories.filter(m => m.type === 'user'),
    feedback: memories.filter(m => m.type === 'feedback'),
    project: memories.filter(m => m.type === 'project'),
    reference: memories.filter(m => m.type === 'reference'),
  }
  
  for (const [type, items] of Object.entries(byType)) {
    if (items.length > 0) {
      console.log(`## ${type} (${items.length})`)
      items.forEach(m => {
        const freshness = m.freshness === 'stale' ? ' ⚠️' : ''
        console.log(`  - ${m.name}${freshness}`)
        console.log(`    ${m.description}`)
        console.log('')
      })
    }
  }
}
