import mongoose from 'mongoose';

const resumeSchema = new mongoose.Schema(
  {
    // Core application data
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobOpening', required: true },
    
    // Candidate information
    candidateName: { type: String, required: true },
    email: { type: String, required: true },
    
    // File storage (GCS)
    fileName: { type: String, required: true },
    originalName: { type: String },
    resumeUrl: { type: String }, // GCS URL
    gcsBucket: { type: String },
    gcsObjectName: { type: String },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    
    // Processing status
    status: { 
      type: String, 
      enum: ['uploaded', 'processing', 'scored', 'screened-in', 'screened-out'], 
      default: 'uploaded' 
    },
    pipelineStage: { 
      type: String, 
      enum: ['screening', 'assessment', 'interview', 'offer', 'hired', 'rejected'], 
      default: 'screening' 
    },
    
    // AI Scoring (Production Architecture)
    aiScore: { type: Number, min: 0, max: 100, default: null }, // Main AI score
    semanticScore: { type: Number, min: 0, max: 100, default: null }, // 40% weight
    skillMatchScore: { type: Number, min: 0, max: 100, default: null }, // 30% weight
    experienceScore: { type: Number, min: 0, max: 100, default: null }, // 15% weight
    metricsScore: { type: Number, min: 0, max: 100, default: null }, // 10% weight
    complexityScore: { type: Number, min: 0, max: 100, default: null }, // 5% weight
    
    // ML Processing metadata
    mlProcessed: { type: Boolean, default: false },
    mlProcessedAt: { type: Date },
    mlError: { type: String },
    
    // Extracted content
    extractedText: { type: String },
    
    // Skill analysis
    matchedSkills: [{ type: String }],
    missingSkills: [{ type: String }],
    
    // Legacy fields (for backward compatibility)
    score: { type: Number, min: 0, max: 100 }, // Deprecated, use aiScore
    
    // Soft delete
    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Indexes for performance
resumeSchema.index({ jobId: 1, aiScore: -1 });
resumeSchema.index({ jobId: 1, status: 1 });
resumeSchema.index({ candidateId: 1 });
resumeSchema.index({ email: 1 });

resumeSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const Resume = mongoose.model('Resume', resumeSchema);

export default Resume;
