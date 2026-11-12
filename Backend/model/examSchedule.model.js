import mongoose from 'mongoose';

const examScheduleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      unique: true
    },

    // quiz.controller.js ye do fields use karta hai (pehle schema mein thi hi nahi)
    lastExamTime: { type: Date, default: null },
    masterExamDoneToday: { type: Boolean, default: false },

    // Purane design ki fields: ab required nahi, taake create() fail na ho
    scheduledStartTime: { type: Date, default: null },
    scheduledEndTime: { type: Date, default: null },

    isCompleted: { type: Boolean, default: false },
    isPassed: { type: Boolean, default: false },
    gamingUnlockedUntil: { type: Date, default: null },
    xpPoints: { type: Number, default: 0 },
    level: { type: Number, default: 1 }
  },
  { timestamps: true }
);

export default mongoose.model('ExamSchedule', examScheduleSchema);