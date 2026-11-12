import Document from "../model/document.model.js";
import Progress from "../model/progress.model.js";
import ExamSchedule from "../model/examSchedule.model.js";
import Student from "../model/student.model.js";
import { askAI } from "../services/ai.service.js";
// import from lib/ directly (the package index has a known debug-mode bug in ESM / serverless)
import pdfParse from "pdf-parse/lib/pdf-parse.js";

// Vercel pe disk persistent nahi hoti -> PDF ab Blob storage me hai, yahan URL se download karte hain
async function readPdfBuffer(fileUrl) {
  try {
    if (!/^https?:\/\//i.test(fileUrl || '')) return null;
    const r = await fetch(fileUrl, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch (e) {
    console.error("PDF download failed:", e.message);
    return null;
  }
}

const safeJsonParse = (str) => {
  try {
    let cleaned = str.replace(/```json/gi, "").replace(/```/g, "").trim();

    // normal case: {"questions":[...]} or a bare array
    try {
      const direct = JSON.parse(cleaned);
      if (Array.isArray(direct)) return direct;
      return direct.questions || Object.values(direct || {}).find(Array.isArray) || null;
    } catch (_) { /* fall through: cut the array out of surrounding text */ }

    const startIdx = cleaned.indexOf('[');
    const endIdx = cleaned.lastIndexOf(']');

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleaned = cleaned.substring(startIdx, endIdx + 1);
    }
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse raw AI text:", str);
    return null;
  }
};

// Keep only well-formed MCQs: question text, exactly 4 options, correctIndex 0-3
const cleanQuestions = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .map((q) => ({
      question: typeof q?.question === 'string' ? q.question.trim() : '',
      options: Array.isArray(q?.options) ? q.options.map((o) => String(o)) : [],
      correctIndex: Number.isInteger(q?.correctIndex) ? q.correctIndex : parseInt(q?.correctIndex, 10)
    }))
    .filter((q) => q.question && q.options.length === 4 && q.correctIndex >= 0 && q.correctIndex <= 3);
};

// 1. Get Schedule Status (With Accurate Time Calculation)
export async function getExamSchedule(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    let schedule = await ExamSchedule.findOne({ userId });
    const now = new Date();

    if (!schedule) {
      schedule = await ExamSchedule.create({
        userId,
        lastExamTime: null,
        masterExamDoneToday: false,
        xpPoints: 0,
        level: 1
      });
    }

    if (schedule.lastExamTime) {
      const lastDate = new Date(schedule.lastExamTime).toDateString();
      const todayDate = now.toDateString();
      if (lastDate !== todayDate) {
        schedule.masterExamDoneToday = false;
        await schedule.save();
      }
    }

    let canTakeHourlyExam = true;
    let minutesLeftForNextExam = 0;
    let secondsLeftForNextExam = 0;

    if (schedule.lastExamTime) {
      const diffMs = now.getTime() - new Date(schedule.lastExamTime).getTime();
      const totalSecondsPassed = Math.floor(diffMs / 1000);
      const remainingSeconds = 3600 - totalSecondsPassed;

      if (remainingSeconds > 0) {
        canTakeHourlyExam = false;
        minutesLeftForNextExam = Math.floor(remainingSeconds / 60);
        secondsLeftForNextExam = remainingSeconds % 60;
      } else {
        canTakeHourlyExam = true;
        minutesLeftForNextExam = 0;
        secondsLeftForNextExam = 0;
      }
    }

    return res.status(200).json({
      success: true,
      canTakeHourlyExam,
      minutesLeftForNextExam,
      secondsLeftForNextExam,
      masterExamDoneToday: schedule.masterExamDoneToday || false,
      lastExamTime: schedule.lastExamTime
    });
  } catch (error) {
    console.error("Schedule Check Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch exam status" });
  }
}

