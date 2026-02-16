import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api',
  withCredentials: true
});

// Add token to request headers if it exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors by refreshing token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = originalRequest?.url || '';

    // Never attempt token refresh for auth endpoints — let their errors pass through directly
    const authPaths = ['/auth/login', '/auth/register', '/auth/refresh-token', '/auth/logout'];
    const isAuthRequest = authPaths.some((p) => requestUrl.includes(p));

    // If we get a 401, it's not an auth endpoint, and we haven't already retried, attempt refresh
    if (error.response?.status === 401 && !isAuthRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api'}/auth/refresh-token`,
          {},
          { withCredentials: true }
        );

        // Update token in localStorage
        localStorage.setItem('accessToken', data.accessToken);
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
        }

        // Update the failed request's authorization header
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;

        // Retry the original request
        return api(originalRequest);
      } catch (refreshError) {
        // If refresh fails, clear the session and reject with the ORIGINAL error
        localStorage.removeItem('user');
        localStorage.removeItem('accessToken');
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
