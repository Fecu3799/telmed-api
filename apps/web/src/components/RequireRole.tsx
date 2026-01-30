import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, type ActiveRole } from '../auth/AuthContext';

interface RequireRoleProps {
  role: ActiveRole;
  children: React.ReactNode;
}

export function RequireRole({ role, children }: RequireRoleProps) {
  const { getActiveToken, activeRole } = useAuth();

  if (!getActiveToken()) {
    return <Navigate to="/login" replace />;
  }

  if (activeRole !== role) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '8px' }}>Acceso denegado</h2>
        <p style={{ color: '#666' }}>
          No tenés permisos para acceder a esta sección.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
