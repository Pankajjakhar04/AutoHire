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
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    jobCode: { type: String, unique: true, sparse: true }, // Shorter 7-digit numeric ID
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    requiredSkills: [{ type: String, trim: true }],
    niceToHaveSkills: [{ type: String, trim: true }],
    experienceYears: { type: Number, min: 0 },
    eligibilityCriteria: eligibilityCriteriaSchema,
    salaryRange: salaryRangeSchema,
    location: { type: String, trim: true },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    isDeleted: { type: Boolean, default: false }
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

jobOpeningSchema.index({ title: 'text', description: 'text', location: 'text' });

const JobOpening = mongoose.model('JobOpening', jobOpeningSchema);

export default JobOpening;
