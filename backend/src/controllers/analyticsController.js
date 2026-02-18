import JobOpening from '../models/JobOpening.js';
import Resume from '../models/Resume.js';

// Dashboard analytics: real-time counts derived from current collections
export async function getDashboardMetrics(_req, res) {
  try {
    const [openRoles, activeCandidatesRaw, applications, screenedIn, screenedOut, interviewsScheduled, offersInProgress] = await Promise.all([
      JobOpening.countDocuments({ isDeleted: false, status: 'active' }),
      Resume.distinct('candidateId', { isDeleted: false }),
      Resume.countDocuments({ isDeleted: false }),
      Resume.countDocuments({ isDeleted: false, status: 'screened-in' }),
      Resume.countDocuments({ isDeleted: false, status: 'screened-out' }),
      Resume.countDocuments({ isDeleted: false, pipelineStage: 'interview' }),
      Resume.countDocuments({ isDeleted: false, pipelineStage: 'offer' })
    ]);

    const activeCandidates = activeCandidatesRaw.length;

    return res.json({
      openRoles,
      activeCandidates,
      applications,
      screenedIn,
      screenedOut,
      interviewsScheduled,
      offersInProgress
    });
  } catch (err) {
    console.error('Analytics error', err);
    return res.status(500).json({ message: 'Failed to load analytics' });
  }
}

// Job-wise analytics for HR dashboard
export async function getJobWiseAnalytics(_req, res) {
  try {
    // Get all active jobs
    const jobs = await JobOpening.find({ isDeleted: false }).sort({ createdAt: -1 }).lean();
    
    // Get analytics for each job
    const jobAnalytics = await Promise.all(
      jobs.map(async (job) => {
        const jobId = job._id;
        
        const [total, screenedIn, screenedOut, inAssessment, inInterview, inOffer, hired] = await Promise.all([
          Resume.countDocuments({ jobId, isDeleted: false }),
          Resume.countDocuments({ jobId, isDeleted: false, status: 'screened-in' }),
          Resume.countDocuments({ jobId, isDeleted: false, status: 'screened-out' }),
          Resume.countDocuments({ jobId, isDeleted: false, pipelineStage: 'assessment' }),
          Resume.countDocuments({ jobId, isDeleted: false, pipelineStage: 'interview' }),
          Resume.countDocuments({ jobId, isDeleted: false, pipelineStage: 'offer' }),
          Resume.countDocuments({ jobId, isDeleted: false, pipelineStage: 'hired' })
        ]);
        
        return {
          jobId: job._id,
          jobCode: job.jobCode,
          title: job.title,
          status: job.status,
          location: job.location,
          createdAt: job.createdAt,
          metrics: {
            total,
            screenedIn,
            screenedOut,
            pending: total - screenedIn - screenedOut,
            inAssessment,
            inInterview,
            inOffer,
            hired
          }
        };
      })
    );
    
    // Calculate totals
    const totals = jobAnalytics.reduce((acc, job) => ({
      total: acc.total + job.metrics.total,
      screenedIn: acc.screenedIn + job.metrics.screenedIn,
      screenedOut: acc.screenedOut + job.metrics.screenedOut,
      pending: acc.pending + job.metrics.pending,
      inAssessment: acc.inAssessment + job.metrics.inAssessment,
      inInterview: acc.inInterview + job.metrics.inInterview,
      inOffer: acc.inOffer + job.metrics.inOffer,
      hired: acc.hired + job.metrics.hired
    }), { total: 0, screenedIn: 0, screenedOut: 0, pending: 0, inAssessment: 0, inInterview: 0, inOffer: 0, hired: 0 });
    
    return res.json({
      jobs: jobAnalytics,
      totals,
      totalJobs: jobs.length,
      activeJobs: jobs.filter(j => j.status === 'active').length
    });
  } catch (err) {
    console.error('Job-wise analytics error', err);
    return res.status(500).json({ message: 'Failed to load job analytics' });
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
