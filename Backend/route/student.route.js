import { Router } from "express";
import multer from "multer";
import path from "path";
import { Create, getAllStudents, getStudentById, updateStudent, deleteStudent } from "../controller/student.controller.js";
import fileUrl from "../Middleware/set_file_URL.js";
import { verifyAccessToken } from "../Middleware/auth.middleware.js";

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'Uploads');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage });
const studentRouter = Router();

// Student Creation with File Upload
studentRouter.post('/', upload.single('myfile'), fileUrl, Create);

// Protected Routes (Token Verification Required)
studentRouter.get('/', verifyAccessToken, getAllStudents);
studentRouter.get('/:id', verifyAccessToken, getStudentById);
studentRouter.put('/:id', verifyAccessToken, updateStudent);
studentRouter.delete('/:id', verifyAccessToken, deleteStudent);

export default studentRouter;