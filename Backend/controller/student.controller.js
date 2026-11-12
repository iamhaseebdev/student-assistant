import {
    CreateStudent,
    getAllStudentsService,
    getStudentByIdService,
    updateStudentService,
    deleteStudentService
} from "../services/student.service.js";

async function Create(req, res) {
    try {
        const std = await CreateStudent(req.body);

        return res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: std
        });
    } catch (error) {
        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message || 'Failed to create student'
        });
    }
}

async function getAllStudents(req, res) {
    try {
        const students = await getAllStudentsService();
        return res.status(200).json({
            success: true,
            data: students
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch students'
        });
    }
}

async function getStudentById(req, res) {
    try {
        const student = await getStudentByIdService(req.params.id);
        return res.status(200).json({
            success: true,
            data: student
        });
    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message || 'Student not found'
        });
    }
}

async function updateStudent(req, res) {
    try {
        const updated = await updateStudentService(req.params.id, req.body);
        return res.status(200).json({
            success: true,
            message: 'Student updated successfully!',
            data: updated
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message || 'Failed to update student'
        });
    }
}

async function deleteStudent(req, res) {
    try {
        const studentIdToDelete = req.params.id;
        const currentUserId = req.user?.id;

        // Self-deletion Protection
        if (studentIdToDelete === currentUserId) {
            return res.status(400).json({
                success: false,
                message: 'You cannot delete your own account!'
            });
        }

        await deleteStudentService(studentIdToDelete);
        return res.status(200).json({
            success: true,
            message: 'Student deleted successfully!'
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message || 'Failed to delete student'
        });
    }
}

export {
    Create,
    getAllStudents,
    getStudentById,
    updateStudent,
    deleteStudent
};