import { z, type ZodType } from "zod";
import type { LlmTool } from "../infra/llm.js";

/**
 * One capability an agent can invoke.
 *
 * `TArgs` is whatever `schema` validates, so `execute` only ever receives parsed,
 * trusted arguments — raw model output never reaches it. Implementations stay thin:
 * a tool adapts a service call, it holds no logic of its own.
 */
export interface Tool<TArgs = unknown> {
  readonly name: string;
  /** Written for the model: what it does and when to reach for it. */
  readonly description: string;
  readonly schema: ZodType<TArgs>;
  /**
   * JSON Schema to advertise instead of deriving one from `schema`. Set it when the
   * contract was authored elsewhere — an MCP server publishes its own schemas — so we
   * forward that contract untouched rather than round-tripping it through Zod.
   */
  readonly rawJsonSchema?: Record<string, unknown>;
  execute(args: TArgs): Promise<unknown>;
}

/**
 * A tool whose argument type is not known to the holder.
 *
 * `execute` is declared with method syntax, which TypeScript checks bivariantly, so
 * every `Tool<T>` is assignable here. That is what lets an agent keep a heterogeneous
 * list of tools while each one still validates its own arguments through its own schema.
 */
export type AnyTool = Tool<unknown>;

/**
 * Projects a tool into the provider-neutral shape the LLM client advertises.
 *
 * `io: "input"` matters: we describe the arguments the model must *send*, so a field
 * with a Zod default is optional here, even though it is always present after parsing.
 */
export function toLlmToolDefinition(tool: AnyTool): LlmTool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.rawJsonSchema ?? z.toJSONSchema(tool.schema, { io: "input" }),
  };
}
