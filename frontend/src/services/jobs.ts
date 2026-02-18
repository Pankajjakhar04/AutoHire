import api from './api';

export type EligibilityCriteria = {
  educationMinLevel?: ('highSchool' | 'diploma' | 'bachelors' | 'masters' | 'phd')[];
  specialization?: string;
  academicQualification?: string;
  minExperienceYears?: number;
  customCriteria?: string[];
};

export type Job = {
  _id: string;
  jobCode?: string;
  title: string;
  description: string;
  requiredSkills?: string[];
  niceToHaveSkills?: string[];
  experienceYears?: number;
  eligibilityCriteria?: EligibilityCriteria;
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

export type EligibilityCheckPayload = {
  educationLevel?: 'highSchool' | 'diploma' | 'bachelors' | 'masters' | 'phd';
  specialization?: string;
  academicQualification?: string;
  experienceYears?: number;
  customCriteriaAccepted?: number[];
};

export type EligibilityCheckResult = {
  eligible: boolean;
  failures: string[];
  warning?: string | null;
  message?: string;
};

export async function checkJobEligibility(jobId: string, payload: EligibilityCheckPayload) {
  const { data } = await api.post<EligibilityCheckResult>(`/jobs/${jobId}/check-eligibility`, payload);
  return data;
}
