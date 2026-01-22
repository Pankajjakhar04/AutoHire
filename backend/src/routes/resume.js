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
  uploadResume
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

router.get('/:id', authenticate, param('id').isMongoId(), handleValidation, getResume);
router.get('/:id/download', authenticate, param('id').isMongoId(), handleValidation, downloadResume);
router.delete('/:id', authenticate, param('id').isMongoId(), handleValidation, deleteResume);

export default router;
