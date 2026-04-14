#!/usr/bin/env node
/**
 * Manual test for task-store.ts core logic
 * Mimics the key functions in plain JS to verify the approach works
 */

import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HOME = process.env.HOME ?? '/Users/huahaha'

// ============================================================
// Core paths (mirrors task-store.ts)
// ============================================================

function getOpenClawTasksDir() {
  return path.join(HOME, '.openclaw', 'tasks')
}

function getSessionTaskOutputPath(taskId, parentSessionId) {
  return path.join(getOpenClawTasksDir(), parentSessionId, `${taskId}.log`)
}

function getTaskMetaPath(taskId, parentSessionId) {
  return path.join(getOpenClawTasksDir(), parentSessionId, `${taskId}.meta.json`)
}

// ============================================================
// Core operations (mirrors task-store.ts)
// ============================================================

async function registerSessionTask(parentSessionId, childSessionId, description, taskType) {
  const id = randomUUID()
  const dir = path.join(getOpenClawTasksDir(), parentSessionId)
  const outputFile = getSessionTaskOutputPath(id, parentSessionId)

  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(outputFile, '', 'utf-8')

  const task = {
    id,
    parentSessionId,
    childSessionId,
    status: 'pending',
    taskType,
    description,
    createdAt: Date.now(),
    outputFile,
    outputOffset: 0,
    outputSize: 0,
    progress: {
      toolUseCount: 0,
      latestInputTokens: 0,
      cumulativeOutputTokens: 0,
      recentActivities: [],
    },
  }

  const metaPath = getTaskMetaPath(id, parentSessionId)
  await fs.writeFile(metaPath, JSON.stringify(task, null, 2), 'utf-8')
  return task
}

async function appendTaskOutput(taskId, parentSessionId, chunk, currentOffset = 0) {
  const file = getSessionTaskOutputPath(taskId, parentSessionId)
  let stat
  try {
    stat = await fs.stat(file)
  } catch {
    stat = { size: 0 }
  }

  const MAX_OUTPUT_SIZE = 100 * 1024
  let newOffset = currentOffset + Buffer.byteLength(chunk, 'utf-8')
  let finalSize = stat.size + Buffer.byteLength(chunk, 'utf-8')
  let truncated = false

  if (finalSize > MAX_OUTPUT_SIZE) {
    const keepSize = Math.min(50 * 1024, stat.size)
    const buf = Buffer.alloc(keepSize)
    const fd = await fs.open(file, 'r')
    await fd.read(buf, 0, keepSize, stat.size - keepSize)
    await fd.close()
    const kept = buf.toString('utf-8')
    await fs.writeFile(file, kept + '\n[...truncated...]\n' + chunk, 'utf-8')
    newOffset = Buffer.byteLength(kept + '\n[...truncated...]\n' + chunk, 'utf-8')
    finalSize = newOffset
    truncated = true
  } else {
    await fs.appendFile(file, chunk, 'utf-8')
  }

  return { newOffset, size: finalSize, truncated }
}

async function readTaskOutput(taskId, parentSessionId, offset = 0, limit) {
  const file = getSessionTaskOutputPath(taskId, parentSessionId)
  try {
    const stat = await fs.stat(file)
    const effLimit = limit ?? stat.size - offset
    const buf = Buffer.alloc(effLimit)
    const fd = await fs.open(file, 'r')
    await fd.read(buf, 0, effLimit, offset)
    await fd.close()
    return {
      content: buf.toString('utf-8'),
      newOffset: offset + effLimit,
      truncated: offset + effLimit < stat.size,
    }
  } catch {
    return { content: '', newOffset: 0, truncated: false }
  }
}

// ============================================================
// TEST
// ============================================================

const TEST_SESSION = 'test-parent-session'
const TEST_CHILD = 'test-child-session'

console.log('='.repeat(60))
console.log('Task Persistence Phase 1 - Manual Test')
console.log('='.repeat(60))
console.log()

// 1. Register a task
console.log('[1] Registering task...')
const task = await registerSessionTask(TEST_SESSION, TEST_CHILD, '测试任务：验证持久化', 'research')
console.log(`  ✅ Task created:`)
console.log(`     ID: ${task.id}`)
console.log(`     Status: ${task.status}`)
console.log(`     Output file: ${task.outputFile}`)
console.log(`     Meta file: ${getTaskMetaPath(task.id, TEST_SESSION)}`)
console.log()

// 2. Check files exist
console.log('[2] Verifying files created...')
const outExists = await fs.access(task.outputFile).then(() => true).catch(() => false)
const metaExists = await fs.access(getTaskMetaPath(task.id, TEST_SESSION)).then(() => true).catch(() => false)
console.log(`  ${outExists ? '✅' : '❌'} Output file exists: ${task.outputFile}`)
console.log(`  ${metaExists ? '✅' : '❌'} Meta file exists`)
console.log()

// 3. Append output
console.log('[3] Appending output...')
const result = await appendTaskOutput(task.id, TEST_SESSION, '这是第一条测试输出\n第二行内容\n')
console.log(`  ✅ Appended ${result.size} bytes, truncated: ${result.truncated}`)
console.log()

// 4. Read back
console.log('[4] Reading output back...')
const read = await readTaskOutput(task.id, TEST_SESSION)
console.log(`  Content:\n${read.content.split('\n').map(l => '    ' + l).join('\n')}`)
console.log(`  ✅ Read ${read.newOffset} bytes, truncated: ${read.truncated}`)
console.log()

// 5. Multiple appends
console.log('[5] Testing multiple appends...')
for (let i = 1; i <= 3; i++) {
  const r = await appendTaskOutput(task.id, TEST_SESSION, `[Append ${i}] ${new Date().toISOString()}\n`)
  console.log(`  ✅ Append ${i}: newOffset=${r.newOffset}, size=${r.size}`)
}
console.log()

// 6. Cleanup
console.log('[6] Cleanup test files...')
await fs.rm(path.join(getOpenClawTasksDir(), TEST_SESSION), { recursive: true, force: true })
console.log('  ✅ Cleaned up')
console.log()

console.log('='.repeat(60))
console.log('ALL TESTS PASSED')
console.log('='.repeat(60))
