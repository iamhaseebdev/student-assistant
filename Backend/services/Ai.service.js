// Backend/services/ai.service.js
// Shared AI layer (same as Notes Vault): Gemini first, Groq as backup. Keys ONLY from .env
//   GEMINI_API_KEY, GEMINI_MODEL (optional), GROQ_API_KEY, GROQ_MODEL (optional)
//
//   askAI(prompt, { json, system, temperature, minLen })   -> one-shot question (quiz, notes ...)
//   askAIChat(messages, { system, temperature })           -> multi-turn chat history (study chatbot)

async function callGemini({ messages, system, json, temperature }) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY missing in .env');
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  const generationConfig = {};
  if (json) generationConfig.responseMimeType = 'application/json';
  if (temperature !== undefined) generationConfig.temperature = temperature;

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(90000),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        generationConfig
      })
    }
  );
  const data = await r.json();
  const cand = data?.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text || '').join('');
  if (!text) throw new Error(`Gemini: ${JSON.stringify(data?.error || data).slice(0, 300)}`);
  if (cand.finishReason && cand.finishReason !== 'STOP') {
    throw new Error(`Gemini stopped early (${cand.finishReason}) after ${text.length} chars`);
  }
  return text;
}

async function callGroq({ messages, system, json, temperature }) {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new Error('GROQ_API_KEY missing in .env');
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

  const fullMessages = [];
  if (system) fullMessages.push({ role: 'system', content: system });
  fullMessages.push(...messages.map((m) => ({ role: m.role, content: m.content })));

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(120000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: temperature ?? 0.4,
      max_completion_tokens: 16000,
      ...(model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
      messages: fullMessages,
      // Groq JSON mode needs a JSON *object* (not a bare array) -> prompts must ask for {"...": [...]}
      ...(json ? { response_format: { type: 'json_object' } } : {})
    })
  });
  const data = await r.json();
  const choice = data?.choices?.[0];
  const text = choice?.message?.content;
  if (!text) throw new Error(`Groq: ${JSON.stringify(data?.error || data).slice(0, 300)}`);
  if (choice.finish_reason === 'length') {
    throw new Error(`Groq output was cut off (finish_reason=length) after ${text.length} chars`);
  }
  return text;
}

async function runProviders({ messages, system, json, temperature, minLen = 0 }) {
  const errors = [];
  for (const [name, fn] of [['gemini', callGemini], ['groq', callGroq]]) {
    try {
      const text = await fn({ messages, system, json, temperature });
      if (text.length < minLen) throw new Error(`${name} answer too short (${text.length} chars, need ${minLen}+)`);
      console.log(`✅ AI answered via ${name} (${text.length} chars)`);
      return text;
    } catch (e) {
      console.error(`❌ ${name} failed ->`, e.message);
      errors.push(e.message);
    }
  }
  throw new Error('All AI providers failed: ' + errors.join(' | '));
}

// One-shot: askAI("question", { json: true, system: "...", temperature: 0.2 })
export async function askAI(prompt, { json = false, system = '', temperature, minLen = 0 } = {}) {
  return runProviders({
    messages: [{ role: 'user', content: prompt }],
    system,
    json,
    temperature,
    minLen
  });
}

// Chat: pass the frontend history [{role:'user'|'assistant', content:'...'}]
export async function askAIChat(history, { system = '', temperature } = {}) {
  let messages = (Array.isArray(history) ? history : [])
    .map((m) => ({
      role: m?.role === 'assistant' || m?.role === 'bot' ? 'assistant' : m?.role === 'user' ? 'user' : null,
      content: typeof m?.content === 'string' ? m.content : typeof m?.text === 'string' ? m.text : ''
    }))
    .filter((m) => m.role && m.content.trim())
    .slice(-20); // keep the request small

  // the conversation must start with the student's message
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length) throw new Error('No valid user message found in chat history.');

  return runProviders({ messages, system, json: false, temperature });
}