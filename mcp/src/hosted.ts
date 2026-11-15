import express, { type Request, type Response, type NextFunction } from "express"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { mcpAuthRouter, createOAuthMetadata } from "@modelcontextprotocol/sdk/server/auth/router.js"
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { z } from "zod"
import { ComposerOAuthProvider, NOTEBOOK_SCOPES } from "./oauth.ts"
import { SupabaseOAuthStore } from "./oauth-store.ts"
import { SupabaseNotebookWorkspace, NotebookAuthorizationError } from "./notebook-workspace.ts"
import { handleMcp } from "./http.ts"

export type HostedConfig = { origin: string; supabaseUrl: string; serviceKey: string }
export function hostedConfig(): HostedConfig | null {
  const origin = process.env.COMPOSER_NB_ORIGIN
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!origin && !serviceKey) return null
  if (!origin || !supabaseUrl || !serviceKey)
    throw new Error(
      "Configure COMPOSER_NB_ORIGIN, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY together",
    )
  return { origin, supabaseUrl, serviceKey }
}
function bearer(req: Request) {
  const header = req.headers.authorization
  if (!header) return undefined
  if (!/^Bearer [^\s]{1,8192}$/i.test(header))
    throw new InvalidTokenError("Invalid authorization header")
  return header.slice(7)
}

export function createHostedApp(
  config: HostedConfig,
  supplied?: { db?: SupabaseClient; provider?: ComposerOAuthProvider },
) {
  const db =
    supplied?.db ||
    createClient(config.supabaseUrl, config.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  const provider =
    supplied?.provider || new ComposerOAuthProvider(new SupabaseOAuthStore(db), config.origin)
  const app = express()
  app.disable("x-powered-by")
  const metadataUrl = `${provider.origin}/.well-known/oauth-protected-resource/mcp`
  const challenge = (res: Response) => {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${metadataUrl}", error="invalid_token", error_description="Connect your composer-nb account"`,
    )
    res.setHeader("Cache-Control", "no-store")
    res
      .status(401)
      .json({ error: "invalid_token", error_description: "Connect your composer-nb account" })
  }
  app.use((req, res, next) => {
    res.setHeader("Referrer-Policy", "no-referrer")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Cache-Control", "no-store")
    // Vercel can parse form bodies before Express receives them.
    if (
      typeof req.body === "string" &&
      req.headers["content-type"]?.startsWith("application/x-www-form-urlencoded")
    )
      req.body = Object.fromEntries(new URLSearchParams(req.body))
    next()
  })
  const oauthOptions = {
    provider,
    issuerUrl: new URL(provider.origin),
    resourceServerUrl: new URL(provider.resource),
    scopesSupported: NOTEBOOK_SCOPES,
    resourceName: "composer-nb notebooks",
  }
  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.json({
      ...createOAuthMetadata(oauthOptions),
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
    })
  })
  app.use(mcpAuthRouter(oauthOptions))
  // Root alias also supports clients which do not discover the path-specific URL.
  app.get("/.well-known/oauth-protected-resource", (_req, res) =>
    res.json({
      resource: provider.resource,
      authorization_servers: [new URL(provider.origin).href],
      scopes_supported: NOTEBOOK_SCOPES,
    }),
  )

  async function websiteUser(req: Request) {
    const token = bearer(req)
    if (!token) throw new InvalidTokenError("Sign into composer-nb first")
    const { data, error } = await db.auth.getUser(token)
    if (error || !data.user || data.user.is_anonymous)
      throw new InvalidTokenError("Sign into composer-nb first")
    return data.user
  }
  app.use("/oauth", express.json({ limit: "16kb" }))
  app.use("/oauth", (req, res, next) => {
    if (req.method !== "GET" && req.headers.origin !== provider.origin) {
      res.status(403).json({ error: "Use the composer-nb consent page to manage access" })
      return
    }
    next()
  })
  app.get("/oauth/request", async (req, res) => {
    await websiteUser(req)
    res.json(await provider.consentDetails(z.string().min(1).max(200).parse(req.query.request)))
  })
  app.post("/oauth/decision", async (req, res) => {
    const user = await websiteUser(req)
    const body = z
      .object({ requestId: z.string().min(1).max(200), approve: z.boolean() })
      .parse(req.body)
    res.json({ redirectUrl: await provider.decide(body.requestId, user.id, body.approve) })
  })
  app.get("/oauth/connections", async (req, res) => {
    const user = await websiteUser(req)
    res.json({ connections: await provider.connections(user.id) })
  })
  app.post("/oauth/disconnect", async (req, res) => {
    const user = await websiteUser(req)
    await provider.disconnect(user.id, z.object({ id: z.string().uuid() }).parse(req.body).id)
    res.json({ disconnected: true })
  })
  app.use("/mcp", express.json({ limit: "6mb" }))
  app.use("/mcp", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
    )
    res.setHeader(
      "Access-Control-Expose-Headers",
      "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
    )
    if (req.method === "OPTIONS") {
      res.status(204).end()
      return
    }
    let auth: AuthInfo | undefined
    try {
      const token = bearer(req)
      if (!token) throw new InvalidTokenError("Connect your composer-nb account")
      auth = await provider.verifyAccessToken(token)
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        challenge(res)
        return
      }
      throw error
    }
    const owner = async (write = false) => {
      const required = write ? NOTEBOOK_SCOPES : ["notebooks:read"]
      if (!auth || required.some((scope) => !auth.scopes.includes(scope)))
        throw new NotebookAuthorizationError(metadataUrl, required)
      return z.string().uuid().parse(auth.extra?.ownerId)
    }
    await handleMcp(req, res, {
      site: provider.origin,
      workspace: new SupabaseNotebookWorkspace(db, owner),
    })
  })
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return
    if (error instanceof InvalidTokenError) {
      res.status(401).json({ error: "Sign into composer-nb to continue" })
      return
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request" })
      return
    }
    // Never serialize database errors or credentials into a tool/browser response.
    res.status(400).json({
      error:
        error instanceof Error && error.name === "InvalidGrantError"
          ? error.message
          : "The request could not be completed. Please try again.",
    })
  })
  return app
}
