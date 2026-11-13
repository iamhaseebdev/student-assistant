import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import apiClient from '../api/apiClient';
import AILoader, { ButtonSpinner } from './Ailoader';
import styles from './Notebook.module.css';

const Notebook = () => {
  const [pages, setPages] = useState(['']);
  const [drawings, setDrawings] = useState({});
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedFont, setSelectedFont] = useState("'Caveat', cursive");
  const [fontSize, setFontSize] = useState(22);
  const [inkColor, setInkColor] = useState('#1a237e');
  const [isAiFixing, setIsAiFixing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingNotebook, setIsLoadingNotebook] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [flipDirection, setFlipDirection] = useState('');

  // Drawing Canvas States
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [penColor, setPenColor] = useState('#ef4444');
  const [penLineWidth, setPenLineWidth] = useState(3);
  const [isErasing, setIsErasing] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const notebookPageRef = useRef(null);
  const canvasRef = useRef(null);
  const contextRef = useRef(null);

  useEffect(() => {
    fetchNotebookFromDB();
  }, []);

  const fetchNotebookFromDB = async () => {
    try {
      const res = await apiClient.get('/notebook');
      if (res.data?.success && res.data?.pages?.length > 0) {
        const dbPages = res.data.pages.map((p) => p.content || '');
        const dbDrawings = {};
        res.data.pages.forEach((p, idx) => {
          if (p.drawingData) dbDrawings[idx] = p.drawingData;
        });

        setPages(dbPages);
        setDrawings(dbDrawings);
      }
    } catch (err) {
      console.error('Fetch DB Notebook Error:', err);
    } finally {
      setIsLoadingNotebook(false);
    }
  };

  const saveNotebookToDB = async (updatedPages = pages, updatedDrawings = drawings) => {
    setIsSaving(true);
    try {
      const payloadPages = updatedPages.map((content, idx) => ({
        pageNumber: idx + 1,
        content: content,
        drawingData: updatedDrawings[idx] || ''
      }));

      await apiClient.post('/notebook/save', { pages: payloadPages });
      setAiMessage('💾 Notebook Saved!');
    } catch (err) {
      console.error('Save DB Error:', err);
      setAiMessage('⚠️ Failed to save notebook');
    } finally {
      setIsSaving(false);
      setTimeout(() => setAiMessage(''), 3000);
    }
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = isErasing ? '#fffef0' : penColor;
    context.lineWidth = isErasing ? penLineWidth * 3 : penLineWidth;
    contextRef.current = context;

    if (drawings[currentPage]) {
      const img = new Image();
      img.src = drawings[currentPage];
      img.onload = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0);
      };
    } else {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [currentPage, isDrawMode, penColor, penLineWidth, isErasing, drawings]);

  const saveCanvasState = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL();
    const updatedDrawings = { ...drawings, [currentPage]: dataUrl };
    setDrawings(updatedDrawings);
    saveNotebookToDB(pages, updatedDrawings);
  };

  const startDrawing = ({ nativeEvent }) => {
    if (!isDrawMode) return;
    const { offsetX, offsetY } = nativeEvent;
    contextRef.current.beginPath();
    contextRef.current.moveTo(offsetX, offsetY);
    setIsDrawing(true);
  };

  const draw = ({ nativeEvent }) => {
    if (!isDrawing || !isDrawMode) return;
    const { offsetX, offsetY } = nativeEvent;
    contextRef.current.lineTo(offsetX, offsetY);
    contextRef.current.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing || !isDrawMode) return;
    contextRef.current.closePath();
    setIsDrawing(false);
    saveCanvasState();
  };

  const clearCanvas = () => {
    if (!canvasRef.current || !contextRef.current) return;
    const canvas = canvasRef.current;
    contextRef.current.clearRect(0, 0, canvas.width, canvas.height);
    const updatedDrawings = { ...drawings };
    delete updatedDrawings[currentPage];
    setDrawings(updatedDrawings);
    saveNotebookToDB(pages, updatedDrawings);
  };

  const handleContentChange = (e) => {
    const updatedPages = [...pages];
    updatedPages[currentPage] = e.target.value;
    setPages(updatedPages);
  };

  const handleBlurSave = () => {
    saveNotebookToDB(pages, drawings);
  };

  const handleNextPage = () => {
    if (currentPage < pages.length - 1 && !flipDirection) {
      setFlipDirection('next');
      setTimeout(() => {
        setCurrentPage((p) => p + 1);
        setFlipDirection('');
      }, 350);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0 && !flipDirection) {
      setFlipDirection('prev');
      setTimeout(() => {
        setCurrentPage((p) => p - 1);
        setFlipDirection('');
      }, 350);
    }
  };

  const jumpToPage = (index) => {
    if (index === currentPage || flipDirection) return;
    setFlipDirection(index > currentPage ? 'next' : 'prev');
    setTimeout(() => {
      setCurrentPage(index);
      setFlipDirection('');
    }, 350);
  };

  const addNewPage = () => {
    if (flipDirection) return;
    setFlipDirection('next');
    setTimeout(() => {
      const updatedPages = [...pages, ''];
      setPages(updatedPages);
      setCurrentPage(updatedPages.length - 1);
      saveNotebookToDB(updatedPages, drawings);
      setFlipDirection('');
    }, 350);
  };

  const deletePage = () => {
    if (pages.length === 1) {
      const updatedPages = [''];
      const updatedDrawings = {};
      setPages(updatedPages);
      setDrawings(updatedDrawings);
      saveNotebookToDB(updatedPages, updatedDrawings);
      return;
    }

    const updatedPages = pages.filter((_, idx) => idx !== currentPage);
    const nextIdx = currentPage > 0 ? currentPage - 1 : 0;
    
    const updatedDrawings = {};
    updatedPages.forEach((_, newIdx) => {
      const oldIdx = newIdx >= currentPage ? newIdx + 1 : newIdx;
      if (drawings[oldIdx]) updatedDrawings[newIdx] = drawings[oldIdx];
    });

    setPages(updatedPages);
    setDrawings(updatedDrawings);
    setCurrentPage(nextIdx);
    saveNotebookToDB(updatedPages, updatedDrawings);
  };

  const handleDownloadPage = async () => {
    if (!notebookPageRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(notebookPageRef.current, { scale: 2, backgroundColor: '#fffef0' });
      const link = document.createElement('a');
      link.download = `Notebook_Page_${currentPage + 1}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Download PNG error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadFullPDF = async () => {
    if (!notebookPageRef.current) return;
    setIsExporting(true);
    try {
      const pdf = new jsPDF('portrait', 'px', 'a4');
      const canvas = await html2canvas(notebookPageRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Student_Assistant_Notebook.pdf`);
    } catch (err) {
      console.error('Download PDF error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFixSpellingWithAI = async () => {
    const currentText = pages[currentPage];
    if (!currentText || !currentText.trim()) return;

    setIsAiFixing(true);
    setAiMessage('');

    try {
      const response = await apiClient.post('/notebook/fix-spelling', { text: currentText });
      if (response.data?.correctedText) {
        const updatedPages = [...pages];
        updatedPages[currentPage] = response.data.correctedText;
        setPages(updatedPages);
        saveNotebookToDB(updatedPages, drawings);
        setAiMessage('✨ AI Spelling & Grammar corrected!');
      }
    } catch (error) {
      console.error('AI Fix Error:', error);
      setAiMessage('⚠️ AI Fix failed.');
    } finally {
      setIsAiFixing(false);
      setTimeout(() => setAiMessage(''), 4000);
    }
  };

  return (
    <div className={styles.notebookContainer}>
      {isLoadingNotebook && (
        <AILoader fullScreen variant="orbit" messages={['Opening your notebook', 'Loading your pages']} />
      )}
      {isAiFixing && (
        <AILoader
          fullScreen
          variant="neural"
          size="lg"
          messages={['AI is reading your page', 'Fixing spelling and grammar', 'Polishing your notes']}
        />
      )}
      {isExporting && <AILoader fullScreen variant="bars" text="Preparing your download" />}

      {/* Top Controls Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolGroup}>
          <label>Font Style:</label>
          <select 
            value={selectedFont} 
            onChange={(e) => setSelectedFont(e.target.value)}
            className={styles.selectInput}
          >
            <option value="'Caveat', cursive">Casual Cursive (Caveat)</option>
            <option value="'Dancing Script', cursive">Elegant Script (Dancing Script)</option>
            <option value="'Kalam', cursive">Neat Handwriting (Kalam)</option>
            <option value="'Pacifico', cursive">Retro Calligraphy (Pacifico)</option>
          </select>
        </div>

        <div className={styles.toolGroup}>
          <label>Ink:</label>
          <input 
            type="color" 
            value={inkColor} 
            onChange={(e) => setInkColor(e.target.value)}
            className={styles.colorPicker}
          />
        </div>

        {/* Drawing Controls */}
        <div className={styles.drawToolSection}>
          <button
            type="button"
            className={`${styles.drawToggleBtn} ${isDrawMode ? styles.drawActive : ''}`}
            onClick={() => {
              setIsDrawMode(!isDrawMode);
              setIsErasing(false);
            }}
          >
            {isDrawMode ? '✏️ Drawing ON' : '🎨 Pen / Sketch'}
          </button>

          {isDrawMode && (
            <div className={styles.drawControls}>
              <input
                type="color"
                value={penColor}
                onChange={(e) => {
                  setPenColor(e.target.value);
                  setIsErasing(false);
                }}
                className={styles.colorPicker}
              />
              <select
                value={penLineWidth}
                onChange={(e) => setPenLineWidth(Number(e.target.value))}
                className={styles.selectInput}
              >
                <option value="2">Fine (2px)</option>
                <option value="4">Medium (4px)</option>
                <option value="8">Thick (8px)</option>
              </select>
              <button
                type="button"
                className={`${styles.eraserBtn} ${isErasing ? styles.eraserActive : ''}`}
                onClick={() => setIsErasing(!isErasing)}
              >
                🧹 Eraser
              </button>
              <button type="button" className={styles.clearCanvasBtn} onClick={clearCanvas}>
                ❌ Clear
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className={styles.toolActions}>
          <button 
            type="button" 
            onClick={() => saveNotebookToDB(pages, drawings)} 
            className={styles.saveDbBtn}
            disabled={isSaving}
          >
            {isSaving ? <><ButtonSpinner /> Saving...</> : '💾 Save Notes'}
          </button>

          <button 
            type="button" 
            onClick={handleFixSpellingWithAI} 
            className={styles.aiFixBtn}
            disabled={isAiFixing || !pages[currentPage]?.trim()}
          >
            {isAiFixing ? <><ButtonSpinner /> Correcting...</> : '✨ AI Fix'}
          </button>

          <button type="button" onClick={handleDownloadPage} className={styles.downloadBtn}>
            🖼️ PNG
          </button>

          <button type="button" onClick={handleDownloadFullPDF} className={styles.pdfBtn}>
            📄 PDF
          </button>
        </div>
      </div>

      {aiMessage && <div className={styles.aiNotification}>{aiMessage}</div>}

      {/* DOUBLE-PAGE JOURNAL DISPLAY */}
      <div className={styles.stage}>
        <div className={styles.doublePageBook}>

          {/* INSIDE LEFT PAGE (TABLE OF CONTENTS) */}
          <div className={styles.insideLeftPage}>
            <div className={styles.indexHeader}>
              <div className={styles.indexTitleBox}>
                <span className={styles.indexIcon}>📌</span>
                <div>
                  <h3>TABLE OF CONTENTS</h3>
                  <p>STUDENT ASSISTANT NOTEBOOK</p>
                </div>
              </div>
            </div>

            <div className={styles.indexList}>
              {pages.map((p, idx) => {
                const previewText = p.trim().slice(0, 26) || 'Empty Note Page...';
                const isCurrent = idx === currentPage;
                const hasDrawing = !!drawings[idx];

                return (
                  <div 
                    key={idx} 
                    className={`${styles.indexCard} ${isCurrent ? styles.activeCard : ''}`}
                    onClick={() => jumpToPage(idx)}
                  >
                    <div className={styles.cardHeaderInfo}>
                      <span className={styles.pageRibbon}>PAGE {idx + 1}</span>
                      {hasDrawing && <span className={styles.drawBadge}>🎨 Sketch</span>}
                    </div>
                    <p className={styles.indexPreviewText}>{previewText}</p>
                  </div>
                );
              })}
            </div>

            <div className={styles.notebookFooterDetails}>
              <span>Total Pages: <b>{pages.length}</b></span>
              <span>STUDENT ASSISTANT</span>
            </div>
          </div>

          {/* SPIRAL RING SPINE */}
          <div className={styles.ringCenterSpine}>
            {[...Array(14)].map((_, i) => (
              <div key={i} className={styles.metalRing}></div>
            ))}
          </div>

          {/* INSIDE RIGHT PAGE */}
          <div 
            className={`
              ${styles.insideRightPage} 
              ${flipDirection === 'next' ? styles.flipNext : ''} 
              ${flipDirection === 'prev' ? styles.flipPrev : ''}
            `}
            ref={notebookPageRef}
          >
            <div className={styles.redMarginLine}></div>

            <canvas
              ref={canvasRef}
              className={`${styles.drawingCanvas} ${isDrawMode ? styles.canvasActive : ''}`}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />

            <textarea
              className={styles.handwrittenArea}
              style={{
                fontFamily: selectedFont,
                fontSize: `${fontSize}px`,
                color: inkColor,
                pointerEvents: isDrawMode ? 'none' : 'auto'
              }}
              value={pages[currentPage] || ''}
              onChange={handleContentChange}
              onBlur={handleBlurSave}
              placeholder={isDrawMode ? "Drawing Mode Active! Freehand sketch anywhere..." : "Write your study notes here..."}
            />
          </div>

        </div>
      </div>

      {/* FOOTER NAVIGATION CONTROLS */}
      <div className={styles.paginationBar}>
        <button 
          type="button"
          disabled={currentPage === 0 || !!flipDirection} 
          onClick={handlePrevPage}
          className={styles.navBtn}
        >
          ◀ Prev Page
        </button>

        <span className={styles.pageIndicator}>
          Page {currentPage + 1} of {pages.length}
        </span>

        <button 
          type="button"
          disabled={currentPage === pages.length - 1 || !!flipDirection} 
          onClick={handleNextPage}
          className={styles.navBtn}
        >
          Next Page ▶
        </button>

        <button type="button" onClick={addNewPage} className={styles.addBtn}>
          ➕ Add Page
        </button>
        <button type="button" onClick={deletePage} className={styles.deleteBtn}>
          🗑️ Delete Page
        </button>
      </div>
    </div>
  );
};

export default Notebook;