import React from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase.ts"

type Consent = { clientName: string; redirectUri: string; scopes: string[] }
type Connection = { id: string; name: string; scopes: string[]; expiresAt: number }
const scopeLabel = (scope: string) =>
  scope === "notebooks:read"
    ? "Read your saved notebooks and music cells"
    : scope === "notebooks:write"
      ? "Create notebooks and edit their cells"
      : scope

async function accountRequest<T>(path: string, body?: unknown): Promise<T> {
  const session = (await supabase?.auth.getSession())?.data.session
  if (!session) throw new Error("Sign in to composer-nb to continue.")
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      typeof error.error === "string" ? error.error : "Could not connect. Please try again.",
    )
  }
  return response.json() as Promise<T>
}

export function OAuthConsent({ session }: { session: Session }) {
  const requestId = new URLSearchParams(window.location.search).get("request")
  const [details, setDetails] = React.useState<Consent | null>(null)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    let alive = true
    if (!requestId) {
      setError("This connection link is incomplete. Start again from the app you want to connect.")
      return
    }
    accountRequest<Consent>(`/oauth/request?request=${encodeURIComponent(requestId)}`)
      .then((value) => {
        if (alive) setDetails(value)
      })
      .catch((e: Error) => {
        if (alive) setError(e.message)
      })
    return () => {
      alive = false
    }
  }, [requestId, session.user.id])
  async function decide(approve: boolean) {
    setBusy(true)
    setError("")
    try {
      const { redirectUrl } = await accountRequest<{ redirectUrl: string }>("/oauth/decision", {
        requestId,
        approve,
      })
      // Only the server constructs this registered callback; never accept a
      // redirect destination supplied in the consent page's query string.
      window.location.assign(redirectUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish connecting")
      setBusy(false)
    }
  }
  return (
    <main className="auth-screen">
      <section className="auth-card connection-card" aria-labelledby="connection-title">
        <img className="auth-logo" src="/composer-mark.png" width="48" height="48" alt="" />
        <h1 id="connection-title">Connect to Composer.nb</h1>
        <p>
          Signed in as <strong>{session.user.email}</strong>
        </p>
        {details ? (
          <>
            <h2>{details.clientName} is requesting access</h2>
            <p className="connection-destination">
              Return to <strong>{new URL(details.redirectUri).host}</strong>. Only approve an app
              you intended to connect.
            </p>
            <ul>
              {details.scopes.map((scope) => (
                <li key={scope}>{scopeLabel(scope)}</li>
              ))}
            </ul>
            <p>You can disconnect it any time from Connected apps.</p>
            <div className="connection-actions">
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void decide(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void decide(true)}>
                {busy ? "Continuing…" : "Allow access"}
              </button>
            </div>
          </>
        ) : (
          !error && <p role="status">Loading connection request…</p>
        )}
        {error && (
          <p role="alert" className="auth-message">
            {error}
          </p>
        )}
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void supabase?.auth.signOut()}
        >
          Use another account
        </button>
      </section>
    </main>
  )
}

export function ConnectedApps() {
  const [connections, setConnections] = React.useState<Connection[] | null>(null)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  React.useEffect(() => {
    let alive = true
    accountRequest<{ connections: Connection[] }>("/oauth/connections")
      .then((value) => {
        if (alive) setConnections(value.connections)
      })
      .catch((e: Error) => {
        if (alive) setError(e.message)
      })
    return () => {
      alive = false
    }
  }, [])
  async function disconnect(id: string) {
    setBusy(id)
    setError("")
    try {
      await accountRequest("/oauth/disconnect", { id })
      setConnections((items) => items?.filter((item) => item.id !== id) || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect")
    } finally {
      setBusy(null)
    }
  }
  return (
    <main className="auth-screen">
      <section className="auth-card connection-card">
        <a href="/">← Your notebooks</a>
        <h1>Connected apps</h1>
        <p>Manage the apps that can access your Composer.nb notebooks.</p>
        {!connections && !error && <p role="status">Loading connections…</p>}
        {connections?.length === 0 && <p>No apps are connected.</p>}
        {connections?.map((connection) => (
          <article key={connection.id} className="connection-item">
            <h2>{connection.name}</h2>
            <ul>
              {connection.scopes.map((scope) => (
                <li key={scope}>{scopeLabel(scope)}</li>
              ))}
            </ul>
            <button
              className="btn btn-secondary"
              disabled={busy !== null}
              onClick={() => void disconnect(connection.id)}
            >
              {busy === connection.id ? "Disconnecting…" : "Disconnect"}
            </button>
          </article>
        ))}
        {error && (
          <p role="alert" className="auth-message">
            {error}
          </p>
        )}
      </section>
    </main>
  )
}
