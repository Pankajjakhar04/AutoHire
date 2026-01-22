import mongoose from 'mongoose';

export const USER_ROLES = ['recruiterAdmin', 'hrManager', 'candidate'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: USER_ROLES, default: 'candidate' },
    candidateId: { type: String, unique: true, sparse: true },
    employeeId: { type: String, trim: true },
    companyName: { type: String, trim: true },
    highestQualificationDegree: { type: String, trim: true },
    specialization: { type: String, trim: true },
    cgpaOrPercentage: { type: String, trim: true },
    passoutYear: { type: Number },
    isVerified: { type: Boolean, default: false },
    refreshToken: { type: String, default: null }
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.refreshToken;
    delete ret.__v;
    return ret;
  }
});

const User = mongoose.model('User', userSchema);

export default User;
