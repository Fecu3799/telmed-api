import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { LoginPage } from './pages/LoginPage';
import { LobbyPage } from './pages/LobbyPage';
import { ChatsPage } from './pages/ChatsPage';
import { PatientFilesPage } from './pages/PatientFilesPage';
import { DoctorSearchPage } from './pages/DoctorSearchPage';
import { DoctorProfilePage } from './pages/DoctorProfilePage';
import { DoctorAvailabilityPage } from './pages/DoctorAvailabilityPage';
import { AppointmentsPage } from './pages/AppointmentsPage';

// Lazy load RoomPage to reduce initial bundle size (LiveKit is large)
const RoomPage = lazy(() =>
  import('./pages/RoomPage').then((m) => ({ default: m.RoomPage })),
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/lobby"
            element={
              <PrivateRoute>
                <LobbyPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/chats"
            element={
              <PrivateRoute>
                <ChatsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/patient-files"
            element={
              <PrivateRoute>
                <PatientFilesPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/doctor-search"
            element={
              <PrivateRoute>
                <DoctorSearchPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/doctor-profile/:doctorUserId"
            element={
              <PrivateRoute>
                <DoctorProfilePage />
              </PrivateRoute>
            }
          />
          <Route
            path="/appointments"
            element={
              <PrivateRoute>
                <AppointmentsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/doctor-availability"
            element={
              <PrivateRoute>
                <DoctorAvailabilityPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/room/:consultationId"
            element={
              <PrivateRoute>
                <Suspense
                  fallback={
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        minHeight: '100vh',
                      }}
                    >
                      Loading room...
                    </div>
                  }
                >
                  <RoomPage />
                </Suspense>
              </PrivateRoute>
            }
          />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
