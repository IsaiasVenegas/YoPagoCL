// API Configuration
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.140:8000';

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  phone?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface ApiError {
  detail: string;
}

// Store token in memory (in production, use secure storage)
let authToken: string | null = null;
let currentUser: User | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = (): string | null => {
  return authToken;
};

export const setCurrentUser = (user: User | null) => {
  currentUser = user;
};

export const getCurrentUser = (): User | null => {
  return currentUser;
};

// API Service
class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error('[API] Error response body:', responseText);
      
      let error: ApiError;
      try {
        error = JSON.parse(responseText);
      } catch {
        error = {
          detail: `HTTP error! status: ${response.status}. Body: ${responseText}`,
        };
      }
      
      console.error('[API] Parsed error:', error);
      throw new Error(error.detail || `Request failed with status ${response.status}`);
    }

    const responseData = await response.json();
    return responseData;
  }

  async register(data: RegisterRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async logout(): Promise<void> {
    await this.request('/api/auth/logout', {
      method: 'GET',
    });
    setAuthToken(null);
    setCurrentUser(null);
  }

  async topUpWallet(amount: number, currency: string = 'CLP'): Promise<any> {
    const payload = {
      amount: Math.round(amount * 100), // Convert to centavos
      currency,
    };
    
    try {
      const response = await this.request('/api/wallets/top-up', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return response;
    } catch (error: any) {
      console.error('[API] Top-up wallet error:', error);
      console.error('[API] Error message:', error.message);
      console.error('[API] Error details:', error);
      throw error;
    }
  }

  async payBill(sessionId: string, groupId: string, amount: number, currency: string = 'CLP'): Promise<any> {
    return this.request('/api/invoices/pay-bill', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        group_id: groupId,
        amount: Math.round(amount * 100), // Convert to centavos
        currency,
      }),
    });
  }

  async getUserWallet(userId: string): Promise<any> {
    return this.request(`/api/wallets/users/${userId}`, {
      method: 'GET',
    });
  }
}

export const apiService = new ApiService(API_BASE_URL);

