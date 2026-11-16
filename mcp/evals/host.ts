/* Runs one prompt through headless Claude Code with the plugin's skills and the test
   server's tools, and reads its stream-json output into calls, a transcript and numbers. */
import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Call } from "./types.ts"

const PREFIX = "mcp__composer-nb__"

export type Turn = {
  role: "system" | "user" | "assistant" | "tool_call" | "tool_result"
  content: string
  name?: string
  thinking?: string
}
export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}
export type HostResult = {
  events: unknown[]
  calls: Call[]
  reply: string
  turns: Turn[]
  model: string | null
  usage: Usage | null
  costUsd: number | null
  stopReason: string | null
  init: {
    tools: string[]
    mcpServers: { name: string; status: string }[]
    skills: string[]
    plugins: string[]
  } | null
}

export class HostError extends Error {
  kind: "timeout" | "harness" | "model_mismatch" | "usage_limit"
  partial?: Partial<HostResult>
  constructor(
    kind: "timeout" | "harness" | "model_mismatch" | "usage_limit",
    message: string,
    partial?: Partial<HostResult>,
  ) {
    super(message)
    this.kind = kind
    this.partial = partial
  }
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === "string" ? v : "")
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)

function usageOf(v: unknown): Usage | null {
  if (!isObject(v)) return null
  return {
    input_tokens: num(v.input_tokens),
    output_tokens: num(v.output_tokens),
    cache_read_input_tokens: num(v.cache_read_input_tokens),
    cache_creation_input_tokens: num(v.cache_creation_input_tokens),
  }
}
function resultText(content: unknown): string {
  if (typeof content === "string") return content
  return list(content)
    .map((part) => (isObject(part) && part.type === "text" ? str(part.text) : ""))
    .join("")
}
const modelFits = (got: string, wanted: string) =>
  got === wanted || got.startsWith(`${wanted}-`) || got.startsWith(`${wanted}@`)

/** Reads the events in order. Unknown shapes are skipped, never a crash. */
export function readEvents(events: unknown[], prompt: string, wanted: string): HostResult {
  const out: HostResult = {
    events,
    calls: [],
    reply: "",
    turns: [],
    model: null,
    usage: null,
    costUsd: null,
    stopReason: null,
    init: null,
  }
  const pending = new Map<string, Call>()
  let thinking = ""
  let lastText = ""
  let mismatch: string | null = null
  const carry = (turn: Turn): Turn => {
    if (thinking) turn.thinking = thinking
    thinking = ""
    return turn
  }
  for (const event of events) {
    if (!isObject(event)) continue
    if (event.type === "system" && event.subtype === "init") {
      out.init = {
        tools: list(event.tools).map(str),
        mcpServers: list(event.mcp_servers)
          .filter(isObject)
          .map((s) => ({ name: str(s.name), status: str(s.status) })),
        skills: list(event.skills).map(str),
        plugins: list(event.plugins).map((p) => (isObject(p) ? str(p.name) : str(p))),
      }
      out.turns.push({
        role: "system",
        content: `Model ${wanted}, with the plugin's skills and the server's instructions loaded.`,
      })
      out.turns.push({ role: "user", content: prompt })
    } else if (event.type === "assistant" && isObject(event.message)) {
      const message = event.message
      const model = str(message.model)
      if (model && model !== "<synthetic>") {
        out.model = model
        if (!modelFits(model, wanted)) mismatch ??= model
      }
      if (typeof message.stop_reason === "string") out.stopReason = message.stop_reason
      for (const block of list(message.content)) {
        if (!isObject(block)) continue
        if (block.type === "thinking") thinking += str(block.thinking)
        else if (block.type === "text") {
          lastText = str(block.text)
          out.turns.push(carry({ role: "assistant", content: lastText }))
        } else if (block.type === "tool_use") {
          const raw = str(block.name)
          const name = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw
          const input = isObject(block.input) ? block.input : {}
          const call: Call = { name, input, result: "", isError: false }
          out.calls.push(call)
          pending.set(str(block.id), call)
          out.turns.push(
            carry({ role: "tool_call", name, content: JSON.stringify(input, null, 2) }),
          )
        }
      }
    } else if (event.type === "user" && isObject(event.message)) {
      for (const block of list(event.message.content)) {
        if (!isObject(block) || block.type !== "tool_result") continue
        const call = pending.get(str(block.tool_use_id))
        const text = resultText(block.content)
        const isError = block.is_error === true
        if (call) {
          call.result = text
          call.isError = isError
        }
        out.turns.push({
          role: "tool_result",
          name: call?.name,
          content: (isError ? "[error] " : "") + text,
        })
      }
    } else if (event.type === "result") {
      out.usage = usageOf(event.usage)
      out.costUsd = typeof event.total_cost_usd === "number" ? event.total_cost_usd : null
      // Streamed assistant messages carry no stop reason; the result does
      if (typeof event.stop_reason === "string") out.stopReason = event.stop_reason
    }
  }
  out.reply = lastText
  if (mismatch) throw new HostError("model_mismatch", `Asked for ${wanted}, got ${mismatch}`, out)
  return out
}

