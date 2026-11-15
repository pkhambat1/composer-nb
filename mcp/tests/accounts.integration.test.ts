import { readFileSync } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createHostedApp } from "../src/hosted.ts"
import { notebookOf, notebookSchema } from "../src/notebook-document.ts"
import { ComposerOAuthProvider } from "../src/oauth.ts"
import { SupabaseOAuthStore } from "../src/oauth-store.ts"

// Opt in with a local Supabase status JSON file. Never run against hosted data.
const statusPath = process.env.COMPOSER_TEST_SUPABASE_STATUS
describe.skipIf(!statusPath)("account-linked MCP with real local Supabase", () => {
  const status = statusPath
    ? (JSON.parse(readFileSync(statusPath, "utf8")) as Record<string, string>)
    : {}
  const url = status.API_URL || "http://127.0.0.1:54321"
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Integration tests require a local Supabase")
  const db = createClient(url, status.SERVICE_ROLE_KEY || "not-running", {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const origin = "http://127.0.0.1:4187"
  const provider = new ComposerOAuthProvider(new SupabaseOAuthStore(db), origin)
  const app = createHostedApp(
    { origin, supabaseUrl: url, serviceKey: status.SERVICE_ROLE_KEY || "not-running" },
    { db, provider },
  )
  let server: ReturnType<typeof app.listen>, base: string
  const owners: string[] = [],
    clientIds: string[] = [],
    clients: Client[] = []
  const sessions: Array<{ ownerId: string; sessionToken: string; oauthToken: string }> = []
  const post = (path: string, data: Record<string, string>) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(data),
    })
  async function connect(token?: string) {
    const client = new Client({ name: "account-test", version: "1" })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
        requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      }),
    )
    clients.push(client)
    return client
  }
  async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
    return CallToolResultSchema.parse(await client.callTool({ name, arguments: args }))
  }
  beforeAll(async () => {
    server = app.listen(0, "127.0.0.1")
    await new Promise<void>((resolve) => server.once("listening", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("No test server")
    base = `http://127.0.0.1:${address.port}`
    for (let i = 0; i < 2; i++) {
      const email = `mcp-test-${randomUUID()}@composer.local`,
        password = randomUUID() + "Aa1!"
      const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
      if (created.error || !created.data.user) throw created.error
      const ownerId = created.data.user.id
      owners.push(ownerId)
      const login = await createClient(url, status.ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      }).auth.signInWithPassword({ email, password })
      if (login.error || !login.data.session) throw login.error
      const sessionToken = login.data.session.access_token
      const registered = await fetch(base + "/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Integration host",
          redirect_uris: ["https://client.example/callback"],
          token_endpoint_auth_method: "none",
        }),
      })
      expect(registered.status).toBe(201)
      const { client_id: clientId } = await registered.json()
      clientIds.push(clientId)
      const verifier = "a".repeat(64)
      const auth = await fetch(
        base +
          "/authorize?" +
          new URLSearchParams({
            client_id: clientId,
            response_type: "code",
            redirect_uri: "https://client.example/callback",
            code_challenge_method: "S256",
            code_challenge: createHash("sha256").update(verifier).digest("base64url"),
            resource: origin + "/mcp",
            scope: "notebooks:read notebooks:write",
            state: "integration",
          }),
        { redirect: "manual" },
      )
      const requestId = new URL(auth.headers.get("location")!).searchParams.get("request")!
      const headers = {
        Authorization: `Bearer ${sessionToken}`,
        Origin: origin,
        "Content-Type": "application/json",
      }
      const detail = await fetch(base + `/oauth/request?request=${requestId}`, { headers })
      expect(detail.status).toBe(200)
      const wrongOrigin = await fetch(base + "/oauth/decision", {
        method: "POST",
        headers: { ...headers, Origin: "https://attacker.example" },
        body: JSON.stringify({ requestId, approve: true }),
      })
      expect(wrongOrigin.status).toBe(403)
      const approval = await fetch(base + "/oauth/decision", {
        method: "POST",
        headers,
        body: JSON.stringify({ requestId, approve: true }),
      })
      expect(approval.status).toBe(200)
      const redirect = new URL((await approval.json()).redirectUrl)
      expect(redirect.searchParams.get("state")).toBe("integration")
      const response = await post("/token", {
        grant_type: "authorization_code",
        client_id: clientId,
        code: redirect.searchParams.get("code")!,
        code_verifier: verifier,
        redirect_uri: "https://client.example/callback",
        resource: origin + "/mcp",
      })
      expect(response.status).toBe(200)
      const tokens = await response.json()
      sessions.push({ ownerId, sessionToken, oauthToken: tokens.access_token })
    }
  }, 30000)
  afterAll(async () => {
    for (const client of clients) await client.close()
    server?.close()
    // Only test-created accounts are removed; their rows cascade.
    for (const id of owners) await db.auth.admin.deleteUser(id)
    for (const id of clientIds)
      await db
        .from("mcp_oauth_records")
        .delete()
        .eq("kind", "client")
        .eq("key_hash", createHash("sha256").update(id).digest("hex"))
  })
  it("requires a linked account for every MCP operation, including music tools and UI resources", async () => {
    for (const method of ["initialize", "tools/list", "tools/call", "resources/read"]) {
      const response = await fetch(base + "/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params: { name: "parse", arguments: { source: "play piano: chords 1" } },
        }),
      })
      expect(response.status).toBe(401)
      expect(response.headers.get("www-authenticate")).toContain("resource_metadata")
    }
    for (const token of ["invalid-token", sessions[0].sessionToken]) {
      const response = await fetch(base + "/mcp", { headers: { Authorization: `Bearer ${token}` } })
      expect(response.status).toBe(401)
    }
    const linked = await connect(sessions[0].oauthToken)
    expect((await call(linked, "parse", { source: "play piano: chords 1" })).isError).toBeFalsy()
    const { tools } = await linked.listTools()
    for (const tool of tools) {
      expect(tool._meta?.securitySchemes).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "oauth2" })]),
      )
      expect(tool._meta?.securitySchemes).not.toContainEqual({ type: "noauth" })
    }
    expect(tools.find((t) => t.name === "save_notebook")?._meta?.securitySchemes).toEqual([
      { type: "oauth2", scopes: ["notebooks:read", "notebooks:write"] },
    ])
  })
  it("shares real website documents, rejects other owners and preserves edits on stale revisions", async () => {
    const alice = await connect(sessions[0].oauthToken),
      bob = await connect(sessions[1].oauthToken)
    const created = await call(alice, "create_notebook", { title: "Account integration test" })
    const notebook = notebookSchema.parse(notebookOf(created))
    const second = notebookSchema.parse(
      notebookOf(await call(alice, "create_notebook", { title: "Second notebook" })),
    )
    expect((await call(bob, "get_notebook", { notebookId: notebook.id })).isError).toBe(true)
    expect(
      (
        await call(bob, "save_notebook", {
          notebookId: notebook.id,
          expectedRevision: notebook.revision,
          cells: [],
        })
      ).isError,
    ).toBe(true)
    const saved = await call(alice, "update_music_cell", {
      notebookId: notebook.id,
      cellId: notebook.cells[0].id,
      expectedRevision: notebook.revision,
      source: "play piano: chords 1maj7 | 4m6",
    })
    const after = notebookSchema.parse(notebookOf(saved))
    expect(after.revision).toBe(notebook.revision + 1)
    expect(
      (
        await call(alice, "save_notebook", {
          notebookId: notebook.id,
          expectedRevision: notebook.revision,
          cells: [],
        })
      ).isError,
    ).toBe(true)
    expect(
      notebookSchema.parse(
        (await call(alice, "get_notebook", { notebookId: second.id })).structuredContent?.notebook,
      ).cells[0].source,
    ).toBe("")
    const website = createClient(url, status.ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${sessions[0].sessionToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const row = await website
      .from("notebooks")
      .select("document,revision")
      .eq("id", notebook.id)
      .single()
    expect(row.error).toBeNull()
    expect(row.data?.document.cells).toEqual(after.cells)
    const draft = await call(alice, "save_notebook", {
      notebookId: notebook.id,
      expectedRevision: after.revision,
      cells: [{ ...after.cells[0], source: "pattern unfinished = {" }],
    })
    expect(draft.isError).toBeFalsy()
    const profile = await call(alice, "get_profile")
    expect(profile.structuredContent?.id).toBe(sessions[0].ownerId)
    expect(JSON.stringify((await call(bob, "list_notebooks")).structuredContent)).not.toContain(
      notebook.id,
    )
  })
  it("keeps OAuth storage and privileged saves inaccessible to website sessions", async () => {
    const website = createClient(url, status.ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${sessions[0].sessionToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    expect((await website.from("mcp_oauth_records").select("*")).error).toBeTruthy()
    expect(
      (
        await website.rpc("save_mcp_notebook", {
          notebook_id: randomUUID(),
          notebook_owner: sessions[1].ownerId,
          expected_revision: 1,
          new_document: { version: 1, cells: [] },
        })
      ).error,
    ).toBeTruthy()
  })
  it("saves composed music atomically in a new or existing notebook and reports the destination", async () => {
    const client = await connect(sessions[1].oauthToken)
    const { tools } = await client.listTools()
    expect(tools.find((t) => t.name === "parse")?._meta?.ui).not.toHaveProperty("resourceUri")
    const before = await call(client, "list_notebooks")
    const invalid = await call(client, "create_notebook", {
      title: "Invalid composition",
      source: "play missingPattern",
    })
    expect(invalid.isError).toBe(true)
    expect((await call(client, "list_notebooks")).structuredContent).toEqual(
      before.structuredContent,
    )
    const source = "set tempo 76\npattern beat = { kick: x---, hat: x-, }\nplay beat for 2 bars"
    expect((await call(client, "parse", { source })).isError).toBeFalsy()
    expect((await call(client, "list_notebooks")).structuredContent).toEqual(
      before.structuredContent,
    )
    const created = await call(client, "create_notebook", { title: "My groove", source })
    const notebook = notebookSchema.parse(notebookOf(created))
    expect(notebook.cells[0].source).toBe(source)
    expect(created.structuredContent?.change).toContain('Created notebook "My groove"')
    const appended = await call(client, "add_music_cell", {
      notebookId: notebook.id,
      source: "play beat for 4 bars",
    })
    const after = notebookSchema.parse(notebookOf(appended))
    expect(after.cells[0]).toEqual(notebook.cells[0])
    expect(after.cells[1].source).toBe("play beat for 4 bars")
    expect(appended.structuredContent?.change).toContain('Added cell 2 to "My groove"')
    const rejected = await call(client, "add_music_cell", {
      notebookId: notebook.id,
      source: "play missingPattern",
    })
    expect(rejected.isError).toBe(true)
    expect(
      (await call(client, "get_notebook", { notebookId: notebook.id })).structuredContent?.notebook,
    ).toEqual(after)
  })
  it("persists credentials across server instances and immediately enforces disconnect", async () => {
    const independent = new ComposerOAuthProvider(new SupabaseOAuthStore(db), origin)
    expect((await independent.verifyAccessToken(sessions[0].oauthToken)).extra?.ownerId).toBe(
      sessions[0].ownerId,
    )
    const response = await fetch(base + "/oauth/connections", {
      headers: { Authorization: `Bearer ${sessions[0].sessionToken}` },
    })
    const { connections } = await response.json()
    expect(connections).toHaveLength(1)
    const revoke = await fetch(base + "/oauth/disconnect", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessions[0].sessionToken}`,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: connections[0].id }),
    })
    expect(revoke.status).toBe(200)
    const denied = await fetch(base + "/mcp", {
      headers: { Authorization: `Bearer ${sessions[0].oauthToken}` },
    })
    expect(denied.status).toBe(401)
    expect(denied.headers.get("www-authenticate")).toContain("resource_metadata")
    await expect(independent.verifyAccessToken(sessions[1].oauthToken)).resolves.toBeTruthy()
  })
})
