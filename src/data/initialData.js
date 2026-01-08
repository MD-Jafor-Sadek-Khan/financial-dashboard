// This file is ONLY used if the Database is empty (First run ever)
export const INITIAL_DATA = {
  n8nData: { 
    plan: 'pro', 
    users: 1, 
    executionsPerUser: 4800, 
    duration: 'monthly' 
  },
  aiNodes: [
    { name: 'Email Classifier', model: 'gpt-4o-mini', inputTokens: 1500, outputTokens: 50, executionsPerDay: 200, cacheHitRate: 0 },
    { name: 'Draft Agent', model: 'gpt-4o', inputTokens: 4000, outputTokens: 300, executionsPerDay: 50, cacheHitRate: 0 }
  ],
  pineconeData: { 
    plan: 'standard', 
    storageGB: 0.3, 
    readUnits: 4320, 
    writeUnits: 3600 
  },
  pricing: {
    n8n: {
      starter: { price: 20, limit: 2500, label: "Starter ($20/mo, 2.5k execs)", yearlyDiscountPercent: 0.20 },
      pro: { price: 50, limit: 10000, label: "Pro ($50/mo, 10k execs)", yearlyDiscountPercent: 0.20 },
      business: { price: 667, limit: 40000, label: "Business ($667/mo, 40k execs)", yearlyDiscountPercent: 0.15 },
    },
    openai: {
        // Prices per 1 Million Tokens (Input / Cached Input / Output)
        "gpt-5.2": { input: 1.75, cached: 0.175, output: 14.00, label: "GPT-5.2" },
        "gpt-5.1": { input: 1.25, cached: 0.125, output: 10.00, label: "GPT-5.1" },
        "gpt-5": { input: 1.25, cached: 0.125, output: 10.00, label: "GPT-5" },
        "gpt-5-mini": { input: 0.25, cached: 0.025, output: 2.00, label: "GPT-5 Mini" },
        "gpt-5-nano": { input: 0.05, cached: 0.005, output: 0.40, label: "GPT-5 Nano" },
        "gpt-5.2-chat-latest": { input: 1.75, cached: 0.175, output: 14.00, label: "GPT-5.2 Chat Latest" },
        "gpt-5.1-chat-latest": { input: 1.25, cached: 0.125, output: 10.00, label: "GPT-5.1 Chat Latest" },
        "gpt-5-chat-latest": { input: 1.25, cached: 0.125, output: 10.00, label: "GPT-5 Chat Latest" },
        "gpt-5.1-codex-max": { input: 1.25, cached: 0.125, output: 10.00, label: "GPT-5.1 Codex Max" },
        "gpt-5.1-codex": { input: 1.25, cached: 0.125, output: 10.00, label: "GPT-5.1 Codex" },
        "gpt-5-codex": { input: 1.25, cached: 0.125, output: 10.00, label: "GPT-5 Codex" },
        "gpt-5.2-pro": { input: 21.00, cached: 21.00, output: 168.00, label: "GPT-5.2 Pro" },
        "gpt-5-pro": { input: 15.00, cached: 15.00, output: 120.00, label: "GPT-5 Pro" },
        "gpt-4.1": { input: 2.00, cached: 0.50, output: 8.00, label: "GPT-4.1" },
        "gpt-4.1-mini": { input: 0.40, cached: 0.10, output: 1.60, label: "GPT-4.1 Mini" },
        "gpt-4.1-nano": { input: 0.10, cached: 0.025, output: 0.40, label: "GPT-4.1 Nano" },
        "gpt-4o": { input: 2.50, cached: 1.25, output: 10.00, label: "GPT-4o" },
        "gpt-4o-2024-05-13": { input: 5.00, cached: 5.00, output: 15.00, label: "GPT-4o (2024-05-13)" },
        "gpt-4o-mini": { input: 0.15, cached: 0.075, output: 0.60, label: "GPT-4o Mini" },
        "gpt-realtime": { input: 4.00, cached: 0.40, output: 16.00, label: "GPT Realtime" },
        "gpt-realtime-mini": { input: 0.60, cached: 0.06, output: 2.40, label: "GPT Realtime Mini" },
        "gpt-4o-realtime-preview": { input: 5.00, cached: 2.50, output: 20.00, label: "GPT-4o Realtime Preview" },
        "gpt-4o-mini-realtime-preview": { input: 0.60, cached: 0.30, output: 2.40, label: "GPT-4o Mini Realtime" },
        "gpt-audio": { input: 2.50, cached: 2.50, output: 10.00, label: "GPT Audio" },
        "gpt-audio-mini": { input: 0.60, cached: 0.60, output: 2.40, label: "GPT Audio Mini" },
        "gpt-4o-audio-preview": { input: 2.50, cached: 2.50, output: 10.00, label: "GPT-4o Audio Preview" },
        "gpt-4o-mini-audio-preview": { input: 0.15, cached: 0.15, output: 0.60, label: "GPT-4o Mini Audio" },
        "o1": { input: 15.00, cached: 7.50, output: 60.00, label: "o1" },
        "o1-pro": { input: 150.00, cached: 150.00, output: 600.00, label: "o1 Pro" },
        "o3-pro": { input: 20.00, cached: 20.00, output: 80.00, label: "o3 Pro" },
        "o3": { input: 2.00, cached: 0.50, output: 8.00, label: "o3" },
        "o3-deep-research": { input: 10.00, cached: 2.50, output: 40.00, label: "o3 Deep Research" },
        "o4-mini": { input: 1.10, cached: 0.275, output: 4.40, label: "o4 Mini" },
        "o4-mini-deep-research": { input: 2.00, cached: 0.50, output: 8.00, label: "o4 Mini Deep Research" },
        "o3-mini": { input: 1.10, cached: 0.55, output: 4.40, label: "o3 Mini" },
        "o1-mini": { input: 1.10, cached: 0.55, output: 4.40, label: "o1 Mini" },
    },
    pinecone: {
      storage: 0.33, 
      read: 8.25,   
      write: 4.50,
      plans: {
        starter: { min: 0, label: "Starter (Free)" },
        standard: { min: 0, label: "Serverless (Usage Based)" },
        enterprise: { min: 500, label: "Enterprise" }
      }
    }
  }
};