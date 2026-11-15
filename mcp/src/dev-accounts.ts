import { createHostedApp, hostedConfig } from "./hosted.ts"
import { cellHtml } from "./app.ts"
import express from "express"
import { fileURLToPath } from "node:url"

const config = hostedConfig()
if (!config)
  throw new Error(
    "Configure COMPOSER_NB_ORIGIN, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the local account server",
  )
const app = createHostedApp(config)
app.get("/widget", async (_req, res) => {
  res.type("html").send(await cellHtml())
})
app.use(express.static(fileURLToPath(new URL("../app/dist", import.meta.url))))
const port = Number(process.env.COMPOSER_NB_DEV_PORT || 4187)
app.listen(port, "127.0.0.1", () =>
  console.log(`Composer account server at http://127.0.0.1:${port}`),
)
