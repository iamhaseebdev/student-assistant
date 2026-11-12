import NotesVault from '../model/NotesVault.model.js';
import Progress from '../model/progress.model.js';
import { registerClearedDay } from '../model/Streak.model.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { put } from '@vercel/blob';
// NOTE: import from lib/ directly (the package index has a known debug-mode bug in ESM)
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

console.log('📦 notesVault.controller loaded - version 12 (upload fix + Q/A only)');
const ALLOWED_SUBJECTS = ['Computer', 'Physics', 'Chemistry', 'Biology', 'Math', 'Urdu', 'Islamiat', 'PST (Pakistan Studies)', 'English'];

// Vercel pe disk read-only hai -> PDFs Vercel Blob me save hoti hain (env: BLOB_READ_WRITE_TOKEN)
async function uploadPdf(fileName, buffer) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN missing in env');
  const blob = await put(`notes/${fileName}`, buffer, {
    access: 'public',
    contentType: 'application/pdf',
    addRandomSuffix: true
  });
  return blob.url;
}

// -------------------------------------------------------------------------
// 1. AI LAYER  (Gemini first, Groq as backup) — keys ONLY from .env
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

// minLen: reject answers that are suspiciously short and try the next provider
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

// Accept different shapes the AI may return: {questions:[...]}, [...], other key names
function normalizeQuestions(parsed) {
  const arr = Array.isArray(parsed)
    ? parsed
    : parsed?.questions || parsed?.Questions || parsed?.exam || Object.values(parsed || {}).find(Array.isArray) || [];
  return arr
    .map((q) => (typeof q === 'string'
      ? { question: q, answer: '', marks: 5 }
      : {
          question: q.question || q.q || q.text || q.prompt || '',
          answer: q.answer || q.model_answer || q.modelAnswer || q.a || '',
          marks: q.marks || 5
        }))
    .filter((q) => typeof q.question === 'string' && q.question.trim());
}

// -------------------------------------------------------------------------
// 2. PROMPTS
// -------------------------------------------------------------------------
const FORMAT_RULES = `FORMAT RULES (strict, the PDF engine depends on them):
- Main headings: a line starting with "## ".  Sub-headings: a line starting with "### ".
- Bullets: a line starting with "- ".
- Working steps: a line starting with "Step 1:", "Step 2:" ... (one idea per step, 3-8 word reason).
- Final result: a line "Answer:" (then the result on the next line as an EQ line, or on the same line if it is a sentence).
- EVERY equation, calculation and chemical reaction goes on its own line starting with "EQ: ".
- Fractions inside EQ lines: frac{top}{bottom}.  Example: EQ: frac{dy}{dx} = frac{u′v − uv′}{v^{2}}   (never use frac in normal sentences).
- Use _{...} for subscripts and ^{...} for powers/charges EVERYWHERE (equations AND normal sentences), e.g. H_{2}O, Cu^{2+}, mol^{-1}, x^{2}, v_{y}, lim_{x→0}, ∫_{0}^{1}.
- Use real symbols: θ α β γ Δ ω λ μ π ρ σ φ √ × ÷ ≈ ≠ ≤ ≥ → ⇌ ↑ ↓ ° ∫ ∑ ∞ ′.
  Examples:  EQ: v_{y} = u sin θ − g t   |   EQ: R = frac{u^{2} sin 2θ}{g}   |   EQ: 2Cu_{2}O + Cu_{2}S → 6Cu + SO_{2}   |   EQ: f′(x) = lim_{h→0} frac{f(x+h) − f(x)}{h}
- No other markdown (no **, no #, no tables, no code blocks, no LaTeX, no $ signs). Use the plain minus sign "-" or "−", never special hyphens.`;

