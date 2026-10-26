# The agent door: `POST /api/mcp`

Gravitone runs an MCP server inside the Next server, at `POST /api/mcp`. An agent (Athena first) reads
the studio and launches work through it with its own CLI token. The tools call the same server ports
the studio's screens call (`serverProduce()`, `serverPart()`, `serverBoard()`, `serverLibrary()`, the
Ledger's `readPage`). Every write records the agent in the ledger as `{kind: "agent", id: <token name>}`.

- Route: `app/api/mcp/route.ts`, wrapped by `app/_server/route.ts` `route({guard: "access"})`.
- Envelope and dispatch: `app/_server/mcp/rpc.ts`. Who may call: `app/_server/mcp/principal.ts`.
- The one tool registry: `app/_server/mcp/registry.ts`. Its rows are in `app/_server/mcp/tools/{read,launch,job,spend}.ts`.
- How the registry is published: `app/_server/mcp/projection.ts`.

## The rule it holds

An agent never spends. A run or a plan launches dry. It launches live only when the receipt, recomputed
at the call, is free: `isFreeReceipt` in `@gt/domain/mcp` (no dollar, no range above $0, every unpriced
line the Claude seat). Any other live launch is filed as a spend request (`@gt/kernel/spend-requests/store`
`fileSpendRequest`). The request has its own `spend-request.requested` ledger event, written in the same
transaction, and nothing launches. The operator confirms or refuses it on the Board packet
`/board/pkt:spend:<day>`. The agent reads the verdict with `gt_spend`.

Part acts run dry for every caller (`app/(studio)/projects/[id]/_part/real.ts` arms no live act). Retrying
or re-routing a job that carries a live arm belongs to the operator. The door refuses both by name:
`retry of a live job is the operator's (Runs)`.

## Token scope

An agent reaches `/api/mcp` with its own CLI token, scope `act`, minted by the operator:

```bash
node pipeline/token.mts mint --name athena --scope act [--ttl 30d]
```

The token prints once, on stdout, after its row and its `token.mint` event commit. Put it in the agent's
`GRAVITONE_CLI_TOKEN` and send it as `Authorization: Bearer $GRAVITONE_CLI_TOKEN`. It lives 30 days by
default and 90 at most. When it runs out, mint a new one.

| scope   | read doors | act doors (non-spending writes) | money doors |
|---------|------------|---------------------------------|-------------|
| `money` | admitted   | admitted                        | admitted    |
| `act`   | admitted   | admitted                        | 403 `token-scope` |
| `read`  | admitted   | refused                         | 403 `token-scope` |

`act` admits reads, dry runs, live runs whose recomputed receipt is free and spend requests. Every money
door refuses it. On `/api/mcp`, a `money` token gets the same `act` limits: the surface holds the rule,
not the scope. A `read` token can read here. Its write calls are refused in-band
(`gt_job cancel writes, and token <name> has scope read ...`, reason `token-scope`).

To see tokens, run `node pipeline/token.mts list`. To withdraw one, run
`node pipeline/token.mts revoke <id> --reason "<why>"`. A revocation is final and takes effect on the next
request. Tokens are never deleted, so the list stays an inventory.

## Who may call

