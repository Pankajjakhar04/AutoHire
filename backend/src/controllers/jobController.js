import {
  createRun,
  updateRun,
  markRunCompleted,
  markRunFailed
} from "../services/aiScreenRunStore.js";

import { initializeMLJob } from "../services/aiScreening.js";
import { getMLScreeningResults } from "../services/mlScreening.js";

import Resume from "../models/Resume.js";
import JobOpening from "../models/JobOpening.js";
import User from "../models/User.js";

const writableFields = [
  'title',
  'description',
  'requiredSkills',
  'niceToHaveSkills',
  'experienceYears',
  'eligibilityCriteria',
  'salaryRange',
  'location',
  'status'
];

const educationRank = {
  highSchool: 1,
  diploma: 2,
  bachelors: 3,
  masters: 4,
  phd: 5
};

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function evaluateEligibility(criteria = {}, candidate = {}) {
  const failures = [];

  const acceptedEducationLevels = Array.isArray(criteria.educationMinLevel)
    ? criteria.educationMinLevel
    : criteria.educationMinLevel
      ? [criteria.educationMinLevel]
      : [];

  const candEdu = candidate.educationLevel;
  if (acceptedEducationLevels.length > 0) {
    if (!candEdu) {
      failures.push('educationLevel');
    } else {
      const candRank = educationRank[candEdu];
      if (!candRank) {
        failures.push('educationLevel');
      } else {
        const isAccepted = acceptedEducationLevels.some((edu) => {
          const acceptedRank = educationRank[edu];
          return candRank >= acceptedRank;
        });
        if (!isAccepted) failures.push('educationLevel');
      }
    }
  }

  const minExp = criteria.minExperienceYears;
  const candExp = candidate.experienceYears;
  if (minExp !== undefined && minExp !== null) {
    if (candExp === undefined || candExp === null || Number.isNaN(Number(candExp))) failures.push('experienceYears');
    else if (Number(candExp) < Number(minExp)) failures.push('experienceYears');
  }

  const reqSpec = normalizeText(criteria.specialization);
  if (reqSpec) {
    const candSpec = normalizeText(candidate.specialization);
    if (!candSpec) failures.push('specialization');
    else if (candSpec !== reqSpec) failures.push('specialization');
  }

  const reqQual = normalizeText(criteria.academicQualification);
  if (reqQual) {
    const candQual = normalizeText(candidate.academicQualification);
    if (!candQual) failures.push('academicQualification');
    else if (candQual !== reqQual) failures.push('academicQualification');
  }

  const custom = Array.isArray(criteria.customCriteria) ? criteria.customCriteria : [];
  if (custom.length > 0) {
    const acceptedIdx = Array.isArray(candidate.customCriteriaAccepted) ? candidate.customCriteriaAccepted : [];
    const requiredIdx = custom.map((_, idx) => idx);
    const missing = requiredIdx.filter((idx) => !acceptedIdx.includes(idx));
    if (missing.length > 0) failures.push('customCriteria');
  }

  return { eligible: failures.length === 0, failures };
}

export async function createJob(req, res) {
  try {
    const payload = writableFields.reduce((acc, key) => {
      if (req.body[key] !== undefined) acc[key] = req.body[key];
      return acc;
    }, {});
    payload.companyId = req.user?.id;

    // Fetch companyName from DB — req.user (JWT) doesn't include companyName
    if (!payload.companyName) {
      try {
        const hrUser = await User.findById(req.user?.id).select('companyName').lean();
        payload.companyName = hrUser?.companyName || 'Unknown Company';
        console.log(`[Job Creation] Company name from HR profile: ${payload.companyName}`);
      } catch (userErr) {
        console.warn('[Job Creation] Could not fetch HR user:', userErr.message);
        payload.companyName = 'Unknown Company';
      }
    }

    const job = await JobOpening.create(payload);

    try {
      console.log("[Job Creation] Initializing ML job for:", job.title);
      const mlData = await initializeMLJob({ job });
      job.mlCompanyId = mlData.mlCompanyId;
      job.mlJobId = mlData.mlJobId;
      await job.save();
      console.log("[Job Creation] ML IDs saved:", { mlCompanyId: job.mlCompanyId, mlJobId: job.mlJobId });
    } catch (mlErr) {
      console.warn("[Job Creation] ML initialization failed:", mlErr.message);
    }

    return res.status(201).json(job);
  } catch (err) {
    console.error('Create job error', err);
    return res.status(500).json({ message: 'Failed to create job' });
  }
}

