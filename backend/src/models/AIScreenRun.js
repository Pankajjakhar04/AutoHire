import mongoose from 'mongoose';

const aiScreenRunSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobOpening', required: true },
    total: { type: Number, required: true, default: 0 },
    processed: { type: Number, required: true, default: 0 },
    screenedIn: { type: Number, required: true, default: 0 },
    screenedOut: { type: Number, required: true, default: 0 },
    status: { 
      type: String, 
      enum: ['running', 'completed', 'failed'], 
      default: 'running' 
    },
    error: { type: String, default: null },
    done: { type: Boolean, default: false },
    results: [{
      resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume' },
      candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      candidateName: String,
      score: Number,
      fitLevel: String,
      status: String,
      matchedSkills: [String],
      missingSkills: [String],
      redFlags: [String],
      strongSignals: [String],
      concerns: [String],
      error: String
    }]
  },
  { timestamps: true }
);

// Index for efficient queries
aiScreenRunSchema.index({ jobId: 1, createdAt: -1 });
aiScreenRunSchema.index({ status: 1 });

const AIScreenRun = mongoose.model('AIScreenRun', aiScreenRunSchema);

export default AIScreenRun;
