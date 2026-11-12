import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/apiClient';
import AiLoader from './Ailoader';
import styles from './SignUpForm.module.css';

const LoginForm = () => {
    const [formData, setFormData] = useState({
        StudentEmail: '',
        Password: ''
    });

    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [responseMsg, setResponseMsg] = useState(null);

    const navigate = useNavigate();
    const { login } = useAuth();

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setResponseMsg(null);

        try {
            const res = await apiClient.post('/auth/Login', formData);

            if (res.data.accessToken) {
                const role = login(res.data.accessToken);

                setResponseMsg({
                    type: 'success',
                    text: 'Login successful! Redirecting...'
                });

                setTimeout(() => {
                    const targetPath = role === 'admin' ? '/admin-dashboard' : '/student-dashboard';
                    // FIX: Replace option added to clear login from history stack
                    navigate(targetPath, { replace: true });
                }, 800);
            }

        } catch (err) {
            setResponseMsg({
                type: 'error',
                text: err.response?.data?.message || 'Server connection failed'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.signupContainer}>
            <AiLoader show={loading} messages={['Authenticating…', 'Securing your session…']} />
            <div className={styles.signupCard}>
                <div className={styles.signupHeader}>
                    <h2>Student Login</h2>
                    <p>Welcome back! Enter your details to log in</p>
                </div>

                {responseMsg && (
                    <div className={`${styles.alertBox} ${styles[responseMsg.type]}`}>
                        {responseMsg.text}
                    </div>
                )}

                <form onSubmit={handleSubmit} className={styles.signupForm}>
                    <div className={styles.formGroup}>
                        <label htmlFor="StudentEmail">Email Address</label>
                        <input
                            type="email"
                            id="StudentEmail"
                            name="StudentEmail"
                            placeholder="e.g. Qusai@gmail.com"
                            value={formData.StudentEmail}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="Password">Password</label>
                        <div className={styles.passwordInputWrapper}>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="Password"
                                name="Password"
                                placeholder="••••••••"
                                value={formData.Password}
                                onChange={handleChange}
                                required
                            />
                            <button
                                type="button"
                                className={styles.togglePassword}
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>
                    </div>

                    <button type="submit" className={styles.submitBtn} disabled={loading}>
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>

                <p className={styles.footerText}>
                    Don't have an account? <Link to="/signup">Sign Up</Link>
                </p>
            </div>
        </div>
    );
};

export default LoginForm;