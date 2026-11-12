import express from 'express';
import { playTicTacToeAI, getMathQuestions } from '../controller/game.controller.js';
import { verifyAccessToken } from '../Middleware/auth.middleware.js';

const gameRouter = express.Router();

gameRouter.post('/tictactoe/ai-move', verifyAccessToken, playTicTacToeAI);
gameRouter.get('/math/questions', verifyAccessToken, getMathQuestions);

export default gameRouter;