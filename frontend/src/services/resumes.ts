import api from './api';
import { Job } from './jobs';

export type Resume = {
  _id: string;
  candidateId: string;
  jobId: string;
  job?: Pick<Job, '_id' | 'title' | 'status' | 'location'>;
  // Some API responses may return the populated job under jobId when using mongoose populate
  populatedJobId?: Pick<Job, '_id' | 'title' | 'status' | 'location'>;
  fileName: string;
  originalName?: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  status: 'uploaded' | 'processing' | 'scored' | 'screened-in' | 'screened-out';
  pipelineStage?: 'screening' | 'assessment' | 'interview' | 'offer' | 'hired' | 'rejected';
  score?: number;
  matchedSkills?: string[];
  missingSkills?: string[];
  createdAt?: string;
  // Enriched candidate info (from populated responses)
  candidateName?: string;
  candidateEmail?: string;
  candidateUniqueId?: string;
  highestQualification?: string;
  specialization?: string;
  cgpa?: string;
  passoutYear?: number;
};

export async function uploadResume(jobId: string, file: File) {
  const form = new FormData();
  form.append('jobId', jobId);
  form.append('file', file);
  const { data } = await api.post<Resume>('/resumes/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
}

export async function listResumesForJob(jobId: string) {
  const { data } = await api.get<Resume[]>(`/resumes/job/${jobId}`);
  return data;
}

export async function listMyResumesForJob(jobId: string) {
  const { data } = await api.get<Resume[]>(`/resumes/job/${jobId}/mine`);
  return data;
}

export async function listMyResumes() {
  const { data } = await api.get<Resume[]>('/resumes/mine');
  return data;
}

export async function deleteResume(id: string) {
  const { data } = await api.delete(`/resumes/${id}`);
  return data;
}

export async function downloadResume(id: string) {
  const response = await api.get(`/resumes/${id}/download`, { responseType: 'blob' });
  return response.data as Blob;
}

export async function screenResumes(resumeIds: string[], status: 'screened-in' | 'screened-out') {
  const { data } = await api.patch('/resumes/screen', { resumeIds, status });
  return data;
}

export type AIScreenResult = {
  message: string;
  threshold: number;
  total: number;
  screenedIn: number;
  screenedOut: number;
  results: {
    resumeId: string;
    candidateId: string;
    candidateName: string;
    score: number;
    status: string;
    matchedSkills: string[];
    missingSkills: string[];
  }[];
};

export async function aiScreenResumes(jobId: string, resumeIds?: string[], threshold?: number) {
  const { data } = await api.post<AIScreenResult>('/resumes/ai-screen', { jobId, resumeIds, threshold });
  return data;
}

export type AdvanceResult = {
  message: string;
  advanced: number;
  emailsSent: number;
};

export async function advanceCandidates(resumeIds: string[], targetStage: string) {
  const { data } = await api.post<AdvanceResult>('/resumes/advance', { resumeIds, targetStage });
  return data;
}

export async function listResumesByStage(jobId: string, stage: string) {
  const { data } = await api.get<Resume[]>(`/resumes/job/${jobId}/stage/${stage}`);
  return data;
}

export async function exportStageToExcel(jobId: string, stage: string) {
  const response = await api.get(`/resumes/job/${jobId}/stage/${stage}/export`, { responseType: 'blob' });
  const blob = response.data as Blob;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  a.download = match ? match[1] : `export_${stage}_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
