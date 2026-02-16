import mongoose from 'mongoose';

const resumeSchema = new mongoose.Schema(
  {
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobOpening', required: true },
    fileName: { type: String, required: true },
    originalName: { type: String },
    filePath: { type: String },
    driveFileId: { type: String },
    driveWebViewLink: { type: String },
    gcsBucket: { type: String },
    gcsObjectName: { type: String },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    status: { type: String, enum: ['uploaded', 'processing', 'scored', 'screened-in', 'screened-out'], default: 'uploaded' },
    pipelineStage: { type: String, enum: ['screening', 'assessment', 'interview', 'offer', 'hired', 'rejected'], default: 'screening' },
    matchedSkills: [{ type: String }],
    missingSkills: [{ type: String }],
    score: { type: Number, min: 0, max: 100 },
    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

resumeSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const Resume = mongoose.model('Resume', resumeSchema);

export default Resume;
