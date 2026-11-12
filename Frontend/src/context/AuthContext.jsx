import React, { createContext, useState, useContext, useEffect } from 'react';
import apiClient, { refreshAccessToken } from '../api/apiClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const decodeToken = (authToken) => {
        try {
            // base64url -> utf-8 (Urdu / special characters wale naam bhi sahi decode hon)
            const b64 = authToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const payload = JSON.parse(new TextDecoder().decode(bytes));
            return {
                id: payload.id,
                email: payload.email,
                name: payload.name,
                role: payload.role || payload.Role || 'user'
            };
        } catch {
            return null;
        }
    };

    const login = (accessToken) => {
        setToken(accessToken);
        window.accessToken = accessToken;
        const decodedUser = decodeToken(accessToken);
        setUser(decodedUser);
        return decodedUser?.role || 'user';
    };

    const logout = async () => {
        try {
            await apiClient.post('/auth/Logout');
        } catch (error) {
            console.error('Logout failed:', error);
        } finally {
            setToken(null);
            setUser(null);
            window.accessToken = null;
        }
    };

    useEffect(() => {
        // Refresh sirf tab "logout" mane jaye jab server ne saaf inkar kiya ho (401/403/404).
        // Network error / 5xx (Vercel cold start, DB slow, CORS hiccup) pe 3 baar try karte hain.
        const refreshWithRetry = async () => {
            let lastErr;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    return await refreshAccessToken();
                } catch (err) {
                    lastErr = err;
                    const status = err.response?.status;
                    if (status && status < 500) throw err;
                    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
                }
            }
            throw lastErr;
        };

        const checkAuthOnRefresh = async () => {
            try {
                const accessToken = await refreshWithRetry();
                if (accessToken) {
                    login(accessToken);
                }
            } catch (err) {
                console.warn(
                    '[Auth] Session restore failed ->',
                    err.response?.status ?? 'no response (network/CORS)',
                    err.response?.data?.message || err.message
                );
                setToken(null);
                setUser(null);
                window.accessToken = null;
            } finally {
                setLoading(false);
            }
        };

        checkAuthOnRefresh();
    }, []);

    return (
        <AuthContext.Provider value={{ token, user, login, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);