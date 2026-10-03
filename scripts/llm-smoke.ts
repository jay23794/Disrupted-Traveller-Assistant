/**
 * Manual check that the configured provider actually answers and can call tools.
 * Run with: npm run smoke:llm
 */
import "dotenv/config";
import { z } from "zod";
import { loadEnv } from "../src/config/env.js";
import { OpenAiCompatibleLlmClient, type LlmTool } from "../src/infra/llm.js";
import { createLogger } from "../src/shared/utils/logger.js";

const env = loadEnv();
const logger = createLogger({ level: "debug" });
const llm = new OpenAiCompatibleLlmClient({ env, logger });

console.log(`provider=${env.LLM_PROVIDER} model=${env.LLM_MODEL} baseUrl=${env.LLM_BASE_URL}\n`);

// 1. Plain completion: can we reach the provider at all?
const plain = await llm.chat({
  messages: [
    { role: "system", content: "You are terse." },
    { role: "user", content: "Reply with the word OK" },
  ],
});
console.log("[1] plain completion");
console.log(`    content:   ${JSON.stringify(plain.content)}`);
console.log(`    toolCalls: ${plain.toolCalls.length}\n`);

// 2. Tool call: does the model use a tool when one clearly fits?
const getTime: LlmTool = {
  name: "get_time",
  description: "Get the current local time for an IANA timezone.",
  parameters: z.toJSONSchema(
    z.object({ timezone: z.string().describe("IANA timezone, e.g. Europe/London") }),
  ),
};

const tooled = await llm.chat({
  messages: [
    { role: "system", content: "Use the provided tools when they fit the question." },
    { role: "user", content: "What time is it in Tokyo right now?" },
  ],
  tools: [getTime],
});
console.log("[2] with one dummy tool (get_time)");
console.log(`    tool call returned: ${tooled.toolCalls.length > 0 ? "YES" : "NO"}`);
for (const call of tooled.toolCalls) {
  console.log(`    -> ${call.name}(${call.arguments}) [id=${call.id}]`);
}
if (tooled.content !== null) console.log(`    content: ${JSON.stringify(tooled.content)}`);
