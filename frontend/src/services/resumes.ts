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
  status: 'uploaded' | 'processing' | 'scored';
  score?: number;
  matchedSkills?: string[];
  missingSkills?: string[];
  createdAt?: string;
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
