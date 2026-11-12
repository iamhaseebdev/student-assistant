import Notebook from '../model/notebook.model.js';

// -------------------------------------------------------------------------
// AI LAYER (Gemini first, Groq as backup) — keys ONLY from .env
// -------------------------------------------------------------------------
async function callGemini(prompt, json) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY missing in .env');
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(90000),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: json ? { responseMimeType: 'application/json' } : {}
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

async function callGroq(prompt, json) {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new Error('GROQ_API_KEY missing in .env');
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(120000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_completion_tokens: 16000,
      ...(model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
      messages: [{ role: 'user', content: prompt }],
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

async function askAI(prompt, json = false, minLen = 0) {
  const errors = [];
  for (const [name, fn] of [['gemini', callGemini], ['groq', callGroq]]) {
    try {
      const text = await fn(prompt, json);
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

// 1. Get User Notebook Pages & Drawings
export const getNotebook = async (req, res) => {
  try {
    const studentId = req.user?.id || req.user?._id || req.userId;
    if (!studentId) {
      return res.status(401).json({ success: false, message: 'Unauthorized access' });
    }

    let notebook = await Notebook.findOne({ studentId });

    if (!notebook) {
      notebook = await Notebook.create({
        studentId,
        pages: [{ pageNumber: 1, content: '', drawingData: '' }]
      });
    }

    return res.status(200).json({
      success: true,
      pages: notebook.pages
    });
  } catch (error) {
    console.error('Get Notebook Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch notebook data' });
  }
};

// 2. Save / Update Full Notebook
export const saveNotebook = async (req, res) => {
  try {
    const studentId = req.user?.id || req.user?._id || req.userId;
    const { pages } = req.body;

    if (!studentId) {
      return res.status(401).json({ success: false, message: 'Unauthorized access' });
    }

    const notebook = await Notebook.findOneAndUpdate(
      { studentId },
      { pages },
      { returnDocument: 'after', upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Notebook saved successfully!',
      pages: notebook.pages
    });
  } catch (error) {
    console.error('Save Notebook Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save notebook' });
  }
};

// 3. AI Spell & Grammar Fix (Gemini first, Groq as backup)
export const fixNotebookSpelling = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Text is required for correction' });
    }

    console.log(`🛠 fixNotebookSpelling called (${text.length} chars)`);

    const prompt = `You are an expert proofreader. Correct all spelling and grammar errors in the student notebook text below. Preserve line breaks, structure, and original meaning. Return ONLY the corrected text without any chat commentary, introduction, or quotes.

TEXT:
${text.slice(0, 20000)}`;

    const raw = await askAI(prompt, false);
    const correctedText = raw.trim() || text;

    return res.status(200).json({
      success: true,
      correctedText
    });
  } catch (error) {
    console.error('Notebook AI Fix Error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fix notebook spelling via AI' });
  }
};