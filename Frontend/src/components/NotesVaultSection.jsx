import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import SubjectiveExamModal from './SubjectiveExamModal';
import styles from './NotesVaultSection.module.css';

const SUBJECTS_LIST = ['Computer', 'Physics', 'Chemistry', 'Biology'];
const BOARDS_LIST = ['Sindh Board', 'Federal Board'];
const CLASSES_BY_BOARD = {
  'Sindh Board': ['9th Class (SSC Part-I)', '10th Class (SSC Part-II)', '11th Class (HSC Part-I)', '12th Class (HSC Part-II)'],
  'Federal Board': ['9th Class', '10th Class', '11th Class (FSc/ICS)', '12th Class (FSc/ICS)']
};
const DEFAULT_BOARD = 'Sindh Board';

const NotesVaultSection = () => {
  const [vaults, setVaults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nowTime, setNowTime] = useState(Date.now());

  const [creationMode, setCreationMode] = useState('ai');
  const [subjectName, setSubjectName] = useState('Physics');
  const [board, setBoard] = useState(DEFAULT_BOARD);
  const [studentClass, setStudentClass] = useState(CLASSES_BY_BOARD[DEFAULT_BOARD][3]);
  const [topicName, setTopicName] = useState('');
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [serverLastExam, setServerLastExam] = useState(0); // lock time kept by the server (survives PDF deletion)

  const [selectedVaultForExam, setSelectedVaultForExam] = useState(null);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [showExamModal, setShowExamModal] = useState(false);
  const [startingExam, setStartingExam] = useState(false);

  useEffect(() => {
    fetchUserVaults();
    const timerInterval = setInterval(() => setNowTime(Date.now()), 1000);
    return () => clearInterval(timerInterval);
  }, []);

  const fetchUserVaults = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/notes-vault/user-vaults');
      if (res.data?.success) {
        setVaults(res.data.vaults || []);
        setServerLastExam(res.data.lastExamTakenAt ? new Date(res.data.lastExamTakenAt).getTime() : 0);
      }
    } catch (err) {
      console.error('Fetch Notes Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBoardChange = (newBoard) => {
    setBoard(newBoard);
    setStudentClass(CLASSES_BY_BOARD[newBoard][3]); // reset to 12th for the new board
  };

  const handleCreateVault = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!topicName.trim()) return setErrorMsg('Please enter topic title!');

    const formData = new FormData();
    formData.append('subjectName', subjectName);
    // board is stored inside the class string so the backend prompts and saved vaults carry it automatically
    formData.append('studentClass', `${studentClass} - ${board}`);
    formData.append('topicTitle', topicName);
    formData.append('notesType', 'subjective');
    formData.append('creationMode', creationMode);
    if (creationMode === 'upload' && selectedPdf) formData.append('pdf', selectedPdf);

    setGenerating(true);
    try {
      const res = await apiClient.post('/notes-vault/create', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.success) {
        setTopicName('');
        setSelectedPdf(null);
        fetchUserVaults();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to create notes PDF vault.');
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenPDF = (vault) => {
    if (vault.pdfUrl) {
      window.open(`http://localhost:3000${vault.pdfUrl}`, '_blank');
    } else {
      setErrorMsg('PDF URL not found in database record.');
    }
  };

  const getExamCooldownStatus = (lastExamTakenAt) => {
    if (!lastExamTakenAt) return { canTake: true, text: '' };
    const remainingMs = new Date(lastExamTakenAt).getTime() + 60 * 60 * 1000 - nowTime;
    if (remainingMs > 0) {
      const m = Math.floor(remainingMs / 60000);
      const s = Math.floor((remainingMs % 60000) / 1000);
      return { canTake: false, text: `⏳ Wait ${m}m ${s < 10 ? '0' : ''}${s}s` };
    }
    return { canTake: true, text: '' };
  };

  // newest exam time over ALL vaults -> the 1-hour lock is shared by every PDF
  const globalLastExam = vaults.reduce((latest, v) => {
    const t = v.lastExamTakenAt ? new Date(v.lastExamTakenAt).getTime() : 0;
    return t > latest ? t : latest;
  }, serverLastExam);
  const globalCooldown = getExamCooldownStatus(globalLastExam || null);

  const handleStartExam = async (vault) => {
    const cooldown = globalCooldown;
    if (!cooldown.canTake) {
      return setErrorMsg(`You can re-attempt after 1 hour from last attempt. (${cooldown.text})`);
    }

    setErrorMsg('');
    setStartingExam(true);
    try {
      const res = await apiClient.post('/notes-vault/generate-exam', { vaultId: vault._id }, { timeout: 120000 });
      const list = res.data?.questions || [];
      if (!res.data?.success || list.length === 0) {
        return setErrorMsg(`Server replied without any question. Response: ${JSON.stringify(res.data).slice(0, 200)}`);
      }
      const qObj = list[Math.floor(Math.random() * list.length)];
      const currentChap = vault.extractedChapters?.[vault.currentChapterIndex] || vault.extractedChapters?.[0];

      // the server has started the 1-hour lock now -> show it immediately on every card
      setServerLastExam(Date.now());
      setSelectedVaultForExam(vault);
      setActiveQuestion({
        chapterTitle: currentChap?.chapterTitle || vault.topicTitle,
        subjectName: vault.subjectName,
        studentClass: vault.studentClass,
        question: qObj.question,
        modelAnswer: qObj.answer || ''
      });
      setShowExamModal(true);
    } catch (err) {
      console.error('generate-exam failed:', err);
      const status = err.response?.status;
      const serverMsg = err.response?.data?.message;
      setErrorMsg(
        serverMsg ||
        (status
          ? `Server returned ${status} for /notes-vault/generate-exam (route missing or not allowed).`
          : `Could not reach the server: ${err.message}`)
      );
    } finally {
      setStartingExam(false);
    }
  };

  return (
    <div className={styles.vaultContainer}>
      <div className={styles.vaultHeader}>
        <h2 className={styles.title}>📝 PDF NOTES & Q/A EXAM</h2>
        <p className={styles.subtitle}>
          Generate or upload PDF notes for Computer, Physics, Chemistry and Biology, then answer a board-style question (Sindh Board SSC/HSC or Federal Board).
        </p>
      </div>

      <div className={styles.createBox}>
        <div className={styles.modeTabs}>
          <button type="button" className={creationMode === 'ai' ? styles.activeTabBtn : styles.tabBtn} onClick={() => { setCreationMode('ai'); setErrorMsg(''); }}>
            ⚡ Auto-Generate AI PDF Notes
          </button>
          <button type="button" className={creationMode === 'upload' ? styles.activeTabBtn : styles.tabBtn} onClick={() => { setCreationMode('upload'); setErrorMsg(''); }}>
            📎 Upload PDF Book / Notes
          </button>
        </div>

        <form onSubmit={handleCreateVault} className={styles.createForm}>
          <div className={styles.formRow} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className={styles.inputGroup}>
              <label>Select Board</label>
              <select value={board} onChange={(e) => handleBoardChange(e.target.value)}>
                {BOARDS_LIST.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className={styles.inputGroup}>
              <label>Select Subject</label>
              <select value={subjectName} onChange={(e) => setSubjectName(e.target.value)}>
                {SUBJECTS_LIST.map((sub) => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            </div>
            <div className={styles.inputGroup}>
              <label>Select Class</label>
              <select value={studentClass} onChange={(e) => setStudentClass(e.target.value)}>
                {CLASSES_BY_BOARD[board].map((cls) => <option key={cls} value={cls}>{cls}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.formRowSecondary}>
            <div className={styles.inputGroup} style={{ flex: 2 }}>
              <label>Topic / Chapter Title</label>
              <input
                type="text"
                placeholder="e.g. Projectile Motion / Carnot Engine"
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                required
              />
            </div>
          </div>

          {creationMode === 'upload' && (
            <div className={styles.fileUploadRow}>
              <input type="file" accept="application/pdf" onChange={(e) => { setSelectedPdf(e.target.files[0]); setErrorMsg(''); }} required />
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px',
                background: 'rgba(255, 0, 85, 0.1)', border: '1px solid #ff0055', color: '#ff4d85',
                padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, lineHeight: 1.5
              }}
            >
              <span>❌ {errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg('')}
                style={{ background: 'transparent', border: 'none', color: '#ff4d85', cursor: 'pointer', fontSize: '16px', fontWeight: 800 }}
              >
                ✕
              </button>
            </div>
          )}

          <button type="submit" disabled={generating} className={styles.generateBtn}>
            {generating ? '⏳ Building PDF Document...' : creationMode === 'upload' ? '📎 Upload & Save PDF' : '🚀 Generate & Create PDF'}
          </button>
        </form>
      </div>

      {!globalCooldown.canTake && (
        <div
          style={{
            background: 'rgba(255, 170, 0, 0.1)', border: '1px solid #ffaa00', color: '#ffaa00',
            padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700
          }}
        >
          🔒 Only 1 exam per hour is allowed (on any PDF). Next exam unlocks in: {globalCooldown.text.replace('⏳ Wait ', '')}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#00f3ff', textAlign: 'center', padding: '30px' }}>⏳ Loading PDF Vaults...</div>
      ) : vaults.length > 0 ? (
        <div className={styles.vaultGrid}>
          {vaults.map((vault) => {
            const cooldown = globalCooldown;
            return (
              <div key={vault._id} className={styles.vaultCard}>
                <div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <span className={styles.subjectBadge}>{vault.subjectName}</span>
                    <span className={styles.classBadge}>{vault.studentClass || '12th Class (HSC Part-II) - Sindh Board'}</span>
                  </div>
                  <h4 className={styles.pdfTitle}>📄 {vault.topicTitle}</h4>
                </div>

                <div className={styles.btnActionRow}>
                  <button type="button" className={styles.readStudyBtn} onClick={() => handleOpenPDF(vault)}>
                    📄 Open PDF Notes
                  </button>
                  <button
                    type="button"
                    className={styles.startExamBtn}
                    onClick={() => handleStartExam(vault)}
                    disabled={startingExam}
                    style={{ opacity: cooldown.canTake ? 1 : 0.65, cursor: cooldown.canTake ? 'pointer' : 'not-allowed' }}
                  >
                    {!cooldown.canTake ? cooldown.text : startingExam ? '⏳ Preparing...' : '✏️ Start Q/A Exam'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ color: '#64748b', textAlign: 'center', padding: '30px', background: 'rgba(15,23,42,0.5)', borderRadius: '12px' }}>
          📄 No Notes PDF found. Create your first PDF topic above!
        </div>
      )}

      {showExamModal && selectedVaultForExam && activeQuestion && (
        <SubjectiveExamModal
          vaultData={selectedVaultForExam}
          questionData={activeQuestion}
          onClose={() => setShowExamModal(false)}
          onFinish={(shouldClose = true) => {
            if (shouldClose) setShowExamModal(false);
            fetchUserVaults();
          }}
        />
      )}
    </div>
  );
};

export default NotesVaultSection;
