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

/**
 * Get ranking results from ML
 */
/**
 * Get ML screening results - FIXED VERSION
 * Now handles both resumeIndex and resume_id matching
 */
export async function getMLScreeningResults(mlCompanyId, mlJobId) {
  try {
    const headers = getHeaders();

    const response = await axios.post(
      `${ML_BASE_URL}/jobs/${mlCompanyId}/${mlJobId}/match`,
      {},
      { headers: getHeaders() }
    );

    const results = response.data?.results || [];

    // Enhanced logging for debugging
    console.log(`[ML] Received ${results.length} results from ML server`);
    if (results.length > 0) {
      console.log(`[ML] Sample result structure:`, JSON.stringify(results[0], null, 2));
      
      // Validate that scores are present
      const firstResult = results[0];
      if (!firstResult.totalScore) {
        console.warn(`[ML] WARNING: totalScore field is missing from ML results. Available fields:`, Object.keys(firstResult));
      }
    }

    return results;
  } catch (err) {
    console.error("[ML] Ranking failed:", err.message);
    if (err.response) {
      console.error("[ML] Response status:", err.response.status);
      console.error("[ML] Response data:", err.response.data);
    }
    throw new Error("ML ranking failed");
  }
}

export default {
  getMLScreeningResults
};