export const AGENT_PROMPTS = {
  agentPromptsSchemaAlignedV3: {
    id: "agentPromptsSchemaAlignedV3",
    label: "Schema-aligned v3",
    filePath: "Specs/agent/EmllyStudio_AgentPrompts_schemaAligned_v3.md",
  },
  agentPromptsSchemaAlignedV4_1: {
    id: "agentPromptsSchemaAlignedV4_1",
    label: "Schema-aligned v4.1",
    filePath: "Specs/agent/EmllyStudio_AgentPrompts_schemaAligned_v4_1.md",
  },
} as const;

export const ACTIVE_AGENT_PROMPT_ID = "agentPromptsSchemaAlignedV4_1";
export const ACTIVE_AGENT_PROMPT = AGENT_PROMPTS[ACTIVE_AGENT_PROMPT_ID];
