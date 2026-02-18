import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import Resume from '../models/Resume.js';
import JobOpening from '../models/JobOpening.js';
import User from '../models/User.js';
import { sendApplicationConfirmation, sendBatchStageEmails } from '../services/email.js';
import { scoreResumeWithGemini } from '../services/aiScreening.js';
import { extractResumeTextFromBuffer, readFileToBuffer } from '../services/resumeText.js';
import { createRun, getRun, updateRun } from '../services/aiScreenRunStore.js';

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

    // Best-effort resume text extraction (for Gemini screening)
    (async () => {
      try {
        const extractedText = await extractResumeTextFromBuffer({
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          originalName: req.file.originalname
        });
        if (extractedText) {
          await Resume.findByIdAndUpdate(resume._id, { $set: { extractedText } });
        }
      } catch (e) {
        console.warn('[ResumeText] Extraction failed:', e?.message || e);
      }
    })();
    
    // Send application confirmation email (non-blocking)
    (async () => {
      try {
        const candidate = await User.findById(req.user.id);
        if (candidate && candidate.email) {
          await sendApplicationConfirmation({
            to: candidate.email,
            candidateName: candidate.name || 'Candidate',
            jobTitle: job.title,
            jobId: job._id.toString()
          });
        }
      } catch (emailErr) {
        // Log but don't fail the request if email fails
        console.error('[Email] Failed to send application confirmation:', emailErr?.message || emailErr);
      }
    })();
    
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
    const resumes = await Resume.find({ jobId, candidateId: req.user.id, isDeleted: false })
      .sort({ createdAt: -1 })
      .populate('jobId', 'jobCode title status location');
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
      .populate('jobId', 'jobCode title status location');
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

