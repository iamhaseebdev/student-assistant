import { put, del } from "@vercel/blob";
import Document from "../model/document.model.js";

// Upload PDF (Vercel pe disk persistent nahi -> file Vercel Blob me jati hai)
// NOTE: upload middleware me multer.memoryStorage() hona chahiye (req.file.buffer)
export async function uploadDocument(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please upload a PDF file' });
        }
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
            return res.status(500).json({ success: false, message: 'File storage is not configured' });
        }

        const safeName = (req.file.originalname || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
        const blob = await put(`pdf/${safeName}`, req.file.buffer, {
            access: 'public',
            contentType: 'application/pdf',
            addRandomSuffix: true
        });
        const fileSize = (req.file.size / (1024 * 1024)).toFixed(2) + ' MB';

        const doc = await Document.create({
            userId: req.user.id,
            title: req.body.title || req.file.originalname,
            fileUrl: blob.url,
            fileSize
        });

        return res.status(201).json({ success: true, data: doc });
    } catch (error) {
        console.error("PDF Upload Error:", error);
        return res.status(500).json({ success: false, message: error.message || 'Server upload error' });
    }
}

// Get Logged-in Student PDFs
export async function getDocuments(req, res) {
    try {
        const docs = await Document.find({ userId: req.user.id }).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: docs });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

// Delete PDF
export async function deleteDocument(req, res) {
    try {
        const deleted = await Document.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        if (!deleted) return res.status(404).json({ success: false, message: 'Document not found' });

        // Blob se bhi file hata do (purane local URLs ko skip karta hai)
        if (/^https?:\/\/.+blob\.vercel-storage\.com/i.test(deleted.fileUrl || '')) {
            try { await del(deleted.fileUrl); } catch (e) { console.error('Blob delete failed:', e.message); }
        }

        return res.status(200).json({ success: true, message: 'PDF deleted successfully' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}