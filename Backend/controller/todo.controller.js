// Backend/controller/todo.controller.js
import Todo from "../model/todo.model.js";

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

function parseJSON(text) {
    const clean = text.replace(/```json|```/g, '').trim();
    try {
        return JSON.parse(clean);
    } catch (e) {
        // AI sometimes adds a sentence before/after the JSON -> cut out the JSON part
        const start = clean.search(/[\[{]/);
        const end = Math.max(clean.lastIndexOf('}'), clean.lastIndexOf(']'));
        if (start !== -1 && end > start) return JSON.parse(clean.slice(start, end + 1));
        throw e;
    }
}

// Get Todos of Logged-in Student
async function getTodos(req, res) {
    try {
        const todos = await Todo.find({ userId: req.user.id }).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: todos });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

// Add New Todo Manually
async function createTodo(req, res) {
    try {
        const { title, priority } = req.body;
        if (!title) return res.status(400).json({ success: false, message: 'Title is required' });

        const todo = await Todo.create({
            userId: req.user.id,
            title,
            priority
        });
        return res.status(201).json({ success: true, data: todo });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

// Toggle Todo Status
async function toggleTodo(req, res) {
    try {
        const todo = await Todo.findOne({ _id: req.params.id, userId: req.user.id });
        if (!todo) return res.status(404).json({ success: false, message: 'Todo not found' });

        todo.completed = !todo.completed;
        await todo.save();

        return res.status(200).json({ success: true, data: todo });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

// Delete Todo
async function deleteTodo(req, res) {
    try {
        const deleted = await Todo.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        if (!deleted) return res.status(404).json({ success: false, message: 'Todo not found' });

        return res.status(200).json({ success: true, message: 'Task deleted' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

const ALLOWED_PRIORITIES = ['high', 'medium', 'low'];

// Generate Tasks automatically from Syllabus via AI (Gemini first, Groq as backup)
async function generateSyllabusTodos(req, res) {
    try {
        const { subject, syllabusText, days } = req.body;
        if (!syllabusText || !syllabusText.trim()) {
            return res.status(400).json({ success: false, message: 'Syllabus content is required' });
        }

        const numberOfDays = Math.min(Math.max(parseInt(days) || 7, 1), 60);

        // NOTE: Groq's JSON mode needs a JSON OBJECT (not a bare array), so we ask for { "tasks": [...] }
        const prompt = `You are an expert study planner.
Break down the following syllabus for subject "${subject || 'General Subject'}" into a structured day-by-day study task plan spread over ${numberOfDays} days.

Syllabus Content:
${syllabusText.slice(0, 12000)}

Return ONLY valid JSON without markdown formatting or extra text.
Format required:
{
  "tasks": [
    {
      "title": "Day 1: Subject - Specific topic/chapter to cover",
      "priority": "high"
    }
  ]
}
Priorities allowed: "high", "medium", or "low". Ensure task titles start with "Day X:".`;

        const raw = await askAI(prompt, true);
        const parsed = parseJSON(raw);

        const generatedTasks = Array.isArray(parsed)
            ? parsed
            : parsed?.tasks || Object.values(parsed || {}).find(Array.isArray) || [];

        const newTodosData = generatedTasks
            .filter((item) => item && typeof item.title === 'string' && item.title.trim())
            .map((item) => ({
                userId: req.user.id,
                title: item.title.trim(),
                priority: ALLOWED_PRIORITIES.includes(String(item.priority).toLowerCase())
                    ? String(item.priority).toLowerCase()
                    : 'medium',
                completed: false
            }));

        if (newTodosData.length === 0) {
            return res.status(502).json({ success: false, message: 'AI did not return any usable tasks. Please try again.' });
        }

        // Bulk Save to MongoDB
        const createdTodos = await Todo.insertMany(newTodosData);

        return res.status(201).json({
            success: true,
            data: createdTodos
        });

    } catch (error) {
        console.error("AI Syllabus Todo Error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to generate study plan"
        });
    }
}

// Separate Exports at Bottom
export {
    getTodos,
    createTodo,
    toggleTodo,
    deleteTodo,
    generateSyllabusTodos
};