import { Router } from "express";
import { verifyAccessToken } from "../Middleware/auth.middleware.js";
import { uploadPDF } from "../Middleware/upload.middleware.js";
import { 
  getTodos, 
  createTodo, 
  toggleTodo, 
  deleteTodo,
  generateSyllabusTodos 
} from "../controller/todo.controller.js";
import { uploadDocument, getDocuments, deleteDocument } from "../controller/document.controller.js";
import { 
  generateQuizFromPDF, 
  getExamSchedule, 
  saveGamifiedQuizResult, 
  getLeaderboard 
} from "../controller/quiz.controller.js";
import { getProgressReport } from "../controller/progress.controller.js";
import { getTimetable, generateTimetable, deleteTimetable } from "../controller/Timetable.controller.js";

const assistantRouter = Router();

// Todos Routes
assistantRouter.get('/todos', verifyAccessToken, getTodos);
assistantRouter.post('/todos', verifyAccessToken, createTodo);
assistantRouter.post('/todos/generate-ai-plan', verifyAccessToken, generateSyllabusTodos);
assistantRouter.put('/todos/:id', verifyAccessToken, toggleTodo);
assistantRouter.delete('/todos/:id', verifyAccessToken, deleteTodo);

// PDFs Routes
assistantRouter.get('/documents', verifyAccessToken, getDocuments);
assistantRouter.post('/documents/upload', verifyAccessToken, uploadPDF.single('pdf'), uploadDocument);
assistantRouter.delete('/documents/:id', verifyAccessToken, deleteDocument);

// Gamified Exam & Leaderboard Routes
assistantRouter.get('/exam/schedule', verifyAccessToken, getExamSchedule);
assistantRouter.post('/quiz/generate', verifyAccessToken, generateQuizFromPDF);
assistantRouter.post('/quiz/save-gamified', verifyAccessToken, saveGamifiedQuizResult);

// Leaderboard Both Routes (Fixes 404 Endpoint Mismatch)
assistantRouter.get('/leaderboard', verifyAccessToken, getLeaderboard);
assistantRouter.get('/quiz/leaderboard', verifyAccessToken, getLeaderboard);

// Timetable Routes
assistantRouter.get('/timetable', verifyAccessToken, getTimetable);
assistantRouter.post('/timetable/generate', verifyAccessToken, generateTimetable);
assistantRouter.delete('/timetable', verifyAccessToken, deleteTimetable);

// Progress Report Route
assistantRouter.get('/progress', verifyAccessToken, getProgressReport);

export default assistantRouter;