| request | answer |
|---|---|
| no credential, or an expired or unknown token | 401 `unauthenticated` (route()'s guard) |
| an `Origin` header whose host is not `localhost`, `127.0.0.1` or `[::1]` | 403 `refused`, `mcp: origin <o> is not this machine` |
| a session cookie, the legacy shared secret, the dev fixture, the local owner | 403 `refused`, detail `mcp-needs-token` |
| a CLI token (`gt_...`) | admitted |

## Protocol

The server is stateless, Streamable HTTP, and hand-rolled (no SDK at runtime). Each POST carries one
JSON-RPC 2.0 message and gets an `application/json` answer. There are no sessions and no SSE. A `GET` gets
Next's 405, which an MCP client reads as "no stream offered".

| method | answer |
|---|---|
| `initialize` | `protocolVersion`: the client's if it is `2025-11-25`, `2025-06-18` or `2025-03-26`, else `2025-11-25`; `capabilities: {tools: {listChanged: false}}`; `serverInfo: {name: "gravitone", version}`; `instructions` |
| `notifications/*`, or any message with no `id` | 202, no body |
| `ping` | `{}` |
| `tools/list` | every tool of the projection, in one page |
| `tools/call` | the tool result |

Errors come back on two channels:

- **The message is wrong:** JSON-RPC errors. `-32700`: the body is not JSON. `-32600`: not a request, or a
  batch (`batch requests are not supported`). `-32601`: unknown method. `-32602`: params the envelope
  refuses, an unknown tool, or an unknown op (the error names the known ones).
- **The work is wrong:** a tool result with `isError: true` and
  `structuredContent: {code, detail, reason?, fresh?}`. This covers args an op's own zod door refuses
  (`invalid`), a stale receipt (`stale`, with `fresh`), a conflict, a refusal and a missing thing.

A successful result is `{content: [{type: "text", text: <JSON>}], structuredContent: <the value>}`. Where a
screen shows the thing, the value carries `view`, a deep-link path: `/projects/<id>`,
`/projects/<id>/<part>`, `/projects/runs?job=<id>`, `/board/<packet>`, `/library?sel=<id>` or
`/ledger?ev=<seq>`. A cut listing says `truncated: true` and gives `next` (an `offset`, a ledger
`cursor`, or an `after` seq).

## Projections

`GRAVITONE_MCP_PROJECTION` is read once when the server starts. It is server-only.

- `family` (default): four tools, `gt_read`, `gt_launch`, `gt_job` and `gt_spend`. Each takes
  `{op, ...args}`. Its `inputSchema` is a JSON-Schema `oneOf` over its ops, discriminated by `op`. Its
  annotations are the most severe of its ops'.
- `operation`: one tool per op, `gt_<family>_<op>` (33 today).

Both projections resolve to the same registry row and run the same handler with the same args. The
results and the ledger events are identical.

## Ops

| family | op | args | writes |
|---|---|---|---|
| read | `projects` | - | |
| read | `plan` | `id` | |
| read | `jobs` | `project?`, `state?`, `offset?`, `limit<=100` | |
| read | `holds` | - | |
| read | `packets` | `state?` (open, committed, returned), `limit<=100` | |
| read | `packet` | `id` | |
| read | `library` | `kind?`, `q?`, `sort?`, `offset?`, `limit<=50` | |
| read | `library_item` | `id` | |
| read | `ledger` | `q?`, `actor?` (operator, agent, machine), `type?`, `project?`, `from?`, `to?` (YYYY-MM-DD), `cursor?`, `limit<=200` | |
| read | `events_after` | `after` (seq), `limit<=200` | |
| read | `composer_choices`, `compose_choices` | - | |
| launch | `composer_receipt` | `input` (composer estimate), `mode?` | |
| launch | `composer_run` | `input`, `mode?`, `token?`, `ceilingUsd?` | yes |
| launch | `compose` | the Compose input (`recipe`, `title?`, `styleId?`, `takeId?`, `topic?`, `units?`) | yes |
| launch | `set_part` | `id`, `rev`, `partId`, `patch` | yes |
| launch | `rename` | `id`, `rev`, `title` | yes |
| launch | `plan_receipt` | `id`, `mode?` | |
| launch | `plan_launch` | `id`, `rev`, `mode?`, `token?`, `ceilingUsd?` | yes |
| launch | `discard` | `id`, `rev` | yes |
| launch | `part_receipt` | `projectId`, `key`, `act`, `target?` | |
| launch | `part_act` | `projectId`, `key`, `act`, `target?`, `token` | yes |
| job | `status`, `reroute_options` | `jobId` | |
| job | `pause`, `resume`, `retry`, `cancel` | `jobId` | yes |
| job | `move` | `jobId`, `dir` (earlier, later) | yes |
| job | `reroute` | `jobId`, `option`, `token?` | yes |
| job | `ack_lane` | `lane` | yes |
| spend | `list` | `state?`, `day?`, `limit<=100` (this token's own requests) | |
| spend | `get` | `id` (`sr_` + 12 hex; any state, with reasons, note, jobIds, failure) | |

How `composer_run` and `plan_launch` decide:

- The receipt is recomputed for the requested `mode`. A `token` is optional. If the agent sends one that
  no longer matches, the call answers `stale` with the fresh receipt.
- `plan_launch` also answers `stale` when the plan's revision has moved past `rev`.
- `mode: "dry"`: the run or plan launches dry, as the agent.
- `mode: "live"` with a free receipt: it launches live, as the agent, on that receipt's token.
- `mode: "live"` otherwise: `{kind: "spend-requested", requestId, day, receipt, view: "/board/pkt:spend:<day>"}`,
  and nothing launches.
- In a process started with `GRAVITONE_DRY_ONLY=1`, a live receipt cannot be read at all, so the call is
  refused in-band.

What the kernel refuses an agent, in the kernel's own words: a retry of a failed or interrupted job
(`only an operator retries ...`), a re-route that requeues a failed or interrupted job, and the
acknowledgement of a held lane.

## Tests

- `tests/next-server/mcp-registry.test.ts`: the registry's rules and both projections.
- `tests/next-server/mcp-door.test.ts`: the envelope, who may call, scope, the live rule (with seeded
  receipts at the handler seam), the job refusals, cancel's ledger actor, and byte-identical results
  across projections.
- `tests/golden-path/mcp-conformance.probe.spec.ts`: the official SDK client (`@modelcontextprotocol/sdk`
  1.32.2, a devDependency imported only there) completes initialize, lists the tools and calls
  `gt_read projects`. It reaches the route's own `POST` through a fetch shim that answers any other
  method 405.
