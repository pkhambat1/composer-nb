import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

export type RecordKind = "client" | "request" | "code" | "grant" | "access" | "refresh"
const recordSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
  consumed_at: z.string().nullable(),
  expires_at: z.string().nullable(),
})
export type OAuthRecord = z.infer<typeof recordSchema>
export interface OAuthStore {
  get(kind: RecordKind, key: string): Promise<OAuthRecord | null>
  put(
    kind: RecordKind,
    key: string,
    payload: Record<string, unknown>,
    expiresAt: number | null,
    ownerId?: string,
  ): Promise<void>
  consume(kind: RecordKind, key: string): Promise<OAuthRecord | null>
  grants(ownerId: string): Promise<OAuthRecord[]>
}
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex")

export class SupabaseOAuthStore implements OAuthStore {
  private db: SupabaseClient
  constructor(db: SupabaseClient) {
    this.db = db
  }
  async get(kind: RecordKind, key: string) {
    const { data, error } = await this.db
      .from("mcp_oauth_records")
      .select("payload,consumed_at,expires_at")
      .eq("kind", kind)
      .eq("key_hash", tokenHash(key))
      .maybeSingle()
    if (error) throw new Error("Authorization storage is unavailable")
    return data ? recordSchema.parse(data) : null
  }
  async put(
    kind: RecordKind,
    key: string,
    payload: Record<string, unknown>,
    expiresAt: number | null,
    ownerId?: string,
  ) {
    const { error } = await this.db.from("mcp_oauth_records").insert({
      kind,
      key_hash: tokenHash(key),
      payload,
      owner_id: ownerId,
      expires_at: expiresAt === null ? null : new Date(expiresAt * 1000).toISOString(),
    })
    if (error) throw new Error("Could not save authorization")
  }
  async consume(kind: RecordKind, key: string) {
    const { data, error } = await this.db.rpc("consume_mcp_oauth_record", {
      record_kind: kind,
      record_hash: tokenHash(key),
    })
    if (error) throw new Error("Authorization storage is unavailable")
    return data?.[0] ? recordSchema.parse(data[0]) : null
  }
  async grants(ownerId: string) {
    const { data, error } = await this.db
      .from("mcp_oauth_records")
      .select("payload,consumed_at,expires_at")
      .eq("kind", "grant")
      .eq("owner_id", ownerId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
    if (error) throw new Error("Could not read connected apps")
    return z.array(recordSchema).parse(data)
  }
}
