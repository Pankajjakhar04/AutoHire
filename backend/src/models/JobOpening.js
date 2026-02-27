import mongoose from 'mongoose';

const salaryRangeSchema = new mongoose.Schema(
  {
    min: { type: Number },
    max: { type: Number },
    currency: { type: String, default: 'USD' }
  },
  { _id: false }
);

const eligibilityCriteriaSchema = new mongoose.Schema(
  {
    educationMinLevel: {
      type: [String],
      enum: ['highSchool', 'diploma', 'bachelors', 'masters', 'phd'],
      default: []
    },
    specialization: { type: String, trim: true },
    academicQualification: { type: String, trim: true },
    minExperienceYears: { type: Number, min: 0 },
    customCriteria: [{ type: String, trim: true }]
  },
  { _id: false }
);

const jobOpeningSchema = new mongoose.Schema(
  {
    // Company and basic info
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    companyName: { type: String, required: true, trim: true }, // For ML integration
    jobCode: { type: String, unique: true, sparse: true }, // 7-digit numeric ID
    
    // Job details (Production Architecture)
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    requiredSkills: [{ type: String, trim: true }],
    niceToHaveSkills: [{ type: String, trim: true }],
    experienceYears: { type: Number, min: 0 },
    
    // Eligibility criteria
    eligibilityCriteria: eligibilityCriteriaSchema,
    
    // Additional job info
    salaryRange: salaryRangeSchema,
    location: { type: String, trim: true },
    
    // Status and soft delete
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    isDeleted: { type: Boolean, default: false },
    
    // ML Integration (Production Architecture)
    mlCompanyId: { type: String, default: null }, // ML server company ID
    mlJobId: { type: String, default: null }, // ML server job ID
    mlInitialized: { type: Boolean, default: false }, // Track ML initialization
    mlInitializedAt: { type: Date },
    
    // Screening metadata
    totalResumes: { type: Number, default: 0 },
    screenedResumes: { type: Number, default: 0 },
    lastScreenedAt: { type: Date }
  },
  { timestamps: true }
);

// Generate jobCode before saving
jobOpeningSchema.pre('save', async function(next) {
  if (!this.jobCode) {
    // Generate a 7-digit random number
    let jobCode;
    let isUnique = false;
    
    while (!isUnique) {
      jobCode = String(Math.floor(Math.random() * 9000000) + 1000000); // 7 digits: 1000000-9999999
      const existing = await mongoose.model('JobOpening').findOne({ jobCode });
      isUnique = !existing;
    }
    
    this.jobCode = jobCode;
  }
  next();
});

// Indexes for performance
jobOpeningSchema.index({ title: 'text', description: 'text', location: 'text' });
jobOpeningSchema.index({ companyId: 1, status: 1 });
jobOpeningSchema.index({ mlCompanyId: 1 });
jobOpeningSchema.index({ mlJobId: 1 });

const JobOpening = mongoose.model('JobOpening', jobOpeningSchema);

export default JobOpening;
