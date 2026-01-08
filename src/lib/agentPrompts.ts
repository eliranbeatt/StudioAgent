export const AGENT_PROMPTS = {
  agentPromptsSchemaAlignedV1: {
    id: "agentPromptsSchemaAlignedV1",
    label: "Schema-aligned v1",
    filePath: "Specs/agent/EmllyStudio_AgentPrompts_schemaAligned_v1.md",
  },
} as const;

export const ACTIVE_AGENT_PROMPT_ID = "agentPromptsSchemaAlignedV1";
export const ACTIVE_AGENT_PROMPT = AGENT_PROMPTS[ACTIVE_AGENT_PROMPT_ID];
