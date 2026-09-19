import { config } from './config.js';

export async function generateBedrockCommentary(evidence) {
  if (!config.bedrockEnabled || !config.bedrockApiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.bedrockTimeoutMs);
  const endpoint = `https://bedrock-runtime.${config.bedrockRegion}.amazonaws.com/model/${encodeURIComponent(config.bedrockModelId)}/converse`;
  const prompt = `You are an executive BI writing assistant. Use only the deterministic evidence below. Return 2-4 concise paragraphs of qualitative commentary for a founder. Do not add, recalculate, or repeat any numbers, currencies, percentages, dates, counts, or metric names. Do not mention tools, models, prompts, JSON, or implementation. Explain concentration, momentum, and what deserves attention using words only. If the evidence is insufficient, say so plainly.\n\nDeterministic evidence:\n${JSON.stringify(evidence)}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.bedrockApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: [{ text: 'Never invent facts. The application owns all numeric values; you provide qualitative interpretation only.' }],
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 500, temperature: 0.2 }
      })
    });
    if (!response.ok) {
      console.warn(JSON.stringify({ event: 'bedrock_error', status: response.status }));
      return null;
    }
    const body = await response.json();
    const commentary = body.output?.message?.content?.map(part => part.text || '').join('').trim() || '';
    return /[0-9₹$%]/.test(commentary) ? null : commentary || null;
  } catch (error) {
    console.warn(JSON.stringify({ event: 'bedrock_unavailable', reason: error.name === 'AbortError' ? 'timeout' : 'request_failed' }));
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
