import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { NotebookConflictError } from "../src/notebook.ts"
import { HostError, runHost } from "../evals/host.ts"
import { main } from "../evals/run.ts"
import { appOnlyTools, startServer } from "../evals/server.ts"
import { MemoryWorkspace } from "../evals/workspace.ts"
import type { Case } from "../evals/grade.ts"
import type { Grade } from "../evals/types.ts"

const STUB = fileURLToPath(new URL("./fixtures/stub-host.mjs", import.meta.url))
const command = ["node", STUB]
const doc = {
  id: "n1",
  title: "One",
  revision: 0,
  cells: [{ id: "c1", type: "music" as const, source: "" }],
}

describe("MemoryWorkspace", () => {
  it("creates, reads, saves and lists newest first", async () => {
    const ws = new MemoryWorkspace([doc])
    const made = await ws.create("Two", "set tempo 90")
    expect(made.revision).toBe(0)
    expect(made.cells).toHaveLength(1)
    expect((await ws.list()).notebooks.map((n) => n.title)).toEqual(["Two", "One"])
    expect((await ws.read(made.id)).cells[0].source).toBe("set tempo 90")
    const saved = await ws.save("n1", [{ id: "c1", type: "music", source: "x" }], 0)
    expect(saved.revision).toBe(1)
    await expect(ws.read()).rejects.toThrow("Choose a notebook ID")
    await expect(ws.read("nope")).rejects.toThrow("Notebook unavailable")
  })
  it("refuses a stale revision and duplicate ids", async () => {
    const ws = new MemoryWorkspace([doc])
    await ws.save("n1", doc.cells, 0)
    await expect(ws.save("n1", doc.cells, 0)).rejects.toBeInstanceOf(NotebookConflictError)
    const twice = [doc.cells[0], doc.cells[0]]
    await expect(ws.save("n1", twice, 1)).rejects.toThrow("Cell IDs must be unique.")
  })
  it("snapshots a copy", async () => {
    const ws = new MemoryWorkspace([doc])
    const snap = ws.snapshot()
    snap[0].title = "changed"
    expect(ws.snapshot()[0].title).toBe("One")
    expect(doc.title).toBe("One")
  })
})

describe("appOnlyTools", () => {
  it("lists the widget's own tools", async () => {
    const tools = await appOnlyTools()
    expect(tools).toEqual(
      expect.arrayContaining(["save_notebook", "notebook_revision", "rename_notebook"]),
    )
    expect(tools).not.toContain("add_music_cell")
  })
})

describe("runHost with the stub", () => {
  let server: Awaited<ReturnType<typeof startServer>>
  beforeAll(async () => {
    server = await startServer()
    return () => server.stop()
  })
  const options = (mcpUrl: string, timeoutMs = 20000) => ({
    prompt: "make a beat",
    mcpUrl,
    model: "claude-stub-1",
    pluginDir: "unused",
    hiddenTools: ["save_notebook"],
    timeoutMs,
    command,
  })

  it("makes a notebook and reads the stream", async () => {
    const ws = new MemoryWorkspace([])
    const result = await runHost(options(server.open("ok", ws)))
    expect(result.calls).toHaveLength(1)
    expect(result.calls[0].name).toBe("create_notebook")
    expect(result.calls[0].isError).toBe(false)
    expect(ws.snapshot()).toHaveLength(1)
    expect(result.turns.map((t) => t.role)).toEqual([
      "system",
      "user",
      "tool_call",
      "tool_result",
      "assistant",
    ])
    expect(result.turns[2].thinking).toBe("A beat.")
    expect(result.reply).toBe("Saved.")
    expect(result.usage?.output_tokens).toBe(5)
    expect(result.costUsd).toBe(0.01)
  })
  it("answers 404 for an unknown run", async () => {
    const url = server.open("x", new MemoryWorkspace([])).replace("/run/x/", "/run/y/")
    expect((await fetch(url, { method: "POST" })).status).toBe(404)
  })
  it("times out and leaves no child", async () => {
    process.env.STUB_MODE = "hang"
    try {
      const started = Date.now()
      await expect(
        runHost(options(server.open("h", new MemoryWorkspace([])), 1000)),
      ).rejects.toMatchObject({
        kind: "timeout",
      })
      expect(Date.now() - started).toBeLessThan(2000 + 6000)
    } finally {
      delete process.env.STUB_MODE
    }
  })
  it("calls a crash a harness error", async () => {
    process.env.STUB_MODE = "crash"
    try {
      const error = await runHost(options(server.open("c", new MemoryWorkspace([])))).catch(
        (e) => e,
      )
      expect(error).toBeInstanceOf(HostError)
      expect(error.kind).toBe("harness")
      expect(error.message).toContain("crashed on purpose")
    } finally {
      delete process.env.STUB_MODE
    }
  })
  it("catches the wrong model", async () => {
    process.env.STUB_MODE = "wrong-model"
    try {
      await expect(
        runHost(options(server.open("w", new MemoryWorkspace([])))),
      ).rejects.toMatchObject({
        kind: "model_mismatch",
      })
    } finally {
      delete process.env.STUB_MODE
    }
  })
})