// 2. Generate Quiz
export async function generateQuizFromPDF(req, res) {
  try {
    const { docId, difficulty = 'easy', isMixed = false } = req.body;
    const userId = req.user.id || req.user._id;

    let schedule = await ExamSchedule.findOne({ userId });
    const now = new Date();

    if (schedule && schedule.lastExamTime) {
      const diffMs = now.getTime() - new Date(schedule.lastExamTime).getTime();
      const totalSecondsPassed = Math.floor(diffMs / 1000);
      if (totalSecondsPassed < 3600) {
        const waitMins = Math.ceil((3600 - totalSecondsPassed) / 60);
        return res.status(400).json({
          success: false,
          message: `⏰ Hourly Cooldown Active! Please wait ${waitMins} minute(s) before taking your next exam.`
        });
      }
    }

    let pdfTextChunk = "";
    let docTitle = "Mixed PDF Master Exam";

    if (isMixed) {
      const docs = await Document.find({ userId });
      if (!docs.length) {
        return res.status(400).json({ success: false, message: "No uploaded PDFs found to generate mixed exam." });
      }

      for (const doc of docs.slice(0, 5)) {
        const buffer = await readPdfBuffer(doc.fileUrl);

        if (buffer) {
          const parsed = await pdfParse(buffer);
          if (parsed && parsed.text) {
            const totalLen = parsed.text.length;
            if (difficulty === 'easy') {
              pdfTextChunk += `\n --- Source: ${doc.title} ---\n` + parsed.text.slice(0, 1000);
            } else if (difficulty === 'normal') {
              pdfTextChunk += `\n --- Source: ${doc.title} ---\n` + parsed.text.slice(0, Math.floor(totalLen * 0.5));
            } else {
              pdfTextChunk += `\n --- Source: ${doc.title} ---\n` + parsed.text.slice(0, 6000);
            }
          }
        }
      }
    } else {
      if (!docId) return res.status(400).json({ success: false, message: "Document ID is required" });
      const doc = await Document.findOne({ _id: docId, userId });
      if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

      docTitle = doc.title;
      const buffer = await readPdfBuffer(doc.fileUrl);
      if (!buffer) {
        return res.status(404).json({ success: false, message: "PDF file not found in storage" });
      }

      const parsed = await pdfParse(buffer);
      const fullText = parsed?.text || "";
      const totalLen = fullText.length;

      if (difficulty === 'easy') {
        pdfTextChunk = fullText.slice(0, 1500);
      } else if (difficulty === 'normal') {
        pdfTextChunk = fullText.slice(0, Math.floor(totalLen * 0.5));
      } else {
        pdfTextChunk = fullText.slice(0, 8000);
      }
    }

    if (!pdfTextChunk.trim()) {
      return res.status(400).json({ success: false, message: "Could not extract readable text from PDF(s)." });
    }

    let mcqCount = difficulty === 'easy' ? 5 : (difficulty === 'normal' ? 10 : 15);

    const systemPrompt = `You are a strict PDF Exam Controller. STRICT GROUNDING RULE: Create EXACTLY ${mcqCount} MCQs derived ONLY and EXCLUSIVELY from the provided text context. DO NOT bring any external general knowledge. Every question has exactly 4 options and "correctIndex" is the 0-based index (0-3) of the single correct option. Return ONLY valid raw JSON in exactly this shape: {"questions":[{"question":"String","options":["A","B","C","D"],"correctIndex":0}]}`;

    let newQuestions = null;

    // Gemini first, Groq as backup (inside askAI); up to 2 tries if the answer is unusable
    for (let attempt = 1; attempt <= 2 && !newQuestions; attempt++) {
      try {
        const raw = await askAI(`Text content:\n${pdfTextChunk}`, {
          json: true,
          system: systemPrompt,
          temperature: 0.2
        });
        const valid = cleanQuestions(safeJsonParse(raw));
        if (valid.length >= Math.ceil(mcqCount * 0.6)) {
          newQuestions = valid.slice(0, mcqCount);
        } else {
          console.warn(`Quiz attempt ${attempt}: only ${valid.length}/${mcqCount} usable MCQs`);
        }
      } catch (err) {
        console.warn(`Quiz attempt ${attempt} failed:`, err.message);
      }
    }

    if (!newQuestions) {
      return res.status(500).json({ 
        success: false, 
        message: "AI services busy. Please try starting exam again." 
      });
    }

    return res.status(200).json({
      success: true,
      docTitle,
      difficulty,
      isMixed,
      data: newQuestions
    });

  } catch (error) {
    console.error("Quiz Gen Error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to generate exam from PDF" });
  }
}