export async function runHost(options: {
  prompt: string
  mcpUrl: string
  model: string
  pluginDir: string
  hiddenTools: string[]
  timeoutMs: number
  command?: string[]
}): Promise<HostResult> {
  const [bin, ...lead] = options.command ?? ["claude"]
  const mcpConfig = JSON.stringify({
    mcpServers: { "composer-nb": { type: "http", url: options.mcpUrl } },
  })
  const args = [
    ...lead,
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    options.model,
    "--restricted",
    "--strict-mcp-config",
    "--mcp-config",
    mcpConfig,
    "--plugin-dir",
    options.pluginDir,
    "--tools",
    "Skill",
    "--allowedTools",
    `Skill,${PREFIX}*`,
    ...(options.hiddenTools.length
      ? ["--disallowedTools", options.hiddenTools.map((t) => PREFIX + t).join(",")]
      : []),
    "--permission-mode",
    "dontAsk",
    "--no-session-persistence",
  ]
  const cwd = await mkdtemp(join(tmpdir(), "composer-eval-"))
  const child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"] })
  const events: unknown[] = []
  let stderr = ""
  let buffer = ""
  const take = (line: string) => {
    if (!line.trim()) return
    try {
      events.push(JSON.parse(line))
    } catch {
      events.push({ type: "unparsed", line })
    }
  }
  child.stdout.setEncoding("utf8")
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk
    let at: number
    while ((at = buffer.indexOf("\n")) >= 0) {
      take(buffer.slice(0, at))
      buffer = buffer.slice(at + 1)
    }
  })
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => (stderr = (stderr + chunk).slice(-4000)))
  child.stdin.on("error", () => {})
  child.stdin.end(options.prompt)
  const tail = () => `\nstderr: ${stderr.slice(-2000)}`
  const partial = () => {
    try {
      return readEvents(events, options.prompt, options.model)
    } catch (error) {
      return error instanceof HostError ? (error.partial ?? {}) : {}
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let killer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  try {
    const outcome = await new Promise<"exit" | "timeout" | { spawnError: Error }>((resolve) => {
      child.on("error", (spawnError) => resolve({ spawnError }))
      // Reported once the child is gone, so nothing is left running
      child.on("close", () => resolve(timedOut ? "timeout" : "exit"))
      timer = setTimeout(() => {
        timedOut = true
        child.kill("SIGTERM")
        killer = setTimeout(() => child.kill("SIGKILL"), 5000)
      }, options.timeoutMs)
    })
    take(buffer)
    if (typeof outcome === "object")
      throw new HostError("harness", `Could not start ${bin}: ${outcome.spawnError.message}`)
    if (outcome === "timeout")
      throw new HostError("timeout", `No result in ${options.timeoutMs} ms`, partial())
    if (child.exitCode !== 0) {
      const details = partial()
      const reason = details.reply || stderr.slice(-2000)
      throw new HostError(
        /hit your .*limit|usage limit|rate limit/i.test(reason) ? "usage_limit" : "harness",
        `${bin} exited with ${child.exitCode ?? child.signalCode}: ${reason}`,
        details,
      )
    }
    const result = readEvents(events, options.prompt, options.model)
    const done = events.find((e) => isObject(e) && e.type === "result") as Json | undefined
    if (!done) throw new HostError("harness", `No result event${tail()}`, result)
    if (done.is_error === true)
      throw new HostError("harness", `Result is an error: ${str(done.result)}${tail()}`, result)
    const init = result.init
    const server = init?.mcpServers.find((s) => s.name === "composer-nb")
    if (!init || server?.status !== "connected")
      throw new HostError(
        "harness",
        `composer-nb server is ${server?.status ?? "missing"}${tail()}`,
        result,
      )
    if (!init.tools.some((t) => t.startsWith(PREFIX)))
      throw new HostError("harness", `No composer-nb tools were loaded${tail()}`, result)
    // Without its skills the run would measure the server alone, not the plugin
    if (!init.skills.some((s) => s.startsWith("composer-nb:")))
      throw new HostError("harness", `The plugin's skills were not loaded${tail()}`, result)
    return result
  } finally {
    clearTimeout(timer)
    clearTimeout(killer)
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    await rm(cwd, { recursive: true, force: true })
  }
}
