import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { verifyAccessToken } from '../Middleware/auth.middleware.js';
import {
  createOrGenerateNotes,
  getUserNotesVaults,
  generateExamQuestions,
  evaluateSubjectiveExam
} from '../controller/notesVault.controller.js';

// Uploaded PDFs go to Uploads/pdf/ with a proper .pdf name
// (before: dest 'Uploads/' saved a random name with no extension in the wrong folder)
// Vercel pe sirf /tmp writable hai, local pe Uploads/pdf use hoga
const PDF_DIR = process.env.VERCEL
  ? '/tmp/uploads/pdf'
  : path.join(process.cwd(), 'Uploads', 'pdf');

try {
  fs.mkdirSync(PDF_DIR, { recursive: true });
} catch (err) {
  console.error('Upload dir create error:', err.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PDF_DIR),
  filename: (req, file, cb) => {
    const base =
      path
        .basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 40) || 'notes';
    cb(null, `${base}_${Date.now()}.pdf`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    if (!isPdf) return cb(new Error('Only PDF files are allowed.'));
    cb(null, true);
  }
});

// Turns multer errors (wrong type / too big) into JSON so the red error box can show them
const handleUpload = (req, res, next) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'PDF is too large (max 25 MB).' : err.message;
      return res.status(400).json({ success: false, message });
    }
    next();
  });
};

const notesVaultRouter = express.Router();

notesVaultRouter.post('/create', verifyAccessToken, handleUpload, createOrGenerateNotes);
notesVaultRouter.get('/user-vaults', verifyAccessToken, getUserNotesVaults);
notesVaultRouter.post('/generate-exam', verifyAccessToken, generateExamQuestions); // was missing -> 404
notesVaultRouter.post('/evaluate', verifyAccessToken, evaluateSubjectiveExam);     // JSON only now (no photo upload)

export default notesVaultRouter;