// Backend/routes/chat.routes.js
import express from 'express';
import { handleStudyChat } from '../controller/chat.controller.js';

const router = express.Router();

router.post('/study-bot', handleStudyChat);

// Separate Export at Bottom
export default router;