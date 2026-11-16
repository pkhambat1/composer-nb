/* A stand-in for `claude -p` in the eval's tests: connects to the server named by
   --mcp-config, creates one notebook and prints stream-json the way the real host does.
   STUB_MODE: hang | crash | wrong-model */
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

const mode = process.env.STUB_MODE
if (mode === "hang") setInterval(() => {}, 1000)
else {
  if (mode === "crash") {
    console.error("stub host crashed on purpose")
    process.exit(1)
  }
  const args = process.argv.slice(2)
  const config = JSON.parse(args[args.indexOf("--mcp-config") + 1])
  const url = config.mcpServers["composer-nb"].url
  let prompt = ""
  for await (const chunk of process.stdin) prompt += chunk

  const client = new Client({ name: "stub-host", version: "0.0.0" })
  await client.connect(new StreamableHTTPClientTransport(new URL(url)))
  const { tools } = await client.listTools()
  const model = mode === "wrong-model" ? "claude-other-1" : "claude-stub-1-20260101"
  const out = (event) => console.log(JSON.stringify(event))
  out({
    type: "system",
    subtype: "init",
    model,
    tools: ["Skill", ...tools.map((t) => `mcp__composer-nb__${t.name}`)],
    mcp_servers: [{ name: "composer-nb", status: "connected" }],
    skills: ["composer-nb:write-cells"],
    plugins: ["composer-nb"],
  })
  const input = {
    title: "Stub groove",
    source:
      "set tempo 100\n\npattern beat = {\n  hat: x-,\n  snare: ---- x---,\n  kick: x--- --x- x--- ----,\n}\n\nplay beat for 2 bars",
  }
  const usage = {
    input_tokens: 10,
    output_tokens: 5,
    cache_read_input_tokens: 2,
    cache_creation_input_tokens: 1,
  }
  out({
    type: "assistant",
    message: {
      model,
      stop_reason: "tool_use",
      usage,
      content: [
        { type: "thinking", thinking: "A beat." },
        { type: "tool_use", id: "t1", name: "mcp__composer-nb__create_notebook", input },
      ],
    },
  })
  const result = await client.callTool({ name: "create_notebook", arguments: input })
  out({
    type: "user",
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: "t1",
          content: result.content,
          is_error: result.isError === true,
        },
      ],
    },
  })
  out({
    type: "assistant",
    message: { model, stop_reason: "end_turn", usage, content: [{ type: "text", text: "Saved." }] },
  })
  out({
    type: "result",
    subtype: "success",
    is_error: false,
    total_cost_usd: 0.01,
    usage,
    num_turns: 2,
    duration_ms: 5,
    result: "Saved.",
  })
  await client.close()
}
