import "dotenv/config";
import { loadEnv } from "./config/env.js";

// Placeholder entry point: validates config at boot. The Express app and the
// agent container are wired in here in the next step.
const env = loadEnv();

console.log(
  `[boot] config ok — env=${env.NODE_ENV} port=${env.PORT} provider=${env.LLM_PROVIDER} model=${env.LLM_MODEL}`,
);
