import mongoose from 'mongoose';

const classSchema = new mongoose.Schema(
  {
    label: { type: String, default: 'Class' },
    start: { type: String, required: true }, // "HH:MM" (24h)
    end: { type: String, required: true },
    days: [Number] // 0 = Monday ... 6 = Sunday
  },
  { _id: false }
);

const blockSchema = new mongoose.Schema(
  {
    start: String,
    end: String,
    minutes: Number,
    type: String, // class | study | play | free | meal | routine | rest | sleep
    title: String
  },
  { _id: false }
);

const daySchema = new mongoose.Schema(
  {
    day: Number, // 0 = Monday ... 6 = Sunday
    blocks: [blockSchema],
    studyMinutes: Number,
    playMinutes: Number,
    sleepMinutes: Number
  },
  { _id: false }
);

const timetableSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, unique: true },
    settings: {
      wakeTime: String,
      bedTime: String,
      studyHours: Number,
      playHours: Number,
      subjects: [String],
      classes: [classSchema]
    },
    schedule: [daySchema],
    warnings: [String],
    generatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export default mongoose.model('Timetable', timetableSchema);