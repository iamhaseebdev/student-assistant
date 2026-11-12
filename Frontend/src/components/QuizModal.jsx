import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import styles from './QuizModal.module.css';

const QuizModal = ({ quizData, docTitle, docId, difficulty, onClose, onExamCompleted }) => {
  const [userAnswers, setUserAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [loading, setLoading] = useState(false);

  // STRICT ANTI-CHEATING LOCKDOWN: 1 Violation = INSTANT AUTO-FAIL
  useEffect(() => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => {});
    }

    const handleContextMenu = (e) => e.preventDefault();
    document.addEventListener('contextmenu', handleContextMenu);

    const handleKeyDown = (e) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.key === 'c') ||
        (e.altKey && e.key === 'Tab')
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const handleVisibilityChange = () => {
      if (document.hidden && !submitted) {
        alert("🚨 CHEATING DETECTED! You switched tabs or left the exam window. Exam auto-submitted as FAILED.");
        handleSubmitQuiz(true); // Instant Force Fail
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [submitted]);

  const handleSelectOption = (qIdx, optIdx) => {
    if (submitted) return;
    setUserAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
  };

  const handleSubmitQuiz = async (forceFail = false) => {
    let calculatedScore = 0;
    const failedQuestions = [];

    quizData.forEach((q, idx) => {
      if (userAnswers[idx] === q.correctIndex) {
        calculatedScore += 1;
      } else {
        failedQuestions.push(q);
      }
    });

    if (forceFail) {
      calculatedScore = 0;
    }

    const percentage = Math.round((calculatedScore / quizData.length) * 100);
    const passed = !forceFail && percentage >= 60;

    setLoading(true);
    try {
      const res = await apiClient.post('/assistant/quiz/save-gamified', {
        docId,
        docTitle,
        score: calculatedScore,
        totalQuestions: quizData.length,
        passed,
        difficulty,
        failedQuestions
      });

      setResultData({
        score: calculatedScore,
        total: quizData.length,
        percentage,
        passed,
        xpPoints: res.data.xpPoints,
        level: res.data.level,
        rescheduledStartTime: res.data.rescheduledStartTime,
        forceFail
      });

      setSubmitted(true);
      if (onExamCompleted) onExamCompleted();
    } catch (err) {
      console.error("Error saving exam result:", err);
    } finally {
      setLoading(false);
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.lockdownHeader}>
          <span>🔒 KIOSK EXAM LOCKDOWN ACTIVE</span>
          <span style={{ color: '#ff0055' }}>⚡ Strict: 1 Tab Switch = Instant Fail</span>
        </div>

        <div className={styles.modalHeader}>
          <h3>⚡ EXAM: {docTitle} ({difficulty ? difficulty.toUpperCase() : 'EASY'})</h3>
          {!submitted && (
            <button className={styles.closeBtn} onClick={onClose} title="Exit Exam">✖</button>
          )}
        </div>

        {!submitted ? (
          <>
            {quizData.map((q, qIdx) => (
              <div key={qIdx} className={styles.questionBlock}>
                <div className={styles.questionTitle}>
                  {qIdx + 1}. {q.question}
                </div>
                <div className={styles.optionsGrid}>
                  {q.options.map((opt, optIdx) => (
                    <label
                      key={optIdx}
                      className={`${styles.optionLabel} ${userAnswers[qIdx] === optIdx ? styles.selectedOption : ''}`}
                      onClick={() => handleSelectOption(qIdx, optIdx)}
                    >
                      <input
                        type="radio"
                        name={`question-${qIdx}`}
                        checked={userAnswers[qIdx] === optIdx}
                        onChange={() => {}}
                        style={{ accentColor: '#00f3ff' }}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <button
              type="button"
              className={styles.submitQuizBtn}
              onClick={() => handleSubmitQuiz(false)}
              disabled={loading || Object.keys(userAnswers).length === 0}
            >
              {loading ? 'Evaluating & Verifying...' : 'Submit Final Exam'}
            </button>
          </>
        ) : (
          <div className={styles.scoreBox}>
            <p style={{ color: '#64748b', margin: 0, fontWeight: 700 }}>OFFICIAL EXAM RESULT</p>
            <h2>{resultData.score} / {resultData.total} ({resultData.percentage}%)</h2>

            <div style={{
              padding: '16px',
              borderRadius: '10px',
              margin: '20px 0',
              background: resultData.passed ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255, 0, 85, 0.15)',
              border: `1px solid ${resultData.passed ? '#00ff66' : '#ff0055'}`,
              color: resultData.passed ? '#00ff66' : '#ff0055'
            }}>
              {resultData.passed ? (
                <div>
                  <h3 style={{ margin: '0 0 4px 0' }}>🎉 EXAM CLEARED!</h3>
                  <p style={{ margin: 0 }}>Earned <b>+{resultData.xpPoints} XP</b> (Level {resultData.level} Scholar)</p>
                  <p style={{ margin: '6px 0 0 0', fontSize: '13px' }}>🎮 Gaming Arcade unlocked for 30 minutes!</p>
                </div>
              ) : (
                <div>
                  <h3 style={{ margin: '0 0 4px 0' }}>❌ EXAM FAILED</h3>
                  <p style={{ margin: 0 }}>
                    {resultData.forceFail 
                      ? 'Auto-Failed due to Anti-Cheating tab/window switch violation.' 
                      : 'Minimum 60% score required to clear this exam.'}
                  </p>
                  {resultData.rescheduledStartTime && (
                    <p style={{ margin: '6px 0 0 0', fontSize: '12px' }}>
                      ⏰ Rescheduled for: <b>{new Date(resultData.rescheduledStartTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</b>
                    </p>
                  )}
                </div>
              )}
            </div>

            <button type="button" className={styles.submitQuizBtn} onClick={onClose}>
              Return to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizModal;