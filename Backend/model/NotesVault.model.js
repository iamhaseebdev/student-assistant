import mongoose from 'mongoose';

const ChapterProgressSchema = new mongoose.Schema({
  chapterIndex: { type: Number, required: true },
  chapterTitle: { type: String, required: true },
  isUnlocked: { type: Boolean, default: false },
  isPassed: { type: Boolean, default: false },
  lastScore: { type: Number, default: 0 },
  mistakes: [String]
});

const NotesVaultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  subjectName: { type: String, required: true },
  studentClass: { type: String, default: '' },          // NEW: was being dropped (schema is strict) -> showed "Physics ()" and "undefined" in AI prompts
  notesType: { type: String, default: 'subjective' },   // NEW: same reason
  pdfName: { type: String, required: true },
  topicTitle: { type: String, required: true },
  pdfUrl: { type: String, default: "" },
  notesContent: { type: String, required: true },
  // exam date field was removed from the form -> not required any more (controller still sets a default)
  examTargetDate: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  currentChapterIndex: { type: Number, default: 0 },
  extractedChapters: [ChapterProgressSchema],
  lastExamTakenAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model('NotesVault', NotesVaultSchema);