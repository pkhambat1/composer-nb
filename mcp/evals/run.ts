/* The eval's command line: plays each case through headless Claude Code against the test
   server, grades what was left in the account, and appends a row per run as it finishes,
   so a stopped run resumes where it was and a failed one is retried by running it again.
     npm run eval -- --reps 1 --case h01 */
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { contextText } from "../app/context.ts"
import type { Case } from "./grade.ts"
import { HostError, runHost, type HostResult } from "./host.ts"
import { appOnlyTools, startServer } from "./server.ts"
import { STATES } from "./states.ts"
import { METRICS, PERF_FIELDS, type Grade, type Run } from "./types.ts"
import { MemoryWorkspace } from "./workspace.ts"

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..")

export type Deps = {
  cases?: Case[]
  grade?: (c: Case, run: Run) => Grade
}

type Row = {
  prompt_id: string
  rep: number
  tags: string[]
  grade: Record<string, number>
  latency_s: number
  cost_usd: number
  [key: string]: unknown
}
type ErrorRow = { prompt_id: string; rep: number; class: string; [key: string]: unknown }

function parseArgs(argv: string[]) {
  const values = new Map<string, string>()
  const flags = new Set<string>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument ${arg}`)
    const name = arg.slice(2)
    if (name === "dry-run") flags.add(name)
    else {
      const value = argv[++i]
      if (value === undefined) throw new Error(`--${name} needs a value`)
      values.set(name, value)
    }
  }
  const known = new Set(["flow", "variant", "model", "reps", "timeout-s", "concurrency", "case"])
  for (const key of [...values.keys(), ...flags])
    if (!known.has(key) && key !== "host-cmd" && key !== "dry-run")
      throw new Error(`Unknown option --${key}`)
  const positive = (name: string, fallback: number) => {
    const n = Number(values.get(name) ?? fallback)
    if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} must be a positive number`)
    return n
  }
  const integer = (name: string, fallback: number) => {
    const n = positive(name, fallback)
    if (!Number.isSafeInteger(n)) throw new Error(`--${name} must be a positive integer`)
    return n
  }
  const variant = values.get("variant") ?? "baseline"
  if (!/^(baseline|v\d+)$/.test(variant)) throw new Error("--variant is baseline or v<N>")
  const hostCmd = values.get("host-cmd")
  const command = hostCmd ? (JSON.parse(hostCmd) as unknown) : undefined
  if (command && !(Array.isArray(command) && command.every((x) => typeof x === "string")))
    throw new Error("--host-cmd is a JSON array of strings")
  return {
    flow: values.get("flow") ?? ".claude/hillclimb/plugin-writes",
    variant,
    model: values.get("model") ?? "claude-sonnet-5-5",
    reps: integer("reps", 3),
    timeoutS: positive("timeout-s", 300),
    concurrency: integer("concurrency", 4),
    caseFilter: values.get("case"),
    command: command as string[] | undefined,
    dryRun: flags.has("dry-run"),
  }
}

