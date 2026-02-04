import { http } from './http';
import { endpoints } from './endpoints';

export interface Specialty {
  id: string;
  name: string;
  slug: string;
  sortOrder?: number;
  isActive: boolean;
}

/**
 * List active specialties
 * @param limit - Maximum number of specialties to return (default: 50)
 * @param offset - Offset for pagination (default: 0)
 */
export async function getSpecialties(
  limit?: number,
  offset?: number,
): Promise<Specialty[]> {
  const params = new URLSearchParams();
  if (limit !== undefined) {
    params.append('limit', String(limit));
  }
  if (offset !== undefined) {
    params.append('offset', String(offset));
  }
  const query = params.toString();
  const url = query
    ? `${endpoints.specialties.list}?${query}`
    : endpoints.specialties.list;
  return http<Specialty[]>(url);
}
