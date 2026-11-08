import React from "react"
import type { Session } from "@supabase/supabase-js"
import { hasSupabaseConfig, supabase } from "../lib/supabase.ts"

export default function AuthGate({ children }: { children: (session: Session) => React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [mode, setMode] = React.useState<"login" | "signup">("login")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [message, setMessage] = React.useState("")

  React.useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      setLoading(false)
      if (event === "SIGNED_OUT") {
        setEmail("")
        setPassword("")
        setMessage("")
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  async function authenticate(event: React.FormEvent) {
    event.preventDefault()
    if (!supabase) return setMessage("Supabase is not configured for this app.")
    setMessage(mode === "login" ? "Signing in…" : "Creating account…")
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
    if (result.error) setMessage(result.error.message)
    else if (mode === "signup" && !result.data.session) setMessage("Check your email to confirm your account.")
  }

  async function signInWithGoogle() {
    if (!supabase) return setMessage("Supabase is not configured for this app.")
    setMessage("Opening Google…")
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: { access_type: "offline", prompt: "select_account" },
      },
    })
    if (error) setMessage(error.message)
  }

  if (loading) return <main className="auth-screen">Loading your workspace…</main>
  if (session) return <>{children(session)}</>

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={authenticate}>
        <img className="auth-logo" src="/composer-mark.png" width="48" height="48" alt="" />
        <h1>Composer.nb</h1>
        <p>Your music notebooks, saved securely and available anywhere.</p>
        <div className="auth-tabs" role="tablist" aria-label="Account action">
          <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "auth-tab-active" : ""} onClick={() => { setMode("login"); setMessage("") }}>Log in</button>
          <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "auth-tab-active" : ""} onClick={() => { setMode("signup"); setMessage("") }}>Sign up</button>
        </div>
        <button className="auth-google" type="button" onClick={() => void signInWithGoogle()}><span aria-hidden="true">G</span> Continue with Google</button>
        <div className="auth-divider"><span>or use email</span></div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        <button className="auth-submit" type="submit">{mode === "login" ? "Log in" : "Create account"}</button>
        {!hasSupabaseConfig && <div className="auth-config-note" role="status">Supabase configuration is required.</div>}
        {message && <div className="auth-message" role="status">{message}</div>}
      </form>
    </main>
  )
}
