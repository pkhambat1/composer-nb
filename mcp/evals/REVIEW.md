# Plugin eval review — November 15, 2026

The previous results show better use of the language's harmony functions, but do not establish faster generation or better first-save success. Three baseline failures were grader mistakes. The scores below regrade the same saved notebooks and tool calls with the corrected grader; they are not new model runs.

| Measure                         | Historical baseline | Historical v1 |
| ------------------------------- | ------------------- | ------------- |
| Passing runs                    | 18/27 (66.7%)       | 24/27 (88.9%) |
| Harmony                         | 16/24 (66.7%)       | 24/24 (100%)  |
| First save succeeds             | 19/27 (70.4%)       | 19/27 (70.4%) |
| Typed pitches / sounding events | 0.528               | 0.347         |
| Tool calls per run              | 2.81                | 3.26          |
| Average latency                 | 17.29 s             | 23.65 s       |

The corrected baseline runs are `h10` repetition 0 (the same chord on different instruments was collapsed), and `h15` repetitions 0 and 2 (valid reuse through named patterns was missed). Historical files remain unchanged. The later `v2` measured only the repair case `w06`: 3/3 passed. Combining that selective rerun with v1 would not be a new nine-case measurement.

## Corrections

- Grade requested piano chords, slow tempo, phrase lengths, all chord tones, slash basses, rhythm and literal chord duration. Reject an extra cell when one append was requested.
- Count actual chord attacks, including consecutive repeated attacks and different instruments. Recognize chart reuse through patterns and inherited definitions. An unused interval declaration cannot earn the function check.
- Move the implicit default C key as well as explicit key scopes when checking transposability.
- Keep truncated completions in the result set as failures. Save the model/source fingerprint, before/after notebooks and tool calls; prevent mixed-configuration resumes. Account limits stop further scheduling. Report observed scores without unsupported confidence bounds.
- Correct the `write-cells` note-duration guidance to match the released step-based engine; clarify ASCII accidentals and half-bar note lengths. Use selected-cell context for edits when it already supplies the source, ID and revision. Make harmony library lookup conditional on needing an example.
- Share the one-read notebook fallback between sidebar actions and model-delivered results when a host omits `_meta`. Reject malformed fallback responses without recursive reads. Bump the notebook UI resource to `v8` so hosts can refetch the changed renderer. Parse selected-cell errors once per context update.

## Verification

- DSL: 622 tests passed. Playground: 25 passed. MCP after the final code changes: 127 passed, 5 Supabase integration tests skipped because no local Supabase instance was configured.
- Lint, type checks and production build passed. Both edited skills passed the skill validator.
- The local development host loaded the shared sidebar, rendered the F# minor chart, and sent the selected broken cell's exact error and identity in model context. Regression tests cover metadata present, metadata omitted, a malformed fallback, and permission errors.
- The connected live MCP host served the older notebook picker. Opening an existing notebook produced a schema error expecting `notebooks`; a direct `get_notebook` call succeeded. This is consistent with an older widget being incompatible with the current result shape, not verification of the new widget in production. The new resource and fallback still need a deployed, refreshed-host check.
- A fresh 27-attempt eval was blocked by Claude's account limit before any model tokens were used. Its message reported a reset at 8:40 p.m. Pacific. No new pass-rate, latency or cost improvement is claimed for the additional corrections above.

## Follow-up

After account usage is available, run `npm run eval -- --variant v4 --reps 3` on this source. Check the new full run rather than replacing only failed rows. After deployment, refresh the plugin's tools/resources and repeat opening, creating and editing a notebook in the actual host. Claude.ai, ChatGPT browser hosting, drums, musical taste and concurrent website edits remain outside this nine-case headless suite.
