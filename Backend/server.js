// 1. Sabse pehli import: .env baaki sab modules se pehle load hoti hai
import 'dotenv/config';

import express from 'express';
import connectToDb from './config/db.config.js';
import studentRouter from './route/student.route.js';
import authRouter from './route/auth.route.js';
import assistantRouter from './route/assistant.route.js';
import chatRouter from './route/chat.route.js';
import notebookRouter from './route/notebook.route.js';
import notesVaultRouter from './route/notesVault.route.js'; // 📝 Notes Vault Route Import
import cors from 'cors';
import cookieParser from 'cookie-parser';

const IS_VERCEL = !!process.env.VERCEL;

const app = express();
const PORT = process.env.PORT || 3000;

// Vercel proxy ke peeche hai: real IP (rate limit) aur https (cookies) ke liye zaroori
app.set('trust proxy', 1);

// 2. CORS Configuration (CLIENT_URL mein comma se multiple URLs bhi de sakte ho)
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

// Vercel ki request body limit 4.5 MB hai
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());

// Local development: purani disk wali PDFs. Vercel par disk read-only hai, wahan Blob use hota hai.
if (!IS_VERCEL) {
    app.use('/Uploads', express.static('Uploads'));
}

// 3. Database: har request se pehle (cached) connection ready karo
app.use(async (req, res, next) => {
    try {
        await connectToDb();
        next();
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        res.status(500).json({ success: false, message: 'Database connection failed' });
    }
});

app.get('/', (req, res) => res.json({ success: true, message: 'Student Assistant API is running' }));

// 4. API Endpoints Mounting
app.use('/api/students', studentRouter);
app.use('/api/auth', authRouter);
app.use('/api/assistant', assistantRouter); // Todos, PDF Vault, Quiz, Progress
app.use('/api/assistant/chat', chatRouter); // Floating AI Study Chatbot Route
app.use('/api/notebook', notebookRouter);   // AI Notebook Route
app.use('/api/notes-vault', notesVaultRouter); // 📝 Subjective Notes Vault Route

// 5. Koi bhi unhandled error JSON mein jaye (HTML nahi)
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Internal server error' });
});

// Vercel khud function chalata hai, wahan listen nahi karna
if (!IS_VERCEL) {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}

export default app;