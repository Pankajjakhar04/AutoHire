import { Router } from 'express';
import { getDashboardMetrics, getCandidateMetrics, getJobWiseAnalytics } from '../controllers/analyticsController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Only HR Managers and Recruiter Admins should see org-wide analytics
router.get('/dashboard', authenticate, requireRole(['hrManager', 'recruiterAdmin']), getDashboardMetrics);

// Job-wise analytics for HR dashboard
router.get('/jobs', authenticate, requireRole(['hrManager', 'recruiterAdmin']), getJobWiseAnalytics);

// Candidate personal analytics
router.get('/candidate', authenticate, requireRole(['candidate']), getCandidateMetrics);

export default router;
