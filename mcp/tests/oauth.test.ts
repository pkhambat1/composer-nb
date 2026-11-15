import { createHash, randomUUID } from "node:crypto"
import express from "express"
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ComposerOAuthProvider } from "../src/oauth.ts"
import {
  tokenHash,
  type OAuthStore,
  type OAuthRecord,
  type RecordKind,
} from "../src/oauth-store.ts"

class MemoryStore implements OAuthStore {
  records = new Map<string, OAuthRecord>()
  async get(kind: RecordKind, key: string) {
    return structuredClone(this.records.get(kind + tokenHash(key)) || null)
  }
  async put(
    kind: RecordKind,
    key: string,
    payload: Record<string, unknown>,
    expiresAt: number | null,
  ) {
    this.records.set(kind + tokenHash(key), {
      payload,
      consumed_at: null,
      expires_at: expiresAt === null ? null : new Date(expiresAt * 1000).toISOString(),
    })
  }
  async consume(kind: RecordKind, key: string) {
    const record = this.records.get(kind + tokenHash(key))
    if (
      !record ||
      record.consumed_at ||
      (record.expires_at && Date.parse(record.expires_at) <= Date.now())
    )
      return null
    record.consumed_at = new Date().toISOString()
    return structuredClone(record)
  }
  async grants(ownerId: string) {
    return [...this.records.entries()]
      .filter(([k, v]) => k.startsWith("grant") && v.payload.ownerId === ownerId && !v.consumed_at)
      .map(([, v]) => v)
  }
}
const origin = "https://composer.example"
const resource = `${origin}/mcp`
const store = new MemoryStore()
const provider = new ComposerOAuthProvider(store, origin)
const app = express()
app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: new URL(origin),
    resourceServerUrl: new URL(resource),
    scopesSupported: ["notebooks:read", "notebooks:write"],
    tokenOptions: { rateLimit: false },
    authorizationOptions: { rateLimit: false },
    clientRegistrationOptions: { rateLimit: false },
  }),
)
let server: ReturnType<typeof app.listen>, base: string
beforeAll(async () => {
  server = app.listen(0, "127.0.0.1")
  await new Promise<void>((resolve) => server.once("listening", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("No test server")
  base = `http://127.0.0.1:${address.port}`
})
afterAll(() => server.close())
const post = (path: string, data: Record<string, string>) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(data),
  })
async function client(scope?: string) {
  const response = await fetch(base + "/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Test composer host",
      redirect_uris: ["https://client.example/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope,
    }),
  })
  expect(response.status).toBe(201)
  return response.json() as Promise<{ client_id: string }>
}
async function authorization(scopes = "notebooks:read notebooks:write") {
  const registered = await client(),
    ownerId = randomUUID(),
    verifier = "a".repeat(64)
  const params = new URLSearchParams({
    client_id: registered.client_id,
    redirect_uri: "https://client.example/callback",
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    resource,
    scope: scopes,
    state: "preserve-this-state",
  })
  const response = await fetch(`${base}/authorize?${params}`, { redirect: "manual" })
  const requestId = new URL(response.headers.get("location")!).searchParams.get("request")!
  expect(requestId).toBeTruthy()
  const redirect = new URL(await provider.decide(requestId, ownerId, true))
  expect(redirect.searchParams.get("state")).toBe("preserve-this-state")
  return {
    clientId: registered.client_id,
    code: redirect.searchParams.get("code")!,
    verifier,
    ownerId,
    requestId,
  }
}
async function tokens(scopes?: string) {
  const a = await authorization(scopes)
  const response = await exchange(a)
  expect(response.status).toBe(200)
  return { ...a, ...((await response.json()) as { access_token: string; refresh_token: string }) }
}
function exchange(
  a: Awaited<ReturnType<typeof authorization>>,
  patch: Record<string, string> = {},
) {
  return post("/token", {
    grant_type: "authorization_code",
    client_id: a.clientId,
    code: a.code,
    code_verifier: a.verifier,
    redirect_uri: "https://client.example/callback",
    resource,
    ...patch,
  })
}

