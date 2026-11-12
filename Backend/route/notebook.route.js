import express from 'express';
import { getNotebook, saveNotebook, fixNotebookSpelling } from '../controller/notebook.controller.js';
import { verifyAccessToken } from '../Middleware/auth.middleware.js';

const notebookRouter = express.Router();

// Protected Endpoints using verifyAccessToken
notebookRouter.get('/', verifyAccessToken, getNotebook);
notebookRouter.post('/save', verifyAccessToken, saveNotebook);
notebookRouter.post('/fix-spelling', verifyAccessToken, fixNotebookSpelling);

export default notebookRouter;