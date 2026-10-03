# Project: Disrupted Traveller Assistant (Collinson take-home)

A multi-agent backend. A traveller describes a problem (flight delay, lounge access,
insurance claim). An orchestrator agent delegates to specialist sub-agents:
- flight agent: flight status + airport weather
- lounge agent: lounges at airport/terminal + membership entitlement
- insurance agent: policy lookup, delay coverage rules, claim drafts, policy docs via MCP

## Stack
TypeScript (strict), Node 20, Express 4, Zod 4, Vitest, openai SDK (used as an
OpenAI-compatible client for Groq/Gemini/Ollama),@modelcontextprotocol/client (MCP TypeScript SDK v2). Never use the v1
@modelcontextprotocol/sdk package. Imports: Client from "@modelcontextprotocol/client",
StdioClientTransport from "@modelcontextprotocol/client/stdio".
No agent framework: we build a small agent runtime ourselves in src/core.

## Architecture rules
- Feature folders: src/features/<name>/<name>.{routes,controller,service,repository,schema,tools,agent}.ts
- Layers: routes → controller → service → repository (interface) ← providers (implementations)
- Agents call tools; tools are thin adapters that call SERVICES, never repositories.
- Services depend on interfaces, never concrete classes. Constructor injection only.
- Private fields prefixed with underscore: private _flightRepo: FlightRepository
- All wiring happens in src/infra/container.ts (composition root). No module imports a singleton.
- src/core = agent runtime, domain-agnostic (knows nothing about flights/lounges/insurance).
- src/infra = anything that talks to the outside world (LLM, MCP, HTTP).
- src/shared = errors, middleware, utils.
- Errors: throw AppError subclasses from shared/errors. Controllers have no try/catch;
  asyncHandler + central errorHandler middleware handle them.
- Validation: Zod everywhere (env, request bodies, tool args). Use Zod 4 built-in
  z.toJSONSchema() (do not install zod-to-json-schema).
- Responses use the envelope in shared/utils/apiResponse.ts.
- Tests colocated as *.test.ts. Mock data in features/<name>/data/*.json.

## Working style
Only implement the current step. Keep code small and readable. After writing code,
explain briefly what each file does and why.