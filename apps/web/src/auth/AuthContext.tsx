import {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  ReactNode,
} from 'react';
import { setAccessTokenGetter } from '../api/http';

export type ActiveRole = 'doctor' | 'patient' | 'admin';

interface AuthContextType {
  doctorToken: string | null;
  patientToken: string | null;
  adminToken: string | null;
  activeRole: ActiveRole | null;
  setDoctorToken: (token: string | null) => void;
  setPatientToken: (token: string | null) => void;
  setAdminToken: (token: string | null) => void;
  setActiveRole: (role: ActiveRole | null) => void;
  getActiveToken: () => string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEYS = {
  doctorToken: 'telmed.auth.doctorToken',
  patientToken: 'telmed.auth.patientToken',
  adminToken: 'telmed.auth.adminToken',
  activeRole: 'telmed.auth.activeRole',
} as const;

// Normalize token: remove "Bearer " prefix if present
// Tokens should be stored without "Bearer " prefix
function normalizeToken(token: string | null): string | null {
  if (!token) return null;
  return token.startsWith('Bearer ') ? token.substring(7) : token;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Normalize tokens when reading from storage (boot)
  // CRÍTICO: leer tokens y activeRole del localStorage al boot para sincronizar http client inmediatamente
  const [doctorToken, setDoctorTokenState] = useState<string | null>(() => {
    if (import.meta.env.DEV) {
      const stored = localStorage.getItem(STORAGE_KEYS.doctorToken);
      const normalized = normalizeToken(stored);
      if (import.meta.env.DEV && normalized) {
        const tokenPreview =
          normalized.length > 12
            ? `${normalized.substring(0, 6)}...${normalized.substring(normalized.length - 6)}`
            : normalized.substring(0, 6);
        console.log(
          `[AuthContext] Boot: Loaded doctorToken from storage (${tokenPreview})`,
        );
      }
      return normalized;
    }
    return null;
  });

  const [patientToken, setPatientTokenState] = useState<string | null>(() => {
    if (import.meta.env.DEV) {
      const stored = localStorage.getItem(STORAGE_KEYS.patientToken);
      const normalized = normalizeToken(stored);
      if (import.meta.env.DEV && normalized) {
        const tokenPreview =
          normalized.length > 12
            ? `${normalized.substring(0, 6)}...${normalized.substring(normalized.length - 6)}`
            : normalized.substring(0, 6);
        console.log(
          `[AuthContext] Boot: Loaded patientToken from storage (${tokenPreview})`,
        );
      }
      return normalized;
    }
    return null;
  });

  const [adminToken, setAdminTokenState] = useState<string | null>(() => {
    if (import.meta.env.DEV) {
      const stored = localStorage.getItem(STORAGE_KEYS.adminToken);
      const normalized = normalizeToken(stored);
      if (import.meta.env.DEV && normalized) {
        const tokenPreview =
          normalized.length > 12
            ? `${normalized.substring(0, 6)}...${normalized.substring(normalized.length - 6)}`
            : normalized.substring(0, 6);
        console.log(
          `[AuthContext] Boot: Loaded adminToken from storage (${tokenPreview})`,
        );
      }
      return normalized;
    }
    return null;
  });

  const [activeRole, setActiveRoleState] = useState<ActiveRole | null>(() => {
    if (import.meta.env.DEV) {
      const stored = localStorage.getItem(STORAGE_KEYS.activeRole);
      const role =
        stored === 'doctor' || stored === 'patient' || stored === 'admin'
          ? stored
          : null;
      if (import.meta.env.DEV && role) {
        console.log(
          `[AuthContext] Boot: Loaded activeRole from storage (${role})`,
        );
      }
      return role as ActiveRole | null;
    }
    return null;
  });

  // Sincronizar getter de token activo con HTTP client
  // CRÍTICO: usar useLayoutEffect para sincronizar ANTES del primer render
  // Esto asegura que el token esté disponible antes de que cualquier request se haga
  // Se ejecuta inmediatamente al boot y cuando cambia activeRole para sincronizar el token correcto
  useLayoutEffect(() => {
    const getActiveTokenFn = (): string | null => {
      if (activeRole === 'doctor') return doctorToken;
      if (activeRole === 'patient') return patientToken;
      if (activeRole === 'admin') return adminToken;
      return null;
    };

    const activeToken = getActiveTokenFn();

    // Sincronizar http client con el token del rol activo
    setAccessTokenGetter(getActiveTokenFn);

    // Debug log (dev only): confirmar sincronización
    if (import.meta.env.DEV) {
      if (activeToken) {
        const tokenPreview =
          activeToken.length > 12
            ? `${activeToken.substring(0, 6)}...${activeToken.substring(activeToken.length - 6)}`
            : activeToken.substring(0, 6);
        console.log(
          `[AuthContext] Synced HTTP client with ${activeRole} token (${tokenPreview})`,
        );
      } else {
        console.warn(
          `[AuthContext] No token available for activeRole=${activeRole} - HTTP client will not send Authorization`,
        );
      }
    }

    return () => {
      setAccessTokenGetter(null);
    };
  }, [activeRole, doctorToken, patientToken, adminToken]);

  // getActiveToken para uso en componentes (exportado en context)
  const getActiveToken = (): string | null => {
    if (activeRole === 'doctor') return doctorToken;
    if (activeRole === 'patient') return patientToken;
    if (activeRole === 'admin') return adminToken;
    return null;
  };

  // Persistir en localStorage solo en desarrollo
  // Normalizar tokens antes de guardar (sin "Bearer " prefix)
  useEffect(() => {
    if (import.meta.env.DEV) {
      const normalized = normalizeToken(doctorToken);
      if (normalized) {
        localStorage.setItem(STORAGE_KEYS.doctorToken, normalized);
      } else {
        localStorage.removeItem(STORAGE_KEYS.doctorToken);
      }
    }
  }, [doctorToken]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      const normalized = normalizeToken(patientToken);
      if (normalized) {
        localStorage.setItem(STORAGE_KEYS.patientToken, normalized);
      } else {
        localStorage.removeItem(STORAGE_KEYS.patientToken);
      }
    }
  }, [patientToken]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      const normalized = normalizeToken(adminToken);
      if (normalized) {
        localStorage.setItem(STORAGE_KEYS.adminToken, normalized);
      } else {
        localStorage.removeItem(STORAGE_KEYS.adminToken);
      }
    }
  }, [adminToken]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      if (activeRole) {
        localStorage.setItem(STORAGE_KEYS.activeRole, activeRole);
      } else {
        localStorage.removeItem(STORAGE_KEYS.activeRole);
      }
    }
  }, [activeRole]);

  // Normalizar tokens al setear (remover "Bearer " prefix si existe)
  // Esto asegura que los tokens siempre se guarden sin el prefix
  const setDoctorToken = (token: string | null) => {
    setDoctorTokenState(normalizeToken(token));
  };

  const setPatientToken = (token: string | null) => {
    setPatientTokenState(normalizeToken(token));
  };

  const setAdminToken = (token: string | null) => {
    setAdminTokenState(normalizeToken(token));
  };

  const setActiveRole = (role: ActiveRole | null) => {
    setActiveRoleState(role);
  };

  const logout = () => {
    setDoctorTokenState(null);
    setPatientTokenState(null);
    setAdminTokenState(null);
    setActiveRoleState(null);
    if (import.meta.env.DEV) {
      localStorage.removeItem(STORAGE_KEYS.doctorToken);
      localStorage.removeItem(STORAGE_KEYS.patientToken);
      localStorage.removeItem(STORAGE_KEYS.adminToken);
      localStorage.removeItem(STORAGE_KEYS.activeRole);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        doctorToken,
        patientToken,
        adminToken,
        activeRole,
        setDoctorToken,
        setPatientToken,
        setAdminToken,
        setActiveRole,
        getActiveToken,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
