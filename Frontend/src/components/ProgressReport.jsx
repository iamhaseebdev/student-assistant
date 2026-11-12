import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import styles from './ProgressReport.module.css';

const ProgressReport = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(''); // '' | 'pdf' | 'csv'

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    try {
      const res = await apiClient.get('/assistant/progress');
      if (res.data) {
        const data = res.data.data || res.data;
        setReport(data);
      }
    } catch (err) {
      console.error("Fetch Progress Error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.reportCard} style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ color: '#00f3ff', fontSize: '18px', fontWeight: 700 }}>⚡ Analyzing Learning Performance...</div>
      </div>
    );
  }

  const isCleared = report?.isTodayCleared || false;
  const streak = report?.streakCount || 0;
  const longestStreak = report?.longestStreak || streak;
  const total = report?.totalAttempts || 0;
  const passed = report?.passedAttempts || 0;
  const avg = report?.avgPercentage || 0;
  const attemptsList = report?.attempts || [];

  // ---------- DOWNLOAD HELPERS ----------
  const fileStamp = () => new Date().toLocaleDateString('en-CA'); // 2026-11-11
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : 'N/A');
  // the default PDF font has no emoji / Urdu glyphs -> drop them so the text never garbles
  const pdfSafe = (t) => String(t ?? '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '').trim() || '-';

  const saveBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadCSV = () => {
    setDownloading('csv');
    try {
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = [
        ['Student Progress Report', fileStamp()],
        ['Current streak (days)', streak],
        ['Longest streak (days)', longestStreak],
        ['Total tests attempted', total],
        ['Tests cleared', passed],
        ['Average accuracy (%)', avg],
        [],
        ['Document / Topic', 'Exam Type', 'Score', 'Accuracy (%)', 'Status', 'Date'],
        ...attemptsList.map((a) => [
          a.docTitle,
          a.type || 'MCQ Quiz',
          a.score,
          a.percentage,
          a.passed ? 'PASSED' : 'FAILED',
          fmtDate(a.createdAt)
        ])
      ];
      const csv = '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n'); // BOM so Excel reads UTF-8
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `progress-report-${fileStamp()}.csv`);
    } finally {
      setDownloading('');
    }
  };

  const downloadPDF = async () => {
    setDownloading('pdf');
    try {
      // loaded only when the button is clicked, so it does not slow the page down
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Student Progress Report', 40, 50);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, 40, 68);

      autoTable(doc, {
        startY: 85,
        head: [['Current Streak', 'Longest Streak', 'Tests Attempted', 'Tests Cleared', 'Avg Accuracy']],
        body: [[`${streak} days`, `${longestStreak} days`, total, passed, `${avg}%`]],
        theme: 'grid',
        styles: { fontSize: 10, halign: 'center' },
        headStyles: { fillColor: [15, 23, 42] }
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 24,
        head: [['Document / Topic', 'Exam Type', 'Score', 'Accuracy', 'Status', 'Date']],
        body: attemptsList.map((a) => [
          pdfSafe(a.docTitle),
          pdfSafe(a.type || 'MCQ Quiz'),
          pdfSafe(a.score),
          `${a.percentage}%`,
          a.passed ? 'PASSED' : 'FAILED',
          fmtDate(a.createdAt)
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [15, 23, 42] },
        columnStyles: { 0: { cellWidth: 170 } },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 4) {
            data.cell.styles.textColor = data.cell.raw === 'PASSED' ? [0, 150, 60] : [200, 30, 70];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      });

      doc.save(`progress-report-${fileStamp()}.pdf`);
    } catch (err) {
      console.error('PDF download failed:', err);
      alert('Could not create the PDF. Make sure "jspdf" and "jspdf-autotable" are installed (npm i jspdf jspdf-autotable).');
    } finally {
      setDownloading('');
    }
  };

  return (
    <div className={styles.reportCard}>
      {/* Header */}
      <div className={styles.headerSection}>
        <div>
          <h3 className={styles.mainTitle}>📈 STUDENT PROGRESS & COMBINED ANALYTICS</h3>
          <p className={styles.subtitle}>
            Real-time analytics across MCQ Quizzes, Board PDF Exams, and daily performance metrics.
          </p>
        </div>
        <div className={styles.downloadGroup}>
          <button type="button" className={styles.downloadBtn} onClick={downloadPDF} disabled={!!downloading}>
            {downloading === 'pdf' ? '⏳ Preparing PDF...' : '⬇️ Download PDF'}
          </button>
          <button type="button" className={styles.downloadBtn} onClick={downloadCSV} disabled={!!downloading}>
            {downloading === 'csv' ? '⏳ Preparing...' : '⬇️ Download CSV'}
          </button>
        </div>
      </div>

      {/* Daily Status Banner */}
      <div className={`${styles.statusBanner} ${isCleared ? styles.statusCleared : styles.statusPending}`}>
        <span>{isCleared ? '✅ TODAY\'S EXAM CLEARED' : '🔒 TODAY\'S EXAM PENDING'}</span>
        <span className={styles.streakChip}>🔥 {streak} DAY STREAK</span>
      </div>

      {/* Stats Cards Grid */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard} style={{ '--card-accent': '#00f3ff' }}>
          <h4 className={styles.statLabel}>Total Tests Attempted</h4>
          <p className={styles.statValue} style={{ color: '#00f3ff' }}>{total}</p>
        </div>

        <div className={styles.statCard} style={{ '--card-accent': '#00ff66' }}>
          <h4 className={styles.statLabel}>Tests Cleared</h4>
          <p className={styles.statValue} style={{ color: '#00ff66' }}>{passed}</p>
        </div>

        <div className={styles.statCard} style={{ '--card-accent': '#38bdf8' }}>
          <h4 className={styles.statLabel}>Average Accuracy</h4>
          <p className={styles.statValue} style={{ color: '#38bdf8' }}>{avg}%</p>
        </div>

        <div className={styles.statCard} style={{ '--card-accent': '#ff9900' }}>
          <h4 className={styles.statLabel}>Longest Streak</h4>
          <p className={styles.statValue} style={{ color: '#ff9900' }}>{longestStreak} 🔥</p>
        </div>
      </div>

      {/* Recent History Table */}
      <h4 className={styles.tableHeader}>📜 Recent Exam Attempts (MCQs & Subjective PDF Notes)</h4>
      
      <div className={styles.tableContainer}>
        {attemptsList.length > 0 ? (
          <table className={styles.customTable}>
            <thead>
              <tr>
                <th>Document / Topic</th>
                <th>Exam Type</th>
                <th>Score</th>
                <th>Accuracy</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {attemptsList.map((attempt, index) => {
                const isSub = attempt.type === 'Subjective PDF';
                return (
                  <tr key={index} className={styles.tableRow}>
                    <td style={{ fontWeight: 600, color: '#f8fafc' }}>{attempt.docTitle}</td>
                    <td>
                      <span className={isSub ? styles.typeBadgeSubj : styles.typeBadgeMcq}>
                        {attempt.type || 'MCQ Quiz'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '14px' }}>{attempt.score}</td>
                    <td style={{ fontWeight: 800, color: '#00f3ff' }}>{attempt.percentage}%</td>
                    <td>
                      <span className={attempt.passed ? styles.badgePass : styles.badgeFail}>
                        {attempt.passed ? 'PASSED' : 'FAILED'}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: '#64748b' }}>
                      {attempt.createdAt ? new Date(attempt.createdAt).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '30px' }}>
            No test attempts recorded yet.
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgressReport;