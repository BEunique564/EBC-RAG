const PROVIDERS = {
  ollama: {
    baseUrl: () => process.env.LLM_OLLAMA_URL || "http://localhost:11434",
    model: () => process.env.LLM_OLLAMA_MODEL || "qwen2.5:7b",
    headers: () => ({}),
    body: (model, messages, opts) => ({ model, messages, stream: false, ...opts })
  },
  openai: {
    baseUrl: () => "https://api.openai.com/v1",
    model: () => process.env.LLM_OPENAI_MODEL || "gpt-4o-mini",
    headers: () => process.env.LLM_OPENAI_KEY ? { Authorization: `Bearer ${process.env.LLM_OPENAI_KEY}` } : {},
    body: (model, messages, opts) => ({ model, messages, ...opts })
  },
  azure: {
    baseUrl: () => process.env.LLM_AZURE_ENDPOINT || "",
    model: () => process.env.LLM_AZURE_DEPLOYMENT || "",
    headers: () => process.env.LLM_AZURE_KEY ? { "api-key": process.env.LLM_AZURE_KEY } : {},
    body: (model, messages, opts) => ({ model, messages, ...opts })
  }
};

function resolveProvider() {
  const name = process.env.LLM_PROVIDER || "";
  if (!name) return null;
  const provider = PROVIDERS[name];
  if (!provider) return null;
  const baseUrl = provider.baseUrl();
  const model = provider.model();
  if (!baseUrl || !model) return null;
  return { name, baseUrl, model, headers: provider.headers(), body: provider.body };
}

export async function generateWithLLM(systemPrompt, userContent) {
  const provider = resolveProvider();
  if (!provider) return null;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ];

  const body = provider.body(provider.model, messages, {
    temperature: 0.1,
    max_tokens: 2048,
    seed: 42
  });

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...provider.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

export function isLLMConfigured() {
  return resolveProvider() !== null;
}
