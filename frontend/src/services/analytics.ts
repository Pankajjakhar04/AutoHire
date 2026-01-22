import api from './api';

export type DashboardMetrics = {
  openRoles: number;
  activeCandidates: number;
  applications: number;
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

export async function fetchDashboardMetrics() {
  const { data } = await api.get<DashboardMetrics>('/analytics/dashboard');
  return data;
}

export async function fetchCandidateMetrics() {
  const { data } = await api.get<CandidateMetrics>('/analytics/candidate');
  return data;
}