// Board is stored inside studentClass, e.g. "10th Class (SSC Part-II) - Sindh Board"
function boardInfo(studentClass = '') {
  const c = String(studentClass);
  if (/sindh|ssc|hsc/i.test(c)) {
    return {
      label: 'Sindh board',
      books: 'Sindh Textbook Board (Jamshoro) books for SSC (9th-10th) / HSC (11th-12th), as followed by the Sindh boards (BSEK, BIEK Karachi, Hyderabad, Sukkur, Larkana, Mirpurkhas etc.)'
    };
  }
  if (/federal|fbise|fsc|ics/i.test(c)) {
    return { label: 'Federal board', books: 'Federal Board (FBISE) / National Book Foundation books' };
  }
  return { label: 'Pakistan board', books: 'the official Pakistan board textbooks' };
}

function buildNotesPrompt({ topicTitle, subjectName, studentClass }) {
  const b = boardInfo(studentClass);
  const syllabus = `SYLLABUS: strictly the ${b.label} syllabus for ${studentClass}, i.e. ${b.books}. Use the same terms, methods and order as those textbooks. No university-level extras.
LANGUAGE: VERY SIMPLE, EASY English that an average Pakistani student understands. Short sentences. If a technical word is needed, explain it in simple words right after it.`;

  const level = `${syllabus}
STYLE: write exactly the way a top-scoring student WRITES it on the answer sheet and can MEMORIZE it the night before the exam.
- Short sentences (about 15 words max).
- Definitions in the exact wording boards expect.
- Every derivation or process is broken into numbered steps, ONE equation per line, final result clearly stated.
- Give memory tricks (mnemonic / shortcut / pattern) wherever possible.
PARAGRAPH RULE: "Definitions", "Explanation" and any part that explains an idea must be written as flowing paragraphs (3-5 connected sentences), like in an answer sheet, NOT bullets. Use bullets only for real lists: Quick Revision Box, properties, uses, formulas, Common Mistakes, Memory Tricks, Likely Board Questions, Answer Sheet Tips.`;

  return `You are a board-exam topper coach for ${subjectName} (${studentClass}, ${b.label}).
Write notes on the topic: "${topicTitle}".
${level}

Choose ONE layout that fits this topic, the way the textbook teaches it:
LAYOUT A - numerical / derivation topics (Physics, and Chemistry laws/calculations):
## Quick Revision Box
## Definitions
## Explanation
## Derivation(s) - Step by Step
## Important Formulas with Units
## Solved Numericals (2, full steps, with units)
## Common Mistakes
## Memory Tricks
## Likely Board Questions (with marks)
## Answer Sheet Tips
LAYOUT B - descriptive / process topics (Chemistry processes and reactions, Biology, Computer, Pakistan Studies, and similar):
## Quick Revision Box
## Definitions
Then HEADING-WISE sections for the sub-topics exactly as the textbook divides them: "## " for the main parts and "### " for sub-parts (for example: occurrence, steps of the process with each chemical reaction as an EQ line, types, properties, uses, advantages and disadvantages, labelled-diagram description).
## Important Terms
## Common Mistakes
## Memory Tricks
## Likely Board Questions (with marks)
## Answer Sheet Tips
For Pakistan Studies give correct names, dates and places. For Chemistry write every reaction as an EQ line with correct formulas and balanced equations. Only write units where they truly belong to the quantity.
Be specific to "${topicTitle}" - no generic filler.
${FORMAT_RULES}`;
}

function buildExamPrompt(vault, source) {
  return `You are a board exam paper setter for ${vault.subjectName} (${vault.studentClass}, ${boardInfo(vault.studentClass).label}).
Using ONLY the study material below, create 5 different long descriptive board-style questions, each worth 5-8 marks.
Return ONLY valid JSON in this exact shape:
{"questions":[{"question":"...","answer":"complete model answer","marks":5}]}

STUDY MATERIAL:
${source}`;
}

