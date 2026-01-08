export const AGENT_PROMPTS = {
  agentPromptsSchemaAlignedV3: {
    id: "agentPromptsSchemaAlignedV3",
    label: "Schema-aligned v3",
    filePath: "Specs/agent/EmllyStudio_AgentPrompts_schemaAligned_v3.md",
  },
} as const;

export const ACTIVE_AGENT_PROMPT_ID = "agentPromptsSchemaAlignedV3";
export const ACTIVE_AGENT_PROMPT = AGENT_PROMPTS[ACTIVE_AGENT_PROMPT_ID];
