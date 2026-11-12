// AI Move Logic for Tic-Tac-Toe based on Difficulty
const getTicTacToeAIMove = (board, difficulty) => {
  const emptyIndices = board
    .map((val, idx) => (val === null ? idx : null))
    .filter((val) => val !== null);

  if (emptyIndices.length === 0) return null;

  // Easy: Pure Random Move
  if (difficulty === 'easy') {
    const randomIndex = Math.floor(Math.random() * emptyIndices.length);
    return emptyIndices[randomIndex];
  }

  // Medium / Hard: Smart Winning / Blocking Move
  const winningLines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  // 1. Check if AI can win in one move ('O')
  for (let line of winningLines) {
    const [a, b, c] = line;
    if (board[a] === 'O' && board[b] === 'O' && board[c] === null) return c;
    if (board[a] === 'O' && board[c] === 'O' && board[b] === null) return b;
    if (board[b] === 'O' && board[c] === 'O' && board[a] === null) return a;
  }

  // 2. Block Player ('X') from winning
  for (let line of winningLines) {
    const [a, b, c] = line;
    if (board[a] === 'X' && board[b] === 'X' && board[c] === null) return c;
    if (board[a] === 'X' && board[c] === 'X' && board[b] === null) return b;
    if (board[b] === 'X' && board[c] === 'X' && board[a] === null) return a;
  }

  // Fallback to center or random
  if (board[4] === null && difficulty === 'hard') return 4;
  return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
};

// Controllers Export
export const playTicTacToeAI = async (req, res) => {
  try {
    const { board, difficulty = 'medium' } = req.body;
    const aiMoveIndex = getTicTacToeAIMove(board, difficulty);

    return res.status(200).json({
      success: true,
      aiMoveIndex
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Game AI error' });
  }
};

export const getMathQuestions = async (req, res) => {
  try {
    const { difficulty = 'easy' } = req.query;
    let questions = [];

    const count = difficulty === 'hard' ? 10 : 5;
    const maxNum = difficulty === 'hard' ? 50 : (difficulty === 'medium' ? 20 : 10);

    for (let i = 0; i < count; i++) {
      const n1 = Math.floor(Math.random() * maxNum) + 1;
      const n2 = Math.floor(Math.random() * maxNum) + 1;
      const ops = ['+', '-', '*'];
      const op = ops[Math.floor(Math.random() * (difficulty === 'easy' ? 2 : 3))];

      let ans = 0;
      if (op === '+') ans = n1 + n2;
      if (op === '-') ans = n1 - n2;
      if (op === '*') ans = n1 * n2;

      questions.push({ id: i + 1, question: `${n1} ${op} ${n2}`, answer: ans });
    }

    return res.status(200).json({ success: true, questions });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate math questions' });
  }
};