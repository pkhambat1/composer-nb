import { randomBytes, randomUUID } from "node:crypto"
import type { Response } from "express"
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js"
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidRequestError,
  InvalidScopeError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js"
import {
  OAuthClientInformationFullSchema,
  type OAuthClientInformationFull,
  type OAuthTokenRevocationRequest,
  type OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { z } from "zod"
import type { OAuthStore, OAuthRecord } from "./oauth-store.ts"

export const NOTEBOOK_SCOPES = ["notebooks:read", "notebooks:write"]
const credential = () => randomBytes(32).toString("base64url")
const now = () => Math.floor(Date.now() / 1000)
const live = (record: OAuthRecord | null): record is OAuthRecord =>
  Boolean(
    record &&
    !record.consumed_at &&
    (!record.expires_at || Date.parse(record.expires_at) > Date.now()),
  )
const requestSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  redirectUri: z.string().url(),
  state: z.string().optional(),
  scopes: z.array(z.string()),
  codeChallenge: z.string(),
  resource: z.string().url(),
})
const grantSchema = z.object({
  grantId: z.string(),
  ownerId: z.string().uuid(),
  clientId: z.string(),
  clientName: z.string(),
  resource: z.string().url(),
  scopes: z.array(z.string()),
  expiresAt: z.number(),
})
const codeSchema = requestSchema.merge(grantSchema)
type Grant = z.infer<typeof grantSchema>

/** Protocol validation and PKCE are handled by the MCP SDK's OAuth handlers.
 * Supabase authenticates the person on our consent page; its session tokens are
 * never forwarded to a host or persisted here. MCP credentials are opaque,
 * resource-bound and stored only as hashes in the durable store. */
