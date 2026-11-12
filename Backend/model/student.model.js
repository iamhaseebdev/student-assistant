import mongoose from "mongoose";


const studentSchema = new mongoose.Schema({
    StudentName : {
        type : String,
        required : true
    },
    StudentEmail : {
        type : String,
        required : true,
        unique : true
    },
    StudentAge : {
        type : Number,
    },
    Verified : {
        type : Boolean
    },
    StudentContact : {
        type : Number,
    },
    Password : {
        type : String,
        required : true
    },
    file_Url : {
        type : []
    },
    Role : {
        type : String,
        default : 'user'
    }
});

const Student = mongoose.model('student' , studentSchema);

export default Student;