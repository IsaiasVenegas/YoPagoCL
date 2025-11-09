// API Configuration
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://56.126.24.163';

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
  avatar_url: string | null;
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

  async getWalletTransactions(userId: string, limit?: number): Promise<any[]> {
    const params = limit ? `?limit=${limit}` : '';
    return this.request(`/api/wallets/users/${userId}/transactions${params}`, {
      method: 'GET',
    });
  }

  // Groups
  async getGroups(): Promise<any[]> {
    return this.request('/api/groups', {
      method: 'GET',
    });
  }

  async getGroup(groupId: string): Promise<any> {
    return this.request(`/api/groups/${groupId}`, {
      method: 'GET',
    });
  }

  async createGroup(data: { name: string; description?: string; member_ids?: string[] }): Promise<any> {
    return this.request('/api/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateGroup(groupId: string, data: { name?: string; description?: string }): Promise<any> {
    return this.request(`/api/groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteGroup(groupId: string): Promise<void> {
    return this.request(`/api/groups/${groupId}`, {
      method: 'DELETE',
    });
  }

  async getGroupMembers(groupId: string): Promise<any[]> {
    return this.request(`/api/groups/${groupId}/members`, {
      method: 'GET',
    });
  }

  async addGroupMember(groupId: string, userId: string): Promise<any> {
    return this.request(`/api/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    return this.request(`/api/groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  async searchUserByEmail(email: string): Promise<User> {
    return this.request(`/api/auth/users/search?email=${encodeURIComponent(email)}`, {
      method: 'GET',
    });
  }

  async getCurrentUser(): Promise<User> {
    return this.request('/api/auth/users/me', {
      method: 'GET',
    });
  }

  async updateCurrentUser(data: { name?: string; phone?: string; avatar_url?: string | null }): Promise<User> {
    return this.request('/api/auth/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async uploadAvatar(formData: FormData): Promise<User> {
    const url = `${this.baseUrl}/api/auth/users/me/avatar`;
    const headers: HeadersInit = {};

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    // Don't set Content-Type for FormData, let the browser set it with boundary

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const responseText = await response.text();
      let error: ApiError;
      try {
        error = JSON.parse(responseText);
      } catch {
        error = {
          detail: `HTTP error! status: ${response.status}. Body: ${responseText}`,
        };
      }
      throw new Error(error.detail || `Request failed with status ${response.status}`);
    }

    return response.json();
  }

  // Invoices
  async getInvoices(userId?: string, status?: string, groupId?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (userId) params.append('user_id', userId);
    if (status) params.append('status', status);
    if (groupId) params.append('group_id', groupId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/invoices${query}`, {
      method: 'GET',
    });
  }

  async getUserInvoices(userId: string): Promise<any[]> {
    return this.request(`/api/invoices/users/${userId}/invoices`, {
      method: 'GET',
    });
  }

  async getUserPendingInvoices(userId: string): Promise<any[]> {
    return this.request(`/api/invoices/users/${userId}/invoices/pending`, {
      method: 'GET',
    });
  }

  async getInvoice(invoiceId: string): Promise<any> {
    return this.request(`/api/invoices/${invoiceId}`, {
      method: 'GET',
    });
  }

  async markInvoicePaid(invoiceId: string, paidAt?: string): Promise<any> {
    return this.request(`/api/invoices/${invoiceId}/mark-paid`, {
      method: 'PUT',
      body: JSON.stringify({ paid_at: paidAt || new Date().toISOString() }),
    });
  }

  async getAvailableGroups(debtorId: string, creditorId: string): Promise<any[]> {
    const response = await this.request<{ groups: any[] }>(`/api/invoices/available-groups?debtor_id=${debtorId}&creditor_id=${creditorId}`, {
      method: 'GET',
    });
    return response.groups || [];
  }

  // Settlements
  async getSettlements(userId?: string, groupId?: string, invoiceId?: string, tableSessionId?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (userId) params.append('user_id', userId);
    if (groupId) params.append('group_id', groupId);
    if (invoiceId) params.append('invoice_id', invoiceId);
    if (tableSessionId) params.append('table_session_id', tableSessionId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/settlements${query}`, {
      method: 'GET',
    });
  }

  async getGroupSettlements(groupId: string): Promise<any[]> {
    return this.request(`/api/settlements/groups/${groupId}/settlements`, {
      method: 'GET',
    });
  }

  // Reminders
  async getReminders(invoiceId?: string, status?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (invoiceId) params.append('invoice_id', invoiceId);
    if (status) params.append('status', status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/reminders${query}`, {
      method: 'GET',
    });
  }

  async getInvoiceReminders(invoiceId: string): Promise<any[]> {
    return this.request(`/api/reminders/invoices/${invoiceId}/reminders`, {
      method: 'GET',
    });
  }

  async createReminder(data: { invoice_id: string; message?: string; reminder_date?: string }): Promise<any> {
    return this.request('/api/reminders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async sendPushNotification(invoiceId: string, message?: string): Promise<any> {
    return this.request('/api/reminders/send-push-notification', {
      method: 'POST',
      body: JSON.stringify({
        invoice_id: invoiceId,
        message: message || undefined,
      }),
    });
  }

  async registerPushNotificationToken(token: string): Promise<User> {
    return this.request('/api/auth/users/me', {
      method: 'PUT',
      body: JSON.stringify({
        push_notification_token: token,
      }),
    });
  }
}

export const apiService = new ApiService(API_BASE_URL);

