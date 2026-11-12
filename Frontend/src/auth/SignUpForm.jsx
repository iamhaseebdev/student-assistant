import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import apiClient from '../api/apiClient';
import AiLoader from './AiLoader';
import styles from './SignUpForm.module.css';

const RESEND_SECONDS = 60;

const emptyForm = {
  StudentName: '',
  StudentEmail: '',
  StudentAge: '',
  StudentContact: '',
  Password: '',
  ConfirmPassword: ''
};

const SignUpForm = () => {
  const [formData, setFormData] = useState(emptyForm);
  const [step, setStep] = useState('details'); // 'details' | 'verify'
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [responseMsg, setResponseMsg] = useState(null);

  const navigate = useNavigate();

  // Resend countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Password Strong Validation Regex
  const validatePassword = (password) => {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return regex.test(password);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  // Step 1 helper: email par 6-digit code bhejo
  const requestCode = async () => {
    setLoading(true);
    setResponseMsg(null);

    try {
      await apiClient.post('/auth/SendOtp', { StudentEmail: formData.StudentEmail });

      setOtp('');
      setStep('verify');
      setCooldown(RESEND_SECONDS);
      setResponseMsg({
        type: 'success',
        text: `Code sent to ${formData.StudentEmail}`
      });
    } catch (err) {
      setResponseMsg({
        type: 'error',
        text: err.response?.data?.message || 'Server connection failed'
      });
    } finally {
      setLoading(false);
    }
  };

  // Step 1: details validate -> code bhejo
  const handleDetailsSubmit = async (e) => {
    e.preventDefault();
    setResponseMsg(null);

    if (formData.Password !== formData.ConfirmPassword) {
      setResponseMsg({ type: 'error', text: 'Passwords do not match!' });
      return;
    }

    if (!validatePassword(formData.Password)) {
      setResponseMsg({
        type: 'error',
        text: 'Password must be 8+ characters and contain uppercase, lowercase, number, and special character (@$!%*?&).'
      });
      return;
    }

    await requestCode();
  };

  // Step 2: code verify + account create
  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    setResponseMsg(null);

    if (otp.length !== 6) {
      setResponseMsg({ type: 'error', text: 'Enter the 6-digit code from your email.' });
      return;
    }

    setLoading(true);

    try {
      await apiClient.post('/auth/Register', {
        StudentName: formData.StudentName,
        StudentEmail: formData.StudentEmail,
        StudentAge: Number(formData.StudentAge),
        StudentContact: Number(formData.StudentContact),
        Password: formData.Password,
        VerificationCode: otp
      });

      setResponseMsg({
        type: 'success',
        text: 'Registration successful! Redirecting to login...'
      });

      setFormData(emptyForm);
      setOtp('');

      setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (err) {
      setResponseMsg({
        type: 'error',
        text: err.response?.data?.message || 'Server connection failed'
      });
    } finally {
      setLoading(false);
    }
  };

  const backToDetails = () => {
    setStep('details');
    setOtp('');
    setResponseMsg(null);
  };

  const loaderMessages =
    step === 'details'
      ? ['Sending verification code…', 'Checking your email…']
      : ['Verifying your code…', 'Creating your account…'];

  return (
    <div className={styles.signupContainer}>
      <AiLoader show={loading} messages={loaderMessages} />

      <div className={styles.signupCard}>
        <div className={styles.signupHeader}>
          <h2>{step === 'details' ? 'Student Sign Up' : 'Verify Email'}</h2>
          <p>
            {step === 'details'
              ? 'Enter your details to register'
              : `Enter the 6-digit code we sent to ${formData.StudentEmail}`}
          </p>
        </div>

        {responseMsg && (
          <div className={`${styles.alertBox} ${styles[responseMsg.type]}`}>
            {responseMsg.text}
          </div>
        )}

        {step === 'details' ? (
          <form onSubmit={handleDetailsSubmit} className={styles.signupForm}>
            <div className={styles.formGroup}>
              <label htmlFor="StudentName">Full Name</label>
              <input
                type="text"
                id="StudentName"
                name="StudentName"
                placeholder="e.g. Qusai"
                value={formData.StudentName}
                onChange={handleChange}
                required
              />
            </div>

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

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="StudentAge">Age</label>
                <input
                  type="number"
                  id="StudentAge"
                  name="StudentAge"
                  placeholder="18"
                  min="1"
                  value={formData.StudentAge}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="StudentContact">Contact Number</label>
                <input
                  type="text"
                  id="StudentContact"
                  name="StudentContact"
                  placeholder="0311312386"
                  value={formData.StudentContact}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="Password">Password</label>
              <div className={styles.passwordInputWrapper}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="Password"
                  name="Password"
                  placeholder="Min 8 chars (e.g. Test@1234)"
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

            <div className={styles.formGroup}>
              <label htmlFor="ConfirmPassword">Confirm Password</label>
              <div className={styles.passwordInputWrapper}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="ConfirmPassword"
                  name="ConfirmPassword"
                  placeholder="••••••••"
                  value={formData.ConfirmPassword}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              Send verification code
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifySubmit} className={styles.signupForm}>
            <div className={styles.formGroup}>
              <label htmlFor="VerificationCode">Verification Code</label>
              <input
                type="text"
                id="VerificationCode"
                name="VerificationCode"
                className={styles.otpInput}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
                required
              />
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading || otp.length !== 6}>
              Verify and register
            </button>

            <div className={styles.otpActions}>
              <button type="button" className={styles.linkBtn} onClick={backToDetails}>
                Change details
              </button>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={requestCode}
                disabled={cooldown > 0 || loading}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        <p className={styles.footerText}>
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
};

export default SignUpForm;