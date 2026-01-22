import Resume from '../models/Resume.js';
import JobOpening from '../models/JobOpening.js';
import { uploadToGCS, downloadFromGCS, deleteFromGCS } from '../services/gcs.js';

function canManageResume(user, resume) {
  if (!user) return false;
  if (user.role === 'recruiterAdmin' || user.role === 'hrManager') return true;
  return resume.candidateId?.toString() === user.id;
}

export async function uploadResume(req, res) {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ message: 'jobId is required' });
    if (!req.file) return res.status(400).json({ message: 'File is required' });

    const job = await JobOpening.findById(jobId);
    if (!job || job.isDeleted) return res.status(404).json({ message: 'Job not found' });

    const bucketName = process.env.GCP_BUCKET;
    if (!bucketName) return res.status(500).json({ message: 'Storage bucket not configured' });

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const objectName = `resumes/${jobId}/${Date.now()}-${safeName}`;

    await uploadToGCS({
      bucketName,
      objectName,
      buffer: req.file.buffer,
      contentType: req.file.mimetype
    });

    const resume = await Resume.create({
      candidateId: req.user.id,
      jobId,
      fileName: safeName,
      originalName: req.file.originalname,
      gcsBucket: bucketName,
      gcsObjectName: objectName,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      status: 'uploaded'
    });

    return res.status(201).json(resume);
  } catch (err) {
    console.error('Upload resume error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'Failed to upload resume' });
  }
}

export async function listResumesByJob(req, res) {
  try {
    const { jobId } = req.params;
    const resumes = await Resume.find({ jobId, isDeleted: false }).sort({ createdAt: -1 });
    return res.json(resumes);
  } catch (err) {
    console.error('List resumes error', err);
    return res.status(500).json({ message: 'Failed to list resumes' });
  }
}

export async function listMyResumesByJob(req, res) {
  try {
    const { jobId } = req.params;
    const resumes = await Resume.find({ jobId, candidateId: req.user.id, isDeleted: false }).sort({ createdAt: -1 });
    return res.json(resumes);
  } catch (err) {
    console.error('List my resumes error', err);
    return res.status(500).json({ message: 'Failed to list resumes' });
  }
}

export async function listMyResumes(req, res) {
  try {
    const resumes = await Resume.find({ candidateId: req.user.id, isDeleted: false })
      .sort({ createdAt: -1 })
      .populate('jobId', 'title status location');
    return res.json(resumes);
  } catch (err) {
    console.error('List my resumes error', err);
    return res.status(500).json({ message: 'Failed to list resumes' });
  }
}

export async function getResume(req, res) {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, isDeleted: false });
    if (!resume) return res.status(404).json({ message: 'Resume not found' });
    if (!canManageResume(req.user, resume)) return res.status(403).json({ message: 'Forbidden' });
    return res.json(resume);
  } catch (err) {
    console.error('Get resume error', err);
    return res.status(500).json({ message: 'Failed to fetch resume' });
  }
}

export async function downloadResume(req, res) {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, isDeleted: false });
    if (!resume) return res.status(404).json({ message: 'Resume not found' });
    if (!canManageResume(req.user, resume)) return res.status(403).json({ message: 'Forbidden' });

    if (!resume.gcsBucket || !resume.gcsObjectName) return res.status(404).json({ message: 'File missing' });

    const stream = downloadFromGCS({ bucketName: resume.gcsBucket, objectName: resume.gcsObjectName });
    res.setHeader('Content-Type', resume.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(resume.originalName || resume.fileName)}"`);
    return stream.pipe(res);
  } catch (err) {
    console.error('Download resume error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'Failed to download resume' });
  }
}

export async function deleteResume(req, res) {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, isDeleted: false });
    if (!resume) return res.status(404).json({ message: 'Resume not found' });
    if (!canManageResume(req.user, resume)) return res.status(403).json({ message: 'Forbidden' });

    resume.isDeleted = true;
    await resume.save();

    if (resume.gcsBucket && resume.gcsObjectName) {
      try {
        await deleteFromGCS({ bucketName: resume.gcsBucket, objectName: resume.gcsObjectName });
      } catch (err) {
        console.error('GCS delete error', err.message);
      }
    }

    return res.json({ message: 'Resume deleted' });
  } catch (err) {
    console.error('Delete resume error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'Failed to delete resume' });
  }
}
