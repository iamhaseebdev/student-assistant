import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import styles from './Timetable.module.css';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SUBJECT_OPTIONS = ['Math', 'Physics', 'Chemistry', 'Biology', 'Computer', 'English', 'Urdu', 'Islamiat', 'Pakistan Studies'];

const DEFAULT_FORM = {
  wakeTime: '06:30',
  bedTime: '22:30',
  studyHours: 3,
  playHours: 2,
  subjects: [],
  classes: [{ label: 'School', start: '08:00', end: '14:00', days: [0, 1, 2, 3, 4] }]
};

const TYPE_ICON = {
  class: '🏫',
  study: '📚',
  play: '⚽',
  free: '🛋️',
  meal: '🍽️',
  routine: '⏰',
  rest: '☕',
  sleep: '😴'
};

const to12h = (t) => {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
};

const fmt = (min) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
};

// JS: Sunday = 0  ->  our index: Monday = 0
const todayIndex = () => (new Date().getDay() + 6) % 7;

const Timetable = () => {
  const [mode, setMode] = useState('loading'); // loading | form | view
  const [form, setForm] = useState(DEFAULT_FORM);
  const [timetable, setTimetable] = useState(null);
  const [activeDay, setActiveDay] = useState(todayIndex());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customSubject, setCustomSubject] = useState('');

  useEffect(() => {
    apiClient
      .get('/assistant/timetable')
      .then((res) => {
        const data = res.data?.data;
        if (data?.schedule?.length) {
          setTimetable(data);
          setForm({
            wakeTime: data.settings.wakeTime,
            bedTime: data.settings.bedTime,
            studyHours: data.settings.studyHours,
            playHours: data.settings.playHours,
            subjects: data.settings.subjects || [],
            classes: data.settings.classes?.length ? data.settings.classes : []
          });
          setMode('view');
        } else {
          setMode('form');
        }
      })
      .catch((err) => {
        console.error('Timetable load error:', err);
        setMode('form');
      });
  }, []);

  // ---------- class rows ----------
  const updateClass = (i, patch) =>
    setForm((f) => ({ ...f, classes: f.classes.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));

  const toggleClassDay = (i, d) => {
    const days = form.classes[i].days;
    updateClass(i, { days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort() });
  };

  const addClass = () =>
    setForm((f) => ({
      ...f,
      classes: [...f.classes, { label: '', start: '16:00', end: '17:00', days: [0, 1, 2, 3, 4] }]
    }));

  const removeClass = (i) => setForm((f) => ({ ...f, classes: f.classes.filter((_, idx) => idx !== i) }));

  // ---------- subjects ----------
  const toggleSubject = (name) =>
    setForm((f) => ({
      ...f,
      subjects: f.subjects.includes(name) ? f.subjects.filter((s) => s !== name) : [...f.subjects, name]
    }));

  const addCustomSubject = () => {
    const name = customSubject.trim();
    if (!name) return;
    if (!form.subjects.includes(name)) setForm((f) => ({ ...f, subjects: [...f.subjects, name] }));
    setCustomSubject('');
  };

  // ---------- generate ----------
  const handleGenerate = async (e) => {
    e.preventDefault();
    setError('');

    for (const c of form.classes) {
      if (!c.start || !c.end) return setError('Please fill start and end time of every class');
      if (c.end <= c.start) return setError(`"${c.label || 'Class'}": end time must be after start time`);
      if (c.days.length === 0) return setError(`"${c.label || 'Class'}": select at least one day`);
    }

    setSaving(true);
    try {
      const res = await apiClient.post('/assistant/timetable/generate', {
        ...form,
        studyHours: Number(form.studyHours),
        playHours: Number(form.playHours)
      });
      setTimetable(res.data.data);
      setActiveDay(todayIndex());
      setMode('view');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create timetable');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Delete your timetable and start again?')) return;
    try {
      await apiClient.delete('/assistant/timetable');
    } catch (err) {
      console.error('Timetable delete error:', err);
    }
    setTimetable(null);
    setForm(DEFAULT_FORM);
    setMode('form');
  };

  if (mode === 'loading') return <div className={styles.loading}>Loading timetable...</div>;

  // =====================================================================
  // FORM
  // =====================================================================
  if (mode === 'form') {
    return (
      <form className={styles.card} onSubmit={handleGenerate}>
        <h3 className={styles.title}>🗓️ MAKE MY TIMETABLE</h3>
        <p className={styles.sub}>Tell us your class timings and we will plan study, play and sleep around them.</p>

        {error && <div className={styles.error}>{error}</div>}

        {/* ---- class timings ---- */}
        <h4 className={styles.section}>1. Your class timings</h4>
        <p className={styles.help}>School, college, academy, tuition... add as many timings as you have.</p>

        {form.classes.map((c, i) => (
          <div key={i} className={styles.classRow}>
            <div className={styles.classTop}>
              <input
                type="text"
                className={styles.labelInput}
                value={c.label}
                onChange={(e) => updateClass(i, { label: e.target.value })}
                placeholder="Name (School, Tuition...)"
                maxLength={40}
              />
              <input type="time" value={c.start} onChange={(e) => updateClass(i, { start: e.target.value })} />
              <span className={styles.to}>to</span>
              <input type="time" value={c.end} onChange={(e) => updateClass(i, { end: e.target.value })} />
              <button type="button" className={styles.removeBtn} onClick={() => removeClass(i)} title="Remove">
                ✕
              </button>
            </div>
            <div className={styles.dayChips}>
              {DAYS.map((d, di) => (
                <button
                  key={d}
                  type="button"
                  className={`${styles.chip} ${c.days.includes(di) ? styles.chipOn : ''}`}
                  onClick={() => toggleClassDay(i, di)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        ))}

        {form.classes.length < 12 && (
          <button type="button" className={styles.addBtn} onClick={addClass}>
            + Add another timing
          </button>
        )}

        {/* ---- sleep ---- */}
        <h4 className={styles.section}>2. Your sleep</h4>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label>Wake up time</label>
            <input type="time" value={form.wakeTime} onChange={(e) => setForm({ ...form, wakeTime: e.target.value })} required />
          </div>
          <div className={styles.field}>
            <label>Bed time</label>
            <input type="time" value={form.bedTime} onChange={(e) => setForm({ ...form, bedTime: e.target.value })} required />
          </div>
        </div>

        {/* ---- study / play ---- */}
        <h4 className={styles.section}>3. Study and play</h4>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label>Study hours per day</label>
            <input
              type="number"
              min="0"
              max="12"
              step="0.5"
              value={form.studyHours}
              onChange={(e) => setForm({ ...form, studyHours: e.target.value })}
              required
            />
          </div>
          <div className={styles.field}>
            <label>Play hours per day</label>
            <input
              type="number"
              min="0"
              max="8"
              step="0.5"
              value={form.playHours}
              onChange={(e) => setForm({ ...form, playHours: e.target.value })}
              required
            />
          </div>
        </div>

        <div className={styles.field}>
          <label>Subjects to study (optional)</label>
          <div className={styles.dayChips}>
            {[...new Set([...SUBJECT_OPTIONS, ...form.subjects])].map((name) => (
              <button
                key={name}
                type="button"
                className={`${styles.chip} ${form.subjects.includes(name) ? styles.chipOn : ''}`}
                onClick={() => toggleSubject(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className={styles.customRow}>
            <input
              type="text"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomSubject();
                }
              }}
              placeholder="Other subject..."
              maxLength={30}
            />
            <button type="button" className={styles.addBtn} onClick={addCustomSubject}>
              Add
            </button>
          </div>
        </div>

        <div className={styles.actions}>
          {timetable && (
            <button type="button" className={styles.ghostBtn} onClick={() => setMode('view')}>
              Cancel
            </button>
          )}
          <button type="submit" className={styles.primaryBtn} disabled={saving}>
            {saving ? 'Creating...' : '✨ Create Timetable'}
          </button>
        </div>
      </form>
    );
  }

  // =====================================================================
  // VIEW
  // =====================================================================
  const day = timetable.schedule.find((d) => d.day === activeDay) || timetable.schedule[0];
  const isToday = activeDay === todayIndex();

  return (
    <div className={styles.card}>
      <div className={styles.viewHead}>
        <h3 className={styles.title} style={{ margin: 0 }}>🗓️ MY TIMETABLE</h3>
        <div className={styles.headBtns}>
          <button type="button" className={styles.ghostBtn} onClick={() => setMode('form')}>
            ✏️ Change timings
          </button>
          <button type="button" className={styles.dangerBtn} onClick={handleReset}>
            🗑 Reset
          </button>
        </div>
      </div>

      {timetable.warnings?.length > 0 && (
        <div className={styles.warnBox}>
          {timetable.warnings.map((w, i) => (
            <div key={i}>⚠️ {w}</div>
          ))}
        </div>
      )}

      <div className={styles.dayTabs}>
        {DAYS.map((d, i) => (
          <button
            key={d}
            type="button"
            className={`${styles.dayTab} ${activeDay === i ? styles.dayTabOn : ''}`}
            onClick={() => setActiveDay(i)}
          >
            {d}
            {i === todayIndex() && <span className={styles.todayDot} />}
          </button>
        ))}
      </div>

      <div className={styles.summary}>
        <div className={styles.sumItem}><b>{fmt(day.studyMinutes)}</b><span>Study</span></div>
        <div className={styles.sumItem}><b>{fmt(day.playMinutes)}</b><span>Play / free</span></div>
        <div className={styles.sumItem}><b>{fmt(day.sleepMinutes)}</b><span>Sleep</span></div>
      </div>

      <h4 className={styles.dayName}>{DAY_FULL[day.day]}{isToday ? ' (today)' : ''}</h4>

      <div className={styles.timeline}>
        {day.blocks.map((b, i) => (
          <div key={i} className={`${styles.block} ${styles['type_' + b.type]}`}>
            <div className={styles.blockTime}>
              {to12h(b.start)}<br /><span>{to12h(b.end)}</span>
            </div>
            <div className={styles.blockBody}>
              <div className={styles.blockTitle}>{TYPE_ICON[b.type] || '•'} {b.title}</div>
              <div className={styles.blockMeta}>{fmt(b.minutes)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timetable;