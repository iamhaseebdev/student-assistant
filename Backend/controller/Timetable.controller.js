// Backend/controller/timetable.controller.js
import Timetable from '../model/Timetable.model.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toTime = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const round5 = (n) => Math.round(n / 5) * 5;
const hm = (min) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
};

// -------------------------------------------------------------------------
// 1. VALIDATION
// -------------------------------------------------------------------------
function validateSettings(body = {}) {
  const { wakeTime, bedTime, classes = [], subjects = [] } = body;
  const studyHours = Number(body.studyHours);
  const playHours = Number(body.playHours);

  if (!TIME_RE.test(wakeTime || '') || !TIME_RE.test(bedTime || '')) {
    return { error: 'Wake-up time and bed time are required (HH:MM)' };
  }
  let window = toMin(bedTime) - toMin(wakeTime);
  if (window <= 0) window += 1440;
  if (window < 360 || window > 1140) {
    return { error: 'Your awake time should be between 6 and 19 hours. Please check wake-up and bed time.' };
  }
  if (!Number.isFinite(studyHours) || studyHours < 0 || studyHours > 12) {
    return { error: 'Study hours must be between 0 and 12' };
  }
  if (!Number.isFinite(playHours) || playHours < 0 || playHours > 8) {
    return { error: 'Play hours must be between 0 and 8' };
  }
  if (!Array.isArray(classes) || classes.length > 12) {
    return { error: 'You can add up to 12 class timings' };
  }

  const cleanClasses = [];
  for (const c of classes) {
    if (!TIME_RE.test(c?.start || '') || !TIME_RE.test(c?.end || '')) {
      return { error: 'Every class timing needs a valid start and end time' };
    }
    if (toMin(c.end) <= toMin(c.start)) {
      return { error: `Class "${c.label || 'Class'}": end time must be after start time` };
    }
    const days = [...new Set((Array.isArray(c.days) ? c.days : []).map(Number))].filter(
      (d) => Number.isInteger(d) && d >= 0 && d <= 6
    );
    if (days.length === 0) {
      return { error: `Class "${c.label || 'Class'}": select at least one day` };
    }
    cleanClasses.push({
      label: String(c.label || 'Class').trim().slice(0, 40) || 'Class',
      start: c.start,
      end: c.end,
      days
    });
  }

  const cleanSubjects = [
    ...new Set(
      (Array.isArray(subjects) ? subjects : [])
        .map((s) => String(s).trim().slice(0, 30))
        .filter(Boolean)
    )
  ].slice(0, 12);

  return {
    settings: {
      wakeTime,
      bedTime,
      studyHours: Math.round(studyHours * 2) / 2,
      playHours: Math.round(playHours * 2) / 2,
      subjects: cleanSubjects,
      classes: cleanClasses
    }
  };
}

// -------------------------------------------------------------------------
// 2. TIMETABLE BUILDER (plain logic, no AI -> always works, sleep is always included)
// -------------------------------------------------------------------------
function gapsOf(blocks, from, to) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const gaps = [];
  let cur = from;
  for (const b of sorted) {
    if (b.start > cur) gaps.push({ start: cur, end: b.start });
    cur = Math.max(cur, b.end);
  }
  if (cur < to) gaps.push({ start: cur, end: to });
  return gaps;
}

// Study time is split into ~1 hour sessions with 10 minute breaks in between
function splitStudy(total) {
  const k = Math.max(1, Math.round(total / 60));
  const net = total - (k - 1) * 10;
  const out = [];
  let used = 0;
  for (let i = 0; i < k; i++) {
    const len = i === k - 1 ? net - used : round5(net / k);
    used += len;
    out.push({ type: 'study', min: len });
    if (i < k - 1) out.push({ type: 'rest', min: 10 });
  }
  return out;
}

