import { useQuery } from '@tanstack/react-query';
import { createApiClient } from './api-client';

const api = createApiClient();

export const meQueryKey = ['me'] as const;

/**
 * Tài khoản đang đăng nhập (`null` = khách). Chỉ chạy ở browser: HTML render phía server
 * không phụ thuộc cookie nên cache công khai được.
 */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async () => {
      const res = await api.api.v1.me.$get();
      if (res.status === 200) return (await res.json()).user;
      if (res.status === 401) return null;
      throw new Error('GET /api/v1/me thất bại');
    },
  });
}
