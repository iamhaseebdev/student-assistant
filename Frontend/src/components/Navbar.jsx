import React from 'react';
import styles from './Navbar.module.css';

const Navbar = ({ user, onLogout, onOpenLeaderboard }) => {
  return (
    <header className={styles.headerBar}>
      {/* Greeting Section */}
      <div className={styles.greetingSection}>
        <h3 className={styles.welcomeHeading}>
          Welcome back, <span className={styles.userName}>{user?.StudentName || user?.name || user?.email?.split('@')[0] || 'Ali'}</span> 👋
        </h3>
        <p className={styles.subTitle}>Here is your learning overview for today</p>
      </div>

      {/* Action Section */}
      <div className={styles.actionSection}>
        {/* Cyan Theme Leaderboard Trigger Button */}
        <button 
          type="button" 
          className={styles.cyanLeaderboardBtn}
          onClick={onOpenLeaderboard}
          title="View Student Leaderboard"
        >
          <span className={styles.lbIcon}>🏆</span>
          <span className={styles.lbLabel}>Leaderboard</span>
        </button>

        {/* User Badge */}
        <div className={styles.userBadge}>
          <div className={styles.userAvatar}>
            {(user?.StudentName || user?.name || user?.email || 'ST').substring(0, 2).toUpperCase()}
          </div>
          <span className={styles.userEmail}>{user?.StudentEmail || user?.email}</span>
        </div>

        {/* Logout Button */}
        <button type="button" className={styles.logoutBtn} onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
};

export default Navbar;