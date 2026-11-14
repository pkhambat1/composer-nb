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
        <button className="btn btn-secondary auth-google" type="button" onClick={() => void signInWithGoogle()}><GoogleMark /> Continue with Google</button>
        <div className="auth-divider"><span>or use email</span></div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        <button className="btn btn-primary auth-submit" type="submit">{mode === "login" ? "Log in" : "Create account"}</button>
        {!hasSupabaseConfig && <div className="auth-config-note" role="status">Supabase configuration is required.</div>}
        {message && <div className="auth-message" role="status">{message}</div>}
      </form>
    </main>
  )
}

// Google's "G" mark, as its sign-in branding guidelines ask for on a "Continue with Google" button.
function GoogleMark() {
  return (
    <svg className="auth-google-mark" aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
