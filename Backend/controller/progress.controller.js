import Progress from "../model/progress.model.js";
import { registerClearedDay, getStreakStatus, dayString } from "../model/Streak.model.js";

const getTodayString = () => dayString();

// 1. Save Test Result, Track Weak Questions & Update Streak (MCQ Quiz)
export async function saveQuizResult(req, res) {
    try {
        const { docId, docTitle, score, totalQuestions, failedQuestions } = req.body;
        const userId = req.user.id || req.user._id;

        if (!docTitle || score === undefined || !totalQuestions) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const percentage = Math.round((score / totalQuestions) * 100);
        const passed = percentage >= 60;

        let progress = await Progress.findOne({ userId });

        if (!progress) {
            progress = new Progress({ 
                userId, 
                streakCount: 0, 
                lastClearedDate: null, 
                wrongQuestions: [], 
                attempts: [] 
            });
        }

        // --- WEAK QUESTIONS / SPACED REPETITION LOGIC ---
        if (progress.wrongQuestions) {
            progress.wrongQuestions = progress.wrongQuestions.filter(
                (q) => q.docId && q.docId.toString() !== (docId ? docId.toString() : '')
            );
        } else {
            progress.wrongQuestions = [];
        }

        if (failedQuestions && failedQuestions.length > 0 && !passed) {
            failedQuestions.forEach((q) => {
                progress.wrongQuestions.push({
                    docId,
                    question: q.question,
                    options: q.options,
                    correctIndex: q.correctIndex
                });
            });
        }

        // --- SAVE ATTEMPT ---
        progress.attempts.unshift({
            docTitle,
            score,
            totalQuestions,
            percentage,
            passed,
            type: 'MCQ Quiz',
            createdAt: new Date()
        });

        await progress.save();

        // --- STREAK LOGIC (kept in its own "streaks" collection, survives progress deletion) ---
        if (passed) await registerClearedDay(userId);
        const streak = await getStreakStatus(userId);

        return res.status(200).json({
            success: true,
            passed,
            percentage,
            streakCount: streak.streakCount,
            isTodayCleared: streak.clearedToday
        });

    } catch (error) {
        console.error("Save Quiz Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

// 2. Get Progress Report (MCQ + Notes exams, both come from the Progress model)
export async function getProgressReport(req, res) {
    try {
        const userId = req.user.id || req.user._id;
        const todayStr = getTodayString();
        const progress = await Progress.findOne({ userId });

        // MCQ and Notes (Subjective PDF) attempts both live in progress.attempts
        const combinedAttempts = (progress?.attempts || [])
            .map(a => ({
                docTitle: a.docTitle || 'Exam Attempt',
                type: a.type || 'MCQ Quiz',
                score: a.type === 'Subjective PDF'
                    ? `${a.percentage || 0}%`
                    : `${a.score} / ${a.totalQuestions || 5}`,
                percentage: a.percentage || 0,
                passed: a.passed || false,
                createdAt: a.createdAt || new Date()
            }))
            .sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt)); // latest first

        // Calculate combined statistics
        const totalAttempts = combinedAttempts.length;
        const passedAttempts = combinedAttempts.filter(a => a.passed).length;
        const totalSum = combinedAttempts.reduce((acc, curr) => acc + (curr.percentage || 0), 0);
        const avgPercentage = totalAttempts > 0 ? Math.round(totalSum / totalAttempts) : 0;

        // Streak comes from its own collection, NOT from the attempts above,
        // so deleting progress/notes data does not reset it.
        let streak = await getStreakStatus(userId);
        const clearedTodayInAttempts = combinedAttempts.some(
            a => a.passed && dayString(a.createdAt) === todayStr
        );
        if (clearedTodayInAttempts && !streak.clearedToday) {
            // a pass exists today but was never counted (e.g. subjective exam) -> count it now
            await registerClearedDay(userId);
            streak = await getStreakStatus(userId);
        }
        const isTodayCleared = streak.clearedToday || clearedTodayInAttempts;

        const reportData = {
            streakCount: streak.streakCount,
            longestStreak: streak.longestStreak,
            totalAttempts,
            passedAttempts,
            avgPercentage,
            isTodayCleared,
            attempts: combinedAttempts
        };

        return res.status(200).json({
            success: true,
            ...reportData,
            data: reportData
        });
    } catch (error) {
        console.error("Get Progress Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}