import AIScreenRun from "../models/AIScreenRun.js";

/**
 * Create new screening run
 */
export async function createRun({ jobId, total }) {
  const run = await AIScreenRun.create({
    jobId,
    total: Number(total) || 0,
    processed: 0,
    screenedIn: 0,
    screenedOut: 0,
    status: "running"
  });

  return run;
}

/**
 * Update run progress
 */
export async function updateRun(runId, patch = {}) {
  const run = await AIScreenRun.findByIdAndUpdate(
    runId,
    { ...patch },
    { new: true }
  );

  return run;
}

/**
 * Get run status
 */
export async function getRun(runId) {
  return AIScreenRun.findById(runId);
}

/**
 * Mark run completed
 */
export async function markRunCompleted(runId) {
  return AIScreenRun.findByIdAndUpdate(
    runId,
    { status: "completed" },
    { new: true }
  );
}

/**
 * Mark run failed
 */
export async function markRunFailed(runId, errorMessage) {
  return AIScreenRun.findByIdAndUpdate(
    runId,
    { status: "failed", error: errorMessage },
    { new: true }
  );
}

export default {
  createRun,
  updateRun,
  getRun,
  markRunCompleted,
  markRunFailed
};