# Graph Report - .  (2026-04-13)

## Corpus Check
- 62 files · ~29,609 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 152 nodes · 192 edges · 20 communities detected
- Extraction: 89% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `The Prime (主脑)` - 16 edges
2. `Coordinator (主协调者)` - 13 edges
3. `4-Class Memory System` - 11 edges
4. `4-Class Memory (user/feedback/project/reference)` - 10 edges
5. `Continue/Spawn Decision Engine (skill)` - 10 edges
6. `@prime Agent` - 9 edges
7. `CircuitBreaker` - 8 edges
8. `7 TaskTypes (b/a/r/t/w/m/d)` - 8 edges
9. `compaction-plus Plugin` - 7 edges
10. `Council Routing` - 6 edges

## Surprising Connections (you probably didn't know these)
- `No Auto-Retry (coordinator decides)` --design_constraint--> `The Prime (主脑)`  [INFERRED]
  coordinator/coordinatorMode.ts → SOUL.md
- `方案B: File Overlap ≥ 0.5 Forces Continue` --design_insight--> `The Prime (主脑)`  [INFERRED]
  skills/continue-spawn-decision/decision.ts → SOUL.md
- `Coordinator (主协调者)` --same_as--> `The Prime (主脑)`  [INFERRED]
  coordinator/coordinatorMode.ts → SOUL.md
- `task-notification XML (worker result)` --delivered_to--> `The Prime (主脑)`  [INFERRED]
  coordinator/coordinatorMode.ts → SOUL.md
- `local_agent Task (a)` --spawns--> `@prime Agent`  [INFERRED]
  tasks/types.ts → AGENTS.md

## Communities

### Community 0 - "Circuit Breaker Pattern"
Cohesion: 0.1
Nodes (23): Daily Log Mode (KAIROS), MEMORY.md Index Pattern, 4-Class Memory (user/feedback/project/reference), Memory Drift Caveat (verify before use), Memory Exclusions (no code patterns/git/fixes), feedback Memory Type (+Why +How), project Memory Type, reference Memory Type (+15 more)

### Community 1 - "Memory Recall System"
Cohesion: 0.1
Nodes (14): outputFile Persistence, CircuitBreaker, 9-Segment Structured Summary, Circuit Breaker Integration, Extractive Fallback (no model), generateSummary(), Summary Merge Strategy, Partial Compaction (preserve early summaries) (+6 more)

### Community 2 - "Memory Extraction System"
Cohesion: 0.14
Nodes (20): AgentTool (spawn workers), Context Overlap判断 (high→continue, low→spawn), Continue vs Spawn Decision, Coordinator (主协调者), Fan-Out Research (parallel), No Auto-Retry (coordinator decides), SendMessageTool (continue worker), Synthesize Before Delegation (+12 more)

### Community 3 - "Agent Council & Task Routing"
Cohesion: 0.27
Nodes (10): detectScene(), formatMemoriesForContext(), getRelevantMemoriesContext(), getTypesForScene(), memoryAgeDays(), parseFrontmatter(), readMemoryFile(), recallByScene() (+2 more)

### Community 4 - "4-Class Memory Taxonomy"
Cohesion: 0.22
Nodes (13): Council Routing, @dev Agent, @prime Agent, @research Agent, Task Workflow (research→prime→dev), Two-Layer Verification, D001: Session-level Agent Routing, KR1: 打造全能型 OpenClaw Agent (+5 more)

### Community 5 - "Compaction Plus Plugin"
Cohesion: 0.19
Nodes (13): USER_md, CLAUDE.md Loading, Conditional Rules (glob pattern), Coordinator Permission Handler, Permission Classifier (BASH_CLASSIFIER), Permission Dialog (fallback), Permission Hooks (automated), .claude/rules/ Directory Loading (+5 more)

### Community 6 - "Sentinel & Cron Automation"
Cohesion: 0.2
Nodes (10): dream Task (d), in_process_teammate Task (t), local_agent Task (a), local_bash Task (b), monitor_mcp Task (m), ProgressTracker (token/tool use), remote_agent Task (r), 7 TaskTypes (b/a/r/t/w/m/d) (+2 more)

### Community 7 - "Compaction Core"
Cohesion: 0.36
Nodes (7): buildMemoryExtractionPrompt(), countToolCallsSince(), estimateTokenCount(), extractMemoryTask(), formatMessagesForPrompt(), hasToolCallsInLastAssistantTurn(), shouldExtractMemory()

### Community 8 - "Summarizer Module"
Cohesion: 0.29
Nodes (7): Cron Automation Schedule, FlushGate Message Batching, @sentinel Agent, Continuous Patrol (2h interval), Morning Report (09:30), HEARTBEAT_OK Signal, Sentinel 24/7 Monitoring

### Community 9 - "Partial Compaction Module"
Cohesion: 0.6
Nodes (3): buildExtractiveFallback(), extractText(), generateSummary()

### Community 10 - "Custom Commands"
Cohesion: 0.5
Nodes (2): escapeRegex(), extractSegment()

### Community 11 - "Decision Log"
Cohesion: 0.67
Nodes (2): extractText(), splitForPartialCompaction()

### Community 12 - "The Prime & Soul"
Cohesion: 1.0
Nodes (2): 5 TaskStatuses (pending/running/completed/failed/killed), 5 Task Statuses (pending/running/completed/failed/killed)

### Community 13 - "HEARTBEAT System"
Cohesion: 1.0
Nodes (1): Custom Commands (/slim, /checkpoint)

### Community 14 - "Claude Code: Coordinator"
Cohesion: 1.0
Nodes (1): DECISIONS.md (Decision Log)

### Community 15 - "Claude Code: Memory System"
Cohesion: 1.0
Nodes (1): Search Past Context (grep sessions)

### Community 16 - "Claude Code: Task System"
Cohesion: 1.0
Nodes (1): Continue/Spawn Decision Table

### Community 17 - "Claude Code: Permission System"
Cohesion: 1.0
Nodes (1): outputFile Truncation (100KB max)

### Community 18 - "Claude Code ↔ OpenClaw Bridges"
Cohesion: 1.0
Nodes (1): Layer1Verification Output Structure

### Community 19 - "Decision Engine (今日新增)"
Cohesion: 1.0
Nodes (1): Layer2Verification Output Structure

## Knowledge Gaps
- **50 isolated node(s):** `Cron Automation Schedule`, `FlushGate Message Batching`, `Custom Commands (/slim, /checkpoint)`, `Morning Report (09:30)`, `Evening Summary (17:00)` (+45 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `The Prime & Soul`** (2 nodes): `5 TaskStatuses (pending/running/completed/failed/killed)`, `5 Task Statuses (pending/running/completed/failed/killed)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HEARTBEAT System`** (1 nodes): `Custom Commands (/slim, /checkpoint)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Claude Code: Coordinator`** (1 nodes): `DECISIONS.md (Decision Log)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Claude Code: Memory System`** (1 nodes): `Search Past Context (grep sessions)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Claude Code: Task System`** (1 nodes): `Continue/Spawn Decision Table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Claude Code: Permission System`** (1 nodes): `outputFile Truncation (100KB max)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Claude Code ↔ OpenClaw Bridges`** (1 nodes): `Layer1Verification Output Structure`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Decision Engine (今日新增)`** (1 nodes): `Layer2Verification Output Structure`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `The Prime (主脑)` connect `Compaction Plus Plugin` to `Circuit Breaker Pattern`, `Memory Recall System`, `Memory Extraction System`, `4-Class Memory Taxonomy`?**
  _High betweenness centrality (0.250) - this node is a cross-community bridge._
- **Why does `@prime Agent` connect `4-Class Memory Taxonomy` to `Memory Extraction System`, `Compaction Plus Plugin`, `Sentinel & Cron Automation`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **Why does `Coordinator (主协调者)` connect `Memory Extraction System` to `Circuit Breaker Pattern`, `4-Class Memory Taxonomy`, `Compaction Plus Plugin`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `The Prime (主脑)` (e.g. with `Coordinator (主协调者)` and `task-notification XML (worker result)`) actually correct?**
  _`The Prime (主脑)` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Coordinator (主协调者)` (e.g. with `The Prime (主脑)` and `Continue/Spawn Decision Engine (skill)`) actually correct?**
  _`Coordinator (主协调者)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Cron Automation Schedule`, `FlushGate Message Batching`, `Custom Commands (/slim, /checkpoint)` to the rest of the system?**
  _50 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Circuit Breaker Pattern` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._