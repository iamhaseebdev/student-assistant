import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import apiClient from '../api/apiClient';
import AILoader, { ButtonSpinner } from './Ailoader';
import styles from './PdfVault.module.css';

const PdfVault = () => {
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentTitle, setDocumentTitle] = useState('');

  // Reader Modal State
  const [readingPdfUrl, setReadingPdfUrl] = useState(null);
  const [readingPdfTitle, setReadingPdfTitle] = useState('');

  // Per-PDF Difficulty Selection Modal State
  const [selectedDocForExam, setSelectedDocForExam] = useState(null);
  const [chosenDifficulty, setChosenDifficulty] = useState('easy');
  const [startingQuiz, setStartingQuiz] = useState(false);

  // Result Breakdown Modal State
  const [examResultData, setExamResultData] = useState(null);

  // Schedule & Cooldown States
  const [canTakeHourlyExam, setCanTakeHourlyExam] = useState(true);
  const [minutesLeft, setMinutesLeft] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [masterExamDoneToday, setMasterExamDoneToday] = useState(false);

  // Exam Active States
  const [examActive, setExamActive] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [examDocTitle, setExamDocTitle] = useState('');
  const [examDocId, setExamDocId] = useState('');
  const [isMixedExam, setIsMixedExam] = useState(false);
  const [examDifficulty, setExamDifficulty] = useState('easy');
  const [examTimeLeft, setExamTimeLeft] = useState(600);
  const [errorMsg, setErrorMsg] = useState(null);
  const [savingExam, setSavingExam] = useState(false);

  useEffect(() => {
    fetchDocuments();
    checkScheduleStatus();

    // Live Ticking Engine
    const timerInterval = setInterval(() => {
      // Check local storage timestamp fallback
      const lastExamStamp = localStorage.getItem('last_exam_timestamp');
      if (lastExamStamp) {
        const diffMs = Date.now() - parseInt(lastExamStamp, 10);
        const totalSecPassed = Math.floor(diffMs / 1000);
        const remSec = 3600 - totalSecPassed;

        if (remSec > 0) {
          setCanTakeHourlyExam(false);
          setMinutesLeft(Math.floor(remSec / 60));
          setSecondsLeft(remSec % 60);
          return;
        } else {
          localStorage.removeItem('last_exam_timestamp');
          setCanTakeHourlyExam(true);
          setMinutesLeft(0);
          setSecondsLeft(0);
        }
      }
    }, 1000);

    return () => clearInterval(timerInterval);
  }, []);

  const fetchDocuments = async () => {
    setLoadingDocs(true);
    try {
      const res = await apiClient.get('/assistant/documents');
      const docs = res.data?.documents || res.data?.data || res.data || [];
      setDocuments(Array.isArray(docs) ? docs : []);
    } catch (err) {
      console.error('Fetch PDFs Error:', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const checkScheduleStatus = async () => {
    try {
      const res = await apiClient.get('/assistant/exam/schedule');
      const lastExamStamp = localStorage.getItem('last_exam_timestamp');
      
      if (lastExamStamp) {
        const diffMs = Date.now() - parseInt(lastExamStamp, 10);
        const remSec = 3600 - Math.floor(diffMs / 1000);
        if (remSec > 0) {
          setCanTakeHourlyExam(false);
          setMinutesLeft(Math.floor(remSec / 60));
          setSecondsLeft(remSec % 60);
          return;
        }
      }

      setCanTakeHourlyExam(res.data?.canTakeHourlyExam);
      setMinutesLeft(res.data?.minutesLeftForNextExam || 0);
      setSecondsLeft(res.data?.secondsLeftForNextExam || 0);
      setMasterExamDoneToday(res.data?.masterExamDoneToday || false);
    } catch (err) {
      console.error('Check Status Error:', err);
    }
  };

  useEffect(() => {
    let timer;
    if (examActive && examTimeLeft > 0) {
      timer = setInterval(() => setExamTimeLeft((t) => t - 1), 1000);
    } else if (examTimeLeft === 0 && examActive) {
      handleExamSubmit(false);
    }
    return () => clearInterval(timer);
  }, [examActive, examTimeLeft]);

  // Silent Anti-Cheating Lockdown
  useEffect(() => {
    if (!examActive) return;

    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }

    const handleVisibilityChange = () => {
      if (document.hidden && examActive) {
        handleExamSubmit(true);
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && examActive) {
        handleExamSubmit(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [examActive]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please select a PDF file first.');
      return;
    }

    const formData = new FormData();
    formData.append('pdf', selectedFile);
    if (documentTitle.trim()) formData.append('title', documentTitle);

    setUploading(true);
    setErrorMsg(null);

    try {
      await apiClient.post('/assistant/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSelectedFile(null);
      setDocumentTitle('');
      fetchDocuments();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to upload PDF');
    } finally {
      setUploading(false);
    }
  };

  const openPdfViewer = (fileUrl, title) => {
    const fullUrl = fileUrl.startsWith('http') 
      ? fileUrl 
      : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/${fileUrl.replace(/\\/g, '/')}`;
    setReadingPdfUrl(fullUrl);
    setReadingPdfTitle(title);
  };

  const openDifficultyModal = (docId, title, isMixed) => {
    setSelectedDocForExam({ id: docId, title, isMixed });
    setChosenDifficulty('easy');
  };

  const confirmAndStartExam = async () => {
    if (!selectedDocForExam) return;
    const targetDoc = { ...selectedDocForExam };
    const diff = chosenDifficulty;

    setStartingQuiz(true);
    setErrorMsg(null);

    try {
      const res = await apiClient.post('/assistant/quiz/generate', {
        docId: targetDoc.id,
        difficulty: diff,
        isMixed: targetDoc.isMixed
      });

      if (res.data?.data && Array.isArray(res.data.data) && res.data.data.length > 0) {
        const shuffledQuestions = [...res.data.data].sort(() => Math.random() - 0.5);

        setQuizQuestions(shuffledQuestions);
        setExamDocTitle(res.data.docTitle || targetDoc.title || 'PDF Exam');
        setExamDocId(targetDoc.id);
        setIsMixedExam(targetDoc.isMixed);
        setExamDifficulty(diff);
        setCurrentQIdx(0);
        setUserAnswers({});
        setExamTimeLeft(600);
        setSelectedDocForExam(null);
        setExamActive(true);
      } else {
        setErrorMsg('Failed to generate quiz. Please try again.');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to start exam.');
    } finally {
      setStartingQuiz(false);
    }
  };

  const handleExamSubmit = async (forceFail = false) => {
    let score = 0;
    const detailedBreakdown = [];

    quizQuestions.forEach((q, idx) => {
      const selected = userAnswers[idx];
      const isCorrect = selected === q.correctIndex;
      if (isCorrect) score++;

      detailedBreakdown.push({
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        userSelectedIndex: selected !== undefined ? selected : -1,
        isCorrect
      });
    });

    const passed = !forceFail && score >= Math.ceil(quizQuestions.length * 0.6);

    // Save timestamp locally immediately to guarantee timer starts
    localStorage.setItem('last_exam_timestamp', Date.now().toString());
    setCanTakeHourlyExam(false);
    setMinutesLeft(59);
    setSecondsLeft(59);

    setSavingExam(true);
    try {
      const res = await apiClient.post('/assistant/quiz/save-gamified', {
        score: forceFail ? 0 : score,
        totalQuestions: quizQuestions.length,
        docTitle: examDocTitle,
        docId: examDocId,
        passed,
        difficulty: examDifficulty,
        isMixed: isMixedExam,
        forceFail,
        failedQuestions: detailedBreakdown.filter(d => !d.isCorrect)
      });

      setExamActive(false);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }

      if (res.data?.masterExamDoneToday) {
        setMasterExamDoneToday(true);
      }

      setExamResultData({
        passed: res.data.passed,
        score: forceFail ? 0 : score,
        totalQuestions: quizQuestions.length,
        percentage: res.data.percentage || 0,
        earnedXp: res.data.earnedXp || 0,
        forceFail,
        breakdown: detailedBreakdown,
        title: examDocTitle
      });

    } catch (err) {
      console.error('Save Quiz Error:', err);
    } finally {
      setSavingExam(false);
    }
  };

  return (
    <div className={styles.vaultCard}>
      {uploading && (
        <AILoader
          fullScreen
          variant="neural"
          size="lg"
          messages={['Uploading your PDF', 'Saving to your vault', 'Almost done']}
        />
      )}
      {startingQuiz && (
        <AILoader
          fullScreen
          variant="neural"
          size="lg"
          messages={['AI is reading your PDF', 'Writing exam questions', 'Preparing your exam']}
        />
      )}
      {savingExam && (
        <AILoader
          fullScreen
          variant="neural"
          size="lg"
          messages={['Checking your answers', 'Calculating your score', 'Saving your result']}
        />
      )}

      {/* Header with Live Timer */}
      <div className={styles.vaultHeader}>
        <div className={styles.headerInfo}>
          <div className={styles.iconBadge}>📚</div>
          <div>
            <h2 className={styles.mainTitle}>STUDY PDF VAULT & EXAM ENGINE</h2>
            <p className={styles.subTitle}>Read study material & attempt hourly scheduled AI exams</p>
          </div>
        </div>

        {masterExamDoneToday ? (
          <div className={styles.dayDoneBadge}>🎉 MIXED MASTER EXAM PASSED</div>
        ) : (!canTakeHourlyExam || minutesLeft > 0 || secondsLeft > 0) ? (
          <div className={styles.cooldownBadge}>
            ⏳ Next Exam: {minutesLeft}m {secondsLeft}s
          </div>
        ) : (
          <div className={styles.readyBadge}>🟢 Exam System Ready</div>
        )}
      </div>

      {errorMsg && (
        <div className={styles.errorBanner}>
          <span>⚠️ {errorMsg}</span>
          <button onClick={() => setErrorMsg(null)}>✖</button>
        </div>
      )}

      {/* Setup Bar */}
      <div className={styles.examSetupBar}>
        <div style={{ color: '#00f3ff', fontWeight: '700', fontSize: '13px' }}>
          ⚡ Master Exam Mode
        </div>

        <button 
          onClick={() => openDifficultyModal(null, 'Mixed PDF Master Exam', true)} 
          disabled={masterExamDoneToday || (!canTakeHourlyExam || minutesLeft > 0 || secondsLeft > 0)}
          className={styles.cyanMixedExamBtn}
        >
          ⚡ TAKE ALL-PDF MASTER EXAM {masterExamDoneToday ? '(PASSED TODAY)' : ''}
        </button>
      </div>

      {/* Upload Form */}
      <form onSubmit={handleUpload} className={styles.uploadForm}>
        <div className={styles.formRow}>
          <input
            type="text"
            placeholder="Document Title (e.g., Physics Notes)"
            value={documentTitle}
            onChange={(e) => setDocumentTitle(e.target.value)}
            className={styles.titleInput}
          />
          <input
            type="file"
            id="pdfFileInput"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => setSelectedFile(e.target.files[0])}
          />
          <label htmlFor="pdfFileInput" className={styles.customFileBtn}>
            {selectedFile ? selectedFile.name : '📎 Choose PDF File'}
          </label>
          <button type="submit" disabled={uploading} className={styles.uploadBtn}>
            {uploading ? <><ButtonSpinner /> Uploading...</> : 'Upload PDF'}
          </button>
        </div>
      </form>

      {/* PDF List Grid */}
      {loadingDocs ? (
        <AILoader messages={['Loading PDF documents', 'Fetching your study material', 'Almost there']} />
      ) : documents.length > 0 ? (
        <div className={styles.gridContainer}>
          {documents.map((doc) => (
            <div key={doc._id} className={styles.docBox}>
              <div className={styles.docHeader}>
                <span className={styles.pdfBadge}>PDF</span>
                <div className={styles.docMeta}>
                  <h4>{doc.title || 'Untitled PDF'}</h4>
                  <p>Uploaded: {new Date(doc.createdAt || Date.now()).toLocaleDateString()}</p>
                </div>
              </div>

              <div className={styles.docActionRow}>
                <button 
                  type="button" 
                  onClick={() => openPdfViewer(doc.fileUrl, doc.title)} 
                  className={styles.readPdfBtn}
                >
                  📖 Read PDF
                </button>

                <button 
                  type="button"
                  onClick={() => openDifficultyModal(doc._id, doc.title, false)} 
                  disabled={!canTakeHourlyExam || minutesLeft > 0 || secondsLeft > 0}
                  className={styles.startExamBtn}
                >
                  🎯 Exam
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: '#94a3b8', textAlign: 'center', padding: '30px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px' }}>
          📄 No PDFs uploaded yet. Upload your PDF notes above to read & take exams!
        </div>
      )}

      {/* EXAM RESULT REPORT MODAL */}
      {examResultData && ReactDOM.createPortal(
        <div className={styles.portalOverlay} onClick={() => setExamResultData(null)}>
          <div className={styles.resultModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.portalHeader}>
              <div className={styles.portalTitleBox}>
                <span>📊 EXAM PERFORMANCE REPORT</span>
              </div>
              <button className={styles.portalCloseBtn} onClick={() => setExamResultData(null)}>✖ Close</button>
            </div>

            <div className={styles.resultBody}>
              <div className={styles.resultBanner}>
                {examResultData.forceFail ? (
                  <div className={styles.failBanner}>🚨 AUTO-FAILED (Anti-Cheating Violation)</div>
                ) : examResultData.passed ? (
                  <div className={styles.passBanner}>🎉 CONGRATULATIONS! EXAM PASSED</div>
                ) : (
                  <div className={styles.failBanner}>❌ EXAM FAILED (Keep Practicing!)</div>
                )}

                <div className={styles.statGrid}>
                  <div className={styles.statBox}>
                    <span className={styles.statLabel}>Score</span>
                    <span className={styles.statVal}>{examResultData.score} / {examResultData.totalQuestions}</span>
                  </div>
                  <div className={styles.statBox}>
                    <span className={styles.statLabel}>Percentage</span>
                    <span className={styles.statVal}>{examResultData.percentage}%</span>
                  </div>
                  <div className={styles.statBox}>
                    <span className={styles.statLabel}>XP Earned</span>
                    <span className={styles.statVal} style={{ color: '#00f3ff' }}>+{examResultData.earnedXp} XP</span>
                  </div>
                </div>
              </div>

              <h4 style={{ color: '#00f3ff', margin: '14px 0 10px 0', fontSize: '14px' }}>📌 Question Breakdown & Correct Answers:</h4>
              
              <div className={styles.breakdownList}>
                {examResultData.breakdown.map((item, index) => (
                  <div 
                    key={index} 
                    className={`${styles.breakdownCard} ${item.isCorrect ? styles.correctCard : styles.wrongCard}`}
                  >
                    <div className={styles.qTitleRow}>
                      <span className={item.isCorrect ? styles.correctTag : styles.wrongTag}>
                        {item.isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}
                      </span>
                      <p className={styles.breakdownQText}>{index + 1}. {item.question}</p>
                    </div>

                    <div className={styles.optionsReviewGrid}>
                      {item.options.map((opt, oIdx) => {
                        let optionStyle = styles.neutralOpt;
                        if (oIdx === item.correctIndex) optionStyle = styles.correctOpt;
                        else if (oIdx === item.userSelectedIndex && !item.isCorrect) optionStyle = styles.wrongOpt;

                        return (
                          <div key={oIdx} className={optionStyle}>
                            <span>{opt}</span>
                            {oIdx === item.correctIndex && <strong>(Correct Answer)</strong>}
                            {oIdx === item.userSelectedIndex && !item.isCorrect && <strong>(Your Pick)</strong>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => setExamResultData(null)} className={styles.confirmStartExamBtn}>
                Done & Continue
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Difficulty Selection Popup Modal */}
      {selectedDocForExam && ReactDOM.createPortal(
        <div className={styles.portalOverlay} onClick={() => !startingQuiz && setSelectedDocForExam(null)}>
          <div className={styles.difficultyModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.portalHeader}>
              <div className={styles.portalTitleBox}>
                <span>🎯 SELECT EXAM DIFFICULTY</span>
              </div>
              <button 
                className={styles.portalCloseBtn} 
                onClick={() => setSelectedDocForExam(null)}
                disabled={startingQuiz}
              >
                ✖ Cancel
              </button>
            </div>

            <div className={styles.diffModalBody}>
              <h4 className={styles.diffDocTitle}>{selectedDocForExam.title}</h4>
              
              <label className={`${styles.diffOptionLabel} ${chosenDifficulty === 'easy' ? styles.diffSelectedEasy : ''}`}>
                <input
                  type="radio"
                  name="difficultyChoice"
                  value="easy"
                  checked={chosenDifficulty === 'easy'}
                  onChange={() => setChosenDifficulty('easy')}
                />
                <span className={styles.easyText}>🟢 Easy</span>
              </label>

              <label className={`${styles.diffOptionLabel} ${chosenDifficulty === 'normal' ? styles.diffSelectedNormal : ''}`}>
                <input
                  type="radio"
                  name="difficultyChoice"
                  value="normal"
                  checked={chosenDifficulty === 'normal'}
                  onChange={() => setChosenDifficulty('normal')}
                />
                <span className={styles.normalText}>🟡 Normal</span>
              </label>

              <label className={`${styles.diffOptionLabel} ${chosenDifficulty === 'hard' ? styles.diffSelectedHard : ''}`}>
                <input
                  type="radio"
                  name="difficultyChoice"
                  value="hard"
                  checked={chosenDifficulty === 'hard'}
                  onChange={() => setChosenDifficulty('hard')}
                />
                <span className={styles.hardText}>🔴 Hard</span>
              </label>

              <button 
                onClick={confirmAndStartExam} 
                className={styles.confirmStartExamBtn}
                disabled={startingQuiz}
              >
                {startingQuiz ? <><ButtonSpinner /> Generating AI Exam...</> : '🚀 Start Exam Now'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Reader Modal Portal */}
      {readingPdfUrl && ReactDOM.createPortal(
        <div className={styles.portalOverlay} onClick={() => setReadingPdfUrl(null)}>
          <div className={styles.pdfReaderModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.portalHeader}>
              <div className={styles.portalTitleBox}>
                <span>📖 READING: {readingPdfTitle}</span>
              </div>
              <button className={styles.portalCloseBtn} onClick={() => setReadingPdfUrl(null)}>✖ Close</button>
            </div>
            <div className={styles.readerFrameBody}>
              <iframe src={readingPdfUrl} title={readingPdfTitle} className={styles.pdfIframe} />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Kiosk Exam Modal Portal */}
      {examActive && ReactDOM.createPortal(
        <div className={styles.portalOverlay}>
          <div className={styles.portalModalContent}>
            <div className={styles.kioskBar}>
              <span>🔒 KIOSK EXAM LOCKDOWN ACTIVE</span>
              <span className={styles.timerBadge}>⏱️ {Math.floor(examTimeLeft / 60)}m {examTimeLeft % 60}s</span>
            </div>

            <div className={styles.portalHeader}>
              <div className={styles.portalTitleBox}>
                <span>⚡ {examDocTitle} ({examDifficulty.toUpperCase()})</span>
              </div>
              <button className={styles.portalCloseBtn} onClick={() => handleExamSubmit(true)}>✖ Exit & Fail</button>
            </div>

            {quizQuestions[currentQIdx] && (
              <div className={styles.portalBody}>
                <h3 className={styles.questionText}>
                  {currentQIdx + 1}. {quizQuestions[currentQIdx].question}
                </h3>

                <div className={styles.optionsList}>
                  {quizQuestions[currentQIdx].options.map((opt, oIdx) => (
                    <label
                      key={oIdx}
                      className={`${styles.optionLabel} ${userAnswers[currentQIdx] === oIdx ? styles.optionSelected : ''}`}
                    >
                      <input
                        type="radio"
                        name={`q_${currentQIdx}`}
                        checked={userAnswers[currentQIdx] === oIdx}
                        onChange={() => setUserAnswers({ ...userAnswers, [currentQIdx]: oIdx })}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>

                <div className={styles.examFooterNav}>
                  <button
                    disabled={currentQIdx === 0}
                    onClick={() => setCurrentQIdx((i) => i - 1)}
                    className={styles.secondaryBtn}
                  >
                    ◀ Previous
                  </button>

                  <span className={styles.qCounter}>Question {currentQIdx + 1} of {quizQuestions.length}</span>

                  {currentQIdx === quizQuestions.length - 1 ? (
                    <button onClick={() => handleExamSubmit(false)} className={styles.submitExamBtn}>
                      ✅ Submit Final Exam
                    </button>
                  ) : (
                    <button onClick={() => setCurrentQIdx((i) => i + 1)} className={styles.primaryBtn}>
                      Next ▶
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default PdfVault;