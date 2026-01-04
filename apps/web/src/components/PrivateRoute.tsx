import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface PrivateRouteProps {
  children: React.ReactNode;
}

export function PrivateRoute({ children }: PrivateRouteProps) {
  const { getActiveToken } = useAuth();

  if (!getActiveToken()) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

