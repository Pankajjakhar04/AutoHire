import JobOpening from '../models/JobOpening.js';

const writableFields = [
  'title',
  'description',
  'requiredSkills',
  'niceToHaveSkills',
  'experienceYears',
  'salaryRange',
  'location',
  'status'
];

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
    if (q) filter.$text = { $search: q };

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
