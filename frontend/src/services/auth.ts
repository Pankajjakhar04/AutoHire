import api from './api';

export async function updateProfile(payload: {
  name?: string;
  employeeId?: string;
  companyName?: string;
  highestQualificationDegree?: string;
  specialization?: string;
  cgpaOrPercentage?: string;
  passoutYear?: number;
}) {
  const { data } = await api.put('/auth/profile', payload);
  return data;
}

export async function deleteAccount() {
  const { data } = await api.delete('/auth/account');
  return data;
}
