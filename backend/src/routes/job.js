import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { checkEligibility, createJob, deleteJob, getJob, listJobs, updateJob } from '../controllers/jobController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  return next();
};

const eduLevels = ['highSchool', 'diploma', 'bachelors', 'masters', 'phd'];

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
    body('eligibilityCriteria').optional().isObject(),
    body('eligibilityCriteria.educationMinLevel').optional().custom((value) => {
      if (value === null || value === undefined) return true;
      if (Array.isArray(value)) {
        return value.length === 0 || value.every((v) => eduLevels.includes(v));
      }
      return eduLevels.includes(value);
    }),
    body('eligibilityCriteria.specialization').optional().isString(),
    body('eligibilityCriteria.academicQualification').optional().isString(),
    body('eligibilityCriteria.minExperienceYears').optional().isNumeric(),
    body('eligibilityCriteria.customCriteria').optional().isArray(),
    body('eligibilityCriteria.customCriteria.*').optional().isString(),
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
    body('eligibilityCriteria').optional().isObject(),
    body('eligibilityCriteria.educationMinLevel').optional().custom((value) => {
      if (value === null || value === undefined) return true;
      if (Array.isArray(value)) {
        return value.length === 0 || value.every((v) => eduLevels.includes(v));
      }
      return eduLevels.includes(value);
    }),
    body('eligibilityCriteria.specialization').optional().isString(),
    body('eligibilityCriteria.academicQualification').optional().isString(),
    body('eligibilityCriteria.minExperienceYears').optional().isNumeric(),
    body('eligibilityCriteria.customCriteria').optional().isArray(),
    body('eligibilityCriteria.customCriteria.*').optional().isString(),
    body('salaryRange').optional().isObject(),
    body('salaryRange.min').optional().isNumeric(),
    body('salaryRange.max').optional().isNumeric(),
    body('location').optional().isString(),
    body('status').optional().isIn(['active', 'closed'])
  ],
  handleValidation,
  updateJob
);

router.post(
  '/:id/check-eligibility',
  [
    authenticate,
    requireRole(['candidate']),
    param('id').isMongoId(),
    body('educationLevel').optional().isIn(eduLevels),
    body('specialization').optional().isString(),
    body('academicQualification').optional().isString(),
    body('experienceYears').optional().isNumeric(),
    body('customCriteriaAccepted').optional().isArray(),
    body('customCriteriaAccepted.*').optional().isInt({ min: 0 })
  ],
  handleValidation,
  checkEligibility
);

router.delete(
  '/:id',
  [authenticate, requireRole(['recruiterAdmin', 'hrManager']), param('id').isMongoId()],
  handleValidation,
  deleteJob
);

export default router;
