/**
 * Client Better Auth cho browser: gọi `/api/auth/*` cùng origin. Chỉ `import type` từ
 * `@novel-hub/auth` để bundle client không kéo theo code server.
 */
import type { Auth } from '@novel-hub/auth';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [inferAdditionalFields<Auth>()],
});
