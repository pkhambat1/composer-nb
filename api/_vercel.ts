/* What Vercel hands a function: Node's request, with the query string and the JSON body
   read, and Node's response. Types only, so the functions import nothing from here at run
   time; and not a function itself, since Vercel skips files that start with _. */
import type { IncomingMessage, ServerResponse } from "node:http"

// A query parameter given more than once comes as an array
export type Request = IncomingMessage & {
  query?: Record<string, string | string[] | undefined>
  body?: unknown
}
export type Response = ServerResponse
