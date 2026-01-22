import JobOpening from '../models/JobOpening.js';
import Resume from '../models/Resume.js';

// Dashboard analytics: real-time counts derived from current collections
export async function getDashboardMetrics(_req, res) {
  try {
    const [openRoles, activeCandidatesRaw, applications, interviewsScheduled, offersInProgress] = await Promise.all([
      JobOpening.countDocuments({ isDeleted: false, status: 'active' }),
      Resume.distinct('candidateId', { isDeleted: false }),
      Resume.countDocuments({ isDeleted: false }),
      // Using resume status to approximate pipeline stages; adjust when interview/offer models exist
      Resume.countDocuments({ isDeleted: false, status: 'processing' }),
      Resume.countDocuments({ isDeleted: false, status: 'scored' })
    ]);

    const activeCandidates = activeCandidatesRaw.length;

    return res.json({
      openRoles,
      activeCandidates,
      applications,
      interviewsScheduled,
      offersInProgress
    });
  } catch (err) {
    console.error('Analytics error', err);
    return res.status(500).json({ message: 'Failed to load analytics' });
  }
}

// Candidate personal analytics
export async function getCandidateMetrics(req, res) {
  try {
    const candidateId = req.user.id;

    const [jobsApplied, resumesScreenedIn, resumesScreenedOut, interviewsScheduled, offersReceived] = await Promise.all([
      Resume.distinct('jobId', { candidateId, isDeleted: false }).then(jobs => jobs.length),
      Resume.countDocuments({ candidateId, isDeleted: false, status: 'screened-in' }),
      Resume.countDocuments({ candidateId, isDeleted: false, status: 'screened-out' }),
      Resume.countDocuments({ candidateId, isDeleted: false, status: 'processing' }),
      Resume.countDocuments({ candidateId, isDeleted: false, status: 'scored' })
    ]);

    return res.json({
      jobsApplied,
      resumesScreenedIn,
      resumesScreenedOut,
      interviewsScheduled,
      offersReceived
    });
  } catch (err) {
    console.error('Candidate analytics error', err);
    return res.status(500).json({ message: 'Failed to load analytics' });
  }
}
