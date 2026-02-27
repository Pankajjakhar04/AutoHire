import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import Resume from '../models/Resume.js';
import JobOpening from '../models/JobOpening.js';
import User from '../models/User.js';
import { sendApplicationConfirmation, sendBatchStageEmails } from '../services/email.js';
import { extractResumeTextFromBuffer, readFileToBuffer } from '../services/resumeText.js';
import { createRun, getRun, updateRun, markRunCompleted, markRunFailed } from '../services/aiScreenRunStore.js';
import { addResumeToML, initializeMLJob, clearMLJobResumes } from "../services/aiScreening.js";
import { getMLScreeningResults } from "../services/mlScreening.js";
import { validateResumeText, validateObjectId, sanitizeFileName } from '../utils/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// =============================================================================
// GCS LOADER
// =============================================================================

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

// =============================================================================
// HELPERS
// =============================================================================

function canManageResume(user, resume) {
  if (!user) return false;
  if (user.role === 'recruiterAdmin' || user.role === 'hrManager') return true;
  const resumeCandidateId = resume.candidateId?.toString();
  const userId = user.id?.toString();
  console.log(`[Permission Check] User ID: ${userId}, Resume Candidate ID: ${resumeCandidateId}`);
  return resumeCandidateId === userId;
}

/**
 * Extract resume text from local file or GCS.
 * Caches result to resume.extractedText in DB.
 */