export class ComposerOAuthProvider implements OAuthServerProvider {
  readonly store: OAuthStore
  readonly origin: string
  readonly resource: string
  constructor(store: OAuthStore, origin: string) {
    this.store = store
    const url = new URL(origin)
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
    )
      throw new Error("COMPOSER_NB_ORIGIN must use HTTPS")
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
      throw new Error("COMPOSER_NB_ORIGIN must be an origin, without a path")
    this.origin = url.origin
    this.resource = `${url.origin}/mcp`
  }
  get clientsStore() {
    return {
      getClient: async (clientId: string): Promise<OAuthClientInformationFull | undefined> => {
        const record = await this.store.get("client", clientId)
        return live(record) ? OAuthClientInformationFullSchema.parse(record.payload) : undefined
      },
      registerClient: async (
        client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
      ): Promise<OAuthClientInformationFull> => {
        if (client.token_endpoint_auth_method !== "none")
          throw new InvalidClientMetadataError(
            "Use a public OAuth client with PKCE (token_endpoint_auth_method: none)",
          )
        if (
          !client.redirect_uris.length ||
          client.redirect_uris.length > 10 ||
          client.redirect_uris.some((uri) => {
            const url = new URL(uri)
            return (
              url.hash ||
              url.username ||
              url.password ||
              !(
                url.protocol === "https:" ||
                (url.protocol === "http:" &&
                  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
              )
            )
          })
        )
          throw new InvalidClientMetadataError(
            "Redirects must use HTTPS or HTTP loopback, without fragments or credentials",
          )
        if (client.scope && client.scope.split(" ").some((s) => !NOTEBOOK_SCOPES.includes(s)))
          throw new InvalidClientMetadataError("Unsupported scope")
        if (
          client.grant_types?.some((g) => !["authorization_code", "refresh_token"].includes(g)) ||
          client.response_types?.some((r) => r !== "code")
        )
          throw new InvalidClientMetadataError(
            "Only authorization-code and refresh-token grants are supported",
          )
        const saved = {
          ...client,
          client_name: (client.client_name || "MCP client").slice(0, 200),
          client_id: randomUUID(),
          client_id_issued_at: now(),
        }
        await this.store.put("client", saved.client_id, saved, null)
        return saved
      },
    }
  }
  private checkResource(resource?: URL) {
    if (resource?.href !== this.resource)
      throw new InvalidRequestError(`resource must be ${this.resource}`)
  }
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    this.checkResource(params.resource)
    const registeredScopes = client.scope?.split(" ")
    const scopes = params.scopes?.length
      ? [...new Set(params.scopes)]
      : registeredScopes || [...NOTEBOOK_SCOPES]
    if (
      scopes.some((s) => !NOTEBOOK_SCOPES.includes(s)) ||
      (registeredScopes && scopes.some((s) => !registeredScopes.includes(s))) ||
      (scopes.includes("notebooks:write") && !scopes.includes("notebooks:read"))
    )
      throw new InvalidScopeError("Choose notebooks:read, optionally with notebooks:write")
    if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge))
      throw new InvalidRequestError("A valid S256 PKCE challenge is required")
    const id = credential()
    await this.store.put(
      "request",
      id,
      {
        clientId: client.client_id,
        clientName: client.client_name || "MCP client",
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        scopes,
        state: params.state,
        resource: this.resource,
      },
      now() + 600,
    )
    res.redirect(`${this.origin}/oauth/consent?request=${id}`)
  }
  async consentDetails(requestId: string) {
    const record = await this.store.get("request", requestId)
    if (!live(record))
      throw new InvalidGrantError("This connection request expired. Start again from your app.")
    const request = requestSchema.parse(record.payload)
    return {
      clientName: request.clientName,
      redirectUri: request.redirectUri,
      scopes: request.scopes,
    }
  }
  async decide(requestId: string, ownerId: string, approve: boolean) {
    z.string().uuid().parse(ownerId)
    const record = await this.store.consume("request", requestId)
    if (!record) throw new InvalidGrantError("This connection request expired or was already used.")
    const request = requestSchema.parse(record.payload)
    const redirect = new URL(request.redirectUri)
    if (request.state) redirect.searchParams.set("state", request.state)
    // Do not advertise RFC 9207 until the SDK also adds iss to error redirects.
    if (!approve) {
      redirect.searchParams.set("error", "access_denied")
    } else {
      const grant: Grant = {
        ...request,
        ownerId,
        grantId: randomUUID(),
        expiresAt: now() + 30 * 86400,
      }
      await this.store.put("grant", grant.grantId, grant, grant.expiresAt, ownerId)
      const code = credential()
      await this.store.put("code", code, { ...request, ...grant }, now() + 300, ownerId)
      redirect.searchParams.set("code", code)
    }
    return redirect.href
  }
  async challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string) {
    const record = await this.store.get("code", code)
    if (!live(record)) throw new InvalidGrantError("Invalid authorization code")
    const data = codeSchema.parse(record.payload)
    if (data.clientId !== client.client_id)
      throw new InvalidGrantError("Invalid authorization code")
    return data.codeChallenge
  }
  private async activeGrant(data: Grant) {
    const grant = await this.store.get("grant", data.grantId)
    if (!live(grant) || data.expiresAt <= now())
      throw new InvalidGrantError("Connection expired or revoked")
    return data
  }
  private async issue(data: Grant): Promise<OAuthTokens> {
    await this.activeGrant(data)
    const access = credential(),
      refresh = credential()
    const expiresIn = Math.min(3600, data.expiresAt - now())
    await this.store.put("access", access, data, now() + expiresIn, data.ownerId)
    await this.store.put("refresh", refresh, data, data.expiresAt, data.ownerId)
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: expiresIn,
      scope: data.scopes.join(" "),
    }
  }
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ) {
    this.checkResource(resource)
    const record = await this.store.get("code", code)
    if (!live(record)) throw new InvalidGrantError("Invalid authorization code")
    const data = codeSchema.parse(record.payload)
    if (
      data.clientId !== client.client_id ||
      redirectUri !== data.redirectUri ||
      data.resource !== this.resource
    )
      throw new InvalidGrantError("Authorization code binding mismatch")
    if (!(await this.store.consume("code", code)))
      throw new InvalidGrantError("Authorization code already used")
    return this.issue(grantSchema.parse(data))
  }
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refresh: string,
    scopes?: string[],
    resource?: URL,
  ) {
    this.checkResource(resource)
    const record = await this.store.get("refresh", refresh)
    if (!record) throw new InvalidGrantError("Invalid refresh token")
    const data = grantSchema.parse(record.payload)
    if (data.clientId !== client.client_id || data.resource !== this.resource)
      throw new InvalidGrantError("Invalid refresh token")
    if (record.consumed_at) {
      await this.store.consume("grant", data.grantId)
      throw new InvalidGrantError("Refresh token reused; reconnect this account")
    }
    if (!live(record)) throw new InvalidGrantError("Expired refresh token")
    const nextScopes = scopes || data.scopes
    if (!nextScopes.length || nextScopes.some((s) => !data.scopes.includes(s)))
      throw new InvalidScopeError("Refresh cannot expand access")
    if (!(await this.store.consume("refresh", refresh))) {
      await this.store.consume("grant", data.grantId)
      throw new InvalidGrantError("Refresh token already used")
    }
    return this.issue({ ...data, scopes: nextScopes })
  }
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const record = await this.store.get("access", token)
    if (!live(record)) throw new InvalidTokenError("Invalid or expired access token")
    const data = grantSchema.parse(record.payload)
    if (data.resource !== this.resource)
      throw new InvalidTokenError("Token belongs to a different resource")
    try {
      await this.activeGrant(data)
    } catch (error) {
      if (error instanceof InvalidGrantError)
        throw new InvalidTokenError("Connection expired or revoked")
      throw error
    }
    return {
      token,
      clientId: data.clientId,
      scopes: data.scopes,
      resource: new URL(data.resource),
      expiresAt: Math.floor(Date.parse(record.expires_at!) / 1000),
      extra: { ownerId: data.ownerId },
    }
  }
  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest) {
    for (const kind of ["access", "refresh"] as const) {
      const record = await this.store.get(kind, request.token)
      if (!record) continue
      const data = grantSchema.parse(record.payload)
      if (data.clientId === client.client_id) await this.store.consume("grant", data.grantId)
    }
  }
  async connections(ownerId: string) {
    return (await this.store.grants(ownerId)).map((r) => {
      const data = grantSchema.parse(r.payload)
      return {
        id: data.grantId,
        name: data.clientName,
        scopes: data.scopes,
        expiresAt: data.expiresAt,
      }
    })
  }
  async disconnect(ownerId: string, grantId: string) {
    const record = await this.store.get("grant", grantId)
    if (record && grantSchema.parse(record.payload).ownerId === ownerId)
      await this.store.consume("grant", grantId)
  }
}
