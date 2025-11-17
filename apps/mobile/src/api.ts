import createClient from 'openapi-fetch';
import type { paths } from '@app/contracts';
import Constants from 'expo-constants';

// Get API URL from config or environment
const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3101';

// Create typed API client bound to /api/v1
export const apiClient = createClient<paths>({
  baseUrl: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper to set auth token
export function setAuthToken(token: string | null) {
  if (token) {
    apiClient.use({
      onRequest: async ({ request }) => {
        request.headers.set('Authorization', `Bearer ${token}`);
        return request;
      },
    });
  }
}

export default apiClient;
