import dotenv from 'dotenv';

// Load environment variables in dev (no-op in prod if already loaded)
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro';

if (!GEMINI_API_KEY) {
  // eslint-disable-next-line no-console
  console.warn('[AI Screening] GEMINI_API_KEY not set – AI scoring will be disabled.');
}

/**
 * Build a compact but information-dense prompt for Gemini.
 * We send:
 * - Job metadata + requirements
 * - Parsed candidate profile fields
 * - Raw resume text (as plain text)
 *
 * Gemini returns a strictly structured JSON with the full scoring breakdown.
 */
function buildPrompt(job, candidateProfile, resumeText) {
  const jdSummary = [
    `Title: ${job?.title || ''}`,
    `Location: ${job?.location || ''}`,
    `Experience (yrs): ${job?.experienceYears ?? 'N/A'}`,
    `Required skills: ${(job?.requiredSkills || []).join(', ') || 'N/A'}`,
    `Nice-to-have skills: ${(job?.niceToHaveSkills || []).join(', ') || 'N/A'}`
  ].join('\n');

  const candidateSummary = [
    `Name: ${candidateProfile?.name || ''}`,
    `Highest qualification: ${candidateProfile?.highestQualificationDegree || ''}`,
    `Specialization: ${candidateProfile?.specialization || ''}`,
    `CGPA/Percentage: ${candidateProfile?.cgpaOrPercentage || ''}`,
    `Passout year: ${candidateProfile?.passoutYear || ''}`,
    `Total experience (yrs, if known): ${candidateProfile?.totalExperienceYears || ''}`
  ].join('\n');

  return `
You are an expert technical recruiter. Evaluate a candidate's resume against a specific job description.

Follow this EXACT scoring framework. Total score = 100.
Output MUST be pure JSON, no commentary.

############################
SCORING FRAMEWORK (100 points)
############################

1. Core Technical Skills Match (30 points)
- Evaluate only relevant skills for this JD.
- Consider: mandatory/core skills, tools, frameworks, languages, version/platform relevance.
- Scoring guidelines:
  * ~100% match with strong evidence => 30
  * ~75% match => 22
  * ~50% match => 15
  * <50% => 5–10
- If a clearly mandatory skill is missing entirely, set "redFlags.includes('MANDATORY_SKILL_MISSING')" = true.

2. Experience Relevance (20 points)
- Focus on RELEVANT experience, not total years.
- Consider:
  * Same/similar role
  * Same/similar domain
  * Seniority vs JD expectations
- Scoring:
  * Exact domain + required years => 20
  * Slightly lower years but clearly relevant => 15
  * Related domain only => 10
  * Mostly irrelevant => 5

3. Impact & Measurable Achievements (15 points)
- Look for evidence: % improvement, revenue impact, cost savings, performance/scale metrics.
- Strong quantified results across multiple bullet points => 15
- Some metrics, somewhat concrete => 10
- No real metrics / only generic statements => 5

4. Problem-Solving & Complexity (10 points)
- Look for:
  * System design
  * Scaling / high-traffic work
  * Architecture decisions
  * Performance optimization / debugging complex issues
- High complexity and ownership => 9–10
- Moderate complexity => 6–8
- Mostly CRUD / basic tasks => 3–5

5. Project Quality & Depth (10 points)
- Check:
  * Real-world/production projects
  * Ownership of modules / services
  * Clarity of architecture
  * GitHub / live links if present
- Production-grade, well-described projects => 9–10
- Some reasonable academic/training + a bit of real work => 5–8
- Only basic/academic/demo projects => 3–5

6. Education & Academic Strength (5 points)
- Tier-1 / strong university + relevant degree => up to 5
- Strong CGPA (> 8.5 / 85%) => 4
- Relevant degree but average academics => 3
- Unrelated degree => 2
- Keep weight low vs real performance.

7. Communication & Resume Quality (5 points)
- Structure, clarity, grammar, noise/buzzwords, length, signal-to-noise ratio.
- Very clear, concise, professional => 5
- Acceptable, minor issues => 3–4
- Poorly structured / many errors => 1–2

8. Cultural & Role Alignment (5 points)
- Evidence of:
  * Ownership / end-to-end responsibility
  * Leadership / mentoring / collaboration
  * Stability vs frequent short stints
- Strong ownership + stability => 5
- Mixed evidence => 3–4
- Low evidence / job-hopping every 3–6 months => 1–2

############################
RED FLAGS (HARVARD-STYLE)
############################
If present, note them explicitly in "redFlags" with clear text. Examples:
- No measurable achievements anywhere.
- Fake buzzwords (AI, ML, Blockchain etc.) without any concrete project.
- Extremely long skill lists with shallow evidence.
- Job-hopping every 3–6 months.
- Resume appears to copy-paste JD wording.
Red flags should not FORCE score to 0, but they should influence category scores and final recommendation.

############################
FINAL OUTPUT FORMAT (STRICT JSON)
############################
Respond with ONLY valid JSON in this shape:
{
  "totalScore": number (0-100),
  "fitLevel": "Strong Fit" | "Moderate Fit" | "Weak Fit" | "Not Recommended",
  "categories": {
    "coreTechnicalSkills": { "score": number, "comments": string },
    "experienceRelevance": { "score": number, "comments": string },
    "impactAchievements": { "score": number, "comments": string },
    "problemSolvingComplexity": { "score": number, "comments": string },
    "projectQualityDepth": { "score": number, "comments": string },
    "educationAcademics": { "score": number, "comments": string },
    "communicationResumeQuality": { "score": number, "comments": string },
    "culturalRoleAlignment": { "score": number, "comments": string }
  },
  "jdAlignmentSummary": string,
  "strongSignals": string[],
  "concerns": string[],
  "redFlags": string[]
}

Fit level mapping:
- totalScore >= 75 => "Strong Fit"
- 60–74 => "Moderate Fit"
- 45–59 => "Weak Fit"
- < 45 => "Not Recommended"

Make sure the sum of category scores is close to totalScore (allow small rounding differences).

############################
CONTEXT: JOB DESCRIPTION
############################
${jdSummary}

############################
CONTEXT: CANDIDATE PROFILE (STRUCTURED)
############################
${candidateSummary}

############################
CONTEXT: FULL RESUME TEXT (RAW)
############################
${resumeText || '[NO RESUME TEXT PROVIDED]'}
`;
}