// -------------------------------------------------------------------------
// 3. PDF RENDERER
// -------------------------------------------------------------------------
const FONT_REG = path.join(process.cwd(), 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD = path.join(process.cwd(), 'fonts', 'DejaVuSans-Bold.ttf');
const HAS_FONTS = fs.existsSync(FONT_REG) && fs.existsSync(FONT_BOLD);
if (!HAS_FONTS) console.warn('⚠️  fonts/DejaVuSans.ttf missing - Greek letters and math symbols will be garbled in PDFs.');

const LATEX_FIX = {
  '\\theta': 'θ', '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\Delta': 'Δ',
  '\\omega': 'ω', '\\Omega': 'Ω', '\\lambda': 'λ', '\\mu': 'μ', '\\pi': 'π', '\\rho': 'ρ',
  '\\sigma': 'σ', '\\phi': 'φ', '\\times': '×', '\\cdot': '·', '\\approx': '≈', '\\sqrt': '√',
  '\\rightarrow': '→', '\\infty': '∞', '\\int': '∫', '\\sum': '∑', '\\circ': '°'
};

function cleanLine(s) {
  let out = s.replace(/[\u2010\u2011\u2012]/g, '-').replace(/\*\*/g, '').replace(/`/g, '').replace(/\t/g, '  ').replace(/\$/g, '');
  for (const [k, v] of Object.entries(LATEX_FIX)) out = out.split(k).join(v);
  return out;
}

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', p: 'ₚ', s: 'ₛ', t: 'ₜ' };

function scriptsToUnicode(s) {
  return s.replace(/([_^])(?:\{([^}]*)\}|(\S))/g, (m, k, a, b) => {
    const t = a ?? b;
    const map = k === '^' ? SUP : SUB;
    const out = [...t].map((c) => map[c]);
    if (out.every(Boolean)) return out.join('');
    return k === '^' ? `^${t}` : `(${t})`;
  });
}

function fracToText(s) {
  let prev;
  do {
    prev = s;
    s = s.replace(/\\?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
  } while (s !== prev);
  return s;
}

function readGroup(str, i) {
  if (str[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < str.length; j++) {
    if (str[j] === '{') depth++;
    else if (str[j] === '}') {
      depth--;
      if (depth === 0) return [str.slice(i + 1, j), j + 1];
    }
  }
  return null;
}

function parseMath(s) {
  const segs = [];
  const re = /([_^])(?:\{([^}]*)\}|(\S))/g;
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) segs.push({ t: s.slice(last, m.index), k: 'n' });
    segs.push({ t: m[2] ?? m[3], k: m[1] === '_' ? 'sub' : 'sup' });
    last = re.lastIndex;
  }
  if (last < s.length) segs.push({ t: s.slice(last), k: 'n' });

  const out = [];
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i];
    const b = segs[i + 1];
    if (b && ((a.k === 'sub' && b.k === 'sup') || (a.k === 'sup' && b.k === 'sub'))) {
      out.push({ k: 'both', sub: a.k === 'sub' ? a.t : b.t, sup: a.k === 'sup' ? a.t : b.t });
      i++;
    } else {
      out.push(a);
    }
  }
  return out;
}

function parseEquation(s) {
  const items = [];
  let rest = s;
  while (rest.length) {
    const m = /\\?frac\s*(?=\{)/.exec(rest);
    if (!m) { items.push({ type: 'text', segs: parseMath(rest) }); break; }

    const start = m.index + m[0].length;
    const g1 = readGroup(rest, start);
    let j = g1 ? g1[1] : 0;
    while (rest[j] === ' ') j++;
    const g2 = g1 ? readGroup(rest, j) : null;

    if (!g1 || !g2) {
      items.push({ type: 'text', segs: parseMath(rest.slice(0, start)) });
      rest = rest.slice(start);
      continue;
    }
    if (m.index > 0) items.push({ type: 'text', segs: parseMath(rest.slice(0, m.index)) });
    items.push({ type: 'frac', num: parseMath(fracToText(g1[0])), den: parseMath(fracToText(g2[0])) });
    rest = rest.slice(g2[1]);
  }
  return items;
}

function segWidth(doc, seg, size, f) {
  const small = size * 0.7;
  doc.font(f);
  if (seg.k === 'n') { doc.fontSize(size); return doc.widthOfString(seg.t); }
  doc.fontSize(small);
  if (seg.k === 'both') return Math.max(doc.widthOfString(seg.sub), doc.widthOfString(seg.sup));
  return doc.widthOfString(seg.t);
}
const segsWidth = (doc, segs, size, f) => segs.reduce((sum, s) => sum + segWidth(doc, s, size, f), 0);

function itemWidth(doc, it, size, f) {
  if (it.type === 'text') return segsWidth(doc, it.segs, size, f);
  const fs = size * 0.85;
  return Math.max(segsWidth(doc, it.num, fs, f), segsWidth(doc, it.den, fs, f)) + 8;
}

function drawSegs(doc, segs, x, top, size, f) {
  const small = size * 0.7;
  for (const s of segs) {
    const w = segWidth(doc, s, size, f);
    doc.fillColor('#0f172a').font(f);
    if (s.k === 'n') {
      doc.fontSize(size).text(s.t, x, top, { lineBreak: false });
    } else if (s.k === 'both') {
      doc.fontSize(small);
      doc.text(s.sup, x, top - size * 0.29, { lineBreak: false });
      doc.text(s.sub, x, top + size * 0.36, { lineBreak: false });
    } else {
      doc.fontSize(small).text(s.t, x, top + (s.k === 'sub' ? size * 0.33 : -size * 0.29), { lineBreak: false });
    }
    x += w;
  }
  return x;
}

function drawEquation(doc, text, fontReg) {
  const N = 12;
  const left = 40;
  const boxW = doc.page.width - 80;
  const items = parseEquation(text);
  const hasFrac = items.some((i) => i.type === 'frac');
  const boxH = hasFrac ? 50 : 30;
  const total = items.reduce((sum, it) => sum + itemWidth(doc, it, N, fontReg), 0);

  if (total > boxW - 30) {
    const plain = fracToText(scriptsToUnicode(text)).replace(/[{}]/g, '');
    doc.font(fontReg).fontSize(11).fillColor('#0f172a').text(plain, left + 12, undefined, { width: boxW - 24 });
    doc.x = left;
    return;
  }

  if (doc.y + boxH + 8 > doc.page.height - 50) doc.addPage();

  const y0 = doc.y + 3;
  doc.save().roundedRect(left, y0, boxW, boxH, 4).fill('#f1f5f9').restore();
  doc.save().rect(left, y0, 3, boxH).fill('#0891b2').restore();

  const axis = y0 + boxH / 2;
  const mainTop = axis - N * 0.62;
  let x = left + (boxW - total) / 2;

  for (const it of items) {
    if (it.type === 'text') {
      x = drawSegs(doc, it.segs, x, mainTop, N, fontReg);
    } else {
      const fs = N * 0.85;
      const w = itemWidth(doc, it, N, fontReg);
      const numW = segsWidth(doc, it.num, fs, fontReg);
      const denW = segsWidth(doc, it.den, fs, fontReg);
      drawSegs(doc, it.num, x + (w - numW) / 2, axis - 2.5 - fs * 1.17, fs, fontReg);
      drawSegs(doc, it.den, x + (w - denW) / 2, axis + 2.5, fs, fontReg);
      doc.save().lineWidth(0.8).strokeColor('#0f172a').moveTo(x + 1, axis).lineTo(x + w - 1, axis).stroke().restore();
      x += w;
    }
  }
  doc.x = left;
  doc.y = y0 + boxH + 6;
}

// Returns the PDF as a Buffer (no file is written to disk)
function renderTextToRealPDF(topicTitle, subjectName, studentClass, content) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let fR = 'Helvetica';
    let fB = 'Helvetica-Bold';
    if (HAS_FONTS) {
      doc.registerFont('R', FONT_REG);
      doc.registerFont('B', FONT_BOLD);
      fR = 'R';
      fB = 'B';
    }

    doc.rect(0, 0, doc.page.width, 85).fill('#0f172a');
    doc.fillColor('#00f3ff').fontSize(16).font(fB)
      .text(`BOARD EXAM NOTES: ${topicTitle.toUpperCase()}`, 40, 22, { width: doc.page.width - 80 });
    doc.fillColor('#94a3b8').fontSize(11).font(fR)
      .text(`Subject: ${subjectName} | Class: ${studentClass || '12th Class'}`, 40, 58);
    doc.x = 40;
    doc.y = 110;

    for (const raw of content.split('\n')) {
      const cleaned = cleanLine(raw).trim();
      if (!cleaned) { doc.moveDown(0.3); continue; }
      const isEq = /^(?:[-•*]\s+)?EQ:\s*/i.test(cleaned);
      const line = isEq ? cleaned : fracToText(scriptsToUnicode(cleaned));

      const body = line.replace(/^[-•*]\s+/, '');

      if (/^#{1,4}\s+/.test(line)) {
        const isSub = /^#{3,4}\s+/.test(line);
        if (doc.y > doc.page.height - (isSub ? 230 : 120)) doc.addPage();
        doc.moveDown(isSub ? 0.4 : 0.6)
          .fillColor(isSub ? '#0f172a' : '#0891b2').font(fB).fontSize(isSub ? 11.5 : 13)
          .text(line.replace(/^#{1,4}\s+/, ''));
        doc.moveDown(0.2);
      } else if (/^EQ:\s*/i.test(body)) {
        drawEquation(doc, body.replace(/^EQ:\s*/i, ''), fR);
      } else if (/^(Final Answer|Final Result|Answer|Result|Ans)\s*:/i.test(body)) {
        const m = body.match(/^(Final Answer|Final Result|Answer|Result|Ans)\s*:\s*(.*)$/i);
        doc.font(fB).fontSize(10.5).fillColor('#047857')
          .text(m[1] + ':' + (m[2] ? ' ' : ''), { continued: !!m[2], indent: 6 });
        if (m[2]) doc.font(fR).fillColor('#0f172a').text(m[2], { lineGap: 2 });
      } else if (/^Step\s*\d+/i.test(body)) {
        const m = body.match(/^(Step\s*\d+\s*[:.)-]?)\s*(.*)$/i);
        doc.font(fB).fontSize(10.5).fillColor('#0891b2').text(m[1] + ' ', { continued: true, indent: 6 });
        doc.font(fR).fillColor('#0f172a').text(m[2], { lineGap: 2 });
      } else if (/^[-•*]\s+/.test(line)) {
        doc.fillColor('#0f172a').font(fR).fontSize(10.5)
          .text('•  ' + body, { indent: 12, lineGap: 2 });
      } else {
        doc.fillColor('#1e293b').font(fR).fontSize(10.5).text(line, { lineGap: 3, align: 'justify' });
        doc.moveDown(0.3);
      }
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(8).fillColor('#64748b').font(fR).text(
        `Student AI Notes Engine - ${subjectName}  |  Page ${i + 1} of ${range.count}`,
        40, doc.page.height - 30,
        { align: 'center', width: doc.page.width - 80, lineBreak: false }
      );
      doc.page.margins.bottom = oldBottom;
    }

    doc.end();
  });
}

// -------------------------------------------------------------------------
// 4. CONTROLLERS
// -------------------------------------------------------------------------
// -------------------------------------------------------------------------
// UPLOAD CONTENT CHECK: reject MCQ sheets / junk / wrong-subject PDFs
// -------------------------------------------------------------------------
function looksLikeMcqs(text) {
  const lines = text.split('\n');
  const dLine = /^\s*\(?[dD][\)\.]\s+\S/;
  const inline = /\(?\b[aA][\)\.]\s.+\(?\b[bB][\)\.]\s.+\(?\b[cC][\)\.]\s.+\(?\b[dD][\)\.]\s/;
  let optionBlocks = 0;
  for (const l of lines) if (dLine.test(l) || inline.test(l)) optionBlocks++;

  const keywordHits = (text.match(/\bMCQs?\b|multiple[\s-]*choice|choose the correct|tick the correct|encircle the correct|correct option/gi) || []).length;
  return optionBlocks >= 6 || keywordHits >= 2;
}

async function validateUploadedNotes(text, subjectName) {
  if (looksLikeMcqs(text)) {
    return { ok: false, message: 'This PDF contains MCQs. Please upload theory notes / textbook chapter only (no MCQ sheets).' };
  }

  try {
    const sample = text.slice(0, 5000);
    const raw = await askAI(
      `You are checking a PDF uploaded to a ${subjectName} study-notes app (Pakistan board, Computer / Physics / Chemistry / Biology only).
Read the text sample and decide if it is genuine ${subjectName} study material (textbook chapter, theory notes, definitions, derivations, explanations).
It is NOT valid if it is mainly: MCQs or quiz/question-only sheets, true/false or fill-in-the-blank sheets, a different subject, a novel/story, an advertisement, random or garbled text, or inappropriate content.
Return ONLY JSON: {"valid": true or false, "reason": "one short sentence"}

TEXT SAMPLE:
${sample}`,
      true
    );
    const verdict = parseJSON(raw);
    if (verdict.valid === false) {
      return { ok: false, message: `PDF rejected: ${verdict.reason || 'not valid ' + subjectName + ' notes.'}` };
    }
  } catch (e) {
    console.warn('Upload AI check skipped:', e.message);
  }
  return { ok: true };
}

// -------------------------------------------------------------------------
// EXAM LOCK lives OUTSIDE the vault (so deleting a PDF vault keeps it)
// -------------------------------------------------------------------------
const NotesExamState =
  mongoose.models.NotesExamState ||
  mongoose.model(
    'NotesExamState',
    new mongoose.Schema(
      {
        userId: { type: String, required: true, unique: true, index: true },
        lastExamTakenAt: { type: Date, default: null }
      },
      { timestamps: true }
    )
  );

const EXAM_COOLDOWN_MS = 60 * 60 * 1000;

async function getLastNotesExamTime(userId) {
  const state = await NotesExamState.findOne({ userId: String(userId) }).lean();
  const legacy = await NotesVault.findOne({ userId, lastExamTakenAt: { $ne: null } })
    .sort({ lastExamTakenAt: -1 })
    .select('lastExamTakenAt')
    .lean();
  const times = [state?.lastExamTakenAt, legacy?.lastExamTakenAt]
    .filter(Boolean)
    .map((d) => new Date(d).getTime());
  return times.length ? Math.max(...times) : 0;
}

async function setLastNotesExamTime(userId, when = new Date()) {
  await NotesExamState.updateOne(
    { userId: String(userId) },
    { $set: { lastExamTakenAt: when } },
    { upsert: true }
  );
}

const getUserId = (req) => req.user.id || req.user._id || req.user.StudentId;

export async function createOrGenerateNotes(req, res) {
  try {
    const userId = getUserId(req);
    const { subjectName, studentClass, topicTitle, notesType, examTargetDate, creationMode } = req.body;
    if (!topicTitle?.trim()) {
      return res.status(400).json({ success: false, message: 'Topic title is required.' });
    }

    let fileName, relativePdfUrl, notesContent;

    if (creationMode === 'upload') {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Please attach a PDF file.' });
      }
      const baseName = (req.file.originalname || 'notes').replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 40) || 'notes';
      fileName = `${baseName}_${Date.now()}.pdf`;
      // multer memoryStorage -> req.file.buffer (disk path only as fallback)
      const pdfBuffer = req.file.buffer || fs.readFileSync(req.file.path);
      if (!req.file.buffer) { try { fs.unlinkSync(req.file.path); } catch (_) {} }

      const parsed = await pdfParse(pdfBuffer);
      notesContent = (parsed.text || '').trim();
      if (notesContent.length < 200) {
        return res.status(422).json({
          success: false,
          message: 'Could not read text from this PDF (it may be a scanned image). Upload a text-based PDF.'
        });
      }
      const check = await validateUploadedNotes(notesContent, subjectName);
      if (!check.ok) {
        return res.status(422).json({ success: false, message: check.message });
      }
      notesContent = notesContent.slice(0, 60000);
      relativePdfUrl = await uploadPdf(fileName, pdfBuffer); // only valid PDFs reach storage
    } else {
      console.log(`🧠 [1/3] Asking AI for notes: "${topicTitle}" ...`);
      const t0 = Date.now();
      notesContent = await askAI(buildNotesPrompt({ topicTitle, subjectName, studentClass }), false, 1500);
      console.log(`📝 [2/3] AI text ready (${notesContent.length} chars, ${((Date.now() - t0) / 1000).toFixed(1)}s). Building PDF ...`);

      const safeTitle = topicTitle.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 40) || 'notes';
      fileName = `${safeTitle}_${Date.now()}.pdf`;
      const pdfBuffer = await Promise.race([
        renderTextToRealPDF(topicTitle, subjectName, studentClass, notesContent),
        new Promise((_, rej) => setTimeout(() => rej(new Error('PDF rendering timed out')), 30000))
      ]);
      relativePdfUrl = await uploadPdf(fileName, pdfBuffer);
      console.log('📄 [3/3] PDF saved:', relativePdfUrl);
    }

    const newVault = await NotesVault.create({
      userId,
      subjectName,
      studentClass: studentClass || '12th Class',
      topicTitle,
      notesType: 'subjective',
      pdfName: fileName,
      pdfUrl: relativePdfUrl,
      notesContent,
      examTargetDate: examTargetDate ? new Date(examTargetDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currentChapterIndex: 0,
      extractedChapters: [{ chapterIndex: 0, chapterTitle: topicTitle, isUnlocked: true, isPassed: false }]
    });

    return res.status(201).json({ success: true, vault: newVault });
  } catch (error) {
    console.error('Create PDF Error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to generate PDF notes.' });
  }
}

export async function getUserNotesVaults(req, res) {
  try {
    const userId = getUserId(req);
    const vaults = await NotesVault.find({ userId }).sort({ createdAt: -1 });
    const last = await getLastNotesExamTime(userId);
    return res.status(200).json({ success: true, vaults, lastExamTakenAt: last ? new Date(last).toISOString() : null });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch user notes vaults.' });
  }
}

export async function generateExamQuestions(req, res) {
  try {
    const { vaultId } = req.body;
    const vault = await NotesVault.findOne({ _id: vaultId, userId: getUserId(req) });
    if (!vault) return res.status(404).json({ success: false, message: 'Vault record not found.' });

    const lastExam = await getLastNotesExamTime(getUserId(req));
    const remaining = lastExam + EXAM_COOLDOWN_MS - Date.now();
    if (lastExam && remaining > 0) {
      const m = Math.floor(remaining / 60000);
      const sec = Math.floor((remaining % 60000) / 1000);
      return res.status(429).json({
        success: false,
        message: `Only 1 exam per hour is allowed (on any PDF). Next exam in ${m}m ${sec}s.`
      });
    }

    const source = (vault.notesContent || vault.topicTitle).slice(0, 12000);

    let questions = [];
    let lastError = null;
    for (let attempt = 1; attempt <= 2 && questions.length === 0; attempt++) {
      try {
        const raw = await askAI(buildExamPrompt(vault, source), true);
        questions = normalizeQuestions(parseJSON(raw));
        if (questions.length === 0) console.warn(`Exam attempt ${attempt}: AI JSON had no usable questions ->`, raw.slice(0, 300));
      } catch (e) {
        lastError = e;
        console.warn(`Exam attempt ${attempt} failed:`, e.message);
      }
    }

    if (questions.length === 0) {
      console.error('Exam AI failed twice, using fallback question.', lastError?.message || '');
      questions = [{
        question: `Explain in detail: ${vault.topicTitle}. Include definitions, key points, working/process or derivation where it applies, and board exam presentation.`,
        answer: '',
        marks: 8
      }];
    }

    await setLastNotesExamTime(getUserId(req));

    return res.status(200).json({ success: true, questions });
  } catch (error) {
    console.error('Generate exam error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Could not generate exam.' });
  }
}

// Dynamic Smart Examiner (Concept-Aware & Subject-Aware)
export async function evaluateSubjectiveExam(req, res) {
  try {
    const { vaultId, question, studentAnswer, modelAnswer } = req.body;
    const userId = getUserId(req);

    const vault = await NotesVault.findOne({ _id: vaultId, userId });
    if (!vault) return res.status(404).json({ success: false, message: 'Vault record not found.' });

    if (!studentAnswer?.trim()) {
      return res.status(400).json({ success: false, message: 'Answer is empty.' });
    }

    const pdfSourceContext = (vault.notesContent || '').slice(0, 10000);

    const prompt = `You are a strict but fair board exam examiner for ${vault.subjectName} (${vault.studentClass}).
Evaluate the student's written answer against both the PDF Vault Reference Material and general subject accuracy.

PDF VAULT REFERENCE MATERIAL:
${pdfSourceContext}

QUESTION ASKED: ${question}
${modelAnswer ? `MODEL ANSWER KEY: ${modelAnswer}\n` : ''}
STUDENT SUBMITTED ANSWER: ${studentAnswer}

CRITICAL EVALUATION RULES:
1. TOPIC-BASED FLEXIBILITY: Determine if the topic "${vault.topicTitle}" inherently requires mathematical equations/derivations.
   - If the topic is THEORETICAL / CONCEPTUAL (e.g., Biology processes, Pakistan Studies dates/events, English essays, Urdu, or non-mathematical Physics/Chemistry concepts like Cell Structure, Chemical Bonding, First Law concept, etc.), DO NOT expect or penalize for missing mathematical equations!
   - ONLY expect mathematical formulas if the question explicitly asks for a mathematical derivation or numerical calculation.
2. CONCEPTUAL ACCURACY: If the student wrote core textbook points from the PDF OR explained correct concepts accurately in their own words, award full appropriate marks.
3. Calculate precise percentage (0 to 100). Pass criteria is score >= 50.

Return ONLY valid JSON in this exact structure:
{
  "score": 85,
  "passed": true,
  "feedback": "Detailed examiner feedback explaining accuracy against textbook/PDF notes.",
  "mistakes": ["Specific conceptual mistake 1", "Missing key point from PDF 2"]
}`;

    const evaluation = parseJSON(await askAI(prompt, true));

    vault.lastExamTakenAt = new Date();
    const chap = vault.extractedChapters[vault.currentChapterIndex] || vault.extractedChapters[0];
    if (chap) {
      chap.lastScore = evaluation.score;
      chap.mistakes = evaluation.mistakes || [];
      if (evaluation.passed) chap.isPassed = true;
    }
    await vault.save();
    await setLastNotesExamTime(userId, vault.lastExamTakenAt);

    // Save the attempt in the Progress model - the same place MCQ attempts go
    const scorePct = Math.round(Number(evaluation.score) || 0);
    try {
      let progress = await Progress.findOne({ userId });
      if (!progress) {
        progress = new Progress({ userId, streakCount: 0, lastClearedDate: null, wrongQuestions: [], attempts: [] });
      }
      progress.attempts.unshift({
        docTitle: vault.topicTitle || 'Subjective Exam',
        score: scorePct,
        totalQuestions: 100,
        percentage: scorePct,
        passed: !!evaluation.passed,
        type: 'Subjective PDF',
        createdAt: vault.lastExamTakenAt
      });
      await progress.save();
    } catch (e) {
      console.error('Could not save notes attempt in Progress:', e.message);
    }

    // Streak (own collection): count today when the student clears this exam
    if (evaluation.passed) {
      try {
        await registerClearedDay(userId);
      } catch (e) {
        console.error('Streak error:', e.message);
      }
    }

    return res.status(200).json({ 
      success: true, 
      evaluation: {
        score: evaluation.score,
        passed: evaluation.passed,
        feedback: evaluation.feedback,
        mistakes: evaluation.mistakes || []
      }, 
      vault 
    });
  } catch (error) {
    console.error('Evaluate error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Evaluation processing failed.' });
  }
}