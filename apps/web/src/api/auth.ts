import { http } from './http';
import { endpoints } from './endpoints';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: 'doctor' | 'patient';
}

export interface AuthUser {
  id: string;
  role: 'patient' | 'doctor' | 'admin';
  email: string;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface AuthMeResponse {
  id: string;
  role: 'patient' | 'doctor' | 'admin';
  sessionId?: string;
  hasPatientIdentity: boolean;
}

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  return http<LoginResponse>(endpoints.auth.login, {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function register(data: RegisterRequest): Promise<LoginResponse> {
  return http<LoginResponse>(endpoints.auth.register, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getMe(): Promise<AuthMeResponse> {
  return http<AuthMeResponse>(endpoints.auth.me);
}
