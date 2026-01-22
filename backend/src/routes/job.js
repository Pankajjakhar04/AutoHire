import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { createJob, deleteJob, getJob, listJobs, updateJob } from '../controllers/jobController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  return next();
};

router.get(
  '/',
  [query('status').optional().isIn(['active', 'closed']), query('q').optional().isString()],
  handleValidation,
  authenticate,
  listJobs
);

router.get('/:id', [param('id').isMongoId()], handleValidation, authenticate, getJob);

router.post(
  '/',
  [
    authenticate,
    requireRole(['recruiterAdmin', 'hrManager']),
    body('title').isString().notEmpty(),
    body('description').isString().notEmpty(),
    body('requiredSkills').optional().isArray(),
    body('niceToHaveSkills').optional().isArray(),
    body('experienceYears').optional().isNumeric(),
    body('salaryRange').optional().isObject(),
    body('salaryRange.min').optional().isNumeric(),
    body('salaryRange.max').optional().isNumeric(),
    body('location').optional().isString(),
    body('status').optional().isIn(['active', 'closed'])
  ],
  handleValidation,
  createJob
);

router.put(
  '/:id',
  [
    authenticate,
    requireRole(['recruiterAdmin', 'hrManager']),
    param('id').isMongoId(),
    body('title').optional().isString(),
    body('description').optional().isString(),
    body('requiredSkills').optional().isArray(),
    body('niceToHaveSkills').optional().isArray(),
    body('experienceYears').optional().isNumeric(),
    body('salaryRange').optional().isObject(),
    body('salaryRange.min').optional().isNumeric(),
    body('salaryRange.max').optional().isNumeric(),
    body('location').optional().isString(),
    body('status').optional().isIn(['active', 'closed'])
  ],
  handleValidation,
  updateJob
);

router.delete(
  '/:id',
  [authenticate, requireRole(['recruiterAdmin', 'hrManager']), param('id').isMongoId()],
  handleValidation,
  deleteJob
);

export default router;
