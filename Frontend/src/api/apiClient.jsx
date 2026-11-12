import axios from 'axios';

// Vercel env: VITE_API_URL=https://<your-backend>.vercel.app/api  (local fallback below)
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/+$/, '');

const apiClient = axios.create({
    baseURL: API_URL,
    withCredentials: true
});

// Ek hi waqt me chahe kitni requests 401 hon (ya React StrictMode double-run kare),
// refresh sirf ek baar jaye: backend refresh token rotate karta hai, doosri call fail ho jati.
let refreshPromise = null;
export function refreshAccessToken() {
    if (!refreshPromise) {
        refreshPromise = axios
            .post(`${API_URL}/auth/Refresh`, {}, { withCredentials: true })
            .then((res) => {
                window.accessToken = res.data.accessToken;
                return res.data.accessToken;
            })
            .finally(() => {
                refreshPromise = null;
            });
    }
    return refreshPromise;
}

// Request Interceptor
apiClient.interceptors.request.use((config) => {
    const token = window.accessToken;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));

// Response Interceptor
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const url = originalRequest?.url || '';

        // Auth endpoints (Refresh / Login) ko retry loop se exclude karna
        const isAuthEndpoint = url.includes('/auth/Refresh') || url.includes('/auth/Login');

        if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
            originalRequest._retry = true;

            try {
                const newAccessToken = await refreshAccessToken();
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                return apiClient(originalRequest);
            } catch (refreshError) {
                window.accessToken = null;
                return Promise.reject(refreshError); // Full page reload mat hone dein
            }
        }

        return Promise.reject(error);
    }
);

export default apiClient;