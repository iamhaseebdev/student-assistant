import React from 'react';
import styles from './Sidebar.module.css';

const Sidebar = ({ activeTab, setActiveTab, user }) => {
  const menuItems = [
    { id: 'todos', label: 'Tasks & Goals', icon: '📋' },
    { id: 'mcqs', label: 'MCQs Vault & AI', icon: '🎯' },
    { id: 'notes', label: 'Subjective Notes Vault', icon: '📝' },
    { id: 'notebook', label: 'AI Notebook', icon: '📓' },
    { id: 'timetable', label: 'Timetable', icon: '🗓️' },
    { id: 'progress', label: 'Analytics', icon: '📈' },
    { id: 'games', label: 'Arcade Zone', icon: '🎮' },
    { id: 'profile', label: 'Profile', icon: '👤' }
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brandHeader}>
        <div className={styles.logoIcon}>⚡</div>
        <div className={styles.brandDetails}>
          <h2 className={styles.brandTitle}>STUDENT AI</h2>
          <span className={styles.roleBadge}>{user?.role || 'STUDENT'}</span>
        </div>
      </div>

      <nav className={styles.navList}>
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.navLink} ${isActive ? styles.activeLink : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className={styles.linkIcon}>{item.icon}</span>
              <span className={styles.linkLabel}>{item.label}</span>
              {isActive && <div className={styles.activeGlow} />}
            </button>
          );
        })}
      </nav>

      {/* COMPACT BLINKING FOOTER BADGE */}
      <div className={styles.sidebarFooter}>
        <div className={styles.statusCard}>
          <div className={styles.pulseContainer}>
            <span className={styles.blinkingDot}></span>
            <span className={styles.pingRing}></span>
          </div>
          <div className={styles.statusInfo}>
            <p className={styles.statusTitle}>SkillMatrix Academy</p>
            <p className={styles.statusSub}>Live Learning Engine</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;