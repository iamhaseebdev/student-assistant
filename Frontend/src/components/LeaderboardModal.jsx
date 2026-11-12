import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import apiClient from '../api/apiClient';
import styles from './LeaderboardModal.module.css';

const LeaderboardModal = ({ onClose }) => {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      let res;
      try {
        res = await apiClient.get('/assistant/leaderboard');
      } catch (e) {
        res = await apiClient.get('/assistant/quiz/leaderboard');
      }
      setRankings(res.data.leaderboard || []);
    } catch (err) {
      console.error("Failed to fetch leaderboard", err);
    } finally {
      setLoading(false);
    }
  };

  return ReactDOM.createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.titleBox}>
            <span className={styles.trophyIcon}>🏆</span>
            <div>
              <h3>STUDENT XP LEADERBOARD</h3>
              <p>Top Performing Scholars Ranking</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✖</button>
        </div>

        {loading ? (
          <div className={styles.loadingText}>⏳ Loading Live Rankings...</div>
        ) : rankings.length > 0 ? (
          <div className={styles.cardList}>
            {rankings.map((item) => (
              <div key={item.rank} className={`${styles.rankCard} ${item.rank === 1 ? styles.topRankCard : ''}`}>
                <div className={styles.leftInfo}>
                  <div className={styles.rankBadge}>
                    <span>{item.rank === 1 ? '🥇 #1' : item.rank === 2 ? '🥈 #2' : item.rank === 3 ? '🥉 #3' : `#${item.rank}`}</span>
                  </div>
                  <div className={styles.studentDetails}>
                    <h4 className={styles.studentName}>{item.studentName}</h4>
                    <p className={styles.levelTag}>LEVEL {item.level} SCHOLAR</p>
                  </div>
                </div>

                <div className={styles.rightXP}>
                  ⚡ {item.xpPoints} XP
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p>🏆 No rankings recorded yet.</p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default LeaderboardModal;