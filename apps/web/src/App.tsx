import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { RequireRole } from './components/RequireRole';
import { LoginPage } from './pages/LoginPage';
import { LobbyPage } from './pages/LobbyPage';
import { ChatsPage } from './pages/ChatsPage';
import { PatientFilesPage } from './pages/PatientFilesPage';
import { DoctorSearchPage } from './pages/DoctorSearchPage';
import { DoctorProfilePage } from './pages/DoctorProfilePage';
import { DoctorAvailabilityPage } from './pages/DoctorAvailabilityPage';
import { DoctorPatientsPage } from './pages/DoctorPatientsPage';
import { DoctorPatientDetailPage } from './pages/DoctorPatientDetailPage';
import { DoctorPatientFilesPage } from './pages/DoctorPatientFilesPage';
import { DoctorPatientHistoryPage } from './pages/DoctorPatientHistoryPage';
import { PatientHistoryPage } from './pages/PatientHistoryPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { DoctorLocationPage } from './pages/DoctorLocationPage';
import { GeoNearbyPage } from './pages/GeoNearbyPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminHomePage } from './pages/admin/AdminHomePage';
import { AdminSpecialtiesPage } from './pages/admin/AdminSpecialtiesPage';

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
            path="/admin"
            element={
              <RequireRole role="admin">
                <AdminLayout>
                  <AdminHomePage />
                </AdminLayout>
              </RequireRole>
            }
          />
          <Route
            path="/admin/specialties"
            element={
              <RequireRole role="admin">
                <AdminLayout>
                  <AdminSpecialtiesPage />
                </AdminLayout>
              </RequireRole>
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
            path="/doctor-location"
            element={
              <PrivateRoute>
                <DoctorLocationPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/doctor-patients"
            element={
              <PrivateRoute>
                <DoctorPatientsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/geo-nearby"
            element={
              <PrivateRoute>
                <GeoNearbyPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/doctor-patients/:patientId"
            element={
              <PrivateRoute>
                <DoctorPatientDetailPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/doctor-patients/:patientId/files"
            element={
              <PrivateRoute>
                <DoctorPatientFilesPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/doctor-patients/:patientId/history"
            element={
              <PrivateRoute>
                <DoctorPatientHistoryPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/patient-history"
            element={
              <PrivateRoute>
                <PatientHistoryPage />
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
