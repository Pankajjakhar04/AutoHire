import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

export type User = {
  id: string;
  email: string;
  role: string;
  name?: string;
  candidateId?: string;
  employeeId?: string;
  companyName?: string;
  isVerified?: boolean;
  highestQualificationDegree?: string;
  specialization?: string;
  cgpaOrPercentage?: string;
  passoutYear?: number;
};

export type AuthContextValue = {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: { email: string; password: string; name?: string; role?: string; employeeId?: string; companyName?: string; highestQualificationDegree?: string; specialization?: string; cgpaOrPercentage?: string; passoutYear?: number; [key: string]: any }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  // First effect: Restore from localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('accessToken');
    
    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
      setAccessToken(storedToken);
    }
    setIsInitialized(true);
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    setUser(data.user);
    setAccessToken(data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('accessToken', data.accessToken);
  };

  const register = async (payload: { email: string; password: string; name?: string; role?: string; employeeId?: string; companyName?: string; highestQualificationDegree?: string; specialization?: string; cgpaOrPercentage?: string; passoutYear?: number; [key: string]: any }) => {
    const { data } = await api.post('/auth/register', payload);
    setUser(data.user);
    setAccessToken(data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('accessToken', data.accessToken);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // Continue logout even if API call fails
    }
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
  };

  const refresh = async () => {
    try {
      const { data } = await api.post('/auth/refresh-token');
      setUser(data.user);
      setAccessToken(data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('accessToken', data.accessToken);
    } catch (err: any) {
      // Only clear session if we have stored data and refresh explicitly fails with auth error
      // This prevents clearing session on first load when there might be no refresh token yet
      const hasStoredSession = localStorage.getItem('user') && localStorage.getItem('accessToken');
      const isAuthError = err?.response?.status === 401 || err?.response?.status === 403;
      
      if (hasStoredSession && isAuthError) {
        console.warn('Refresh token invalid or expired, clearing session');
        setUser(null);
        setAccessToken(null);
        localStorage.removeItem('user');
        localStorage.removeItem('accessToken');
      }
      // Keep existing session state for other errors (network issues, 5xx, etc.)
    }
  };

  useEffect(() => {
    if (accessToken) {
      api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
    } else {
      delete api.defaults.headers.common.Authorization;
    }
  }, [accessToken]);

  const value = useMemo(
    () => ({ user, accessToken, loading, login, register, logout, refresh }),
    [user, accessToken, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
