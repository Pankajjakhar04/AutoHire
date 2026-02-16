import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import Resume from '../models/Resume.js';
import JobOpening from '../models/JobOpening.js';
import User from '../models/User.js';
import { sendBatchStageEmails } from '../services/email.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Dynamically load GCS if configured
let gcsModule = null;
async function getGCS() {
  if (gcsModule) return gcsModule;
  if (process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
    try {
      gcsModule = await import('../services/gcs.js');
      return gcsModule;
    } catch (_) { /* fall through to local storage */ }
  }
  return null;
}

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

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const uniqueName = `${Date.now()}-${safeName}`;

    const gcs = await getGCS();
    const bucketName = process.env.GCP_BUCKET;
    let resumeData;

    if (gcs && bucketName) {
      // Use GCS storage
      const objectName = `resumes/${jobId}/${uniqueName}`;
      await gcs.uploadToGCS({
        bucketName,
        objectName,
        buffer: req.file.buffer,
        contentType: req.file.mimetype
      });
      resumeData = {
        candidateId: req.user.id,
        jobId,
        fileName: safeName,
        originalName: req.file.originalname,
        gcsBucket: bucketName,
        gcsObjectName: objectName,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        status: 'uploaded'
      };
    } else {
      // Use local file storage
      const jobDir = path.join(UPLOADS_DIR, jobId);
      if (!fs.existsSync(jobDir)) {
        fs.mkdirSync(jobDir, { recursive: true });
      }
      const filePath = path.join(jobDir, uniqueName);
      fs.writeFileSync(filePath, req.file.buffer);
      resumeData = {
        candidateId: req.user.id,
        jobId,
        fileName: safeName,
        originalName: req.file.originalname,
        filePath: `uploads/${jobId}/${uniqueName}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        status: 'uploaded'
      };
    }

    const resume = await Resume.create(resumeData);
    return res.status(201).json(resume);
  } catch (err) {
    console.error('Upload resume error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'Failed to upload resume' });
  }
}

export async function listResumesByJob(req, res) {
  try {
    const { jobId } = req.params;
    const resumes = await Resume.find({ jobId, isDeleted: false })
      .sort({ createdAt: -1 })
      .populate('candidateId', 'name email candidateId highestQualificationDegree specialization cgpaOrPercentage passoutYear');

    // Flatten candidate info into each resume object for the frontend
    const enriched = resumes.map(r => {
      const obj = r.toJSON();
      const candidate = r.candidateId; // populated user doc
      if (candidate && typeof candidate === 'object') {
        obj.candidateName = candidate.name || '';
        obj.candidateEmail = candidate.email || '';
        obj.candidateUniqueId = candidate.candidateId || '';
        obj.highestQualification = candidate.highestQualificationDegree || '';
        obj.specialization = candidate.specialization || '';
        obj.cgpa = candidate.cgpaOrPercentage || '';
        obj.passoutYear = candidate.passoutYear || '';
        obj.candidateId = candidate._id; // keep as ObjectId string
      }
      return obj;
    });

    return res.json(enriched);
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

    // GCS path
    if (resume.gcsBucket && resume.gcsObjectName) {
      const gcs = await getGCS();
      if (!gcs) return res.status(500).json({ message: 'GCS not configured' });
      const stream = gcs.downloadFromGCS({ bucketName: resume.gcsBucket, objectName: resume.gcsObjectName });
      res.setHeader('Content-Type', resume.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(resume.originalName || resume.fileName)}"`);
      return stream.pipe(res);
    }

    // Local file path
    if (resume.filePath) {
      const absPath = path.resolve(__dirname, '../..', resume.filePath);
      if (!fs.existsSync(absPath)) return res.status(404).json({ message: 'File not found on disk' });
      res.setHeader('Content-Type', resume.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(resume.originalName || resume.fileName)}"`);
      return fs.createReadStream(absPath).pipe(res);
    }

    return res.status(404).json({ message: 'File missing' });
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

    // Delete from GCS
    if (resume.gcsBucket && resume.gcsObjectName) {
      try {
        const gcs = await getGCS();
        if (gcs) await gcs.deleteFromGCS({ bucketName: resume.gcsBucket, objectName: resume.gcsObjectName });
      } catch (err) {
        console.error('GCS delete error', err.message);
      }
    }

    // Delete local file
    if (resume.filePath) {
      try {
        const absPath = path.resolve(__dirname, '../..', resume.filePath);
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
      } catch (err) {
        console.error('Local file delete error', err.message);
      }
    }

    return res.json({ message: 'Resume deleted' });
  } catch (err) {
    console.error('Delete resume error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'Failed to delete resume' });
  }
}

