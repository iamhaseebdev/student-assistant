import multer from "multer";
import path from "path";
import fs from "fs";

// Vercel pe sirf /tmp writable hai, local pe Uploads/pdf use hoga
const uploadDir = process.env.VERCEL
    ? "/tmp/uploads/pdf"
    : "Uploads/pdf";

// Folder nahi hai toh create kar do (crash na ho isliye try/catch)
try {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
} catch (err) {
    console.error("Upload dir create error:", err.message);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
});

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
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});