function selectCases(all: Case[], filter?: string): Case[] {
  if (!filter) return all
  const tests = filter.split(",").map((part) => {
    const escaped = part.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`)
  })
  return all.filter((c) => tests.some((t) => t.test(c.id)))
}

async function readLines<T>(path: string): Promise<T[]> {
  if (!existsSync(path)) return []
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T)
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const fmt = (n: number, digits = 3) => (Number.isFinite(n) ? n.toFixed(digits) : "n/a")
const fmtPerf = (id: string, n: number) => (id === "cost_usd" ? fmt(n, 4) : fmt(n, 2))

/** Observed mean over per-case means; a small fixed suite is not a confidence bound. */
function overCases(rows: Row[], read: (row: Row) => number | undefined) {
  const byCase = new Map<string, number[]>()
  for (const row of rows) {
    const value = read(row)
    if (value === undefined || !Number.isFinite(value)) continue
    byCase.set(row.prompt_id, [...(byCase.get(row.prompt_id) ?? []), value])
  }
  const means = [...byCase.values()].map(mean)
  const m = mean(means)
  return {
    mean: m,
    n: means.length,
  }
}

function summarize(rows: Row[], errors: ErrorRow[], variant: string): string {
  const lines = [`# Eval summary: ${variant}`, ""]
  const classes = new Map<string, number>()
  for (const e of errors) classes.set(e.class, (classes.get(e.class) ?? 0) + 1)
  lines.push(
    `Attempts run: ${rows.length + errors.length}. Rows scored: ${rows.length}. Errors: ` +
      (classes.size ? [...classes].map(([k, v]) => `${k} ${v}`).join(", ") : "none") +
      ".",
    "",
    "## Metrics (observed mean over cases)",
  )
  for (const m of METRICS) {
    const r = overCases(rows, (row) => row.grade[m.id])
    lines.push(`- ${m.label}: ${fmt(r.mean)} (n=${r.n} cases)`)
  }
  lines.push("", "## Per run")
  for (const f of PERF_FIELDS)
    lines.push(`- ${f.label}: ${fmtPerf(f.id, mean(rows.map((r) => Number(r[f.id]))))}`)
  const cost = [...rows, ...errors].reduce((a, r) => a + Number(r.cost_usd ?? 0), 0)
  const elapsed = rows.reduce((a, r) => a + r.latency_s, 0)
  lines.push(
    "",
    `Total measured cost: $${fmt(cost, 4)}. Summed run time: ${fmt(elapsed, 1)} s.`,
    "",
  )
  lines.push("## By group", "")
  const columns = [...METRICS.map((m) => m.label), ...PERF_FIELDS.map((f) => f.label)]
  lines.push(`| group | runs | ${columns.join(" | ")} |`)
  lines.push(`|${"---|".repeat(columns.length + 2)}`)
  for (const group of ["harmony", "literal", "drums", "workflow"]) {
    const part = rows.filter((r) => r.tags[0] === group)
    const cells = [
      ...METRICS.map((m) => fmt(overCases(part, (r) => r.grade[m.id]).mean)),
      ...PERF_FIELDS.map((f) => fmtPerf(f.id, mean(part.map((r) => Number(r[f.id]))))),
    ]
    lines.push(`| ${group} | ${part.length} | ${cells.join(" | ")} |`)
  }
  return lines.join("\n") + "\n"
}

/** A resumed variant must still measure the same plugin, engine and graders. */
async function sourceHash(): Promise<string> {
  const hash = createHash("sha256")
  const add = async (path: string) => {
    hash
      .update(path)
      .update("\0")
      .update(await readFile(join(ROOT, path)))
      .update("\0")
  }
  const walk = async (path: string, allFiles = false) => {
    const entries = await readdir(join(ROOT, path), { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) await walk(child, allFiles)
      else if (entry.isFile() && (allFiles || entry.name.endsWith(".ts"))) await add(child)
    }
  }
  for (const path of ["dsl/js", "mcp/src", "mcp/evals"]) await walk(path)
  await walk("plugin", true)
  for (const path of ["mcp/app/context.ts", "package-lock.json"]) await add(path)
  return hash.digest("hex")
}

export async function main(argv: string[], deps: Deps = {}): Promise<number> {
  const opts = parseArgs(argv)
  const cases = selectCases(deps.cases ?? (await import("./cases.ts")).CASES, opts.caseFilter)
  const grade = deps.grade ?? (await import("./grade.ts")).grade
  if (!cases.length) throw new Error("No case matches --case")
  const outDir = resolve(ROOT, opts.flow, opts.variant)
  const resultsPath = join(outDir, "results.jsonl")
  const errorsPath = join(outDir, "errors.jsonl")

  const done = new Set((await readLines<Row>(resultsPath)).map((r) => `${r.prompt_id}/${r.rep}`))
  const queue: { c: Case; rep: number }[] = []
  for (const c of cases)
    for (let rep = 0; rep < opts.reps; rep++)
      if (!done.has(`${c.id}/${rep}`)) queue.push({ c, rep })

  if (opts.dryRun) {
    const command = opts.command ?? ["claude"]
    console.log(`${cases.length} cases x ${opts.reps} reps, ${queue.length} to run`)
    console.log(queue.map(({ c, rep }) => `${c.id}#${rep}`).join(" "))
    console.log(
      [
        ...command,
        "-p --output-format stream-json --verbose",
        `--model ${opts.model} --restricted --strict-mcp-config`,
        `--mcp-config '{"mcpServers":{"composer-nb":{"type":"http","url":"<url>"}}}'`,
        "--plugin-dir <plugin copy> --tools Skill --allowedTools Skill,mcp__composer-nb__*",
        "--disallowedTools <app-only tools> --permission-mode dontAsk --no-session-persistence",
        "< <prompt>",
      ].join(" "),
    )
    return 0
  }

  const manifestPath = join(outDir, "run.json")
  const manifest = {
    model: opts.model,
    command: opts.command ?? ["claude"],
    sourceHash: await sourceHash(),
  }
  if (existsSync(manifestPath)) {
    const previous = JSON.parse(await readFile(manifestPath, "utf8"))
    if (JSON.stringify(previous) !== JSON.stringify(manifest))
      throw new Error(
        "This variant used different source or model settings. Use a new --variant or --flow.",
      )
  } else if (existsSync(resultsPath) || existsSync(errorsPath)) {
    throw new Error("Existing results have no run.json provenance. Use a new --variant or --flow.")
  }
  await mkdir(join(outDir, "traces"), { recursive: true })
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
  const statePath = resolve(ROOT, opts.flow, "_state.json")
  if (!existsSync(statePath))
    await writeFile(
      statePath,
      JSON.stringify({ metrics: METRICS, perf_fields: PERF_FIELDS }, null, 2) + "\n",
    )

  const tmp = await mkdtemp(join(tmpdir(), "composer-eval-plugin-"))
  const pluginDir = join(tmp, "plugin")
  await cp(join(ROOT, "plugin"), pluginDir, {
    recursive: true,
    filter: (src) => !["mcp.json", ".mcp.json"].includes(basename(src)),
  })
  const server = await startServer()
  const hiddenTools = await appOnlyTools()
  let stopped = false

  const runOne = async (c: Case, rep: number) => {
    const state = STATES[c.state]
    const workspace = new MemoryWorkspace(state.notebooks)
    const before = workspace.snapshot()
    const runId = crypto.randomUUID()
    const url = server.open(runId, workspace)
    const tracePath = join(outDir, "traces", `${c.id}_rep${rep}.json`)
    let prompt = c.prompt
    if (state.open) {
      const doc = before.find((n) => n.id === state.open?.notebookId)
      if (!doc) throw new Error(`State ${c.state} opens a notebook it doesn't hold`)
      prompt = `${contextText(doc, { cells: doc.cells, selectedId: state.open.cellId })}\n\n${c.prompt}`
    }
    const started = performance.now()
    let host: HostResult | undefined
    try {
      host = await runHost({
        prompt,
        mcpUrl: url,
        model: opts.model,
        pluginDir,
        hiddenTools,
        timeoutMs: opts.timeoutS * 1000,
        command: opts.command,
      })
      const latency = (performance.now() - started) / 1000
      if (!host.usage || host.costUsd === null)
        throw new HostError("harness", "The run ended without usage or cost numbers", host)
      const after = workspace.snapshot()
      let graded: Grade
      try {
        graded = grade(c, { before, after, calls: host.calls, reply: host.reply })
      } catch (error) {
        await writeFile(tracePath, JSON.stringify(host.turns, null, 2))
        await appendFile(
          errorsPath,
          JSON.stringify({
            prompt_id: c.id,
            rep,
            class: "grader",
            message: error instanceof Error ? error.message : String(error),
            model: host.model,
            usage: host.usage,
            cost_usd: host.costUsd,
          }) + "\n",
        )
        return
      }
      const truncated = host.stopReason === "max_tokens"
      if (truncated) {
        graded.scores.pass = 0
        graded.explanation.pass = [graded.explanation.pass, "model output was truncated"]
          .filter(Boolean)
          .join("; ")
      }
      const row = {
        prompt_id: c.id,
        rep,
        prompt: c.prompt,
        tags: [c.group, c.state, ...(c.harmony ? [c.harmony] : [])],
        status: truncated ? "truncated" : "ok",
        stop_reason: host.stopReason,
        model: host.model,
        grade: graded.scores,
        explanation: graded.explanation,
        ...graded.perf,
        latency_s: Number(latency.toFixed(2)),
        cost_usd: host.costUsd,
        usage: host.usage,
        meta: {
          state: c.state,
          writes: c.writes,
          notebooks_before: before,
          notebooks_after: after,
        },
        calls: host.calls,
      }
      await writeFile(tracePath, JSON.stringify(host.turns, null, 2))
      await appendFile(resultsPath, JSON.stringify(row) + "\n")
    } catch (error) {
      if (error instanceof HostError && error.kind === "usage_limit") stopped = true
      const partial = error instanceof HostError ? error.partial : undefined
      const turns = host?.turns ?? partial?.turns
      if (turns) await writeFile(tracePath, JSON.stringify(turns, null, 2))
      await appendFile(
        errorsPath,
        JSON.stringify({
          prompt_id: c.id,
          rep,
          class: error instanceof HostError ? error.kind : "harness",
          message: error instanceof Error ? error.message : String(error),
          ...(partial?.model ? { model: partial.model } : {}),
          ...(partial?.usage ? { usage: partial.usage } : {}),
          ...(partial?.costUsd != null ? { cost_usd: partial.costUsd } : {}),
        }) + "\n",
      )
    } finally {
      server.close(runId)
    }
  }

  try {
    let next = 0
    const worker = async () => {
      while (!stopped && next < queue.length) {
        const { c, rep } = queue[next++]
        console.log(`run ${c.id} rep ${rep}`)
        await runOne(c, rep)
      }
    }
    await Promise.all(Array.from({ length: Math.min(opts.concurrency, queue.length) }, worker))
  } finally {
    await server.stop()
    await rm(tmp, { recursive: true, force: true })
  }

  const rows = await readLines<Row & { status: string }>(resultsPath)
  const errors = await readLines<ErrorRow>(errorsPath)
  const text = summarize(rows, errors, opts.variant)
  await writeFile(join(outDir, "summary.md"), text)
  console.log("\n" + text)

  const have = new Set((await readLines<Row>(resultsPath)).map((r) => `${r.prompt_id}/${r.rep}`))
  const missing = cases
    .flatMap((c) => Array.from({ length: opts.reps }, (_, rep) => `${c.id}/${rep}`))
    .filter((key) => !have.has(key))
  return missing.length || rows.some((r) => r.status !== "ok") ? 1 : 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    },
  )
}
