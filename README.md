# Disrupted-Traveller-Assistant

Multi-agent backend: an orchestrator agent triages a traveller's problem and delegates to
flight, lounge and insurance specialist agents. See `CLAUDE.md` for architecture rules.

## Requirements

Node 20+ (uses npm).

## Setup

```bash
npm install
cp .env.example .env   # then fill in LLM_API_KEY (not needed for ollama)
```

## Scripts

| Script              | What it does                        |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Run `src/server.ts` with tsx watch  |
| `npm run build`     | Type-check and emit to `dist/`      |
| `npm start`         | Run the built server                |
| `npm run typecheck` | Type-check without emitting         |

## Configuration

All env vars are validated at boot by `src/config/env.ts` (Zod); the process exits with a
readable report if anything is missing or malformed. `LLM_BASE_URL` / `LLM_MODEL` /
`LLM_API_KEY` point the `openai` SDK at any OpenAI-compatible provider (Groq, Gemini, Ollama).
