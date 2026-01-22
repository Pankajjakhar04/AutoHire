import api from './api';

export type Job = {
  _id: string;
  title: string;
  description: string;
  requiredSkills?: string[];
  niceToHaveSkills?: string[];
  experienceYears?: number;
  salaryRange?: { min?: number; max?: number; currency?: string };
  location?: string;
  status?: 'active' | 'closed';
  createdAt?: string;
  updatedAt?: string;
};

export async function fetchJobs(params?: { status?: string; q?: string }) {
  const { data } = await api.get<Job[]>('/jobs', { params });
  return data;
}

export async function fetchJob(id: string) {
  const { data } = await api.get<Job>(`/jobs/${id}`);
  return data;
}

export async function createJob(payload: Partial<Job>) {
  const { data } = await api.post<Job>('/jobs', payload);
  return data;
}

export async function updateJob(id: string, payload: Partial<Job>) {
  const { data } = await api.put<Job>(`/jobs/${id}`, payload);
  return data;
}

export async function deleteJob(id: string) {
  const { data } = await api.delete(`/jobs/${id}`);
  return data;
}
