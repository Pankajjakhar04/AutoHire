import api from './api';

export type DashboardMetrics = {
  openRoles: number;
  activeCandidates: number;
  applications: number;
  screenedIn: number;
  screenedOut: number;
  interviewsScheduled: number;
  offersInProgress: number;
};

export type CandidateMetrics = {
  jobsApplied: number;
  resumesScreenedIn: number;
  resumesScreenedOut: number;
  interviewsScheduled: number;
  offersReceived: number;
};

export type JobMetrics = {
  total: number;
  screenedIn: number;
  screenedOut: number;
  pending: number;
  inAssessment: number;
  inInterview: number;
  inOffer: number;
  hired: number;
};

export type JobAnalytics = {
  jobId: string;
  jobCode: string;
  title: string;
  status: string;
  location: string;
  createdAt: string;
  metrics: JobMetrics;
};

export type JobWiseAnalyticsResponse = {
  jobs: JobAnalytics[];
  totals: JobMetrics;
  totalJobs: number;
  activeJobs: number;
};

export async function fetchDashboardMetrics() {
  const { data } = await api.get<DashboardMetrics>('/analytics/dashboard');
  return data;
}

export async function fetchJobWiseAnalytics() {
  const { data } = await api.get<JobWiseAnalyticsResponse>('/analytics/jobs');
  return data;
}

export async function fetchCandidateMetrics() {
  const { data } = await api.get<CandidateMetrics>('/analytics/candidate');
  return data;
}