describe("OAuth through the standard MCP SDK endpoints", () => {
  it("advertises protected resource discovery and S256 PKCE", async () => {
    const metadata = await (await fetch(base + "/.well-known/oauth-protected-resource/mcp")).json()
    expect(metadata.resource).toBe(resource)
    expect(metadata.authorization_servers).toEqual([origin + "/"])
    const oauth = await (await fetch(base + "/.well-known/oauth-authorization-server")).json()
    expect(oauth.code_challenge_methods_supported).toEqual(["S256"])
    expect(oauth.registration_endpoint).toBe(origin + "/register")
  })
  it("rejects unregistered redirects before redirecting", async () => {
    const c = await client()
    const response = await fetch(
      `${base}/authorize?client_id=${c.client_id}&redirect_uri=https://attacker.example`,
      { redirect: "manual" },
    )
    expect(response.status).toBe(400)
    expect(response.headers.get("location")).toBeNull()
  })
  it("defaults to registered scopes and rejects permission expansion", async () => {
    const c = await client("notebooks:read")
    const params = new URLSearchParams({
      client_id: c.client_id,
      redirect_uri: "https://client.example/callback",
      response_type: "code",
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update("a".repeat(64)).digest("base64url"),
      resource,
    })
    const response = await fetch(`${base}/authorize?${params}`, { redirect: "manual" })
    const requestId = new URL(response.headers.get("location")!).searchParams.get("request")!
    expect((await provider.consentDetails(requestId)).scopes).toEqual(["notebooks:read"])
    params.set("scope", "notebooks:read notebooks:write")
    const denied = await fetch(`${base}/authorize?${params}`, { redirect: "manual" })
    expect(new URL(denied.headers.get("location")!).searchParams.get("error")).toBe("invalid_scope")
  })
  it("rejects an invalid PKCE verifier without spending the code", async () => {
    const a = await authorization()
    expect((await exchange(a, { code_verifier: "b".repeat(64) })).status).toBe(400)
    expect((await exchange(a)).status).toBe(200)
  })
  it("binds code exchange to resource, redirect URI and client", async () => {
    const a = await authorization(),
      other = await client()
    const patches: Record<string, string>[] = [
      { resource: "https://attacker.example/mcp" },
      { redirect_uri: "https://client.example/other" },
      { client_id: other.client_id },
    ]
    for (const patch of patches) expect((await exchange(a, patch)).status).toBe(400)
    expect((await exchange(a)).status).toBe(200)
  })
  it("consumes codes once even under concurrent exchanges", async () => {
    const a = await authorization()
    const responses = await Promise.all([exchange(a), exchange(a)])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400])
    await expect(provider.decide(a.requestId, randomUUID(), true)).rejects.toThrow()
  })
  it("returns the authenticated owner and scope, without accepting a website token", async () => {
    const t = await tokens("notebooks:read")
    const info = await provider.verifyAccessToken(t.access_token)
    expect(info.extra?.ownerId).toBe(t.ownerId)
    expect(info.scopes).toEqual(["notebooks:read"])
    expect(info.resource?.href).toBe(resource)
    await expect(provider.verifyAccessToken("website-session-token")).rejects.toThrow()
    expect(JSON.stringify([...store.records.values()])).not.toContain(t.access_token)
  })
  it("does not allow refresh to expand permissions or change resources", async () => {
    const t = await tokens("notebooks:read")
    const body = {
      grant_type: "refresh_token",
      client_id: t.clientId,
      refresh_token: t.refresh_token,
      resource,
    }
    expect(
      (await post("/token", { ...body, scope: "notebooks:read notebooks:write" })).status,
    ).toBe(400)
    expect((await post("/token", { ...body, resource: "https://other.example/mcp" })).status).toBe(
      400,
    )
    expect((await post("/token", body)).status).toBe(200)
  })
  it("rotates refresh tokens and revokes the connection if an old token is replayed", async () => {
    const t = await tokens()
    const body = {
      grant_type: "refresh_token",
      client_id: t.clientId,
      refresh_token: t.refresh_token,
      resource,
    }
    const refreshed = await (await post("/token", body)).json()
    await expect(provider.verifyAccessToken(refreshed.access_token)).resolves.toBeTruthy()
    expect((await post("/token", body)).status).toBe(400)
    await expect(provider.verifyAccessToken(refreshed.access_token)).rejects.toThrow()
    await expect(provider.verifyAccessToken(t.access_token)).rejects.toThrow()
  })
  it("only lets the owning account disconnect and invalidates access immediately", async () => {
    const t = await tokens()
    const [connection] = await provider.connections(t.ownerId)
    await provider.disconnect(randomUUID(), connection.id)
    await expect(provider.verifyAccessToken(t.access_token)).resolves.toBeTruthy()
    await provider.disconnect(t.ownerId, connection.id)
    await expect(provider.verifyAccessToken(t.access_token)).rejects.toThrow()
  })
  it("supports client revocation without letting a different client revoke a token", async () => {
    const t = await tokens(),
      other = await client()
    expect(
      (await post("/revoke", { client_id: other.client_id, token: t.access_token })).status,
    ).toBe(200)
    await expect(provider.verifyAccessToken(t.access_token)).resolves.toBeTruthy()
    expect((await post("/revoke", { client_id: t.clientId, token: t.access_token })).status).toBe(
      200,
    )
    await expect(provider.verifyAccessToken(t.access_token)).rejects.toThrow()
  })
})