function buildDay(s, dayIndex, warnings) {
  const wake = toMin(s.wakeTime);
  let bed = toMin(s.bedTime);
  if (bed <= wake) bed += 1440; // sleeps after midnight

  const blocks = [];

  // --- classes of this day (merged if they overlap, clamped to awake time)
  const todays = s.classes
    .filter((c) => c.days.includes(dayIndex))
    .map((c) => ({
      start: Math.max(toMin(c.start), wake),
      end: Math.min(toMin(c.end), bed),
      label: c.label
    }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const c of todays) {
    const last = merged[merged.length - 1];
    if (last && c.start <= last.end) {
      last.end = Math.max(last.end, c.end);
      if (!last.label.includes(c.label)) last.label += ` + ${c.label}`;
    } else {
      merged.push({ ...c });
    }
  }
  merged.forEach((c) => blocks.push({ start: c.start, end: c.end, type: 'class', title: c.label }));

  // --- fixed routine blocks (placed only where they fit)
  const place = (target, durations, latest, type, title) => {
    for (const dur of durations) {
      for (const g of gapsOf(blocks, wake, bed)) {
        const st = Math.max(g.start, target);
        if (st <= latest && st + dur <= g.end) {
          blocks.push({ start: st, end: st + dur, type, title });
          return true;
        }
      }
    }
    return false;
  };

  place(wake, [40, 30, 20], wake + 60, 'routine', 'Wake up, freshen up & breakfast');
  if (780 >= wake + 180 && 780 <= bed - 300) place(780, [45, 30], 960, 'meal', 'Lunch');
  const dinnerAt = Math.min(1200, bed - 150);
  if (dinnerAt >= wake + 360) place(dinnerAt, [45, 30], bed - 60, 'meal', 'Dinner');
  place(bed - 30, [30], bed, 'routine', 'Wind down (no screens) & get ready for bed');

  // --- free gaps -> study / play / free time
  const allGaps = gapsOf(blocks, wake, bed);
  const usable = allGaps.filter((g) => g.end - g.start >= 20);
  allGaps
    .filter((g) => g.end - g.start < 20 && g.end - g.start >= 5)
    .forEach((g) => blocks.push({ start: g.start, end: g.end, type: 'rest', title: 'Short break' }));

  const F = usable.filter((g) => g.end - g.start >= 50).reduce((a, g) => a + (g.end - g.start), 0);
  const wantStudy = s.studyHours * 60;
  const wantPlay = s.playHours * 60;
  let studyTotal = wantStudy;
  let playTotal = wantPlay;

  if (wantStudy + wantPlay > F && wantStudy + wantPlay > 0) {
    const r = F / (wantStudy + wantPlay);
    studyTotal = wantStudy * r;
    playTotal = wantPlay * r;
    warnings.push(
      `${DAY_NAMES[dayIndex]}: only ${hm(F)} of free time after classes and meals, so study/play time was reduced to fit.`
    );
  }

  // proportional split per gap (gaps under 50 min stay free: get ready / travel / rest)
  const alloc = usable.map((g) => {
    const L = g.end - g.start;
    if (L < 50) return { g, L, study: 0, play: 0, free: L };
    let study = round5((L * studyTotal) / (F || 1));
    let play = round5((L * playTotal) / (F || 1));
    if (study + play > L) play = Math.max(0, L - study);
    let free = L - study - play;
    if (study < 30) { free += study; study = 0; }
    if (play < 30) { free += play; play = 0; }
    if (free > 0 && free < 30) {
      if (play > 0) { play += free; free = 0; }
      else if (study > 0) { study += free; free = 0; }
    }
    return { g, L, study, play, free };
  });

  // small pieces were dropped above -> give the missing minutes back from free time (longest gaps first)
  const byLength = alloc.filter((x) => x.L >= 50).sort((a, b) => b.L - a.L);
  let studyDeficit = Math.round(studyTotal) - alloc.reduce((a, x) => a + x.study, 0);
  for (const x of byLength) {
    if (studyDeficit < 30) break;
    const move = Math.min(round5(studyDeficit), Math.floor(x.free / 5) * 5);
    if (move > 0 && x.study + move >= 30) { x.study += move; x.free -= move; studyDeficit -= move; }
  }
  let playDeficit = Math.round(playTotal) - alloc.reduce((a, x) => a + x.play, 0);
  for (const x of byLength) {
    if (playDeficit < 30) break;
    const move = Math.min(round5(playDeficit), Math.floor(x.free / 5) * 5);
    if (move > 0 && x.play + move >= 30) { x.play += move; x.free -= move; playDeficit -= move; }
  }

  // lay the pieces out inside each gap
  let subjectIdx = dayIndex % Math.max(1, s.subjects.length);
  const nextSubject = () => {
    if (!s.subjects.length) return 'Study time';
    const name = s.subjects[subjectIdx % s.subjects.length];
    subjectIdx += 1;
    return `Study: ${name}`;
  };

  for (const x of alloc) {
    const items = [];
    const studyItems = x.study > 0 ? splitStudy(x.study) : [];
    const playItem = x.play > 0 ? [{ type: 'play', min: x.play }] : [];
    const freeItem = x.free > 0 ? [{ type: 'free', min: x.free }] : [];

    if (x.g.start < 720) items.push(...studyItems, ...playItem, ...freeItem);      // morning: fresh mind first
    else if (x.g.start < 1020) items.push(...playItem, ...freeItem, ...studyItems); // afternoon: rest first
    else items.push(...studyItems, ...playItem, ...freeItem);                       // evening: study, then relax

    let cur = x.g.start;
    for (const it of items) {
      const title =
        it.type === 'study' ? nextSubject()
        : it.type === 'play' ? 'Play / sports / hobby time'
        : it.type === 'rest' ? 'Short break'
        : 'Free time (rest, family, hobbies)';
      blocks.push({ start: cur, end: cur + it.min, type: it.type, title });
      cur += it.min;
    }
  }

  // a short free block right before class = getting ready / travelling
  const classStarts = new Set(merged.map((c) => c.start));
  blocks.forEach((b) => {
    if ((b.type === 'free' || b.type === 'rest') && classStarts.has(b.end) && b.end - b.start <= 90) {
      b.title = 'Get ready & travel to class';
      b.type = 'rest';
    }
  });

  // --- sleep
  const sleepMinutes = wake + 1440 - bed;
  blocks.sort((a, b) => a.start - b.start);
  blocks.push({ start: bed, end: wake + 1440, type: 'sleep', title: `Sleep (${hm(sleepMinutes)})` });

  const out = blocks.map((b) => ({
    start: toTime(b.start),
    end: toTime(b.end),
    minutes: Math.round(b.end - b.start),
    type: b.type,
    title: b.title
  }));

  return {
    day: dayIndex,
    blocks: out,
    studyMinutes: out.filter((b) => b.type === 'study').reduce((a, b) => a + b.minutes, 0),
    playMinutes: out.filter((b) => b.type === 'play' || b.type === 'free').reduce((a, b) => a + b.minutes, 0),
    sleepMinutes
  };
}

export function buildTimetable(settings) {
  const warnings = [];

  let sleepMin = toMin(settings.wakeTime) + 1440 - toMin(settings.bedTime);
  if (sleepMin > 1440) sleepMin -= 1440;
  if (sleepMin < 420) {
    warnings.push(`You are sleeping only ${hm(sleepMin)}. Students need about 8-10 hours, try an earlier bed time.`);
  }
  if (settings.classes.some((c) => toMin(c.start) < toMin(settings.wakeTime))) {
    warnings.push('A class starts before your wake-up time. Please wake up earlier or check the class timing.');
  }

  const schedule = [];
  for (let d = 0; d < 7; d++) schedule.push(buildDay(settings, d, warnings));
  return { schedule, warnings };
}

// -------------------------------------------------------------------------
// 3. CONTROLLERS
// -------------------------------------------------------------------------
export const getTimetable = async (req, res) => {
  try {
    const timetable = await Timetable.findOne({ userId: req.user.id }).lean();
    return res.status(200).json({ success: true, data: timetable || null });
  } catch (error) {
    console.error('Get Timetable Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load timetable' });
  }
};

export const generateTimetable = async (req, res) => {
  try {
    const { settings, error } = validateSettings(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const { schedule, warnings } = buildTimetable(settings);

    const timetable = await Timetable.findOneAndUpdate(
      { userId: req.user.id },
      { settings, schedule, warnings, generatedAt: new Date() },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({ success: true, data: timetable });
  } catch (error) {
    console.error('Generate Timetable Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate timetable' });
  }
};

export const deleteTimetable = async (req, res) => {
  try {
    await Timetable.findOneAndDelete({ userId: req.user.id });
    return res.status(200).json({ success: true, message: 'Timetable deleted' });
  } catch (error) {
    console.error('Delete Timetable Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete timetable' });
  }
};