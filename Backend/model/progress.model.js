import mongoose from "mongoose";

const attemptSchema = new mongoose.Schema({
    docTitle: { type: String, required: true },
    score: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    percentage: { type: Number, required: true },
    passed: { type: Boolean, required: true },
    type: { type: String, default: 'MCQ Quiz' }, // 'MCQ Quiz' | 'Subjective PDF'
    createdAt: { type: Date, default: Date.now }
});

const progressSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true,
        unique: true
    },
    streakCount: { type: Number, default: 0 },
    lastClearedDate: { type: String, default: null },
    wrongQuestions: [{
        docId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
        question: String,
        options: [String],
        correctIndex: Number
    }],
    attempts: [attemptSchema]
}, { timestamps: true });

export default mongoose.model('Progress', progressSchema);