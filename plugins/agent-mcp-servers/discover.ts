/**
 * Agent MCP Discovery Helper
 *
 * Subagents call this to discover their available MCP tools at runtime.
 * Usage: npx tsx plugins/agent-mcp-servers/discover.ts <agentId>
 * Output: JSON array of { server, tool, description } objects
 */

import { execFileSync } from "child_process"

const MCPORTER = "mcporter"
const agentId = process.argv[2]

if (!agentId) {
  console.error("Usage: discover.ts <agentId>")
  process.exit(1)
}

try {
  const stdout = execFileSync(MCPORTER, ["list", "--output", "json"], {
    timeout: 10_000,
    encoding: "utf-8",
  })
  const parsed = JSON.parse(stdout)

  // Filter servers prefixed with this agent's ID
  const prefix = `${agentId}__`
  const results: Array<{ server: string; tool: string; description: string }> = []

  for (const server of parsed.servers ?? []) {
    if (!server.name.startsWith(prefix)) continue
    for (const tool of server.tools ?? []) {
      results.push({
        server: server.name,
        tool: `${server.name}.${tool.name}`,
        description: tool.description ?? "",
      })
    }
  }

  console.log(JSON.stringify(results, null, 2))
} catch (err: any) {
  console.error(`Failed to discover MCP tools for ${agentId}:`, err.message)
  console.log("[]")
}
