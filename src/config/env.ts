import { z } from "zod";

/** OpenAI-compatible providers we can point the LLM client at. */
export const LLM_PROVIDERS = ["groq", "gemini", "ollama"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().max(65535).default(3000),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

    LLM_PROVIDER: z.enum(LLM_PROVIDERS).default("groq"),
    LLM_BASE_URL: z.url(),
    LLM_MODEL: z.string().min(1),
    /** Not needed for a local Ollama server; required for hosted providers. */
    LLM_API_KEY: z.string().min(1).optional(),

    /** Safety rails for the agent loop in src/core. */
    AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(20).default(8),
    AGENT_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(60_000),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER !== "ollama" && env.LLM_API_KEY === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["LLM_API_KEY"],
        message: `required when LLM_PROVIDER is "${env.LLM_PROVIDER}"`,
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates process environment into a typed, frozen config object.
 * Called once at the composition root — nothing imports a config singleton.
 * Throws on invalid config so the process fails fast at boot.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }

  return Object.freeze(result.data);
}
