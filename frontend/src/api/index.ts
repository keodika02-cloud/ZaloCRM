import axios from 'axios';
import { router } from '@/router/index';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 120000,
  withCredentials: true,
});

// JWT is now handled via HttpOnly cookies, so we don't need to manually inject it.
api.interceptors.request.use((config) => {
  return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url;
      const isAuthEndpoint = url && (
        url.endsWith('/profile') || 
        url.endsWith('/auth/login') || 
        url.endsWith('/auth/logout') ||
        url.endsWith('/setup/status')
      );

      if (!isAuthEndpoint) {
        // Use Vue Router instead of hard reload to prevent redirect loops
        const currentPath = router.currentRoute.value.path;
        if (currentPath !== '/login' && currentPath !== '/setup') {
          router.replace('/login');
        }
      }
    }
    return Promise.reject(error);
  },
);

export { api };
