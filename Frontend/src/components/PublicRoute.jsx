import React from 'react';
import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../context/AuthContext';

const PublicRoute = () => {
  const { token, user } = useAuth();

  if (token && user) {
    return <Navigate to="/student-dashboard" replace />;
  }

  return <Outlet />;
};

export default PublicRoute;