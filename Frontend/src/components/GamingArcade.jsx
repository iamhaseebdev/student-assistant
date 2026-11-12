import React, { useState, useEffect } from 'react';
import styles from './GamingArcade.module.css';

const GamingArcade = () => {
  const [activeGame, setActiveGame] = useState('tictactoe');
  const [difficulty, setDifficulty] = useState('medium');

  // 1. TIC TAC TOE STATES
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [tttWinner, setTttWinner] = useState(null);

  // 2. NUMBER GUESS STATES
  const [targetNumber, setTargetNumber] = useState(50);
  const [userGuess, setUserGuess] = useState('');
  const [guessFeedback, setGuessFeedback] = useState('Guess a number between 1 and 100!');
  const [attempts, setAttempts] = useState(0);

  // 3. SPEED MATH STATES (FIXED CRASH)
  const [currentMathQ, setCurrentMathQ] = useState(null);
  const [mathScore, setMathScore] = useState(0);
  const [mathTimer, setMathTimer] = useState(30);
  const [isMathActive, setIsMathActive] = useState(false);
  const [lastFeedback, setLastFeedback] = useState(null);
  const [totalAttempted, setTotalAttempted] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [targetGoal, setTargetGoal] = useState(6);

  // --- TIC TAC TOE LOGIC ---
  const checkWinner = (squares) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (let line of lines) {
      const [a, b, c] = line;
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return squares[a];
      }
    }
    return squares.includes(null) ? null : 'Tie';
  };

  const getSmartAIMove = (currentBoard, diff) => {
    const emptyIndices = currentBoard
      .map((val, idx) => (val === null ? idx : null))
      .filter((val) => val !== null);

    if (emptyIndices.length === 0) return null;

    if (diff === 'easy') {
      return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    }

    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];

    for (let line of lines) {
      const [a, b, c] = line;
      if (currentBoard[a] === 'O' && currentBoard[b] === 'O' && currentBoard[c] === null) return c;
      if (currentBoard[a] === 'O' && currentBoard[c] === 'O' && currentBoard[b] === null) return b;
      if (currentBoard[b] === 'O' && currentBoard[c] === 'O' && currentBoard[a] === null) return a;
    }

    for (let line of lines) {
      const [a, b, c] = line;
      if (currentBoard[a] === 'X' && currentBoard[b] === 'X' && currentBoard[c] === null) return c;
      if (currentBoard[a] === 'X' && currentBoard[c] === 'X' && currentBoard[b] === null) return b;
      if (currentBoard[b] === 'X' && currentBoard[c] === 'X' && currentBoard[a] === null) return a;
    }

    if (diff === 'hard' && currentBoard[4] === null) return 4;
    return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
  };

  const handleTTTClick = (index) => {
    if (board[index] || tttWinner || !isPlayerTurn) return;

    const newBoard = [...board];
    newBoard[index] = 'X';
    setBoard(newBoard);

    const win = checkWinner(newBoard);
    if (win) {
      setTttWinner(win);
      return;
    }

    setIsPlayerTurn(false);

    setTimeout(() => {
      const aiMove = getSmartAIMove(newBoard, difficulty);
      if (aiMove !== null) {
        newBoard[aiMove] = 'O';
        setBoard(newBoard);
        const aiWin = checkWinner(newBoard);
        if (aiWin) setTttWinner(aiWin);
      }
      setIsPlayerTurn(true);
    }, 280);
  };

  const resetTTT = () => {
    setBoard(Array(9).fill(null));
    setTttWinner(null);
    setIsPlayerTurn(true);
  };

  // --- NUMBER GUESS LOGIC ---
  const startNumberGame = () => {
    const max = difficulty === 'hard' ? 200 : (difficulty === 'medium' ? 100 : 30);
    setTargetNumber(Math.floor(Math.random() * max) + 1);
    setAttempts(0);
    setGuessFeedback(`AI has picked a secret number between 1 and ${max}. Take your guess!`);
    setUserGuess('');
  };

  const handleGuessSubmit = (e) => {
    e.preventDefault();
    const val = Number(userGuess);
    if (!val) return;

    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);

    if (val === targetNumber) {
      setGuessFeedback(`🎉 Bullseye! You guessed it right in ${nextAttempts} attempts!`);
    } else if (val < targetNumber) {
      setGuessFeedback(`🤖 AI Hint: Go HIGHER! (Attempt #${nextAttempts})`);
    } else {
      setGuessFeedback(`🤖 AI Hint: Go LOWER! (Attempt #${nextAttempts})`);
    }
  };

  // --- FIXED SAFE MATH ENGINE (NO INFINITE LOOP) ---
  const generateMathQ = () => {
    const maxNum = difficulty === 'hard' ? 30 : (difficulty === 'medium' ? 20 : 10);
    const n1 = Math.floor(Math.random() * maxNum) + 1;
    const n2 = Math.floor(Math.random() * maxNum) + 1;
    const ops = ['+', '-', '*'];
    const op = ops[Math.floor(Math.random() * (difficulty === 'easy' ? 2 : 3))];

    let correctAns = 0;
    if (op === '+') correctAns = n1 + n2;
    if (op === '-') correctAns = n1 - n2;
    if (op === '*') correctAns = n1 * n2;

    // SAFE OPTION GENERATION (GUARANTEED NO FREEZE)
    const offsets = [-3, -1, 2, 4, 1, -2, 3];
    const optionsSet = new Set([correctAns]);

    for (let offset of offsets) {
      if (optionsSet.size >= 4) break;
      const fakeOpt = correctAns + offset;
      if (fakeOpt !== correctAns) {
        optionsSet.add(fakeOpt);
      }
    }

    const shuffledOptions = Array.from(optionsSet).sort(() => Math.random() - 0.5);

    setCurrentMathQ({
      question: `${n1} ${op} ${n2}`,
      answer: correctAns,
      options: shuffledOptions
    });
  };

  const startMathGame = () => {
    const goal = difficulty === 'hard' ? 10 : (difficulty === 'medium' ? 8 : 6);
    setTargetGoal(goal);
    setMathScore(0);
    setTotalAttempted(0);
    setCorrectCount(0);
    setLastFeedback(null);
    setMathTimer(30);
    setIsMathActive(true);
    generateMathQ();
  };

  useEffect(() => {
    let timer;
    if (isMathActive && mathTimer > 0) {
      timer = setInterval(() => setMathTimer((t) => t - 1), 1000);
    } else if (mathTimer === 0) {
      setIsMathActive(false);
    }
    return () => clearInterval(timer);
  }, [isMathActive, mathTimer]);

  const handleMathOptionClick = (selectedOpt) => {
    if (!currentMathQ || !isMathActive) return;

    const isRight = selectedOpt === currentMathQ.answer;
    setTotalAttempted((prev) => prev + 1);

    if (isRight) {
      setMathScore((s) => s + 10);
      setCorrectCount((c) => c + 1);
      setLastFeedback({ type: 'correct', text: `🟢 Correct! (+10 XP)` });
    } else {
      setLastFeedback({
        type: 'wrong',
        text: `🔴 Incorrect! (${currentMathQ.question} = ${currentMathQ.answer}, Your Pick: ${selectedOpt})`
      });
    }

    generateMathQ();
  };

  return (
    <div className={styles.arcadeContainer}>
      {/* Top Header */}
      <div className={styles.arcadeHeader}>
        <div>
          <h2 className={styles.title}>🎮 STUDENT STUDY ARCADE</h2>
          <p className={styles.subtitle}>Play brain games against AI Bot to practice focus & speed</p>
        </div>

        <div className={styles.diffSelector}>
          <label>AI Difficulty:</label>
          <select value={difficulty} onChange={(e) => { setDifficulty(e.target.value); resetTTT(); }}>
            <option value="easy">🟢 Easy (Target: 6 Qs)</option>
            <option value="medium">🟡 Medium (Target: 8 Qs)</option>
            <option value="hard">🔴 Hard (Target: 10 Qs)</option>
          </select>
        </div>
      </div>

      {/* Game Tabs */}
      <div className={styles.gameTabs}>
        <button
          className={activeGame === 'tictactoe' ? styles.activeTab : ''}
          onClick={() => { setActiveGame('tictactoe'); resetTTT(); }}
        >
          ❌⭕ Tic-Tac-Toe AI
        </button>
        <button
          className={activeGame === 'number' ? styles.activeTab : ''}
          onClick={() => { setActiveGame('number'); startNumberGame(); }}
        >
          🔢 AI Number Guess
        </button>
        <button
          className={activeGame === 'math' ? styles.activeTab : ''}
          onClick={() => { setActiveGame('math'); startMathGame(); }}
        >
          ⚡ Speed Math Attack
        </button>
      </div>

      {/* GAME 1: TIC TAC TOE AI */}
      {activeGame === 'tictactoe' && (
        <div className={styles.gameCard}>
          <h3 className={styles.gameHeading}>Tic-Tac-Toe vs AI Bot ({difficulty.toUpperCase()})</h3>
          <p className={styles.turnIndicator}>
            {tttWinner ? 'Game Over' : isPlayerTurn ? 'Your Turn (X)' : '🤖 AI Thinking (O)...'}
          </p>

          <div className={styles.tttGrid}>
            {board.map((cell, idx) => (
              <button
                key={idx}
                className={`${styles.tttCell} ${cell === 'X' ? styles.cellX : cell === 'O' ? styles.cellO : ''}`}
                onClick={() => handleTTTClick(idx)}
              >
                {cell}
              </button>
            ))}
          </div>

          {tttWinner && (
            <div className={styles.winnerBox}>
              <h4>{tttWinner === 'Tie' ? "🤝 Match Tied!" : `🎉 ${tttWinner === 'X' ? 'You Won!' : 'AI Bot Won!'}`}</h4>
              <button onClick={resetTTT} className={styles.primaryBtn}>Play Again</button>
            </div>
          )}
        </div>
      )}

      {/* GAME 2: AI NUMBER GUESSING */}
      {activeGame === 'number' && (
        <div className={styles.gameCard}>
          <h3 className={styles.gameHeading}>AI Number Guessing Arena</h3>
          <p className={styles.feedbackText}>{guessFeedback}</p>

          <form onSubmit={handleGuessSubmit} className={styles.guessForm}>
            <input
              type="number"
              value={userGuess}
              onChange={(e) => setUserGuess(e.target.value)}
              placeholder="Enter your guess..."
              className={styles.numberInput}
              required
            />
            <button type="submit" className={styles.primaryBtn}>Submit Guess</button>
          </form>

          <button onClick={startNumberGame} className={styles.secondaryBtn}>
            Reset Number
          </button>
        </div>
      )}

      {/* GAME 3: SPEED MATH ATTACK */}
      {activeGame === 'math' && (
        <div className={styles.gameCard}>
          <h3 className={styles.gameHeading}>Speed Math Challenge ⏱️</h3>
          <div className={styles.challengeBadge}>
            🎯 Target Challenge: Solve {targetGoal}+ Correct Questions in 30 Seconds!
          </div>

          {isMathActive ? (
            <>
              <div className={styles.mathStats}>
                <span className={styles.timerText}>Time Left: <b>{mathTimer}s</b></span>
                <span className={styles.scoreText}>Score: <b>{mathScore} XP</b></span>
                <span style={{ color: '#00f3ff', padding: '6px 14px', background: 'rgba(0,243,255,0.1)', borderRadius: '20px', border: '1px solid rgba(0,243,255,0.3)' }}>
                  Solved: <b>{correctCount} / {targetGoal}</b>
                </span>
              </div>

              {lastFeedback && (
                <div className={lastFeedback.type === 'correct' ? styles.correctAlert : styles.wrongAlert}>
                  {lastFeedback.text}
                </div>
              )}

              {currentMathQ && (
                <div className={styles.mathForm}>
                  <h2 className={styles.mathQ}>{currentMathQ.question} = ?</h2>

                  <div className={styles.mathOptionsGrid}>
                    {currentMathQ.options.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        className={styles.mathOptBtn}
                        onClick={() => handleMathOptionClick(opt)}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className={styles.winnerBox}>
              <h4>
                {correctCount >= targetGoal 
                  ? `🏆 CHALLENGE PASSED! (${correctCount}/${targetGoal} Solved)` 
                  : `❌ CHALLENGE FAILED! (${correctCount}/${targetGoal} Solved)`}
              </h4>

              {totalAttempted > 0 && (
                <div className={styles.reportGrid}>
                  <div className={styles.reportCard}>
                    <span>Total Attempted</span>
                    <b>{totalAttempted}</b>
                  </div>
                  <div className={styles.reportCard}>
                    <span>Accuracy</span>
                    <b>{Math.round((correctCount / totalAttempted) * 100)}%</b>
                  </div>
                  <div className={styles.reportCard}>
                    <span>XP Earned</span>
                    <b style={{ color: '#00ff66' }}>+{mathScore} XP</b>
                  </div>
                </div>
              )}

              <button onClick={startMathGame} className={styles.primaryBtn}>
                🚀 Start 30s Challenge Now
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GamingArcade;