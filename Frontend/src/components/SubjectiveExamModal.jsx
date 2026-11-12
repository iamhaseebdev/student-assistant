import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import apiClient from '../api/apiClient';
import styles from './SubjectiveExamModal.module.css';

const SYMBOL_TOOLBAR = [
  'Δ', 'θ', 'λ', 'π', 'μ', 'ρ', 'ω', '∞', '∫', '√', '≈', '≠', '≤', '≥',
  '°', '℃', '→', '⇌', '±', '×', '÷', 'α', 'β', 'γ'
];

const EMPTY_FMT = { bold: false, italic: false, underline: false, sub: false, sup: false, ul: false, ol: false };

// Turn the formatted page into plain text the backend/AI examiner understands
const editorToPlainText = (editorEl) => {
  if (!editorEl) return '';
  const clone = editorEl.cloneNode(true);

  clone.querySelectorAll('sub').forEach((n) => n.replaceWith(`_{${n.textContent}}`));
  clone.querySelectorAll('sup').forEach((n) => n.replaceWith(`^{${n.textContent}}`));
  clone.querySelectorAll('h1, h2').forEach((n) => n.replaceWith(`\n## ${n.textContent}\n`));
  clone.querySelectorAll('h3, h4').forEach((n) => n.replaceWith(`\n### ${n.textContent}\n`));
  clone.querySelectorAll('ul > li').forEach((li) => li.prepend('- '));
  clone.querySelectorAll('ol').forEach((ol) => {
    [...ol.children].forEach((li, i) => li.prepend(`${i + 1}. `));
  });

  // innerText needs a rendered element to produce correct line breaks
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:800px;white-space:pre-wrap;';
  holder.appendChild(clone);
  document.body.appendChild(holder);
  const text = holder.innerText;
  document.body.removeChild(holder);
  return text.replace(/\n{3,}/g, '\n\n').trim();
};

