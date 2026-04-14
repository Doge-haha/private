/**
 * @openclaw/agent-mcp-servers
 *
 * Per-agent MCP server management via mcporter daemon.
 *
 * Architecture:
 * - Agent MCP configs defined in workspace/config/agents/<agentId>.mcp.json
 * - On subagent_spawned: connect agent-specific MCP servers via mcporter
 * - On subagent_ended: disconnect agent-specific MCP servers
 * - Agents discover their MCP tools via mcporter CLI calls in task prompts
 *
 * Why plugin, not core patch:
 * - sessions_spawn schema rejects unknown keys (UNSUPPORTED_SESSIONS_SPAWN_PARAM_KEYS)
 * - Modifying minified core JS is fragile and breaks on updates
 * - Plugin hooks (subagent_spawned/ended) provide the right lifecycle points
 * - mcporter daemon already manages MCP connections with auth/retry
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry"
import { execFileSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

// ─── Types ───────────────────────────────────────────────

interface McpServerConfig {
  /** Stdio command (e.g. "bun", "npx") */
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** HTTP/SSE URL */
  url?: string
  headers?: Record<string, string>
}

interface AgentMcpConfig {
  /** Agent ID (e.g. "dev", "research") */
  agentId: string
  /** MCP servers to connect when this agent spawns */
  servers: Record<string, McpServerConfig>
}

// ─── Config Loading ──────────────────────────────────────

const WORKSPACE = process.env.OPENCLAW_WORKSPACE ?? join(process.env.HOME!, ".openclaw/workspace")
const AGENT_MCP_DIR = join(WORKSPACE, "config", "agents")
const MCPORTER = "mcporter"

function loadAgentMcpConfig(agentId: string): AgentMcpConfig | null {
  const configPath = join(AGENT_MCP_DIR, `${agentId}.mcp.json`)
  if (!existsSync(configPath)) return null
  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as AgentMcpConfig
  } catch (err) {
    console.error(`[agent-mcp-servers] Failed to load config for ${agentId}:`, err)
    return null
  }
}

// ─── mcporter CLI wrapper ────────────────────────────────

function mcporter(args: string[], timeoutMs = 15_000): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(MCPORTER, args, {
      timeout: timeoutMs,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
    })
    return { ok: true, stdout, stderr: "" }
  } catch (err: any) {
    return {
      ok: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? String(err),
    }
  }
}

/**
 * Ensure mcporter daemon is running
 */
function ensureDaemon(): boolean {
  const status = mcporter(["daemon", "status", "--output", "json"])
  if (status.ok) return true
  console.log("[agent-mcp-servers] Starting mcporter daemon...")
  const start = mcporter(["daemon", "start", "--output", "json"])
  return start.ok
}

/**
 * Connect an MCP server via mcporter config + daemon
 * Returns the prefixed tool names for injection into agent prompts
 */
function connectServer(name: string, config: McpServerConfig): string[] {
  // 1. Add server to mcporter config
  const serverJson = JSON.stringify(config)
  const addResult = mcporter(["config", "add", name, "--server", serverJson])
  if (!addResult.ok) {
    console.error(`[agent-mcp-servers] Failed to add server ${name}: ${addResult.stderr}`)
    return []
  }

  // 2. Restart daemon to pick up new config
  mcporter(["daemon", "restart"])

  // 3. List tools for this server
  const listResult = mcporter(["list", name, "--schema", "--output", "json"])
  if (!listResult.ok) {
    console.error(`[agent-mcp-servers] Failed to list tools for ${name}: ${listResult.stderr}`)
    return []
  }

  try {
    const parsed = JSON.parse(listResult.stdout)
    const tools: string[] = (parsed.servers?.[0]?.tools ?? []).map((t: any) => `${name}.${t.name}`)
    console.log(`[agent-mcp-servers] Connected ${name}: ${tools.length} tools (${tools.join(", ")})`)
    return tools
  } catch {
    return []
  }
}

/**
 * Remove an MCP server from mcporter config
 */
function disconnectServer(name: string): void {
  const result = mcporter(["config", "remove", name])
  if (!result.ok) {
    console.error(`[agent-mcp-servers] Failed to remove server ${name}: ${result.stderr}`)
    return
  }
  mcporter(["daemon", "restart"])
  console.log(`[agent-mcp-servers] Disconnected ${name}`)
}

// ─── Runtime State ───────────────────────────────────────

/** Track which servers are owned by which subagent session */
const sessionServers = new Map<string, Set<string>>()

// ─── Plugin Entry ────────────────────────────────────────

export default definePluginEntry({
  id: "agent-mcp-servers",
  name: "Per-Agent MCP Servers",
  description:
    "Connects agent-specific MCP servers on subagent_spawned, disconnects on subagent_ended. " +
    "Config: workspace/config/agents/<agentId>.mcp.json",

  register(api) {
    ensureDaemon()

    api.registerHook("subagent_spawned", async (event) => {
      const { childSessionKey, agentId } = event
      if (!agentId) return

      const config = loadAgentMcpConfig(agentId)
      if (!config || Object.keys(config.servers).length === 0) return

      console.log(`[agent-mcp-servers] Agent ${agentId} spawning, connecting ${Object.keys(config.servers).length} MCP servers...`)

      const connectedServers = new Set<string>()
      const allTools: string[] = []

      for (const [name, serverConfig] of Object.entries(config.servers)) {
        // Prefix server name with agentId to avoid collisions
        const prefixedName = `${agentId}__${name}`
        const tools = connectServer(prefixedName, serverConfig)
        if (tools.length > 0) {
          connectedServers.add(prefixedName)
          allTools.push(...tools)
        }
      }

      if (connectedServers.size > 0) {
        sessionServers.set(childSessionKey, connectedServers)
        console.log(`[agent-mcp-servers] Agent ${agentId} MCP ready: ${allTools.join(", ")}`)
      }
    })

    api.registerHook("subagent_ended", async (event) => {
      const { targetSessionKey } = event
      const servers = sessionServers.get(targetSessionKey)
      if (!servers || servers.size === 0) return

      console.log(`[agent-mcp-servers] Session ${targetSessionKey} ended, disconnecting ${servers.size} MCP servers...`)
      for (const name of servers) {
        disconnectServer(name)
      }
      sessionServers.delete(targetSessionKey)
    })
  },
})
