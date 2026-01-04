import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { setAccessTokenGetter } from '../api/http';

export type ActiveRole = 'doctor' | 'patient';

interface AuthContextType {
  doctorToken: string | null;
  patientToken: string | null;
  activeRole: ActiveRole | null;
  setDoctorToken: (token: string | null) => void;
  setPatientToken: (token: string | null) => void;
  setActiveRole: (role: ActiveRole | null) => void;
  getActiveToken: () => string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEYS = {
  doctorToken: 'telmed.auth.doctorToken',
  patientToken: 'telmed.auth.patientToken',
  activeRole: 'telmed.auth.activeRole',
} as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [doctorToken, setDoctorTokenState] = useState<string | null>(() => {
    if (import.meta.env.DEV) {
      return localStorage.getItem(STORAGE_KEYS.doctorToken);
    }
    return null;
  });

  const [patientToken, setPatientTokenState] = useState<string | null>(() => {
    if (import.meta.env.DEV) {
      return localStorage.getItem(STORAGE_KEYS.patientToken);
    }
    return null;
  });

  const [activeRole, setActiveRoleState] = useState<ActiveRole | null>(() => {
    if (import.meta.env.DEV) {
      const stored = localStorage.getItem(STORAGE_KEYS.activeRole);
      return (stored === 'doctor' || stored === 'patient' ? stored : null) as ActiveRole | null;
    }
    return null;
  });

  // Sincronizar getter de token activo con HTTP client
  // Esto permite que el HTTP client obtenga el token correcto en cada request
  // La función se recrea cuando cambian activeRole, doctorToken o patientToken
  useEffect(() => {
    const getActiveTokenFn = (): string | null => {
      if (activeRole === 'doctor') return doctorToken;
      if (activeRole === 'patient') return patientToken;
      return null;
    };
    
    setAccessTokenGetter(getActiveTokenFn);
    return () => {
      setAccessTokenGetter(null);
    };
  }, [activeRole, doctorToken, patientToken]);

  // getActiveToken para uso en componentes (exportado en context)
  const getActiveToken = (): string | null => {
    if (activeRole === 'doctor') return doctorToken;
    if (activeRole === 'patient') return patientToken;
    return null;
  };

  // Persistir en localStorage solo en desarrollo
  useEffect(() => {
    if (import.meta.env.DEV) {
      if (doctorToken) {
        localStorage.setItem(STORAGE_KEYS.doctorToken, doctorToken);
      } else {
        localStorage.removeItem(STORAGE_KEYS.doctorToken);
      }
    }
  }, [doctorToken]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      if (patientToken) {
        localStorage.setItem(STORAGE_KEYS.patientToken, patientToken);
      } else {
        localStorage.removeItem(STORAGE_KEYS.patientToken);
      }
    }
  }, [patientToken]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      if (activeRole) {
        localStorage.setItem(STORAGE_KEYS.activeRole, activeRole);
      } else {
        localStorage.removeItem(STORAGE_KEYS.activeRole);
      }
    }
  }, [activeRole]);

  const setDoctorToken = (token: string | null) => {
    setDoctorTokenState(token);
  };

  const setPatientToken = (token: string | null) => {
    setPatientTokenState(token);
  };

  const setActiveRole = (role: ActiveRole | null) => {
    setActiveRoleState(role);
  };

  const logout = () => {
    setDoctorTokenState(null);
    setPatientTokenState(null);
    setActiveRoleState(null);
    if (import.meta.env.DEV) {
      localStorage.removeItem(STORAGE_KEYS.doctorToken);
      localStorage.removeItem(STORAGE_KEYS.patientToken);
      localStorage.removeItem(STORAGE_KEYS.activeRole);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        doctorToken,
        patientToken,
        activeRole,
        setDoctorToken,
        setPatientToken,
        setActiveRole,
        getActiveToken,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
