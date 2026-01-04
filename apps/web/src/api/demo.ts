import { register, login, type LoginRequest } from './auth';
import { type ProblemDetails } from './http';

export interface DemoCredentials {
  email: string;
  password: string;
}

export interface RegisterDemoResult {
  doctorCreated: boolean;
  patientCreated: boolean;
  errors: Array<{ role: 'doctor' | 'patient'; error: ProblemDetails }>;
}

/**
 * Register demo users (doctor and patient)
 * Tolerates 409 (already exists) as success
 */
export async function registerDemoUsers(
  doctorCreds: DemoCredentials,
  patientCreds: DemoCredentials,
): Promise<RegisterDemoResult> {
  const result: RegisterDemoResult = {
    doctorCreated: false,
    patientCreated: false,
    errors: [],
  };

  // Register doctor
  try {
    await register({
      email: doctorCreds.email,
      password: doctorCreds.password,
      role: 'doctor',
    });
    result.doctorCreated = true;
  } catch (err: unknown) {
    const apiError = err as { problemDetails?: ProblemDetails; status?: number };
    if (apiError.status === 409) {
      // Already exists, treat as success
      result.doctorCreated = true;
    } else if (apiError.status === 404) {
      // Endpoint not available
      result.errors.push({
        role: 'doctor',
        error: {
          status: 404,
          detail: 'Register endpoint not available',
        },
      });
    } else {
      result.errors.push({
        role: 'doctor',
        error: apiError.problemDetails || {
          status: apiError.status || 500,
          detail: 'Failed to register doctor',
        },
      });
    }
  }

  // Register patient
  try {
    await register({
      email: patientCreds.email,
      password: patientCreds.password,
      role: 'patient',
    });
    result.patientCreated = true;
  } catch (err: unknown) {
    const apiError = err as { problemDetails?: ProblemDetails; status?: number };
    if (apiError.status === 409) {
      // Already exists, treat as success
      result.patientCreated = true;
    } else if (apiError.status === 404) {
      // Endpoint not available
      result.errors.push({
        role: 'patient',
        error: {
          status: 404,
          detail: 'Register endpoint not available',
        },
      });
    } else {
      result.errors.push({
        role: 'patient',
        error: apiError.problemDetails || {
          status: apiError.status || 500,
          detail: 'Failed to register patient',
        },
      });
    }
  }

  return result;
}

/**
 * Login as doctor and return token
 */
export async function loginAsDoctor(credentials: LoginRequest): Promise<string> {
  const response = await login(credentials);
  if (response.user.role !== 'doctor') {
    throw new Error('User is not a doctor');
  }
  return response.accessToken;
}

/**
 * Login as patient and return token
 */
export async function loginAsPatient(credentials: LoginRequest): Promise<string> {
  const response = await login(credentials);
  if (response.user.role !== 'patient') {
    throw new Error('User is not a patient');
  }
  return response.accessToken;
}

