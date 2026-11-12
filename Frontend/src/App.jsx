import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider } from './context/AuthContext';
import SignUpForm from './auth/SignUpForm';
import LoginForm from './auth/LoginForm';
import Dashboard from './dashboard/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public / Guest Routes (Logged-in user access nahi kar sakta) */}
          <Route element={<PublicRoute />}>
            <Route path="/" element={<Navigate to="/signup" replace />} />
            <Route path="/signup" element={<SignUpForm />} />
            <Route path="/login" element={<LoginForm />} />
          </Route>
          
          {/* Protected Dashboard Routes (Only Authenticated Session) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/student-dashboard" element={<Dashboard />} />
            <Route path="/admin-dashboard" element={<Dashboard />} />
          </Route>

          {/* Fallback Unknown Route Redirect */}
          <Route path="*" element={<Navigate to="/student-dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;