import { http } from './http';
import { endpoints } from './endpoints';

export interface AdminSpecialty {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deactivatedAt?: string | null;
}

export interface AdminSpecialtiesPageInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface AdminSpecialtiesListResponse {
  items: AdminSpecialty[];
  pageInfo: AdminSpecialtiesPageInfo;
}

export interface AdminSpecialtiesQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  isActive?: boolean;
}

export interface AdminSpecialtyCreatePayload {
  name: string;
  slug: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface AdminSpecialtyUpdatePayload {
  name?: string;
  slug?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export async function adminListSpecialties(
  query: AdminSpecialtiesQuery,
): Promise<AdminSpecialtiesListResponse> {
  const params = new URLSearchParams();
  if (query.page) params.append('page', String(query.page));
  if (query.pageSize) params.append('pageSize', String(query.pageSize));
  if (query.q) params.append('q', query.q);
  if (query.isActive !== undefined) {
    params.append('isActive', String(query.isActive));
  }

  const queryString = params.toString();
  const url = queryString
    ? `${endpoints.admin.specialties.list}?${queryString}`
    : endpoints.admin.specialties.list;

  return http<AdminSpecialtiesListResponse>(url);
}

export async function adminCreateSpecialty(
  payload: AdminSpecialtyCreatePayload,
): Promise<AdminSpecialty> {
  return http<AdminSpecialty>(endpoints.admin.specialties.create, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function adminUpdateSpecialty(
  id: string,
  payload: AdminSpecialtyUpdatePayload,
): Promise<AdminSpecialty> {
  return http<AdminSpecialty>(endpoints.admin.specialties.update(id), {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function adminActivateSpecialty(id: string): Promise<void> {
  return http<void>(endpoints.admin.specialties.activate(id), {
    method: 'POST',
  });
}

export async function adminDeactivateSpecialty(id: string): Promise<void> {
  return http<void>(endpoints.admin.specialties.deactivate(id), {
    method: 'POST',
  });
}
