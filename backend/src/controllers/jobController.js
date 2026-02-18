import JobOpening from '../models/JobOpening.js';

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

  // Handle multiple education levels with hierarchy support
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
        // Check if candidate's education is in the accepted list OR is higher than any accepted level
        const isAccepted = acceptedEducationLevels.some((edu) => {
          const acceptedRank = educationRank[edu];
          // Candidate's education matches exactly OR is higher than accepted level
          return candRank >= acceptedRank;
        });
        if (!isAccepted) {
          failures.push('educationLevel');
        }
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

    const job = await JobOpening.create(payload);
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
      warning:
        result.eligible
          ? null
          : 'There is very minimal chance of screening as you are currently ineligible for this position.'
    });
  } catch (err) {
    console.error('Check eligibility error', err);
    return res.status(500).json({ message: 'Failed to evaluate eligibility' });
  }
}
