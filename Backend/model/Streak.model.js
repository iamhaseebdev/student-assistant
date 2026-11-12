import mongoose from 'mongoose';
import Progress from './progress.model.js';

// -------------------------------------------------------------------------
// STREAK lives in its OWN collection ("streaks"), separate from Progress.
// So you can wipe Progress / NotesAttempt / NotesVault test data and the
// streak stays exactly as it was.
// -------------------------------------------------------------------------

const TZ = 'Asia/Karachi'; // a "day" changes at midnight PKT (not 5 AM like UTC)

// 'YYYY-MM-DD' of a date in the student's timezone
export const dayString = (d = new Date()) =>
  new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });

const DAY_MS = 24 * 60 * 60 * 1000;

const streakSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    streakCount: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastClearedDate: { type: String, default: null }
  },
  { timestamps: true }
);

const Streak = mongoose.models.Streak || mongoose.model('Streak', streakSchema);

// Get the user's streak doc; first time only, copy the old streak out of Progress
async function loadStreak(userId) {
  const id = String(userId);
  let doc = await Streak.findOne({ userId: id });
  if (doc) return doc;

  let seed = { streakCount: 0, lastClearedDate: null };
  try {
    const old = await Progress.findOne({ userId });
    if (old) seed = { streakCount: old.streakCount || 0, lastClearedDate: old.lastClearedDate || null };
  } catch (e) {
    // no old progress / bad id -> start from zero
  }

  try {
    doc = await Streak.create({ userId: id, ...seed, longestStreak: seed.streakCount });
  } catch (e) {
    doc = await Streak.findOne({ userId: id }); // two requests raced, use the winner
  }
  return doc;
}

// Call this when the student CLEARS (passes) an exam. Safe to call many times a day.
export async function registerClearedDay(userId, when = new Date()) {
  const doc = await loadStreak(userId);
  const today = dayString(when);
  if (doc.lastClearedDate === today) return doc; // already counted today

  const yesterday = dayString(new Date(new Date(when).getTime() - DAY_MS));
  doc.streakCount = doc.lastClearedDate === yesterday ? (doc.streakCount || 0) + 1 : 1;
  doc.longestStreak = Math.max(doc.longestStreak || 0, doc.streakCount);
  doc.lastClearedDate = today;
  await doc.save();
  return doc;
}

// What to SHOW: a streak is alive only if the last cleared day is today or yesterday
export async function getStreakStatus(userId) {
  const doc = await loadStreak(userId);
  const today = dayString();
  const yesterday = dayString(new Date(Date.now() - DAY_MS));
  const alive = doc.lastClearedDate === today || doc.lastClearedDate === yesterday;
  return {
    streakCount: alive ? doc.streakCount || 0 : 0,
    longestStreak: Math.max(doc.longestStreak || 0, doc.streakCount || 0),
    lastClearedDate: doc.lastClearedDate,
    clearedToday: doc.lastClearedDate === today
  };
}

export default Streak;