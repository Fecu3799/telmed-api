import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { login } from '../api/auth';
import { registerDemoUsers, loginAsDoctor, loginAsPatient } from '../api/demo';
import { type ProblemDetails, type ApiError } from '../api/http';

export function LoginPage() {
  const navigate = useNavigate();
  const { setDoctorToken, setPatientToken, setActiveRole } = useAuth();
  
  // Manual login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ProblemDetails | null>(null);

  // Demo credentials state
  const [doctorEmail, setDoctorEmail] = useState('doctor.demo@telmed.test');
  const [doctorPassword, setDoctorPassword] = useState('Pass123!');
  const [patientEmail, setPatientEmail] = useState('patient.demo@telmed.test');
  const [patientPassword, setPatientPassword] = useState('Pass123!');
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [demoError, setDemoError] = useState<ProblemDetails | null>(null);
  const [registerAvailable, setRegisterAvailable] = useState<boolean | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await login({ email, password });
      // Guardar token según el rol del usuario
      if (response.user.role === 'doctor') {
        setDoctorToken(response.accessToken);
        setActiveRole('doctor');
      } else if (response.user.role === 'patient') {
        setPatientToken(response.accessToken);
        setActiveRole('patient');
      }
      navigate('/lobby');
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.problemDetails) {
        setError(apiError.problemDetails);
      } else {
        setError({
          status: apiError.status || 500,
          detail: apiError.message || 'An error occurred during login',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterDemo = async () => {
    setLoadingDemo(true);
    setDemoError(null);

    try {
      const result = await registerDemoUsers(
        { email: doctorEmail, password: doctorPassword },
        { email: patientEmail, password: patientPassword },
      );

      // Check if register endpoint is not available
      const has404 = result.errors.some((e) => e.error.status === 404);
      if (has404) {
        setRegisterAvailable(false);
        setDemoError({
          status: 404,
          detail: 'Register endpoint not available',
        });
        return;
      }

      setRegisterAvailable(true);

      // Show errors if any (but not 409, which is OK)
      const realErrors = result.errors.filter((e) => e.error.status !== 409);
      if (realErrors.length > 0) {
        const firstError = realErrors[0].error;
        setDemoError(firstError);
      } else {
        // Success (both created or already existed)
        setDemoError(null);
      }
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails; status?: number };
      if (apiError.status === 404) {
        setRegisterAvailable(false);
        setDemoError({
          status: 404,
          detail: 'Register endpoint not available',
        });
      } else {
        setDemoError(
          apiError.problemDetails || {
            status: apiError.status || 500,
            detail: 'Failed to register demo users',
          },
        );
      }
    } finally {
      setLoadingDemo(false);
    }
  };

  const handleLoginDoctor = async () => {
    setLoadingDemo(true);
    setDemoError(null);

    try {
      const token = await loginAsDoctor({
        email: doctorEmail,
        password: doctorPassword,
      });
      setDoctorToken(token);
      setActiveRole('doctor');
      navigate('/lobby');
    } catch (err) {
      const apiError = err as ApiError;
      setDemoError(
        apiError.problemDetails || {
          status: apiError.status || 500,
          detail: apiError.message || 'Failed to login as doctor',
        },
      );
    } finally {
      setLoadingDemo(false);
    }
  };

  const handleLoginPatient = async () => {
    setLoadingDemo(true);
    setDemoError(null);

    try {
      const token = await loginAsPatient({
        email: patientEmail,
        password: patientPassword,
      });
      setPatientToken(token);
      setActiveRole('patient');
      navigate('/lobby');
    } catch (err) {
      const apiError = err as ApiError;
      setDemoError(
        apiError.problemDetails || {
          status: apiError.status || 500,
          detail: apiError.message || 'Failed to login as patient',
        },
      );
    } finally {
      setLoadingDemo(false);
    }
  };

  const sectionStyle = {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  };

  const buttonStyle = {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#007bff',
    color: 'white',
    cursor: 'pointer',
    marginRight: '8px',
    marginBottom: '8px',
    fontSize: '14px',
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div style={{ 
        width: '100%', 
        maxWidth: '600px',
      }}>
        {/* Demo Credentials Section */}
        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, marginBottom: '16px' }}>Demo Credentials</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ marginTop: 0, fontSize: '16px' }}>Doctor</h3>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Email</label>
                <input
                  type="email"
                  value={doctorEmail}
                  onChange={(e) => setDoctorEmail(e.target.value)}
                  disabled={loadingDemo}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Password</label>
                <input
                  type="password"
                  value={doctorPassword}
                  onChange={(e) => setDoctorPassword(e.target.value)}
                  disabled={loadingDemo}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
            <div>
              <h3 style={{ marginTop: 0, fontSize: '16px' }}>Patient</h3>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Email</label>
                <input
                  type="email"
                  value={patientEmail}
                  onChange={(e) => setPatientEmail(e.target.value)}
                  disabled={loadingDemo}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Password</label>
                <input
                  type="password"
                  value={patientPassword}
                  onChange={(e) => setPatientPassword(e.target.value)}
                  disabled={loadingDemo}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          </div>

          {demoError && (
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px',
              backgroundColor: '#fee',
              border: '1px solid #fcc',
              borderRadius: '4px',
              color: '#c33',
              fontSize: '14px'
            }}>
              <div style={{ fontWeight: '500', marginBottom: demoError.errors ? '8px' : 0 }}>
                {demoError.detail}
              </div>
              {demoError.errors && (
                <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                  {Object.entries(demoError.errors).map(([field, messages]) => (
                    <li key={field}>
                      <strong>{field}:</strong> {messages.join(', ')}
                    </li>
                  ))}
                </ul>
              )}
              {demoError.status === 404 && (
                <div style={{ marginTop: '8px', fontSize: '13px', fontStyle: 'italic' }}>
                  The register endpoint may not be available. You can still login if users already exist.
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              onClick={handleRegisterDemo}
              disabled={loadingDemo || registerAvailable === false}
              style={{
                ...buttonStyle,
                backgroundColor: loadingDemo || registerAvailable === false ? '#ccc' : '#28a745',
                cursor: loadingDemo || registerAvailable === false ? 'not-allowed' : 'pointer'
              }}
              title={registerAvailable === false ? 'Register endpoint not available' : ''}
            >
              {loadingDemo ? 'Registering...' : 'Register Demo Users'}
            </button>
            <button
              onClick={handleLoginDoctor}
              disabled={loadingDemo}
              style={{
                ...buttonStyle,
                backgroundColor: loadingDemo ? '#ccc' : '#007bff',
                cursor: loadingDemo ? 'not-allowed' : 'pointer'
              }}
            >
              Login Doctor
            </button>
            <button
              onClick={handleLoginPatient}
              disabled={loadingDemo}
              style={{
                ...buttonStyle,
                backgroundColor: loadingDemo ? '#ccc' : '#007bff',
                cursor: loadingDemo ? 'not-allowed' : 'pointer'
              }}
            >
              Login Patient
            </button>
          </div>
        </div>

        {/* Manual Login Section */}
        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, marginBottom: '16px' }}>Manual Login</h2>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="email" style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="password" style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {error && (
              <div style={{ 
                marginBottom: '16px', 
                padding: '12px',
                backgroundColor: '#fee',
                border: '1px solid #fcc',
                borderRadius: '4px',
                color: '#c33'
              }}>
                <div style={{ fontWeight: '500', marginBottom: error.errors ? '8px' : 0 }}>
                  {error.detail}
                </div>
                {error.errors && (
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                    {Object.entries(error.errors).map(([field, messages]) => (
                      <li key={field}>
                        <strong>{field}:</strong> {messages.join(', ')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: loading ? '#ccc' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '16px',
                fontWeight: '500',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
