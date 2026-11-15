import { createHostedApp, hostedConfig } from "composer-nb-mcp/hosted"
let app: ReturnType<typeof createHostedApp> | undefined
export function composerApp() {
  if (app) return app
  const config = hostedConfig()
  if (!config) return null
  return (app = createHostedApp(config))
}
