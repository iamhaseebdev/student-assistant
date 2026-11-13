import multer from "multer";

// Vercel pe disk read-only hai, is liye file RAM (memory) me rakhte hain.
// Is se req.file.buffer hamesha milega, jo seedha Vercel Blob put() me jata hai.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
        cb(null, true);
    } else {
        cb(new Error("Only PDF files are allowed!"), false);
    }
};

export const uploadPDF = multer({
    storage,
    fileFilter,
    limits: { fileSize: 4 * 1024 * 1024 }, // Vercel request body limit ~4.5MB hai
});