// Bulk update resume screening status
export async function screenResumes(req, res) {
  try {
    const { resumeIds, status } = req.body;
    if (!Array.isArray(resumeIds) || resumeIds.length === 0) {
      return res.status(400).json({ message: 'resumeIds array is required' });
    }
    const validStatuses = ['screened-in', 'screened-out', 'uploaded', 'processing', 'scored'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    let updateFields = { status };
    // If screening out, also reset pipelineStage to 'screening'
    if (status === 'screened-out') {
      updateFields.pipelineStage = 'screening';
    }
    const result = await Resume.updateMany(
      { _id: { $in: resumeIds }, isDeleted: false },
      { $set: updateFields }
    );

    return res.json({ message: `Updated ${result.modifiedCount} resume(s) to "${status}"`, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error('Screen resumes error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'Failed to update resume status' });
  }
}

// AI-based screening: score candidates against job requirements
export async function aiScreenResumes(req, res) {
  try {
    const { jobId, resumeIds, threshold = 50 } = req.body;
    if (!jobId) return res.status(400).json({ message: 'jobId is required' });

    const job = await JobOpening.findById(jobId);
    if (!job || job.isDeleted) return res.status(404).json({ message: 'Job not found' });

    // Build filter — screen specific resumes or all for the job
    const filter = { jobId, isDeleted: false };
    if (Array.isArray(resumeIds) && resumeIds.length > 0) {
      filter._id = { $in: resumeIds };
    }

    const resumes = await Resume.find(filter);
    if (resumes.length === 0) return res.status(404).json({ message: 'No resumes found to screen' });

    // Fetch candidate profiles for all resumes
    const candidateIds = [...new Set(resumes.map(r => r.candidateId.toString()))];
    const candidates = await User.find({ _id: { $in: candidateIds } });
    const candidateMap = {};
    candidates.forEach(c => { candidateMap[c._id.toString()] = c; });

    const jobRequiredSkills = (job.requiredSkills || []).map(s => s.toLowerCase().trim());
    const jobNiceSkills = (job.niceToHaveSkills || []).map(s => s.toLowerCase().trim());
    const jobExperience = job.experienceYears || 0;

    const results = [];

    for (const resume of resumes) {
      const candidate = candidateMap[resume.candidateId.toString()];
      if (!candidate) continue;

      let score = 0;
      const matchedSkills = [];
      const missingSkills = [];

      // --- 1. Qualification scoring (0-25 points) ---
      const qualRank = {
        'phd': 25, 'ph.d': 25, 'doctorate': 25,
        "master's": 20, 'masters': 20, 'm.tech': 20, 'mtech': 20, 'm.sc': 20, 'msc': 20, 'mba': 20, 'me': 20, 'm.e': 20,
        "bachelor's": 15, 'bachelors': 15, 'b.tech': 15, 'btech': 15, 'b.sc': 15, 'bsc': 15, 'b.e': 15, 'be': 15, 'bca': 15, 'bba': 15,
        'diploma': 10,
        'high school': 5, '12th': 5, '10+2': 5
      };
      const candidateQual = (candidate.highestQualificationDegree || '').toLowerCase().trim();
      score += qualRank[candidateQual] || 8;

      // --- 2. Specialization / skill match (0-35 points) ---
      const candidateSpec = (candidate.specialization || '').toLowerCase().trim();
      const allJobSkills = [...jobRequiredSkills, ...jobNiceSkills];

      // Check if specialization matches any required skill keyword
      if (candidateSpec) {
        for (const skill of jobRequiredSkills) {
          if (candidateSpec.includes(skill) || skill.includes(candidateSpec)) {
            matchedSkills.push(skill);
          }
        }
        for (const skill of jobNiceSkills) {
          if (candidateSpec.includes(skill) || skill.includes(candidateSpec)) {
            matchedSkills.push(skill);
          }
        }
      }

      // Check resume's already-stored matched skills (if any from prior parsing)
      if (resume.matchedSkills && resume.matchedSkills.length > 0) {
        resume.matchedSkills.forEach(s => {
          const lower = s.toLowerCase().trim();
          if (!matchedSkills.includes(lower)) matchedSkills.push(lower);
        });
      }

      // Calculate missing required skills
      for (const skill of jobRequiredSkills) {
        if (!matchedSkills.includes(skill)) {
          missingSkills.push(skill);
        }
      }

      if (jobRequiredSkills.length > 0) {
        const requiredMatchRatio = matchedSkills.filter(s => jobRequiredSkills.includes(s)).length / jobRequiredSkills.length;
        score += Math.round(requiredMatchRatio * 25);
      } else {
        score += 15; // No specific skills required, give baseline
      }

      if (jobNiceSkills.length > 0) {
        const niceMatchRatio = matchedSkills.filter(s => jobNiceSkills.includes(s)).length / jobNiceSkills.length;
        score += Math.round(niceMatchRatio * 10);
      }

      // --- 3. CGPA / Percentage scoring (0-20 points) ---
      const cgpaStr = (candidate.cgpaOrPercentage || '').trim();
      let cgpaScore = 0;
      if (cgpaStr) {
        const numVal = parseFloat(cgpaStr.replace(/[^0-9.]/g, ''));
        if (!isNaN(numVal)) {
          if (numVal <= 10) {
            // CGPA scale (out of 10)
            cgpaScore = Math.round((numVal / 10) * 20);
          } else if (numVal <= 100) {
            // Percentage scale
            cgpaScore = Math.round((numVal / 100) * 20);
          }
        }
      }
      score += cgpaScore;

      // --- 4. Recency / passout year scoring (0-10 points) ---
      const currentYear = new Date().getFullYear();
      const passoutYear = candidate.passoutYear;
      if (passoutYear) {
        const yearsAgo = currentYear - passoutYear;
        if (yearsAgo <= 1) score += 10;
        else if (yearsAgo <= 3) score += 8;
        else if (yearsAgo <= 5) score += 6;
        else if (yearsAgo <= 10) score += 4;
        else score += 2;
      }

      // --- 5. File uploaded bonus (0-10 points) ---
      score += 10; // They submitted a resume, so give full credit

      // Clamp score
      score = Math.min(100, Math.max(0, score));

      // Determine status based on threshold
      const status = score >= threshold ? 'screened-in' : 'screened-out';

      // Update resume in DB
      await Resume.findByIdAndUpdate(resume._id, {
        $set: {
          score,
          matchedSkills: [...new Set(matchedSkills)],
          missingSkills: [...new Set(missingSkills)],
          status
        }
      });

      results.push({
        resumeId: resume._id,
        candidateId: resume.candidateId,
        candidateName: candidate.name || '',
        score,
        status,
        matchedSkills: [...new Set(matchedSkills)],
        missingSkills: [...new Set(missingSkills)]
      });
    }

    const screenedIn = results.filter(r => r.status === 'screened-in').length;
    const screenedOut = results.filter(r => r.status === 'screened-out').length;

    return res.json({
      message: `AI screening complete: ${screenedIn} screened in, ${screenedOut} screened out (threshold: ${threshold})`,
      threshold,
      total: results.length,
      screenedIn,
      screenedOut,
      results
    });
  } catch (err) {
    console.error('AI screen error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'AI screening failed' });
  }
}

// Pipeline stage order for validation
const STAGE_ORDER = ['screening', 'assessment', 'interview', 'offer', 'hired'];

/**
 * Advance selected resumes to the next pipeline stage.
 * Also sends email notifications to the advanced candidates.
 *
 * Body: { resumeIds: string[], targetStage: string }
 */
export async function advanceCandidates(req, res) {
  try {
    const { resumeIds, targetStage } = req.body;
    if (!Array.isArray(resumeIds) || resumeIds.length === 0) {
      return res.status(400).json({ message: 'resumeIds array is required' });
    }
    if (!STAGE_ORDER.includes(targetStage)) {
      return res.status(400).json({ message: `Invalid targetStage. Must be one of: ${STAGE_ORDER.join(', ')}` });
    }

    // Fetch the resumes with populated candidate info
    const resumes = await Resume.find({ _id: { $in: resumeIds }, isDeleted: false })
      .populate('candidateId', 'name email candidateId')
      .populate('jobId', 'title');

    if (resumes.length === 0) {
      return res.status(404).json({ message: 'No resumes found' });
    }

    // Update pipeline stage
    await Resume.updateMany(
      { _id: { $in: resumeIds }, isDeleted: false },
      { $set: { pipelineStage: targetStage } }
    );

    // Collect candidate info for email notifications
    const jobTitle = resumes[0]?.jobId?.title || 'the position';
    const candidates = [];
    for (const r of resumes) {
      const c = r.candidateId;
      if (c && typeof c === 'object' && c.email) {
        candidates.push({ email: c.email, name: c.name || '' });
      }
    }

    // Send emails (best-effort)
    let emailResults = [];
    if (candidates.length > 0) {
      try {
        emailResults = await sendBatchStageEmails(candidates, jobTitle, targetStage);
      } catch (emailErr) {
        console.error('Batch email error:', emailErr.message);
      }
    }

    return res.json({
      message: `Advanced ${resumes.length} candidate(s) to "${targetStage}"`,
      advanced: resumes.length,
      emailsSent: emailResults.filter(e => e.sent || e.logged).length
    });
  } catch (err) {
    console.error('Advance candidates error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'Failed to advance candidates' });
  }
}

/**
 * List resumes by job and pipeline stage (with enriched candidate info).
 */
export async function listResumesByStage(req, res) {
  try {
    const { jobId, stage } = req.params;
    if (!STAGE_ORDER.includes(stage) && stage !== 'rejected') {
      return res.status(400).json({ message: 'Invalid stage' });
    }

    const filter = { jobId, isDeleted: false, pipelineStage: stage };
    const resumes = await Resume.find(filter)
      .sort({ score: -1, createdAt: -1 })
      .populate('candidateId', 'name email candidateId highestQualificationDegree specialization cgpaOrPercentage passoutYear');

    const enriched = resumes.map(r => {
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
        obj.candidateId = candidate._id;
      }
      return obj;
    });

    return res.json(enriched);
  } catch (err) {
    console.error('List resumes by stage error', err);
    return res.status(500).json({ message: 'Failed to list resumes' });
  }
}

/**
 * Export candidates for a given job + stage to an Excel file.
 */
export async function exportStageToExcel(req, res) {
  try {
    const { jobId, stage } = req.params;

    const job = await JobOpening.findById(jobId);
    if (!job || job.isDeleted) return res.status(404).json({ message: 'Job not found' });

    const filter = { jobId, isDeleted: false };
    if (stage && stage !== 'all') {
      filter.pipelineStage = stage;
    }

    const resumes = await Resume.find(filter)
      .sort({ score: -1, createdAt: -1 })
      .populate('candidateId', 'name email candidateId highestQualificationDegree specialization cgpaOrPercentage passoutYear');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AutoHire';
    workbook.created = new Date();

    const stageLabel = stage === 'all' ? 'All Stages' : stage.charAt(0).toUpperCase() + stage.slice(1);
    const sheet = workbook.addWorksheet(`${stageLabel} - ${job.title}`.substring(0, 31));

    sheet.columns = [
      { header: 'S.No', key: 'sno', width: 6 },
      { header: 'Candidate ID', key: 'candidateId', width: 14 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Highest Qualification', key: 'qualification', width: 22 },
      { header: 'Specialization', key: 'specialization', width: 20 },
      { header: 'CGPA / %', key: 'cgpa', width: 12 },
      { header: 'Passout Year', key: 'passoutYear', width: 14 },
      { header: 'Profile Score', key: 'score', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Pipeline Stage', key: 'pipelineStage', width: 16 },
      { header: 'Applied On', key: 'appliedOn', width: 20 }
    ];

    // Style header row
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A66C2' } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

    if (resumes.length === 0) {
      sheet.addRow({
        sno: '',
        candidateId: '',
        name: '',
        email: '',
        qualification: '',
        specialization: '',
        cgpa: '',
        passoutYear: '',
        score: '',
        status: '',
        pipelineStage: '',
        appliedOn: 'No candidates found for this stage.'
      });
      console.log('[Excel Export] No candidates found. Filter:', filter);
    } else {
      resumes.forEach((r, idx) => {
        const candidate = r.candidateId;
        sheet.addRow({
          sno: idx + 1,
          candidateId: (candidate && typeof candidate === 'object' ? candidate.candidateId : '') || '',
          name: (candidate && typeof candidate === 'object' ? candidate.name : '') || '',
          email: (candidate && typeof candidate === 'object' ? candidate.email : '') || '',
          qualification: (candidate && typeof candidate === 'object' ? candidate.highestQualificationDegree : '') || '',
          specialization: (candidate && typeof candidate === 'object' ? candidate.specialization : '') || '',
          cgpa: (candidate && typeof candidate === 'object' ? candidate.cgpaOrPercentage : '') || '',
          passoutYear: (candidate && typeof candidate === 'object' ? candidate.passoutYear : '') || '',
          score: r.score !== undefined && r.score !== null ? r.score : '',
          status: r.status || '',
          pipelineStage: r.pipelineStage || 'screening',
          appliedOn: r.createdAt ? new Date(r.createdAt).toLocaleString() : ''
        });
      });
      console.log(`[Excel Export] Exported ${resumes.length} candidates. Filter:`, filter);
    }

    const fileName = `${job.title.replace(/[^a-zA-Z0-9 ]/g, '')}_${stageLabel}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export to Excel error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'Failed to export' });
  }
}
