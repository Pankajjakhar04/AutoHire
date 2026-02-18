import crypto from 'crypto';

const runs = new Map();

export function createRun({ jobId, total }) {
  const runId = crypto.randomUUID();
  const run = {
    runId,
    jobId,
    total: Number(total) || 0,
    processed: 0,
    screenedIn: 0,
    screenedOut: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    done: false,
    error: null
  };
  runs.set(runId, run);
  return run;
}

export function updateRun(runId, patch) {
  const run = runs.get(runId);
  if (!run) return null;
  Object.assign(run, patch || {});
  run.updatedAt = Date.now();
  runs.set(runId, run);
  return run;
}

export function getRun(runId) {
  return runs.get(runId) || null;
}

