# Hosting

The site is one Vercel project, `composer-nb`, in the `pkhambat1s-projects` team. A merge to `main` deploys it to https://composer-nb.vercel.app, and each PR gets a preview. What the repo can say is in `vercel.json`: the build command, the output folder, the `/mcp` rewrite, and the `api/` functions.

## Settings that live in Vercel, not the repo

Vercel has no `vercel.json` key for these, so they are set in the dashboard. If a deploy is blocked or a bill looks wrong, check them first.

| Setting                     | Value                                                                                   | Where                             |
| --------------------------- | --------------------------------------------------------------------------------------- | --------------------------------- |
| Spend budget                | $1 of on-demand use past the plan's credit, with "Pause production deployments" at 100% | Team → Billing → Spend Management |
| Build machine               | Basic                                                                                   | Project → Build and Deployment    |
| On-demand concurrent builds | Disabled                                                                                | Project → Build and Deployment    |
| Function time limit         | 10 seconds, set in each `api/*.ts`                                                      | the code                          |
| Sheet and MIDI downloads    | `s-maxage` set, so Vercel's CDN keeps each one                                          | the code                          |

Vercel's CDN only caches a function's response when it sends `s-maxage`. Without it, every view of a sheet image renders it again and uses CPU.

## Environment variables

The playground reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` when it builds. Neither is set in Vercel, so the sign-in screen can't work on the hosted site until a Supabase project exists and both are added.
