import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const ML_BASE_URL = process.env.ML_BASE_URL;
const ML_API_KEY = process.env.ML_API_KEY;

function getHeaders() {
  return {
    "x-api-key": ML_API_KEY
  };
}

function buildFullJobContext(job) {
  return `
JOB TITLE:
${job.title || ""}

OVERVIEW:
${job.description || ""}

ELIGIBILITY CRITERIA:
Minimum Education: ${job.minimumEducation || ""}
Minimum Experience: ${job.minimumExperience || ""}
Specialization / Stream: ${job.specialization || ""}
Academic Qualification: ${job.academicQualification || ""}

REQUIRED SKILLS:
${Array.isArray(job.requiredSkills) ? job.requiredSkills.join(", ") : job.requiredSkills || ""}

NICE TO HAVE:
${Array.isArray(job.niceToHaveSkills) ? job.niceToHaveSkills.join(", ") : job.niceToHaveSkills || ""}

LOCATION:
${job.location || ""}`;
}

/**
 * Parse skills from job object into a clean lowercase array.
 * Handles both array and comma-separated string formats.
 */
function parseSkillsList(skills) {
  if (!skills) return [];
  if (Array.isArray(skills)) {
    return skills.map(s => s.trim().toLowerCase()).filter(Boolean);
  }
  if (typeof skills === "string") {
    return skills.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

export async function initializeMLJob({ job }) {
  try {
    console.log(`[ML Init] Starting ML job initialization for job: ${job.title}`);
    console.log(`[ML Init] ML_BASE_URL: ${ML_BASE_URL}`);
    console.log(`[ML Init] Company Name: ${job.companyName}`);

    const headers = getHeaders();
    const fullJobContext = buildFullJobContext(job);

    // Parse required and nice-to-have skills into clean arrays
    const requiredSkills = parseSkillsList(job.requiredSkills);
    const niceToHaveSkills = parseSkillsList(job.niceToHaveSkills);

    console.log(`[ML Init] Required skills: ${requiredSkills}`);
    console.log(`[ML Init] Nice to have: ${niceToHaveSkills}`);

    console.log(`[ML Init] Creating company...`);
    const companyRes = await axios.post(
      `${ML_BASE_URL}/company`,
      { name: job.companyName || job.company || job.organizationName || job.title || "Default Company" },
      {
        headers,
        timeout: 10000
      }
    );

    const mlCompanyId = companyRes.data.company_id;
    console.log(`[ML Init] Company created with ID: ${mlCompanyId}`);

    console.log(`[ML Init] Creating job...`);
    const jobRes = await axios.post(
      `${ML_BASE_URL}/jobs`,
      {
        company_id: mlCompanyId,
        title: job.title,
        description: fullJobContext,
        required_skills: requiredSkills,     // FIX: pass structured skills list
        nice_to_have: niceToHaveSkills        // FIX: pass nice-to-have list
      },
      {
        headers,
        timeout: 10000
      }
    );

    const mlJobId = jobRes.data.job_id;
    console.log(`[ML Init] Job created with ID: ${mlJobId}`);

    return {
      mlCompanyId,
      mlJobId
    };
  } catch (error) {
    console.error(`[ML Init] Error details:`, {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: `${ML_BASE_URL}/company`
    });

    if (error.code === "ECONNREFUSED") {
      throw new Error(`ML service not reachable at ${ML_BASE_URL}`);
    }

    if (error.code === "ETIMEDOUT") {
      throw new Error(`ML service timeout at ${ML_BASE_URL}`);
    }

    if (error.response?.status === 401) {
      throw new Error(`Invalid ML API key`);
    }

    throw new Error(`ML initialization failed: ${error.message}`);
  }
}

/**
 * Add resume to ML system.
 * Passes resume_id (your DB ID) so ML results can be mapped back to candidates.
 */
export async function addResumeToML({
  mlCompanyId,
  mlJobId,
  resumeText,
  resumeId  // FIX: now passed to ML so scores can be matched back by resume_id
}) {
  try {
    const headers = getHeaders();

    const response = await axios.post(
      `${ML_BASE_URL}/jobs/${mlCompanyId}/${mlJobId}/resume`,
      {
        resume_text: resumeText,
        resume_id: resumeId   // FIX: send resume_id so ML tracks it
      },
      { headers }
    );

    console.log(`[AI ML] Resume ${resumeId} added to ML system with resume_id tracking`);
    return { success: true, mlResponse: response.data };
  } catch (err) {
    console.error("[AI ML] addResumeToML error:", err.message);
    if (err.response?.data) {
      console.error("[AI ML] ML Error details:", err.response.data);
    }
    throw new Error("Failed to add resume to ML");
  }
}

/**
 * Clear all resumes for a job from ML database.
 * Call this before re-running AI screening to remove stale data.
 */
export async function clearMLJobResumes({ mlCompanyId, mlJobId }) {
  try {
    const headers = getHeaders();
    const response = await axios.delete(
      `${ML_BASE_URL}/jobs/${mlCompanyId}/${mlJobId}/resumes`,
      { headers, timeout: 10000 }
    );
    console.log(`[AI ML] Cleared ML resumes for job ${mlJobId}:`, response.data);
    return response.data;
  } catch (err) {
    console.warn(`[AI ML] clearMLJobResumes failed (non-fatal):`, err.message);
    // Non-fatal — log and continue
    return null;
  }
}

export default {
  initializeMLJob,
  addResumeToML,
  clearMLJobResumes
};