const API_BASE = '/api';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const token = localStorage.getItem('accessToken');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `Request failed: ${response.status}`);
  }

  return response.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface Wallet {
  id: string;
  address: string;
  chain: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRule {
  id: string;
  userId: string;
  walletId: string;
  chain: string;
  type: string;
  threshold: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlertRulePayload {
  walletId: string;
  chain: string;
  type: string;
  threshold?: string;
}

export const authApi = {
  register: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/register', { email, password }),
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),
  logout: () => api.post<{ message: string }>('/auth/logout'),
  me: () => api.get<User>('/auth/me'),
};

export const walletsApi = {
  create: (address: string, chain: string) =>
    api.post<Wallet>('/wallets', { address, chain }),
  findAll: () => api.get<Wallet[]>('/wallets'),
  findOne: (id: string) => api.get<Wallet>(`/wallets/${id}`),
  remove: (id: string) => api.delete<{ message: string }>(`/wallets/${id}`),
};

export const alertRulesApi = {
  create: (payload: CreateAlertRulePayload) =>
    api.post<AlertRule>('/alert-rules', payload),
  findAll: () => api.get<AlertRule[]>('/alert-rules'),
  findOne: (id: string) => api.get<AlertRule>(`/alert-rules/${id}`),
  remove: (id: string) => api.delete<{ message: string }>(`/alert-rules/${id}`),
};
