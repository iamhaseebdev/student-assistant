import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/apiClient';
import AILoader, { ButtonSpinner } from './Ailoader';
import styles from './Profile.module.css';

// At least 8 chars, max 64, must contain a letter and a number
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [form, setForm] = useState({ StudentName: '', StudentAge: '', StudentContact: '' });
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    apiClient
      .get(`/students/${user.id}`)
      .then((res) => {
        const p = res.data.data || res.data;
        setEmail(p?.StudentEmail || '');
        setRole(p?.Role || 'user');
        setForm({
          StudentName: p?.StudentName || '',
          StudentAge: p?.StudentAge ?? '',
          StudentContact: p?.StudentContact ?? ''
        });
      })
      .catch((err) => {
        console.error('Error fetching student profile:', err);
        setProfileMsg({ type: 'error', text: 'Could not load your profile' });
      })
      .finally(() => setLoading(false));
  }, [user?.id]);

  // ---------------- Profile details ----------------
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileMsg(null);

    const name = form.StudentName.trim();
    if (!name) return setProfileMsg({ type: 'error', text: 'Name is required' });

    const age = form.StudentAge === '' ? undefined : Number(form.StudentAge);
    if (age !== undefined && (!Number.isInteger(age) || age < 1 || age > 120)) {
      return setProfileMsg({ type: 'error', text: 'Enter a valid age (1-120)' });
    }

    const contactStr = String(form.StudentContact ?? '').trim();
    if (contactStr && !/^\d{10,15}$/.test(contactStr)) {
      return setProfileMsg({ type: 'error', text: 'Contact must be 10-15 digits' });
    }

    setSaving(true);
    try {
      // Only these 3 fields are sent: email, role and password can NOT be changed from here
      await apiClient.put(`/students/${user.id}`, {
        StudentName: name,
        ...(age !== undefined ? { StudentAge: age } : {}),
        ...(contactStr ? { StudentContact: Number(contactStr) } : {})
      });
      setProfileMsg({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      setProfileMsg({
        type: 'error',
        text: err.response?.data?.message || 'Failed to update profile'
      });
    } finally {
      setSaving(false);
    }
  };

  // ---------------- Change password ----------------
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPwMsg(null);

    if (!pw.current || !pw.next || !pw.confirm) {
      return setPwMsg({ type: 'error', text: 'Please fill all password fields' });
    }
    if (!PASSWORD_RULE.test(pw.next)) {
      return setPwMsg({
        type: 'error',
        text: 'New password must be 8-64 characters and include a letter and a number'
      });
    }
    if (pw.next === pw.current) {
      return setPwMsg({ type: 'error', text: 'New password must be different from the current one' });
    }
    if (pw.next !== pw.confirm) {
      return setPwMsg({ type: 'error', text: 'New password and confirm password do not match' });
    }

    setPwSaving(true);
    try {
      await apiClient.put('/auth/ChangePassword', {
        currentPassword: pw.current,
        newPassword: pw.next
      });
      setPwMsg({ type: 'success', text: 'Password changed! Please login again...' });
      setPw({ current: '', next: '', confirm: '' });
      // All sessions are logged out on the server, so log out here too
      setTimeout(async () => {
        await logout();
        navigate('/login', { replace: true });
      }, 1500);
    } catch (err) {
      setPwMsg({
        type: 'error',
        text: err.response?.data?.message || 'Failed to change password'
      });
      setPwSaving(false);
    }
  };

  const Message = ({ msg }) =>
    msg ? (
      <div className={`${styles.msg} ${msg.type === 'success' ? styles.msgOk : styles.msgErr}`}>
        {msg.text}
      </div>
    ) : null;

  if (loading) return <AILoader messages={['Loading your profile', 'Fetching your details']} />;

  return (
    <div className={styles.wrapper}>
      {/* ---------- Profile details ---------- */}
      <div className={styles.card}>
        <h3 className={styles.title}>👤 MY PROFILE</h3>
        <Message msg={profileMsg} />

        <form onSubmit={handleProfileSubmit}>
          <div className={styles.formGroup}>
            <label>Email Address <span className={styles.lock}>🔒 cannot be changed</span></label>
            <input type="email" value={email} readOnly disabled className={styles.readOnly} />
          </div>

          <div className={styles.formGroup}>
            <label>Account Type</label>
            <input type="text" value={role} readOnly disabled className={styles.readOnly} />
          </div>

          <div className={styles.formGroup}>
            <label>Student Name</label>
            <input
              type="text"
              value={form.StudentName}
              onChange={(e) => setForm({ ...form, StudentName: e.target.value })}
              placeholder="Enter full name"
              maxLength={60}
              required
            />
          </div>

          <div className={styles.row}>
            <div className={styles.formGroup}>
              <label>Age</label>
              <input
                type="number"
                min="1"
                max="120"
                value={form.StudentAge}
                onChange={(e) => setForm({ ...form, StudentAge: e.target.value })}
                placeholder="Age"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Contact Number</label>
              <input
                type="tel"
                inputMode="numeric"
                value={form.StudentContact}
                onChange={(e) => setForm({ ...form, StudentContact: e.target.value.replace(/\D/g, '') })}
                placeholder="e.g. 923001234567"
                maxLength={15}
              />
            </div>
          </div>

          <button type="submit" className={styles.saveBtn} disabled={saving}>
            {saving ? <><ButtonSpinner /> Saving Changes...</> : 'Save Profile'}
          </button>
        </form>
      </div>

      {/* ---------- Change password ---------- */}
      <div className={styles.card}>
        <h3 className={styles.title}>🔐 CHANGE PASSWORD</h3>
        <Message msg={pwMsg} />

        <form onSubmit={handlePasswordSubmit} autoComplete="off">
          <div className={styles.formGroup}>
            <label>Current Password</label>
            <input
              type={showPw ? 'text' : 'password'}
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
              placeholder="Enter current password"
              autoComplete="current-password"
            />
          </div>

          <div className={styles.formGroup}>
            <label>New Password</label>
            <input
              type={showPw ? 'text' : 'password'}
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
              placeholder="At least 8 characters, letter + number"
              autoComplete="new-password"
              maxLength={64}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Confirm New Password</label>
            <input
              type={showPw ? 'text' : 'password'}
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              placeholder="Repeat new password"
              autoComplete="new-password"
              maxLength={64}
            />
          </div>

          <label className={styles.checkRow}>
            <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
            Show passwords
          </label>

          <button type="submit" className={styles.saveBtn} disabled={pwSaving}>
            {pwSaving ? <><ButtonSpinner /> Updating Password...</> : 'Change Password'}
          </button>
          <p className={styles.hint}>You will be logged out from all devices after changing your password.</p>
        </form>
      </div>
    </div>
  );
};

export default Profile;