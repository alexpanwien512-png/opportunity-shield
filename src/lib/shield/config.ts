export const config = {
  nebiusApiKey: process.env.NEBIUS_API_KEY ?? "",
  nebiusBaseUrl: process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1/",
  fastModel: process.env.NEMOTRON_FAST_MODEL ?? "nvidia/Nemotron-3_5-Lightning",
  reasoningModel: process.env.NEMOTRON_REASONING_MODEL ?? "nvidia/Nemotron-3-Ultra-550b-a55b",
  tavilyApiKey: process.env.TAVILY_API_KEY ?? "",
  githubToken: process.env.GITHUB_TOKEN ?? "",
  dbPath: process.env.SHIELD_DB_PATH ?? "data/shield.db",
};