const SubjectiveExamModal = ({ vaultData, questionData, onClose, onFinish }) => {
  const editorRef = useRef(null);
  const [wordCount, setWordCount] = useState(0);
  const [fmt, setFmt] = useState(EMPTY_FMT);
  const [blockType, setBlockType] = useState('p');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const getPlainAnswer = useCallback(() => editorToPlainText(editorRef.current), []);

  // Focus the page so the student can start typing right away
  useEffect(() => {
    if (!result && editorRef.current) editorRef.current.focus();
  }, [result]);

  // Keep the toolbar buttons (B / I / U ...) in sync with the cursor position
  useEffect(() => {
    const syncToolbar = () => {
      const sel = document.getSelection();
      if (!editorRef.current || !sel || !sel.anchorNode || !editorRef.current.contains(sel.anchorNode)) return;
      const q = (c) => { try { return document.queryCommandState(c); } catch (_) { return false; } };
      setFmt({
        bold: q('bold'), italic: q('italic'), underline: q('underline'),
        sub: q('subscript'), sup: q('superscript'),
        ul: q('insertUnorderedList'), ol: q('insertOrderedList')
      });
      let block = 'p';
      let node = sel.anchorNode;
      while (node && node !== editorRef.current) {
        const tag = node.nodeName?.toLowerCase();
        if (tag === 'h2' || tag === 'h3') { block = tag; break; }
        node = node.parentNode;
      }
      setBlockType(block);
    };
    document.addEventListener('selectionchange', syncToolbar);
    return () => document.removeEventListener('selectionchange', syncToolbar);
  }, []);

  // Anti-cheat: only triggers on an actual tab switch
  useEffect(() => {
    if (result) return;
    const handleVisibilityChange = () => {
      if (document.hidden && !result && !submitting) triggerCheatingAutoFail();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, submitting]);

  const triggerCheatingAutoFail = async () => {
    setSubmitting(true);
    const cheatingEvaluation = {
      score: 0,
      passed: false,
      feedback: '🚫 EXAM CANCELLED & FAILED: Tab switching was detected during the active board paper.',
      mistakes: ['Navigated away from active exam tab', 'Cheating protection policy violated']
    };
    try {
      await apiClient.post('/notes-vault/evaluate', {
        vaultId: vaultData._id,
        question: questionData.question,
        studentAnswer: getPlainAnswer() || 'AUTO-FAILED: Tab Switch Detected',
        modelAnswer: questionData.modelAnswer || ''
      });
    } catch (err) {
      console.error('Auto-fail save error:', err);
    } finally {
      setResult(cheatingEvaluation);
      setSubmitting(false);
    }
  };

  // ---------- Word-like editing helpers ----------
  const exec = (command, value = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleInput();
  };

  const keepSelection = (e) => e.preventDefault(); // buttons must not steal focus from the page

  const handleBlockChange = (e) => {
    const value = e.target.value;
    setBlockType(value);
    exec('formatBlock', value === 'p' ? 'p' : value);
  };

  const insertSymbol = (sym) => exec('insertText', sym);

  const handleInput = () => {
    const text = editorRef.current?.innerText || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount(words);
    if (errorMsg) setErrorMsg('');
  };

  // Paste as plain text so copied web/Word styling doesn't mess up the page
  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  const handleSubmitExam = async () => {
    const answer = getPlainAnswer();
    if (!answer) {
      return setErrorMsg('Please type your complete answer before submitting!');
    }

    setErrorMsg('');
    setSubmitting(true);
    try {
      const response = await apiClient.post('/notes-vault/evaluate', {
        vaultId: vaultData._id,
        question: questionData.question,
        studentAnswer: answer,
        modelAnswer: questionData.modelAnswer || ''
      });

      if (response.data?.success) {
        setResult(response.data.evaluation);
        if (onFinish) onFinish(false);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    if (result && onFinish) onFinish(true);
    else onClose();
  };

  const Btn = ({ title, active, onClick, children, extra }) => (
    <button
      type="button"
      title={title}
      className={`${styles.ribbonBtn} ${active ? styles.ribbonBtnActive : ''}`}
      onMouseDown={keepSelection}
      onClick={onClick}
      style={extra}
    >
      {children}
    </button>
  );

  const modalJSX = (
    <div className={styles.modalOverlay}>
      <div className={styles.examCard}>
        {/* HEADER */}
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>
              📝 {questionData.subjectName}{questionData.studentClass ? ` (${questionData.studentClass})` : ''} - {questionData.chapterTitle}
            </h3>
            <span className={styles.antiCheatBadge}>🛡️ Anti-Cheat Active (Tab Switch Protected)</span>
          </div>
          <button className={styles.pdfToggleBtn} onClick={handleCloseModal}>✖ Exit Portal</button>
        </div>

        <div className={styles.bodyLayout}>
          <div className={styles.workspace}>
            {/* QUESTION BOX */}
            <div className={styles.questionBox}>
              <p className={styles.qLabel}>BOARD EXAM QUESTION / TOPIC:</p>
              <h4>{questionData.question}</h4>
            </div>

            {!result ? (
              <>
                {/* WORD-STYLE RIBBON */}
                <div className={styles.ribbon}>
                  <div className={styles.ribbonRow}>
                    <Btn title="Undo (Ctrl+Z)" onClick={() => exec('undo')}>↶</Btn>
                    <Btn title="Redo (Ctrl+Y)" onClick={() => exec('redo')}>↷</Btn>
                    <span className={styles.ribbonSep} />

                    <select className={styles.ribbonSelect} value={blockType} onChange={handleBlockChange} title="Text style">
                      <option value="p">Normal text</option>
                      <option value="h2">Main Heading</option>
                      <option value="h3">Sub-Heading</option>
                    </select>
                    <span className={styles.ribbonSep} />

                    <Btn title="Bold (Ctrl+B)" active={fmt.bold} onClick={() => exec('bold')} extra={{ fontWeight: 900 }}>B</Btn>
                    <Btn title="Italic (Ctrl+I)" active={fmt.italic} onClick={() => exec('italic')} extra={{ fontStyle: 'italic' }}>I</Btn>
                    <Btn title="Underline (Ctrl+U)" active={fmt.underline} onClick={() => exec('underline')} extra={{ textDecoration: 'underline' }}>U</Btn>
                    <span className={styles.ribbonSep} />

                    <Btn title="Bullet list" active={fmt.ul} onClick={() => exec('insertUnorderedList')}>• List</Btn>
                    <Btn title="Numbered list" active={fmt.ol} onClick={() => exec('insertOrderedList')}>1. List</Btn>
                    <span className={styles.ribbonSep} />

                    <Btn title="Subscript (H₂O)" active={fmt.sub} onClick={() => exec('subscript')}>x₂</Btn>
                    <Btn title="Superscript (x²)" active={fmt.sup} onClick={() => exec('superscript')}>x²</Btn>
                  </div>

                  <div className={styles.ribbonRow}>
                    <span className={styles.symTitle}>Symbols:</span>
                    {SYMBOL_TOOLBAR.map((sym) => (
                      <Btn key={sym} title={`Insert ${sym}`} onClick={() => insertSymbol(sym)}>{sym}</Btn>
                    ))}
                  </div>
                </div>

                {/* THE PAGE */}
                <div className={styles.paperWrap}>
                  <div
                    ref={editorRef}
                    className={styles.paper}
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck
                    data-placeholder="Start typing your answer here, just like in a Word document..."
                    onInput={handleInput}
                    onPaste={handlePaste}
                  />
                </div>

                <div className={styles.statusBar}>
                  <span>Words: {wordCount}</span>
                  <span>Tip: Ctrl+B bold · Ctrl+I italic · Ctrl+U underline</span>
                </div>

                {errorMsg && (
                  <div className={styles.errorBox} role="alert">❌ {errorMsg}</div>
                )}

                <button className={styles.submitBtn} onClick={handleSubmitExam} disabled={submitting}>
                  {submitting ? '🤖 AI Examining Paper...' : 'Submit Answer for Board Evaluation'}
                </button>
              </>
            ) : (
              /* RESULT BOX */
              <div className={`${styles.resultBox} ${result.passed ? styles.passBorder : styles.failBorder}`}>
                <h3>{result.passed ? '🎉 EXAM PASSED!' : '❌ EXAM FAILED'}</h3>
                <p className={styles.scoreText}>Board Score: <b>{result.score}%</b></p>
                <p className={styles.feedbackText}><b>Examiner Feedback:</b> {result.feedback}</p>

                {result.mistakes && result.mistakes.length > 0 && (
                  <div className={styles.mistakesBox}>
                    <h4>Key Mistakes & Improvements:</h4>
                    <ul>
                      {result.mistakes.map((m, idx) => (
                        <li key={idx}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button className={styles.primaryBtn} onClick={handleCloseModal}>
                  Close & Return to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalJSX, document.body);
};

export default SubjectiveExamModal;