// AI-based screening: score candidates against job requirements (Gemini-powered)
export async function aiScreenResumes(req, res) {
  try {
    const { jobId, resumeIds, threshold = 50 } = req.body;
    if (!jobId) return res.status(400).json({ message: 'jobId is required' });
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ message: 'GEMINI_API_KEY is not configured on the server.' });
    }

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

    const results = [];

    for (const resume of resumes) {
      const candidate = candidateMap[resume.candidateId.toString()];
      if (!candidate) continue;

      const matchedSkills = [];
      const missingSkills = [];
      // Use any pre-parsed matched skills as hints
      if (resume.matchedSkills && resume.matchedSkills.length > 0) {
        resume.matchedSkills.forEach(s => {
          const lower = s.toLowerCase().trim();
          if (!matchedSkills.includes(lower)) matchedSkills.push(lower);
        });
      }

      let totalScore = 0;
      let fitLevel = 'Not Recommended';
      let redFlags = [];
      let strongSignals = [];
      let concerns = [];
      let scoringError = null;

      try {
        // Load or backfill extracted resume text if missing
        let resumeText = resume.extractedText || '';
        if (!resumeText) {
          console.log(`[AI Screening] No cached text for resume ${resume._id}, extracting...`);
          try {
            if (resume.filePath) {
              const absPath = path.resolve(__dirname, '../..', resume.filePath);
              const buf = readFileToBuffer(absPath);
              resumeText = await extractResumeTextFromBuffer({
                buffer: buf,
                mimeType: resume.mimeType,
                originalName: resume.originalName || resume.fileName
              });
              console.log(`[AI Screening] Extracted ${resumeText.length} chars from local file`);
            } else if (resume.gcsBucket && resume.gcsObjectName) {
              const gcs = await getGCS();
              if (gcs) {
                const chunks = [];
                const stream = gcs.downloadFromGCS({ bucketName: resume.gcsBucket, objectName: resume.gcsObjectName });
                await new Promise((resolve, reject) => {
                  stream.on('data', (d) => chunks.push(d));
                  stream.on('end', resolve);
                  stream.on('error', reject);
                });
                const buf = Buffer.concat(chunks);
                resumeText = await extractResumeTextFromBuffer({
                  buffer: buf,
                  mimeType: resume.mimeType,
                  originalName: resume.originalName || resume.fileName
                });
                console.log(`[AI Screening] Extracted ${resumeText.length} chars from GCS`);
              }
            }

            if (resumeText) {
              await Resume.findByIdAndUpdate(resume._id, { $set: { extractedText: resumeText } });
            }
          } catch (extractErr) {
            console.error('[AI Screening] Text extraction failed:', extractErr?.message || extractErr);
          }
        } else {
          console.log(`[AI Screening] Using cached text (${resumeText.length} chars) for resume ${resume._id}`);
        }

        if (!resumeText || resumeText.length < 50) {
          console.warn(`[AI Screening] Resume text too short or empty for ${resume._id}, using candidate profile only`);
        }

        console.log(`[AI Screening] Calling Gemini for resume ${resume._id}, candidate: ${candidate.name}`);
        const ai = await scoreResumeWithGemini({
          job,
          candidateProfile: candidate,
          resumeText
        });
        totalScore = ai.totalScore;
        fitLevel = ai.fitLevel;
        redFlags = ai.redFlags;
        strongSignals = ai.strongSignals;
        concerns = ai.concerns;
        console.log(`[AI Screening] Resume ${resume._id} scored: ${totalScore} (${fitLevel})`);
      } catch (err) {
        scoringError = err?.message || String(err);
        console.error('[AI Screening] Gemini scoring failed for resume', resume._id.toString(), scoringError);
        // Set a default score based on profile if AI fails
        totalScore = 0;
      }

      totalScore = Math.min(100, Math.max(0, totalScore));

      // Determine status based on threshold
      const status = totalScore >= threshold ? 'screened-in' : 'screened-out';

      // Update resume in DB
      await Resume.findByIdAndUpdate(resume._id, {
        $set: {
          score: totalScore,
          matchedSkills: [...new Set(matchedSkills)],
          missingSkills: [...new Set(missingSkills)],
          status
        }
      });

      results.push({
        resumeId: resume._id,
        candidateId: resume.candidateId,
        candidateName: candidate.name || '',
        score: totalScore,
        fitLevel,
        status,
        matchedSkills: [...new Set(matchedSkills)],
        missingSkills: [...new Set(missingSkills)],
        redFlags,
        strongSignals,
        concerns
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

// Async AI screening with progress reporting (HR/Recruiter only)
export async function startAiScreenRun(req, res) {
  try {
    const { jobId, resumeIds, threshold = 50 } = req.body;
    if (!jobId) return res.status(400).json({ message: 'jobId is required' });
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ message: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const job = await JobOpening.findById(jobId);
    if (!job || job.isDeleted) return res.status(404).json({ message: 'Job not found' });

    const filter = { jobId, isDeleted: false };
    if (Array.isArray(resumeIds) && resumeIds.length > 0) {
      filter._id = { $in: resumeIds };
    }
    const resumes = await Resume.find(filter);
    if (resumes.length === 0) return res.status(404).json({ message: 'No resumes found to screen' });

    const run = createRun({ jobId, total: resumes.length });

    console.log(`[AI Screening] Starting async run ${run.runId} for ${resumes.length} resumes, threshold: ${threshold}`);

    // Kick off background processing (best-effort)
    (async () => {
      try {
        // Candidate map
        const candidateIds = [...new Set(resumes.map(r => r.candidateId.toString()))];
        const candidates = await User.find({ _id: { $in: candidateIds } });
        const candidateMap = {};
        candidates.forEach(c => { candidateMap[c._id.toString()] = c; });

        let screenedIn = 0;
        let screenedOut = 0;
        let processed = 0;

        for (const resume of resumes) {
          const candidate = candidateMap[resume.candidateId.toString()];
          if (!candidate) {
            console.warn(`[AI Screening] No candidate found for resume ${resume._id}`);
            processed += 1;
            updateRun(run.runId, { processed, screenedIn, screenedOut });
            continue;
          }

          let resumeText = resume.extractedText || '';
          if (!resumeText) {
            console.log(`[AI Screening] Extracting text for resume ${resume._id}...`);
            try {
              if (resume.filePath) {
                const absPath = path.resolve(__dirname, '../..', resume.filePath);
                const buf = readFileToBuffer(absPath);
                resumeText = await extractResumeTextFromBuffer({
                  buffer: buf,
                  mimeType: resume.mimeType,
                  originalName: resume.originalName || resume.fileName
                });
                console.log(`[AI Screening] Extracted ${resumeText.length} chars from ${resume.fileName}`);
              } else if (resume.gcsBucket && resume.gcsObjectName) {
                const gcs = await getGCS();
                if (gcs) {
                  const chunks = [];
                  const stream = gcs.downloadFromGCS({ bucketName: resume.gcsBucket, objectName: resume.gcsObjectName });
                  await new Promise((resolve, reject) => {
                    stream.on('data', (d) => chunks.push(d));
                    stream.on('end', resolve);
                    stream.on('error', reject);
                  });
                  const buf = Buffer.concat(chunks);
                  resumeText = await extractResumeTextFromBuffer({
                    buffer: buf,
                    mimeType: resume.mimeType,
                    originalName: resume.originalName || resume.fileName
                  });
                  console.log(`[AI Screening] Extracted ${resumeText.length} chars from GCS`);
                }
              }
              if (resumeText) {
                await Resume.findByIdAndUpdate(resume._id, { $set: { extractedText: resumeText } });
              }
            } catch (extractErr) {
              console.error(`[AI Screening] Text extraction error for ${resume._id}:`, extractErr?.message);
            }
          }

          let totalScore = 0;
          try {
            console.log(`[AI Screening] Scoring resume ${resume._id} for ${candidate.name}...`);
            const ai = await scoreResumeWithGemini({ job, candidateProfile: candidate, resumeText });
            totalScore = Math.min(100, Math.max(0, ai.totalScore));
            console.log(`[AI Screening] Resume ${resume._id} scored: ${totalScore}`);
          } catch (e) {
            console.error(`[AI Screening] Scoring failed for ${resume._id}:`, e?.message || e);
            totalScore = 0;
          }

          const status = totalScore >= threshold ? 'screened-in' : 'screened-out';
          if (status === 'screened-in') screenedIn += 1;
          else screenedOut += 1;

          await Resume.findByIdAndUpdate(resume._id, { $set: { score: totalScore, status } });

          processed += 1;
          updateRun(run.runId, { processed, screenedIn, screenedOut });
        }

        console.log(`[AI Screening] Run ${run.runId} complete: ${screenedIn} in, ${screenedOut} out`);
        updateRun(run.runId, { done: true });
      } catch (e) {
        console.error(`[AI Screening] Run ${run.runId} failed:`, e?.message || e);
        updateRun(run.runId, { done: true, error: e?.message || String(e) });
      }
    })();

    return res.json({ runId: run.runId, total: run.total });
  } catch (err) {
    console.error('Start AI screen run error', err?.message || err);
    return res.status(500).json({ message: 'Failed to start AI screening' });
  }
}

export async function getAiScreenRunProgress(req, res) {
  const runId = req.params.runId;
  const run = getRun(runId);
  if (!run) return res.status(404).json({ message: 'Run not found' });

  const processed = Number(run.processed) || 0;
  const total = Number(run.total) || 0;
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  return res.json({
    runId: run.runId,
    jobId: run.jobId,
    total,
    processed,
    screenedIn: run.screenedIn || 0,
    screenedOut: run.screenedOut || 0,
    percent,
    done: Boolean(run.done),
    error: run.error || null
  });
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
