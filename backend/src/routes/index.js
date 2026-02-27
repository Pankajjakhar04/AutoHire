import { Router } from 'express';
import authRoutes from './auth.js';
import jobRoutes from './job.js';
import resumeRoutes from './resume.js';
import analyticsRoutes from './analytics.js';
import healthRoutes from './health.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/jobs', jobRoutes);
router.use('/resumes', resumeRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/system', healthRoutes);

// TODO: add jobs, resumes, scoring routes
router.get('/', (_req, res) => {
  res.json({ message: 'API root' });
});

export default router;