async function callGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topK: 32,
      topP: 0.8,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json'
    }
  };

  console.log(`[AI Screening] Calling Gemini API (model: ${GEMINI_MODEL})...`);
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[AI Screening] Gemini API HTTP error:', res.status, text);
    throw new Error(`Gemini API error: ${res.status} ${res.statusText} – ${text}`);
  }

  const data = await res.json();
  
  // Check for blocked content or safety issues
  if (data?.promptFeedback?.blockReason) {
    console.error('[AI Screening] Gemini blocked prompt:', data.promptFeedback);
    throw new Error(`Gemini blocked request: ${data.promptFeedback.blockReason}`);
  }
  
  const candidates = data?.candidates || [];
  
  // Check if response was filtered
  if (candidates[0]?.finishReason === 'SAFETY') {
    console.error('[AI Screening] Gemini response filtered for safety');
    throw new Error('Gemini response filtered for safety');
  }
  
  const content = candidates[0]?.content?.parts?.[0]?.text || '';
  if (!content) {
    console.error('[AI Screening] Empty Gemini response. Full response:', JSON.stringify(data));
    throw new Error('Gemini response missing text content');
  }

  console.log(`[AI Screening] Gemini response received (${content.length} chars)`);

  // Response should be pure JSON, but be defensive in case of leading noise
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  const jsonText =
    firstBrace !== -1 && lastBrace !== -1 ? content.slice(firstBrace, lastBrace + 1) : content;

  try {
    const parsed = JSON.parse(jsonText);
    console.log(`[AI Screening] Parsed score: ${parsed.totalScore}, fit: ${parsed.fitLevel}`);
    return parsed;
  } catch (err) {
    console.error('[AI Screening] Failed to parse Gemini JSON:', err.message);
    console.error('[AI Screening] Raw content:', content.substring(0, 500));
    throw new Error('Failed to parse Gemini response as JSON');
  }
}

/**
 * Main entry point for AI screening.
 *
 * @param {Object} params
 * @param {import('../models/JobOpening.js').default} params.job - Mongoose JobOpening document or plain object
 * @param {Object} params.candidateProfile - User profile (name, highestQualificationDegree, specialization, etc.)
 * @param {string} params.resumeText - Full plain-text contents of the candidate's resume
 *
 * @returns {Promise<{
 *   totalScore: number;
 *   fitLevel: string;
 *   categories: {
 *     coreTechnicalSkills: { score: number; comments: string };
 *     experienceRelevance: { score: number; comments: string };
 *     impactAchievements: { score: number; comments: string };
 *     problemSolvingComplexity: { score: number; comments: string };
 *     projectQualityDepth: { score: number; comments: string };
 *     educationAcademics: { score: number; comments: string };
 *     communicationResumeQuality: { score: number; comments: string };
 *     culturalRoleAlignment: { score: number; comments: string };
 *   };
 *   jdAlignmentSummary: string;
 *   strongSignals: string[];
 *   concerns: string[];
 *   redFlags: string[];
 * }>}
 */
export async function scoreResumeWithGemini({ job, candidateProfile, resumeText }) {
  const prompt = buildPrompt(job, candidateProfile, resumeText);
  const result = await callGemini(prompt);

  // Basic normalization & fallback handling
  const totalScore = Number.isFinite(result.totalScore) ? Number(result.totalScore) : 0;
  let fitLevel = result.fitLevel || 'Not Recommended';
  if (totalScore >= 75) fitLevel = 'Strong Fit';
  else if (totalScore >= 60) fitLevel = 'Moderate Fit';
  else if (totalScore >= 45) fitLevel = 'Weak Fit';
  else fitLevel = 'Not Recommended';

  return {
    totalScore,
    fitLevel,
    categories: result.categories || {},
    jdAlignmentSummary: result.jdAlignmentSummary || '',
    strongSignals: Array.isArray(result.strongSignals) ? result.strongSignals : [],
    concerns: Array.isArray(result.concerns) ? result.concerns : [],
    redFlags: Array.isArray(result.redFlags) ? result.redFlags : []
  };
}

export default {
  scoreResumeWithGemini
};