export async function listJobs(req, res) {
  try {
    const { status, q } = req.query;
    const filter = { isDeleted: false };
    if (status) filter.status = status;

    const query = String(q || '').trim();
    if (query) {
      const rx = new RegExp(escapeRegExp(query), 'i');
      filter.$or = [
        { title: rx },
        { description: rx },
        { location: rx },
        { jobCode: rx },
        { requiredSkills: rx },
        { niceToHaveSkills: rx }
      ];
    }

    const jobs = await JobOpening.find(filter).sort({ createdAt: -1 });
    return res.json(jobs);
  } catch (err) {
    console.error('List jobs error', err);
    return res.status(500).json({ message: 'Failed to fetch jobs' });
  }
}

export async function getJob(req, res) {
  try {
    const job = await JobOpening.findOne({ _id: req.params.id, isDeleted: false });
    if (!job) return res.status(404).json({ message: 'Job not found' });
    return res.json(job);
  } catch (err) {
    console.error('Get job error', err);
    return res.status(500).json({ message: 'Failed to fetch job' });
  }
}

export async function updateJob(req, res) {
  try {
    const updates = writableFields.reduce((acc, key) => {
      if (req.body[key] !== undefined) acc[key] = req.body[key];
      return acc;
    }, {});

    const job = await JobOpening.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { $set: updates },
      { new: true }
    );
    if (!job) return res.status(404).json({ message: 'Job not found' });
    return res.json(job);
  } catch (err) {
    console.error('Update job error', err);
    return res.status(500).json({ message: 'Failed to update job' });
  }
}

/**
 * POST /:jobId/run-ai-screening
 *
 * Fetches ML ranking results and stores ONLY aiScore on each resume.
 * No screened-in / screened-out status is set here.
 * Filtering by threshold is done at query time via getFilteredCandidates.
 */
export const runAIScreening = async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await JobOpening.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (!job.mlCompanyId || !job.mlJobId) {
      return res.status(400).json({ message: "ML job not initialized for this job" });
    }

    const resumes = await Resume.find({ jobId, isDeleted: false }).sort({ createdAt: 1 });
    if (!resumes.length) {
      return res.status(400).json({ message: "No resumes found for this job" });
    }

    // Create a tracking run
    const run = await createRun({ jobId, total: resumes.length });

    // Fetch ML ranking results
    let results;
    try {
      results = await getMLScreeningResults(job.mlCompanyId, job.mlJobId);
    } catch (mlErr) {
      await markRunFailed(run._id, mlErr.message);
      return res.status(502).json({ message: "ML ranking failed", error: mlErr.message });
    }

    // Save only aiScore — no status mutation
    let processed = 0;
    for (const result of results) {
      // Support matching by resumeIndex (positional) or resume_id
      let resume = null;

      if (result.resume_id) {
        resume = resumes.find(r => r._id.toString() === result.resume_id);
      }

      if (!resume && result.resumeIndex !== undefined) {
        resume = resumes[result.resumeIndex] || null;
      }

      if (!resume) continue;

      const aiScore = Math.min(100, Math.max(0, result.totalScore ?? result.score ?? 0));

      await Resume.findByIdAndUpdate(resume._id, {
        $set: {
          aiScore,
          score: aiScore,  // Also set deprecated field for frontend compatibility
          mlProcessed: true,
          semanticScore: result.semanticScore ?? null,
          yearsDetected: result.yearsDetected ?? null,
          metricsDetected: result.metricsDetected ?? null,
          complexityScore: result.complexityScore ?? null
        }
      });

      processed += 1;
    }

    await updateRun(run._id, { processed, screenedIn: 0, screenedOut: 0 });
    await markRunCompleted(run._id);

    console.log(`[AI Screening] Run ${run._id} complete. Scored ${processed}/${resumes.length} resumes.`);

    return res.json({
      runId: run._id,
      message: "AI scoring completed",
      totalResumes: resumes.length,
      totalScored: processed
    });

  } catch (err) {
    console.error("AI Screening Error:", err.message);
    return res.status(500).json({ message: "AI screening failed" });
  }
};

/**
 * GET /:jobId/candidates?targetScore=60&limit=50&skip=0
 *
 * Dynamically filters candidates by aiScore threshold.
 * No ML re-run. Instant DB query.
 */