async function extractTextForResume(resume) {
  if (resume.extractedText && resume.extractedText.length > 50) {
    return resume.extractedText;
  }

  let resumeText = '';
  try {
    if (resume.filePath) {
      const absPath = path.resolve(__dirname, '../..', resume.filePath);
      const buf = readFileToBuffer(absPath);
      resumeText = await extractResumeTextFromBuffer({
        buffer: buf,
        mimeType: resume.mimeType,
        originalName: resume.originalName || resume.fileName
      });
    } else if (resume.gcsBucket && resume.gcsObjectName) {
      const gcs = await getGCS();
      if (gcs) {
        const chunks = [];
        const stream = gcs.downloadFromGCS({
          bucketName: resume.gcsBucket,
          objectName: resume.gcsObjectName
        });
        await new Promise((resolve, reject) => {
          stream.on('data', (d) => chunks.push(d));
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        resumeText = await extractResumeTextFromBuffer({
          buffer: Buffer.concat(chunks),
          mimeType: resume.mimeType,
          originalName: resume.originalName || resume.fileName
        });
      }
    }

    if (resumeText && resumeText.length > 50) {
      await Resume.findByIdAndUpdate(resume._id, { $set: { extractedText: resumeText } });
    }
  } catch (err) {
    console.warn(`[Text Extraction] Failed for resume ${resume._id}:`, err?.message);
  }

  return resumeText;
}

/**
 * Enrich a resume mongoose doc with candidate profile fields for API responses.
 */
function enrichResume(r) {
  const obj = r.toJSON();
  const candidate = r.candidateId;
  if (candidate && typeof candidate === 'object') {
    obj.candidateName        = candidate.name                       || '';
    obj.candidateEmail       = candidate.email                      || '';
    obj.candidateUniqueId    = candidate.candidateId                || '';
    obj.highestQualification = candidate.highestQualificationDegree || '';
    obj.specialization       = candidate.specialization             || '';
    obj.cgpa                 = candidate.cgpaOrPercentage           || '';
    obj.passoutYear          = candidate.passoutYear                || '';
    obj.candidateId          = candidate._id;
  }
  return obj;
}

const CANDIDATE_POPULATE = 'name email candidateId highestQualificationDegree specialization cgpaOrPercentage passoutYear';

// =============================================================================
// UPLOAD
// =============================================================================

export async function uploadResume(req, res) {
  try {
    const { jobId } = req.body;

    const jobIdValidation = validateObjectId(jobId);
    if (!jobIdValidation.valid) {
      return res.status(400).json({ message: jobIdValidation.error });
    }

    if (!req.file) return res.status(400).json({ message: 'File is required' });

    const fileNameValidation = sanitizeFileName(req.file.originalname);
    if (!fileNameValidation.valid) {
      return res.status(400).json({ message: fileNameValidation.error });
    }

    const job = await JobOpening.findById(jobId);
    if (!job || job.isDeleted) return res.status(404).json({ message: 'Job not found' });

    const safeName   = fileNameValidation.sanitizedFileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const uniqueName = `${Date.now()}-${safeName}`;

    const candidate = await User.findById(req.user.id);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    const gcs        = await getGCS();
    const bucketName = process.env.GCP_BUCKET;
    let resumeData;

    if (gcs && bucketName) {
      const objectName = `resumes/${jobId}/${uniqueName}`;
      await gcs.uploadToGCS({
        bucketName,
        objectName,
        buffer: req.file.buffer,
        contentType: req.file.mimetype
      });
      resumeData = {
        candidateId:   req.user.id,
        candidateName: candidate.name || 'Unknown Candidate',
        email:         candidate.email,
        jobId,
        fileName:      safeName,
        originalName:  req.file.originalname,
        gcsBucket:     bucketName,
        gcsObjectName: objectName,
        fileSize:      req.file.size,
        mimeType:      req.file.mimetype,
        status:        'uploaded'
      };
    } else {
      const jobDir = path.join(UPLOADS_DIR, jobId);
      if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });
      const filePath = path.join(jobDir, uniqueName);
      fs.writeFileSync(filePath, req.file.buffer);
      resumeData = {
        candidateId:   req.user.id,
        candidateName: candidate.name || 'Unknown Candidate',
        email:         candidate.email,
        jobId,
        fileName:     safeName,
        originalName: req.file.originalname,
        filePath:     `uploads/${jobId}/${uniqueName}`,
        fileSize:     req.file.size,
        mimeType:     req.file.mimetype,
        status:       'uploaded'
      };
    }

    const resume = await Resume.create(resumeData);

    // -------------------------------------------------------------------------
    // Background: extract text then add to ML (ONCE, at upload time).
    // resume._id.toString() is sent as resume_id so ML can track it.
    // Never re-upload in startAiScreenRun — duplicates break index matching.
    // -------------------------------------------------------------------------
    (async () => {
      try {
        const extractedText = await extractResumeTextFromBuffer({
          buffer:       req.file.buffer,
          mimeType:     req.file.mimetype,
          originalName: req.file.originalname
        });

        const textValidation = validateResumeText(extractedText);
        if (textValidation.valid) {
          await Resume.findByIdAndUpdate(resume._id, {
            $set: { extractedText: textValidation.sanitizedText }
          });

          if (job.mlCompanyId && job.mlJobId) {
            try {
              await addResumeToML({
                mlCompanyId: job.mlCompanyId,
                mlJobId:     job.mlJobId,
                resumeText:  textValidation.sanitizedText,
                resumeId:    resume._id.toString()   // CRITICAL: DB _id as resume_id
              });
              console.log(`[ML] Resume ${resume._id} added to ML at upload time`);
            } catch (mlErr) {
              console.warn(`[ML] Failed to add resume ${resume._id}:`, mlErr.message);
            }
          }
        } else {
          console.warn(`[ResumeText] Invalid text for resume ${resume._id}: ${textValidation.error}`);
          await Resume.findByIdAndUpdate(resume._id, {
            $set: { mlError: textValidation.error }
          });
        }
      } catch (e) {
        console.warn('[ResumeText] Extraction failed:', e?.message || e);
        await Resume.findByIdAndUpdate(resume._id, {
          $set: { mlError: 'Text extraction failed' }
        });
      }
    })();

    // Best-effort confirmation email
    (async () => {
      try {
        const candidate = await User.findById(req.user.id);
        if (candidate?.email) {
          await sendApplicationConfirmation({
            to:            candidate.email,
            candidateName: candidate.name || 'Candidate',
            jobTitle:      job.title,
            jobId:         job._id.toString()
          });
        }
      } catch (emailErr) {
        console.error('[Email] Confirmation failed:', emailErr.message || emailErr);
      }
    })();

    return res.status(201).json(resume);
  } catch (err) {
    console.error('Upload resume error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'Failed to upload resume' });
  }
}

// =============================================================================
// LIST / GET / DOWNLOAD / DELETE
// =============================================================================

export async function listResumesByJob(req, res) {
  try {
    const { jobId } = req.params;
    const resumes = await Resume.find({ jobId, isDeleted: false })
      .sort({ createdAt: -1 })
      .populate('candidateId', CANDIDATE_POPULATE);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    return res.json(resumes.map(enrichResume));
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
    console.error('List my resumes by job error', err);
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

    if (resume.gcsBucket && resume.gcsObjectName) {
      const gcs = await getGCS();
      if (!gcs) return res.status(500).json({ message: 'GCS not configured' });
      const stream = gcs.downloadFromGCS({ bucketName: resume.gcsBucket, objectName: resume.gcsObjectName });
      res.setHeader('Content-Type', resume.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(resume.originalName || resume.fileName)}"`);
      return stream.pipe(res);
    }

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

export async function withdrawApplication(req, res) {
  try {
    const { id } = req.params;

    const idValidation = validateObjectId(id);
    if (!idValidation.valid) {
      return res.status(400).json({ message: idValidation.error });
    }

    const resume = await Resume.findOne({ _id: id, isDeleted: false });
    if (!resume) {
      return res.status(404).json({ message: 'Application not found' });
    }

    if (!canManageResume(req.user, resume)) {
      console.warn(`[Withdraw] Permission denied - User ID: ${req.user.id}, Resume Candidate ID: ${resume.candidateId}`);
      return res.status(403).json({ message: 'You can only withdraw your own application' });
    }

    resume.isDeleted = true;
    resume.status = 'withdrawn';
    await resume.save();

    if (resume.gcsBucket && resume.gcsObjectName) {
      try {
        const gcs = await getGCS();
        if (gcs) await gcs.deleteFromGCS({ bucketName: resume.gcsBucket, objectName: resume.gcsObjectName });
      } catch (err) {
        console.error('GCS delete error during withdraw:', err.message);
      }
    }

    if (resume.filePath) {
      try {
        const absPath = path.resolve(__dirname, '../..', resume.filePath);
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
      } catch (err) {
        console.error('Local file delete error during withdraw:', err.message);
      }
    }

    console.log(`[Withdraw] Application withdrawn successfully - Resume ID: ${id}, User ID: ${req.user.id}`);

    return res.json({
      message: 'Application withdrawn successfully',
      applicationId: id
    });

  } catch (err) {
    console.error('Withdraw application error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'Failed to withdraw application' });
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
        const gcs = await getGCS();
        if (gcs) await gcs.deleteFromGCS({ bucketName: resume.gcsBucket, objectName: resume.gcsObjectName });
      } catch (err) { console.error('GCS delete error', err.message); }
    }

    if (resume.filePath) {
      try {
        const absPath = path.resolve(__dirname, '../..', resume.filePath);
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
      } catch (err) { console.error('Local file delete error', err.message); }
    }

    return res.json({ message: 'Resume deleted' });
  } catch (err) {
    console.error('Delete resume error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'Failed to delete resume' });
  }
}

// =============================================================================
// MANUAL SCREENING (bulk HR action)
// =============================================================================

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

    const updateFields = { status };
    if (status === 'screened-out') updateFields.pipelineStage = 'screening';

    const result = await Resume.updateMany(
      { _id: { $in: resumeIds }, isDeleted: false },
      { $set: updateFields }
    );

    return res.json({
      message: `Updated ${result.modifiedCount} resume(s) to "${status}"`,
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    console.error('Screen resumes error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'Failed to update resume status' });
  }
}

// =============================================================================
// AI SCREEN — synchronous legacy endpoint
// =============================================================================

export async function aiScreenResumes(req, res) {
  try {
    const { jobId, resumeIds } = req.body;
    if (!jobId) return res.status(400).json({ message: 'jobId is required' });

    const job = await JobOpening.findById(jobId);
    if (!job || job.isDeleted) return res.status(404).json({ message: 'Job not found' });

    if (!job.mlCompanyId || !job.mlJobId) {
      return res.status(400).json({ message: 'ML job not initialized. Run initialize-ml first.' });
    }

    const filter = { jobId, isDeleted: false };
    if (Array.isArray(resumeIds) && resumeIds.length > 0) filter._id = { $in: resumeIds };

    const resumes = await Resume.find(filter).sort({ createdAt: 1 });
    if (!resumes.length) return res.status(404).json({ message: 'No resumes found to screen' });

    // Index any resumes not yet added to ML
    console.log(`[aiScreenResumes] Ensuring all resumes are indexed in ML...`);
    let indexedCount = 0;
    for (const resume of resumes) {
      if (!resume.mlProcessed && resume.extractedText) {
        try {
          await addResumeToML({
            mlCompanyId: job.mlCompanyId,
            mlJobId:     job.mlJobId,
            resumeText:  resume.extractedText,
            resumeId:    resume._id.toString()
          });
          indexedCount++;
        } catch (indexErr) {
          console.warn(`[aiScreenResumes] Failed to index resume ${resume._id}:`, indexErr.message);
        }
      }
    }
    if (indexedCount > 0) {
      console.log(`[aiScreenResumes] Indexed ${indexedCount} pending resumes`);
    }

    let mlResults = [];
    try {
      mlResults = await getMLScreeningResults(job.mlCompanyId, job.mlJobId);
      console.log(`[aiScreenResumes] Got ${mlResults.length} ML results`);
    } catch (mlErr) {
      console.error('[aiScreenResumes] ML fetch failed:', mlErr.message);
      return res.status(502).json({ message: 'ML ranking failed', error: mlErr.message });
    }

    // Build a fast lookup map: resume_id (string) → resume doc
    const resumeMap = new Map(resumes.map(r => [r._id.toString(), r]));

    const results = [];

    for (const mlResult of mlResults) {
      // PRIMARY: match by resume_id (DB _id we sent at upload time)
      let resume = mlResult.resume_id ? resumeMap.get(mlResult.resume_id.toString()) : null;

      // FALLBACK: positional index match
      if (!resume && mlResult.resumeIndex !== undefined) {
        resume = resumes[mlResult.resumeIndex];
        if (resume) {
          console.log(`[aiScreenResumes] Fallback index match: index ${mlResult.resumeIndex} → ${resume._id}`);
        }
      }

      if (!resume) {
        console.warn(`[aiScreenResumes] No resume matched for ML result`, {
          resume_id: mlResult.resume_id,
          resumeIndex: mlResult.resumeIndex
        });
        continue;
      }

      let aiScore = Math.min(100, Math.max(0, mlResult.totalScore ?? 0));
      if (isNaN(aiScore)) aiScore = 0;

      try {
        await Resume.findByIdAndUpdate(resume._id, {
          $set: {
            aiScore,
            score:           aiScore,
            mlProcessed:     true,
            semanticScore:   mlResult.semanticScore   ?? null,
            skillMatchScore: mlResult.skillScore      ?? null,
            experienceScore: mlResult.experienceScore ?? null,
            metricsScore:    mlResult.metricsScore    ?? null,
            complexityScore: mlResult.complexityScore ?? null,
            matchedSkills:   Array.isArray(mlResult.matchedSkills) ? mlResult.matchedSkills : [],
            missingSkills:   Array.isArray(mlResult.missingSkills) ? mlResult.missingSkills : [],
            mlError:         null
          }
        }, { new: true });
        console.log(`[aiScreenResumes] Resume ${resume._id} scored: ${aiScore}`);
      } catch (updateErr) {
        console.error(`[aiScreenResumes] Error updating resume ${resume._id}:`, updateErr.message);
      }

      results.push({ resumeId: resume._id, aiScore });
    }

    return res.json({
      message: `AI scoring complete for ${results.length} resumes`,
      total:   results.length,
      results
    });
  } catch (err) {
    console.error('aiScreenResumes error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'AI screening failed' });
  }
}

// =============================================================================
// START AI SCREEN RUN — async background run
//
// KEY RULES:
//   1. Do NOT re-upload resumes to ML here.
//      Resumes are added to ML exactly once at upload time (in uploadResume).
//
//   2. Match by mlResult.resume_id (PRIMARY) — the DB _id we sent at upload.
//      Fall back to resumeIndex only if resume_id match fails.
//
//   3. Build a Map for O(1) resume lookups — avoids wrong index matches when
//      ML returns stale results from previous runs.
//
//   4. Save only aiScore + ML breakdown fields. No threshold, no status mutation.
// =============================================================================

export async function startAiScreenRun(req, res) {
  try {
    const { jobId, resumeIds } = req.body;
    if (!jobId) return res.status(400).json({ message: 'jobId is required' });

    const job = await JobOpening.findById(jobId);
    if (!job || job.isDeleted) return res.status(404).json({ message: 'Job not found' });

    // Auto-initialize ML if not already done
    if (!job.mlCompanyId || !job.mlJobId) {
      try {
        console.log(`[AI Screening] Auto-initializing ML for job: ${job.title}`);
        const mlData = await initializeMLJob({ job });
        job.mlCompanyId = mlData.mlCompanyId;
        job.mlJobId     = mlData.mlJobId;
        await job.save();
        console.log(`[AI Screening] ML initialized: companyId=${job.mlCompanyId} jobId=${job.mlJobId}`);
      } catch (mlErr) {
        console.error('[AI Screening] ML initialization failed:', mlErr.message);
        return res.status(500).json({ message: 'Failed to initialize ML for this job. Please try again.' });
      }
    }

    const filter = { jobId, isDeleted: false };
    if (Array.isArray(resumeIds) && resumeIds.length > 0) filter._id = { $in: resumeIds };

    const resumes = await Resume.find(filter).sort({ createdAt: 1 });
    if (!resumes.length) return res.status(404).json({ message: 'No resumes found to screen' });

    const run = await createRun({ jobId, total: resumes.length });
    console.log(`[AI Screening] Started run ${run._id} for ${resumes.length} resumes`);

    // Respond immediately — client polls progress
    res.json({ runId: run._id, total: run.total });

    // -------------------------------------------------------------------------
    // Background processing
    // -------------------------------------------------------------------------
    (async () => {
      try {
        // Step 1: Clear stale resumes from ML DB before re-indexing
        // This prevents old embeddings from previous runs corrupting scores
        console.log(`[AI Screening] Run ${run._id}: Clearing stale ML resumes...`);
        await clearMLJobResumes({ mlCompanyId: job.mlCompanyId, mlJobId: job.mlJobId });

        // Step 2: Re-index ALL resumes for this job fresh
        // Reset mlProcessed flag so all resumes get re-uploaded cleanly
        let indexedCount = 0;
        for (const resume of resumes) {
          // Re-upload every resume since we cleared the ML DB above
          if (resume.extractedText) {
            try {
              await addResumeToML({
                mlCompanyId: job.mlCompanyId,
                mlJobId:     job.mlJobId,
                resumeText:  resume.extractedText,
                resumeId:    resume._id.toString()   // MongoDB _id as resume_id
              });
              indexedCount++;
              console.log(`[AI Screening] Run ${run._id}: Indexed resume ${resume._id}`);
            } catch (indexErr) {
              console.warn(`[AI Screening] Run ${run._id}: Failed to index resume ${resume._id}:`, indexErr.message);
            }
          } else {
            console.warn(`[AI Screening] Run ${run._id}: Resume ${resume._id} has no extractedText — skipping`);
          }
        }
        if (indexedCount > 0) {
          console.log(`[AI Screening] Run ${run._id}: Indexed ${indexedCount} pending resumes`);
        }

        // Step 2: Fetch ML ranking results
        let mlResults = [];
        try {
          mlResults = await getMLScreeningResults(job.mlCompanyId, job.mlJobId);
          console.log(`[AI Screening] Run ${run._id}: received ${mlResults.length} ML results`);
        } catch (mlErr) {
          console.error(`[AI Screening] Run ${run._id}: ML fetch failed:`, mlErr.message);
          await markRunFailed(run._id, `ML results fetch failed: ${mlErr.message}`);
          return;
        }

        if (!mlResults.length) {
          await markRunFailed(run._id, 'ML returned no results. Resumes may not have been indexed yet.');
          return;
        }

        // Step 3: Build O(1) lookup map — resume_id (string) → resume doc
        // FIX: This prevents wrong matches when ML has stale resumes from old runs
        const resumeMap = new Map(resumes.map(r => [r._id.toString(), r]));

        let processed = 0;

        for (const mlResult of mlResults) {
          let resume = null;

          // PRIMARY: match by resume_id — the DB _id we sent at upload time
          if (mlResult.resume_id) {
            resume = resumeMap.get(mlResult.resume_id.toString());
            console.log(`[AI Screening] Resume ID match: ${mlResult.resume_id} → ${resume ? resume._id : 'NOT FOUND'}`);
          }

          // FALLBACK: positional index (only for this run's resumes)
          // FIX: only use if resume_id match failed AND index is within current run's bounds
          if (!resume && mlResult.resumeIndex !== undefined && mlResult.resumeIndex < resumes.length) {
            resume = resumes[mlResult.resumeIndex];
            console.log(`[AI Screening] Index fallback: index ${mlResult.resumeIndex} → ${resume ? resume._id : 'NOT FOUND'}`);
          }

          // Skip if ML result belongs to a different run (stale data)
          if (!resume) {
            console.warn(`[AI Screening] Run ${run._id}: Skipping stale ML result`, {
              resume_id:   mlResult.resume_id,
              resumeIndex: mlResult.resumeIndex,
              currentRunResumes: resumes.length
            });
            continue;
          }

          // Score validation
          let aiScore = Math.min(100, Math.max(0, mlResult.totalScore ?? 0));
          if (isNaN(aiScore)) aiScore = 0;

          // Update resume with ML results
          try {
            const updateResult = await Resume.findByIdAndUpdate(resume._id, {
              $set: {
                aiScore,
                score:           aiScore,
                mlProcessed:     true,
                mlProcessedAt:   new Date(),
                semanticScore:   mlResult.semanticScore   ?? null,
                skillMatchScore: mlResult.skillScore      ?? null,
                experienceScore: mlResult.experienceScore ?? null,
                metricsScore:    mlResult.metricsScore    ?? null,
                complexityScore: mlResult.complexityScore ?? null,
                matchedSkills:   Array.isArray(mlResult.matchedSkills) ? mlResult.matchedSkills : [],
                missingSkills:   Array.isArray(mlResult.missingSkills) ? mlResult.missingSkills : [],
                mlError:         null
              }
            }, { new: true });

            if (!updateResult) {
              console.error(`[AI Screening] Run ${run._id}: Failed to update resume ${resume._id} - not found`);
            } else {
              const verified = await Resume.findById(resume._id).lean();
              console.log(`[AI Screening] Run ${run._id}: Resume ${resume._id} (${resume.candidateName || 'Unknown'}) scored: ${aiScore}. Verified in DB: ${verified?.aiScore}`);
              console.log(`[AI Screening] Score breakdown:`, {
                total:      mlResult.totalScore,
                semantic:   mlResult.semanticScore,
                skill:      mlResult.skillScore,
                experience: mlResult.experienceScore,
                metrics:    mlResult.metricsScore,
                complexity: mlResult.complexityScore
              });
            }
          } catch (updateErr) {
            console.error(`[AI Screening] Run ${run._id}: Error updating resume ${resume._id}:`, updateErr.message);
          }

          processed += 1;

          if (processed % 5 === 0 || processed === mlResults.length) {
            await updateRun(run._id, { processed });
          }
        }

        await markRunCompleted(run._id);
        console.log(`[AI Screening] Run ${run._id} complete. Scored ${processed}/${resumes.length} resumes.`);

      } catch (e) {
        console.error(`[AI Screening] Run ${run._id} failed:`, e?.message || e);
        await markRunFailed(run._id, e?.message || String(e));
      }
    })();

  } catch (err) {
    console.error('startAiScreenRun error', err?.message || err);
    return res.status(500).json({ message: 'Failed to start AI screening' });
  }
}

// =============================================================================
// PROGRESS POLLING
// =============================================================================

export async function getAiScreenRunProgress(req, res) {
  try {
    const run = await getRun(req.params.runId);
    if (!run) return res.status(404).json({ message: 'Run not found' });

    const processed = Number(run.processed) || 0;
    const total     = Number(run.total)     || 0;
    const percent   = total > 0 ? Math.round((processed / total) * 100) : 0;

    return res.json({
      runId:     run._id,
      jobId:     run.jobId,
      total,
      processed,
      percent,
      status:    run.status,
      done:      run.status === 'completed' || run.status === 'failed',
      error:     run.error || null
    });
  } catch (err) {
    console.error('getAiScreenRunProgress error', err);
    return res.status(500).json({ message: 'Failed to get run progress' });
  }
}

// =============================================================================
// PIPELINE — ADVANCE CANDIDATES
// =============================================================================

const STAGE_ORDER = ['screening', 'assessment', 'interview', 'offer', 'hired'];

export async function advanceCandidates(req, res) {
  try {
    const { resumeIds, targetStage } = req.body;
    if (!Array.isArray(resumeIds) || resumeIds.length === 0) {
      return res.status(400).json({ message: 'resumeIds array is required' });
    }
    if (!STAGE_ORDER.includes(targetStage)) {
      return res.status(400).json({ message: `Invalid targetStage. Must be one of: ${STAGE_ORDER.join(', ')}` });
    }

    const resumes = await Resume.find({ _id: { $in: resumeIds }, isDeleted: false })
      .populate('candidateId', 'name email candidateId')
      .populate('jobId', 'title');

    if (!resumes.length) return res.status(404).json({ message: 'No resumes found' });

    await Resume.updateMany(
      { _id: { $in: resumeIds }, isDeleted: false },
      { $set: { pipelineStage: targetStage } }
    );

    const jobTitle   = resumes[0]?.jobId?.title || 'the position';
    const candidates = resumes
      .map(r => r.candidateId)
      .filter(c => c && typeof c === 'object' && c.email)
      .map(c => ({ email: c.email, name: c.name || '' }));

    let emailResults = [];
    if (candidates.length > 0) {
      try {
        emailResults = await sendBatchStageEmails(candidates, jobTitle, targetStage);
      } catch (emailErr) {
        console.error('Batch email error:', emailErr.message);
      }
    }

    return res.json({
      message:    `Advanced ${resumes.length} candidate(s) to "${targetStage}"`,
      advanced:   resumes.length,
      emailsSent: emailResults.filter(e => e.sent || e.logged).length
    });
  } catch (err) {
    console.error('Advance candidates error', err?.message || err);
    return res.status(500).json({ message: err?.message || 'Failed to advance candidates' });
  }
}

// =============================================================================
// LIST BY STAGE
// =============================================================================

export async function listResumesByStage(req, res) {
  try {
    const { jobId, stage } = req.params;
    if (!STAGE_ORDER.includes(stage) && stage !== 'rejected') {
      return res.status(400).json({ message: 'Invalid stage' });
    }

    const resumes = await Resume.find({ jobId, isDeleted: false, pipelineStage: stage })
      .sort({ aiScore: -1, createdAt: -1 })
      .populate('candidateId', CANDIDATE_POPULATE);

    return res.json(resumes.map(enrichResume));
  } catch (err) {
    console.error('List resumes by stage error', err);
    return res.status(500).json({ message: 'Failed to list resumes' });
  }
}

// =============================================================================
// EXPORT TO EXCEL
// =============================================================================

export async function exportStageToExcel(req, res) {
  try {
    const { jobId, stage } = req.params;

    const job = await JobOpening.findById(jobId);
    if (!job || job.isDeleted) return res.status(404).json({ message: 'Job not found' });

    const filter = { jobId, isDeleted: false };
    if (stage && stage !== 'all') filter.pipelineStage = stage;

    const resumes = await Resume.find(filter)
      .sort({ aiScore: -1, createdAt: -1 })
      .populate('candidateId', CANDIDATE_POPULATE);

    const workbook   = new ExcelJS.Workbook();
    workbook.creator = 'AutoHire';
    workbook.created = new Date();

    const stageLabel = stage === 'all'
      ? 'All Stages'
      : stage.charAt(0).toUpperCase() + stage.slice(1);

    const sheet = workbook.addWorksheet(`${stageLabel} - ${job.title}`.substring(0, 31));

    sheet.columns = [
      { header: 'S.No',                  key: 'sno',            width: 6  },
      { header: 'Candidate ID',          key: 'candidateId',    width: 14 },
      { header: 'Name',                  key: 'name',           width: 22 },
      { header: 'Email',                 key: 'email',          width: 28 },
      { header: 'Highest Qualification', key: 'qualification',  width: 22 },
      { header: 'Specialization',        key: 'specialization', width: 20 },
      { header: 'CGPA / %',              key: 'cgpa',           width: 12 },
      { header: 'Passout Year',          key: 'passoutYear',    width: 14 },
      { header: 'AI Score',              key: 'aiScore',        width: 12 },
      { header: 'Semantic Score',        key: 'semanticScore',  width: 14 },
      { header: 'Skill Score',           key: 'skillScore',     width: 12 },
      { header: 'Experience Score',      key: 'experienceScore',width: 14 },
      { header: 'Pipeline Stage',        key: 'pipelineStage',  width: 16 },
      { header: 'Applied On',            key: 'appliedOn',      width: 20 }
    ];

    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A66C2' } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

    if (!resumes.length) {
      sheet.addRow({ appliedOn: 'No candidates found for this stage.' });
    } else {
      resumes.forEach((r, idx) => {
        const c = r.candidateId;
        sheet.addRow({
          sno:            idx + 1,
          candidateId:    c?.candidateId                || '',
          name:           c?.name                       || '',
          email:          c?.email                      || '',
          qualification:  c?.highestQualificationDegree || '',
          specialization: c?.specialization             || '',
          cgpa:           c?.cgpaOrPercentage           || '',
          passoutYear:    c?.passoutYear                || '',
          aiScore:        r.aiScore        ?? '',
          semanticScore:  r.semanticScore  ?? '',
          skillScore:     r.skillScore     ?? '',
          experienceScore:r.experienceScore ?? '',
          pipelineStage:  r.pipelineStage  || 'screening',
          appliedOn:      r.createdAt ? new Date(r.createdAt).toLocaleString() : ''
        });
      });
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

// =============================================================================
// DYNAMIC FILTERING
// =============================================================================

export async function getFilteredCandidates(req, res) {
  try {
    const { jobId } = req.params;
    const {
      targetScore,
      minScore,
      maxScore,
      status,
      pipelineStage,
      skill,
      sortBy = 'aiScore',
      sortOrder = 'desc',
      page = 1,
      limit = 50
    } = req.query;

    console.log(`[Dynamic Filter] Filtering candidates for job: ${jobId}`, {
      targetScore, minScore, maxScore, status, pipelineStage, skill, sortBy, sortOrder, page, limit
    });

    const filter = { job: jobId, isDeleted: false };

    if (targetScore) {
      filter.aiScore = { $gte: parseFloat(targetScore) };
    } else if (minScore || maxScore) {
      filter.aiScore = {};
      if (minScore) filter.aiScore.$gte = parseFloat(minScore);
      if (maxScore) filter.aiScore.$lte = parseFloat(maxScore);
    }

    if (status)        filter.status        = status;
    if (pipelineStage) filter.pipelineStage = pipelineStage;
    if (skill)         filter.matchedSkills = { $in: [skill] };

    filter.mlProcessed = true;

    const sortOptions = {};
    const validSortFields = ['aiScore', 'semanticScore', 'skillMatchScore', 'experienceScore', 'createdAt', 'candidateName'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'aiScore';
    sortOptions[sortField] = sortOrder === 'asc' ? 1 : -1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [candidates, total] = await Promise.all([
      Resume.find(filter)
        .populate('candidateId', 'firstName lastName email')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Resume.countDocuments(filter)
    ]);

    const job = await JobOpening.findById(jobId).select('title requiredSkills experienceYears').lean();

    const transformedCandidates = candidates.map(resume => {
      const candidate = resume.candidateId || {};
      return {
        id:              resume._id,
        candidateId:     resume.candidateId?._id,
        candidateName:   resume.candidateName || `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Unknown',
        email:           resume.email || candidate.email || '',
        fileName:        resume.fileName,
        resumeUrl:       resume.resumeUrl,
        aiScore:         resume.aiScore,
        semanticScore:   resume.semanticScore,
        skillMatchScore: resume.skillMatchScore,
        experienceScore: resume.experienceScore,
        metricsScore:    resume.metricsScore,
        complexityScore: resume.complexityScore,
        status:          resume.status,
        pipelineStage:   resume.pipelineStage,
        matchedSkills:   resume.matchedSkills || [],
        missingSkills:   resume.missingSkills || [],
        mlProcessed:     resume.mlProcessed,
        mlProcessedAt:   resume.mlProcessedAt,
        appliedOn:       resume.createdAt,
        extractedTextLength: resume.extractedText?.length || 0
      };
    });

    const stats = {
      total,
      page:    parseInt(page),
      limit:   parseInt(limit),
      pages:   Math.ceil(total / parseInt(limit)),
      scoreDistribution: {
        above90: candidates.filter(r => r.aiScore >= 90).length,
        above80: candidates.filter(r => r.aiScore >= 80 && r.aiScore < 90).length,
        above70: candidates.filter(r => r.aiScore >= 70 && r.aiScore < 80).length,
        below70: candidates.filter(r => r.aiScore < 70).length
      },
      pipelineDistribution: candidates.reduce((acc, r) => {
        acc[r.pipelineStage] = (acc[r.pipelineStage] || 0) + 1;
        return acc;
      }, {}),
      averageScore: candidates.length > 0
        ? (candidates.reduce((sum, r) => sum + (r.aiScore || 0), 0) / candidates.length).toFixed(2)
        : 0
    };

    console.log(`[Dynamic Filter] Returning ${candidates.length} / ${total} candidates`);

    return res.json({
      success: true,
      data: {
        candidates: transformedCandidates,
        job: {
          id:             job._id,
          title:          job.title,
          requiredSkills: job.requiredSkills || [],
          experienceYears:job.experienceYears
        },
        stats,
        filters: { targetScore, minScore, maxScore, status, pipelineStage, skill, sortBy, sortOrder }
      }
    });

  } catch (err) {
    console.error('[Dynamic Filter] Error:', err?.message || err);
    return res.status(500).json({
      success: false,
      message: 'Failed to filter candidates',
      error:   err?.message
    });
  }
}