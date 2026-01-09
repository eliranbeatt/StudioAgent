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
  agentPromptsSchemaAlignedV5: {
    id: "agentPromptsSchemaAlignedV5",
    label: "Schema-aligned v5",
    filePath: "Specs/agent/EmllyStudio_AgentPrompts_schemaAligned_v5.md",
  },
  agentPromptsSchemaAlignedV6: {
    id: "agentPromptsSchemaAlignedV6",
    label: "Schema-aligned v6",
    filePath: "Specs/agent/EmllyStudio_AgentPrompts_schemaAligned_v6.md",
  },
  agentPromptsSchemaAlignedV7: {
    id: "agentPromptsSchemaAlignedV7",
    label: "Schema-aligned v7",
    filePath: "Specs/agent/EmllyStudio_AgentPrompts_v7.md",
  },
} as const;

export const ACTIVE_AGENT_PROMPT_ID = "agentPromptsSchemaAlignedV7";
export const ACTIVE_AGENT_PROMPT = AGENT_PROMPTS[ACTIVE_AGENT_PROMPT_ID];