export const getFilteredCandidates = async (req, res) => {
  try {
    const { jobId } = req.params;
    const {
      targetScore = 0,
      limit = 100,
      skip = 0
    } = req.query;

    const minScore = Number(targetScore);
    const filter = {
      jobId,
      isDeleted: false,
      aiScore: { $gte: minScore }
    };

    const [candidates, total] = await Promise.all([
      Resume.find(filter)
        .sort({ aiScore: -1 })
        .skip(Number(skip))
        .limit(Number(limit))
        .populate('candidateId', 'name email candidateId highestQualificationDegree specialization cgpaOrPercentage passoutYear'),
      Resume.countDocuments(filter)
    ]);

    const enriched = candidates.map(r => {
      const obj = r.toJSON();
      const candidate = r.candidateId;
      if (candidate && typeof candidate === 'object') {
        obj.candidateName = candidate.name || '';
        obj.candidateEmail = candidate.email || '';
        obj.candidateUniqueId = candidate.candidateId || '';
        obj.highestQualification = candidate.highestQualificationDegree || '';
        obj.specialization = candidate.specialization || '';
        obj.cgpa = candidate.cgpaOrPercentage || '';
        obj.passoutYear = candidate.passoutYear || '';
      }
      return obj;
    });

    return res.json({
      targetScore: minScore,
      total,
      count: enriched.length,
      candidates: enriched
    });

  } catch (err) {
    console.error("getFilteredCandidates error:", err.message);
    return res.status(500).json({ message: "Failed to fetch candidates" });
  }
};

export async function deleteJob(req, res) {
  try {
    const job = await JobOpening.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { $set: { isDeleted: true, status: 'closed' } },
      { new: true }
    );
    if (!job) return res.status(404).json({ message: 'Job not found' });
    return res.json({ message: 'Job deleted' });
  } catch (err) {
    console.error('Delete job error', err);
    return res.status(500).json({ message: 'Failed to delete job' });
  }
}

export async function initializeJobForML(req, res) {
  try {
    const job = await JobOpening.findById(req.params.id);
    if (!job || job.isDeleted) return res.status(404).json({ message: 'Job not found' });

    if (job.mlCompanyId && job.mlJobId) {
      return res.json({
        message: 'Job already initialized for ML',
        mlCompanyId: job.mlCompanyId,
        mlJobId: job.mlJobId
      });
    }

    try {
      const mlData = await initializeMLJob({ job });
      job.mlCompanyId = mlData.mlCompanyId;
      job.mlJobId = mlData.mlJobId;
      await job.save();

      return res.json({
        message: 'Job successfully initialized for ML',
        mlCompanyId: job.mlCompanyId,
        mlJobId: job.mlJobId
      });
    } catch (mlErr) {
      console.error("[ML Init] Failed:", mlErr.message);
      return res.status(500).json({ message: 'Failed to initialize job for ML', error: mlErr.message });
    }
  } catch (err) {
    console.error('initializeJobForML error', err);
    return res.status(500).json({ message: 'Failed to initialize job for ML' });
  }
}

export async function checkEligibility(req, res) {
  try {
    const job = await JobOpening.findOne({ _id: req.params.id, isDeleted: false });
    if (!job) return res.status(404).json({ message: 'Job not found' });

    const criteria = job.eligibilityCriteria || {};
    const educationLevels = Array.isArray(criteria.educationMinLevel)
      ? criteria.educationMinLevel
      : criteria.educationMinLevel
        ? [criteria.educationMinLevel]
        : [];

    const hasCriteria =
      educationLevels.length > 0 ||
      Boolean(criteria.specialization) ||
      Boolean(criteria.academicQualification) ||
      criteria.minExperienceYears !== undefined ||
      (Array.isArray(criteria.customCriteria) && criteria.customCriteria.length > 0);

    if (!hasCriteria) {
      return res.json({ eligible: true, failures: [], message: 'No eligibility criteria configured for this job.' });
    }

    const result = evaluateEligibility(criteria, req.body || {});
    return res.json({
      eligible: result.eligible,
      failures: result.failures,
      warning: result.eligible
        ? null
        : 'There is very minimal chance of screening as you are currently ineligible for this position.'
    });
  } catch (err) {
    console.error('Check eligibility error', err);
    return res.status(500).json({ message: 'Failed to evaluate eligibility' });
  }
}