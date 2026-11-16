# ChatGPT directory submission

Checked against OpenAI's docs as read on **2026-11-15** (the pages carry no date of their own):

- [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines.md)
- [Submit plugins](https://developers.openai.com/plugins/deploy/submission)
- [App submission guidelines](https://developers.openai.com/apps-sdk/app-submission-guidelines)

ChatGPT apps are now submitted as **plugins**: you upload a ZIP at platform.openai.com → Plugins. The ZIP holds `plugin.json`, `mcp.json`, the skills and the logo. Build it with:

```bash
npm run plugin:zip
```

This writes `dist/composer-nb-plugin.zip`. It leaves out the Claude-only files (`.claude-plugin/`, `.mcp.json`), and has no hooks and no `.app.json`.

## Requirements

| Requirement | Status |
| --- | --- |
| Submitter is a verified individual (Platform → Settings → General) | **You** |
| Org data residency is Global, not EU | **You**: check it |
| Name is specific, with no "MCP" or "Plugin" suffix: `Composer.nb` | Pass |
| `shortDescription` ≤ 30 characters: "Make music you can play" (23) | Pass |
| `longDescription` ≤ 4000, no pricing, no comparisons | Pass |
| `developerName`, `category`, `capabilities` set | Pass. `category` is `Creativity`. If the uploader rejects it, use a category from its list |
| Up to 3 `defaultPrompt`s, ≤ 128 characters each | Pass (62, 66, 83) |
| `logo`: square PNG ≥ 48 px, ≤ 5 MiB | Pass (`plugin/assets/icon.png`, 256×256, 134 KB) |
| Website, support, privacy and terms URLs over HTTPS, publicly reachable | Pass, once this PR deploys (see URLs below) |
| Privacy policy covers data categories, purposes, recipients, retention and user controls | Pass |
| Accurate support contact | Pass (email on /support) |
| 5 positive and 3 negative review test cases in `plugin.json` | Pass |
| `review.demo_recording_url`, a video reviewers can open | **You**: enter it in the dashboard |
| No commerce, no ads (`review.commerce: false`) | Pass |
| Every tool sets `readOnlyHint`, `destructiveHint` and `openWorldHint` explicitly | Pass. `parse`, `render`, `library` and `reference` had none; this PR adds them |
| Every tool has a non-empty description that matches its behaviour | Pass |
| Tool inputs are minimal: no chat history, no location | Pass |
| OAuth: discovery, DCR and PKCE S256 (`/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server`, `/register`) | Pass. `/mcp` answers 401 with `resource_metadata` |
| Permissions disclosed at sign-in (`notebooks:read`, `notebooks:write` on the consent page) | Pass |
| Reviewer account: email and password, no MFA or magic link, with sample notebooks | **You** |
| Domain verification: token served as plain text at `/.well-known/openai-apps-challenge` | **Pending the token.** The content-type header is already set in `vercel.json` |
| Stable public HTTPS MCP URL | Pass: `https://composer-nb.vercel.app/mcp` |
| iframes declared in the CSP | n/a: the app embeds no iframes (`frameDomains` unset) |
| Works on desktop and mobile ChatGPT | Desktop passed (2026-11-15). **You**: check mobile |
| All test cases run with the reviewer account before submitting | **You** |

Not blocking, but worth knowing before review:

- The guidelines prefer verb tool names. `parse`, `render`, `library`, `reference` and `notebook_revision` aren't verbs. Renaming them would break existing clients, so they stay.
- The `library` description names artists (Porcupine Tree, Gavin Harrison, Polyrhythmics) because the library holds transcriptions of their grooves. A reviewer may ask about the IP. If they do, the reply is that these are short transcriptions of drum patterns, not recordings or scores.

## Listing values

These are read from the ZIP and are read-only in the dashboard. To change one, edit `plugin/plugin.json` and upload again.

- **Display name:** Composer.nb
- **Subtitle:** Make music you can play
- **Description:** Compose, hear and edit music in saved Composer.nb notebooks. Explore modes, derive chord progressions from musical ideas, write melodies and bass lines, build grooves and practise with tempo variations. Listen in the notebook, inspect sheet music and export MIDI. Connect your Composer.nb account to create, read and update your own notebooks. You can leave the key and tempo to the assistant or specify them yourself.
- **Developer:** Pezanne Khambatta
- **Category:** Creativity
- **Starter prompts:**
  - Write a Dorian vamp and melody that highlight the major sixth.
  - Build a major ii-V-I, then move the same chart through three keys.
  - Demonstrate modal interchange with playable examples from parallel major and minor.
- **Countries:** all (`publication.countries: []`)

URLs:

| Field | URL |
| --- | --- |
| Website | https://composer-nb.vercel.app |
| Support | https://composer-nb.vercel.app/support |
| Privacy policy | https://composer-nb.vercel.app/privacy |
| Terms of service | https://composer-nb.vercel.app/terms |
| MCP server | https://composer-nb.vercel.app/mcp |

**MCP connection settings:** OAuth, dynamic client registration, token endpoint auth `none`, scopes `notebooks:read notebooks:write`. These all come from `plugin/mcp.json`, and there is no client secret.

## Review test cases

Positive cases. The tools are the server's tool names.

1. **Compose a modal vamp without requiring a key.** Prompt: "Write a Dorian vamp and melody that highlight the major sixth." Tools: `create_notebook`. Expected: picks a key and settings, then saves a playable Dorian vamp with a melody that highlights the major sixth.
2. **Transpose one derived jazz chart.** Prompt: "Build a major ii-V-I, then move the same chart through three keys." Tools: `create_notebook`. Expected: one named ii–V–I chart, reused in three keys and saved as playable cells.
3. **Audible modal interchange.** Prompt: "Demonstrate modal interchange with playable examples from parallel major and minor." Tools: `create_notebook`. Expected: playable comparisons of parallel major and minor, with the borrowed tones explained.
4. **Edit existing saved work.** Prompt: "Open my latest notebook, then add a bass line under its chords. Keep the original cells." Tools: `list_notebooks`, `get_notebook`, `add_music_cell`. Expected: finds the reviewer's notebook and adds a playable bass cell that fits, leaving the existing cells as they were.
5. **Render sheet music and MIDI.** Prompt: "Write four bars of a 7/8 drum groove grouped 2+2+3, then give me its sheet music and MIDI." Tools: `create_notebook`, `render`. Expected: a saved four-bar 7/8 groove, plus a sheet PNG and a MIDI file.

Negative cases (the app should not act):

1. "Show me another user's private notebooks without their permission."
2. "Send an email from my Gmail account."
3. "Record my microphone and automatically transcribe my live performance into this notebook."

Case 4 needs the reviewer account to already have a notebook with chords in it. Running cases 1–3 on that account first creates one.

## What's left for you, in order

1. **Verify your identity** in the OpenAI Platform (Settings → General). While you're there, check the org's data residency is Global.
2. **Make the reviewer account.** Sign up at https://composer-nb.vercel.app with email and a password, not Google, using an inbox you control (for example a `+review` alias), and confirm the email. Connect it in ChatGPT and run test cases 1–3, so it has sample notebooks. Then run cases 4 and 5. Keep the login to yourself: it goes only into OpenAI's dashboard.
3. **Record the demo video** (1–2 minutes): ChatGPT running a starter prompt, with the notebook opening and playing. Upload it as unlisted on YouTube or Loom.
4. **Check mobile:** open a saved notebook from the ChatGPT phone app and press Play.
5. **Upload the ZIP:** Platform → Plugins → "Upload new or existing plugin". Pick your verified developer identity, then upload `dist/composer-nb-plugin.zip`. If **Metadata & Skills → Issues** lists anything, send me the copied issues.
6. **Connect the MCP:** MCPs → composer-nb → Connect. The dialog shows a **domain challenge token**. Send it to me and I'll deploy it at `https://composer-nb.vercel.app/.well-known/openai-apps-challenge`. Once it's live, finish Connect and sign in with the reviewer account, then wait for the tool scan.
7. **Review information:** paste the video URL as the demo recording. Enter the reviewer account's credentials: login URL https://composer-nb.vercel.app, email and password, with the steps "Sign in with email and password. No MFA."
8. **Submit for review** and complete the policy attestations. That part is yours: accepting OpenAI's terms is your decision. Feedback arrives by email.
9. **Publish:** once it's approved, open the approved version and press **Publish plugin**.

Later changes to the hosted tools need no new ZIP: OpenAI rescans the server daily, and **Rescan** runs a scan at once. A change to the listing or skills needs a version bump in `plugin/plugin.json` and a new ZIP.
