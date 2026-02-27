import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate, requireRole } from '../middleware/auth.js';
import { resumeUpload } from '../middleware/upload.js';
import {
  deleteResume,
  downloadResume,
  getResume,
  listMyResumes,
  listMyResumesByJob,
  listResumesByJob,
  uploadResume,
  screenResumes,
  aiScreenResumes,
  startAiScreenRun,
  getAiScreenRunProgress,
  advanceCandidates,
  listResumesByStage,
  exportStageToExcel,
  getFilteredCandidates,
  withdrawApplication // NEW: Import withdraw application function
} from '../controllers/resumeController.js';

const router = Router();

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  return next();
};

router.post(
  '/upload',
  authenticate,
  (req, res, next) => {
    resumeUpload(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message });
      return next();
    });
  },
  body('jobId').isMongoId().withMessage('Invalid or missing jobId'),
  handleValidation,
  uploadResume
);

router.get(
  '/job/:jobId',
  authenticate,
  requireRole(['recruiterAdmin', 'hrManager']),
  param('jobId').isMongoId(),
  handleValidation,
  listResumesByJob
);

router.get(
  '/job/:jobId/mine',
  authenticate,
  param('jobId').isMongoId(),
  handleValidation,
  listMyResumesByJob
);

router.get('/mine', authenticate, listMyResumes);

// Bulk screen in/out resumes (HR/Recruiter only)
router.patch(
  '/screen',
  authenticate,
  requireRole(['recruiterAdmin', 'hrManager']),
  screenResumes
);

// AI-based screening (HR/Recruiter only)
router.post(
  '/ai-screen',
  authenticate,
  requireRole(['recruiterAdmin', 'hrManager']),
  aiScreenResumes
);

// AI-based screening with progress (HR/Recruiter only)
router.post(
  '/ai-screen/start',
  authenticate,
  requireRole(['recruiterAdmin', 'hrManager']),
  startAiScreenRun
);

router.get(
  '/ai-screen/progress/:runId',
  authenticate,
  requireRole(['recruiterAdmin', 'hrManager']),
  param('runId').isString(),
  handleValidation,
  getAiScreenRunProgress
);

// Advance candidates to next pipeline stage (HR/Recruiter only)
router.post(
  '/advance',
  authenticate,
  requireRole(['recruiterAdmin', 'hrManager']),
  advanceCandidates
);

// List resumes by job and pipeline stage
router.get(
  '/job/:jobId/stage/:stage',
  authenticate,
  requireRole(['recruiterAdmin', 'hrManager']),
  param('jobId').isMongoId(),
  handleValidation,
  listResumesByStage
);

// Export stage candidates to Excel
router.get(
  '/job/:jobId/stage/:stage/export',
  authenticate,
  requireRole(['recruiterAdmin', 'hrManager']),
  param('jobId').isMongoId(),
  handleValidation,
  exportStageToExcel
);

// Production Architecture: Dynamic Filtering Endpoint
router.get(
  '/job/:jobId/candidates',
  authenticate,
  requireRole(['recruiterAdmin', 'hrManager']),
  param('jobId').isMongoId(),
  handleValidation,
  getFilteredCandidates
);

router.get('/:id', authenticate, param('id').isMongoId(), handleValidation, getResume);
router.get('/:id/download', authenticate, param('id').isMongoId(), handleValidation, downloadResume);

// NEW: Withdraw application route (candidate only)
router.delete('/:id/withdraw', authenticate, param('id').isMongoId(), handleValidation, withdrawApplication);

// Legacy delete route (admin/recruiter only)
router.delete('/:id', authenticate, param('id').isMongoId(), handleValidation, deleteResume);

export default router;
