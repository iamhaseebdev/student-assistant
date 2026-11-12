import mongoose from 'mongoose';

const pageSchema = new mongoose.Schema({
  pageNumber: {
    type: Number,
    required: true
  },
  content: {
    type: String,
    default: ''
  },
  drawingData: {
    type: String, // Base64 Canvas Image
    default: ''
  }
});

const notebookSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      unique: true
    },
    pages: [pageSchema]
  },
  { timestamps: true }
);

const Notebook = mongoose.model('Notebook', notebookSchema);
export default Notebook;