// 3. Save Quiz Result (Explicit DB Save & Time Update)
export async function saveGamifiedQuizResult(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    const { score, totalQuestions, docTitle, docId, passed, difficulty = 'easy', isMixed = false, failedQuestions = [], forceFail = false } = req.body;

    const percentage = forceFail ? 0 : Math.round((score / totalQuestions) * 100);
    const actualPassed = forceFail ? false : passed;
    const now = new Date();

    let userProgress = await Progress.findOne({ userId });
    if (!userProgress) {
      userProgress = new Progress({ userId, attempts: [], wrongQuestions: [], streakCount: 0 });
    }

    userProgress.attempts.push({
      docTitle: docTitle || 'PDF Exam',
      score: forceFail ? 0 : score,
      totalQuestions,
      percentage,
      passed: actualPassed,
      createdAt: now
    });

    if (failedQuestions && failedQuestions.length > 0) {
      failedQuestions.forEach((fq) => {
        userProgress.wrongQuestions.push({
          docId,
          question: fq.question,
          options: fq.options,
          correctIndex: fq.correctIndex
        });
      });
    }

    if (actualPassed) {
      userProgress.streakCount = (userProgress.streakCount || 0) + 1;
    }

    await userProgress.save();

    let schedule = await ExamSchedule.findOne({ userId });
    if (!schedule) {
      schedule = new ExamSchedule({ userId, xpPoints: 0, level: 1 });
    }

    let earnedXp = 0;
    if (actualPassed) {
      const diffMultiplier = difficulty === 'hard' ? 3 : (difficulty === 'normal' ? 2 : 1);
      earnedXp = score * 20 * diffMultiplier;
      schedule.xpPoints = (schedule.xpPoints || 0) + earnedXp;
      schedule.level = Math.floor(schedule.xpPoints / 100) + 1;

      if (isMixed) {
        schedule.masterExamDoneToday = true;
      }
    } else {
      if (isMixed) {
        schedule.masterExamDoneToday = false;
      }
    }

    // Force DB update of lastExamTime
    schedule.lastExamTime = now;
    await ExamSchedule.updateOne(
      { userId },
      { $set: { lastExamTime: now, xpPoints: schedule.xpPoints, level: schedule.level, masterExamDoneToday: schedule.masterExamDoneToday } },
      { upsert: true }
    );

    return res.status(200).json({
      success: true,
      passed: actualPassed,
      percentage,
      score,
      totalQuestions,
      earnedXp,
      xpPoints: schedule.xpPoints,
      level: schedule.level,
      masterExamDoneToday: schedule.masterExamDoneToday,
      canTakeHourlyExam: false,
      minutesLeftForNextExam: 59,
      secondsLeftForNextExam: 59
    });

  } catch (error) {
    console.error("Save Quiz Error:", error);
    return res.status(500).json({ success: false, message: "Failed to save exam results" });
  }
}

// 4. Get Leaderboard
export async function getLeaderboard(req, res) {
  try {
    const students = await Student.find({}).lean();
    const schedules = await ExamSchedule.find({}).lean();

    const scheduleMap = {};
    schedules.forEach((sch) => {
      if (sch.userId) {
        scheduleMap[sch.userId.toString()] = sch;
      }
    });

    const leaderboard = students.map((st) => {
      const sch = scheduleMap[st._id.toString()] || {};
      let name = st.StudentName || st.name || st.username;
      if (!name && st.StudentEmail) name = st.StudentEmail.split('@')[0];
      if (!name && st.email) name = st.email.split('@')[0];

      return {
        _id: st._id,
        studentName: name ? (name.charAt(0).toUpperCase() + name.slice(1)) : 'Ali',
        xpPoints: sch.xpPoints || 0,
        level: sch.level || 1
      };
    });

    leaderboard.sort((a, b) => b.xpPoints - a.xpPoints);

    const formattedData = leaderboard.map((item, idx) => ({
      rank: idx + 1,
      studentName: item.studentName,
      xpPoints: item.xpPoints,
      level: item.level
    }));

    return res.status(200).json({ success: true, leaderboard: formattedData });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load leaderboard" });
  }
}