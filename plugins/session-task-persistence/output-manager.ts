import fs from 'fs/promises'
import {
  getSessionTaskOutputPath,
  getSessionTask,
  updateSessionTaskState,
  type SessionTask,
} from './task-store'

const MAX_OUTPUT_SIZE = 100 * 1024 // 100KB
const MAX_RECENT_ACTIVITIES = 5

export async function appendTaskOutput(
  taskId: string,
  parentSessionId: string,
  chunk: string,
  currentOffset: number
): Promise<{ newOffset: number; size: number; truncated: boolean }> {
  const file = getSessionTaskOutputPath(taskId, parentSessionId)
  const stat = await fs.stat(file).catch(() => ({ size: 0 }) as { size: number })
  let truncated = false

  let contentToWrite = chunk
  let newOffset = currentOffset + Buffer.byteLength(chunk, 'utf-8')
  let finalSize = stat.size + Buffer.byteLength(chunk, 'utf-8')

  if (finalSize > MAX_OUTPUT_SIZE) {
    const keepSize = Math.min(50 * 1024, stat.size)
    const buffer = Buffer.alloc(keepSize)
    const fd = await fs.open(file, 'r')
    await fd.read(buffer, 0, keepSize, stat.size - keepSize)
    await fd.close()

    const kept = buffer.toString('utf-8')
    contentToWrite = kept + '\n[...截断...]\n' + chunk
    newOffset = Buffer.byteLength(contentToWrite, 'utf-8')
    finalSize = newOffset
    truncated = true
  }

  if (truncated) {
    await fs.writeFile(file, contentToWrite, 'utf-8')
  } else {
    await fs.appendFile(file, chunk, 'utf-8')
  }

  const task = await getSessionTask(taskId, parentSessionId)
  if (task) {
    await updateSessionTaskState(taskId, parentSessionId, {
      outputOffset: newOffset,
      outputSize: finalSize,
    })
  }

  return { newOffset, size: finalSize, truncated }
}

export async function readTaskOutput(
  taskId: string,
  parentSessionId: string,
  offset: number = 0,
  limit?: number
): Promise<{ content: string; newOffset: number; truncated: boolean }> {
  const file = getSessionTaskOutputPath(taskId, parentSessionId)

  try {
    const stat = await fs.stat(file)
    const effectiveLimit = limit ?? stat.size - offset
    const buf = Buffer.alloc(effectiveLimit)

    const fd = await fs.open(file, 'r')
    await fd.read(buf, 0, effectiveLimit, offset)
    await fd.close()

    return {
      content: buf.toString('utf-8'),
      newOffset: offset + effectiveLimit,
      truncated: offset + effectiveLimit < stat.size,
    }
  } catch {
    return { content: '', newOffset: 0, truncated: false }
  }
}

export function updateToolActivity(
  task: SessionTask,
  toolName: string,
  input: Record<string, unknown>,
  activityDescription: string
): void {
  const activity = {
    toolName,
    input,
    activityDescription,
    isSearch: toolName.includes('search') || toolName.includes('fetch'),
    isRead: toolName.startsWith('read') || toolName === 'exec',
  }

  task.progress.recentActivities = [
    activity,
    ...task.progress.recentActivities,
  ].slice(0, MAX_RECENT_ACTIVITIES)

  task.progress.toolUseCount++
}