describe("the runner", () => {
  const dirs: string[] = []
  afterEach(async () => {
    delete process.env.STUB_MODE
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })
  const mk = (id: string): Case => ({
    id,
    group: "drums",
    state: "empty",
    harmony: null,
    writes: "new",
    prompt: `prompt ${id}`,
    fits: () => [],
  })
  const grade = (): Grade => ({
    scores: { pass: 1, saved: 1 },
    explanation: {},
    perf: {
      tool_calls: 1,
      failed_writes: 0,
      dsl_errors: 0,
      redundant_calls: 0,
      lookups: 0,
      tool_errors: 0,
    },
  })
  const run = async (flow: string, extra: string[] = []) => {
    const argv = [
      "--flow",
      flow,
      "--reps",
      "2",
      "--case",
      "a,b",
      "--host-cmd",
      JSON.stringify(command),
      "--model",
      "claude-stub-1",
      ...extra,
    ]
    return main(argv, { cases: [mk("a"), mk("b"), mk("c")], grade })
  }
  const flowDir = async () => {
    const dir = await mkdtemp(join(tmpdir(), "eval-flow-"))
    dirs.push(dir)
    return dir
  }
  const lines = async (path: string) =>
    existsSync(path)
      ? (await readFile(path, "utf8"))
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l))
      : []

  it("writes rows, traces and state, and resumes", async () => {
    const dir = await flowDir()
    expect(await run(dir)).toBe(0)
    const out = join(dir, "baseline")
    const rows = await lines(join(out, "results.jsonl"))
    expect(new Set(rows.map((r) => `${r.prompt_id}/${r.rep}`)).size).toBe(4)
    expect(rows[0].tags).toEqual(["drums", "empty"])
    expect(rows[0].cost_usd).toBe(0.01)
    expect(rows[0].calls[0].name).toBe("create_notebook")
    expect(rows[0].meta.notebooks_before).toEqual([])
    expect(await readdir(join(out, "traces"))).toHaveLength(4)
    expect(existsSync(join(dir, "_state.json"))).toBe(true)
    expect(existsSync(join(out, "summary.md"))).toBe(true)
    expect(JSON.parse(await readFile(join(out, "run.json"), "utf8"))).toMatchObject({
      model: "claude-stub-1",
      sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(await run(dir)).toBe(0)
    expect(await lines(join(out, "results.jsonl"))).toHaveLength(4)
  }, 60000)

  it("keeps truncated runs in the scores as failures and exits 1", async () => {
    const dir = await flowDir()
    process.env.STUB_MODE = "truncated"
    expect(await run(dir)).toBe(1)
    const out = join(dir, "baseline")
    const rows = await lines(join(out, "results.jsonl"))
    expect(rows).toHaveLength(4)
    expect(rows.every((row) => row.status === "truncated" && row.grade.pass === 0)).toBe(true)
    const summary = await readFile(join(out, "summary.md"), "utf8")
    expect(summary).toContain("Rows scored: 4")
    expect(summary).toContain("pass: 0.000")
    expect(await run(dir)).toBe(1)
  }, 60000)

  it("refuses to mix different model or source settings into an existing variant", async () => {
    const dir = await flowDir()
    await run(dir)
    await expect(run(dir, ["--model", "another-model"])).rejects.toThrow(
      /different source or model/,
    )
    const path = join(dir, "baseline", "run.json")
    const manifest = JSON.parse(await readFile(path, "utf8"))
    await writeFile(path, JSON.stringify({ ...manifest, sourceHash: "different" }))
    await expect(run(dir)).rejects.toThrow(/different source or model/)
    expect(await lines(join(dir, "baseline", "results.jsonl"))).toHaveLength(4)
  }, 60000)

  it.each(["reps", "concurrency"])("rejects a fractional --%s", async (option) => {
    const dir = await flowDir()
    await expect(run(dir, [`--${option}`, "0.5"])).rejects.toThrow(/positive integer/)
  })

  it("records failures in errors.jsonl and exits 1", async () => {
    const dir = await flowDir()
    process.env.STUB_MODE = "crash"
    expect(await run(dir)).toBe(1)
    const out = join(dir, "baseline")
    expect(await lines(join(out, "results.jsonl"))).toHaveLength(0)
    const errors = await lines(join(out, "errors.jsonl"))
    expect(errors).toHaveLength(4)
    expect(errors[0].class).toBe("harness")
  }, 60000)

  it("stops scheduling runs at the account limit and records its reason", async () => {
    const dir = await flowDir()
    process.env.STUB_MODE = "usage-limit"
    expect(await run(dir, ["--concurrency", "1"])).toBe(1)
    const errors = await lines(join(dir, "baseline", "errors.jsonl"))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      class: "usage_limit",
      message: expect.stringContaining("5-hour limit"),
    })
  }, 60000)
})
