import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

// Components
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import TodoSection from '../components/TodoSection';
import PdfVault from '../components/PdfVault';
import NotesVaultSection from '../components/NotesVaultSection'; // 📝 IMPORT ADDED
import ProgressReport from '../components/ProgressReport';
import Notebook from '../components/Notebook';
import Chatbot from '../components/Chatbot';
import LeaderboardModal from '../components/LeaderboardModal';
import GamingArcade from '../components/GamingArcade';
import Profile from '../components/Profile';
import Timetable from '../components/Timetable';

// CSS Module
import styles from './Dashboard.module.css';

const Dashboard = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('todos');
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Session Protection Guard
  useEffect(() => {
    if (!token || !user) {
      navigate('/login', { replace: true });
    }
  }, [token, user, navigate]);

  if (!token || !user) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={styles.appContainer}>
      {/* 1. Left Glass Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} user={user} />

      {/* 2. Main Work Area */}
      <div className={styles.viewport}>
        <Navbar 
          user={user} 
          onLogout={handleLogout} 
          onOpenLeaderboard={() => setShowLeaderboard(true)}
        />

        <main className={styles.contentArea}>
          {activeTab === 'todos' && <TodoSection />}
          {(activeTab === 'mcqs' || activeTab === 'pdfs' || activeTab === 'pdf') && <PdfVault />}
          {activeTab === 'notes' && <NotesVaultSection />} {/* 📝 Subjective Notes Tab */}
          {activeTab === 'notebook' && <Notebook />}
          {activeTab === 'progress' && <ProgressReport />}
          {activeTab === 'games' && <GamingArcade />}
          {activeTab === 'timetable' && <Timetable />}
          {activeTab === 'profile' && <Profile />}
        </main>
      </div>

      {/* 3. Floating Chatbot */}
      <Chatbot />

      {/* 4. Global Leaderboard Modal */}
      {showLeaderboard && (
        <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
      )}
    </div>
  );
};

export default Dashboard;