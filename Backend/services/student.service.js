import Student from "../model/student.model.js";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

// Password Validation Helper
const isStrongPassword = (password) => {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return regex.test(password);
};

// 1. Create Student
async function CreateStudent(StudentData) {
    const { StudentName, StudentEmail, StudentAge, StudentContact, Password, file_Url, Role } = StudentData;

    if (!StudentName || !StudentEmail || !Password) {
        throw new Error('Data is missing!');
    }

    if (!isStrongPassword(Password)) {
        throw new Error(
            'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&).'
        );
    }

    const hashPassword = await bcrypt.hash(Password, SALT_ROUNDS);

    const user = await Student.create({
        StudentName,
        StudentEmail,
        StudentAge,
        StudentContact,
        Password: hashPassword,
        file_Url,
        ...(Role && { Role })
    });

    return user;
}

// 2. Get All Students (Admin View)
async function getAllStudentsService() {
    return await Student.find({}, "-Password");
}

// 3. Get Student by ID (Profile View)
async function getStudentByIdService(id) {
    const student = await Student.findById(id, "-Password");
    if (!student) {
        throw new Error('Student not found');
    }
    return student;
}

// 4. Update Student Profile
async function updateStudentService(id, updateData) {
    const { StudentName, StudentEmail, StudentAge, StudentContact } = updateData;

    const updatedStudent = await Student.findByIdAndUpdate(
        id,
        { StudentName, StudentEmail, StudentAge, StudentContact },
        { returnDocument: 'after', runValidators: true }
    ).select("-Password");

    if (!updatedStudent) {
        throw new Error('Student not found');
    }

    return updatedStudent;
}

// 5. Delete Student (Admin Feature)
async function deleteStudentService(id) {
    const deletedStudent = await Student.findByIdAndDelete(id);
    if (!deletedStudent) {
        throw new Error('Student not found');
    }
    return deletedStudent;
}

export {
    CreateStudent,
    getAllStudentsService,
    getStudentByIdService,
    updateStudentService,
    deleteStudentService
};