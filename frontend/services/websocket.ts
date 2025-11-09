import { API_BASE_URL } from './api';
import { getAuthToken } from './api';

// Convert HTTP URL to WebSocket URL
const getWebSocketUrl = (path: string): string => {
  const baseUrl = API_BASE_URL.replace(/^https?:\/\//, '');
  const protocol = API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
  return `${protocol}://${baseUrl}${path}`;
};

// WebSocket message types based on backend schemas
export interface SessionStateMessage {
  type: 'session_state';
  session: {
    id: string;
    status: string;
    total_amount: number;
    currency: string;
  };
  participants: Array<{
    id: string;
    user_id: string | null;
    joined_at: string;
  }>;
  order_items: Array<{
    id: string;
    item_name: string;
    unit_price: number;
    ordered_at: string;
  }>;
  assignments: Array<{
    id: string;
    order_item_id: string;
    creditor_id: string;
    debtor_id: string | null;
    assigned_amount: number;
  }>;
}

export interface ParticipantJoinedMessage {
  type: 'participant_joined';
  participant_id: string;
  user_id: string | null;
  joined_at: string;
}

export interface ParticipantLeftMessage {
  type: 'participant_left';
  participant_id: string;
}

export interface ItemAssignedMessage {
  type: 'item_assigned';
  assignment_id: string;
  order_item_id: string;
  creditor_id: string;
  debtor_id: string | null;
  assigned_amount: number;
}

export interface AssignmentUpdatedMessage {
  type: 'assignment_updated';
  assignment_id: string;
  assigned_amount: number;
}

export interface AssignmentRemovedMessage {
  type: 'assignment_removed';
  assignment_id: string;
}

export interface SummaryUpdatedMessage {
  type: 'summary_updated';
  summary: Record<string, number>;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface SelectableParticipantsMessage {
  type: 'selectable_participants';
  order_item_id: string;
  selectable_participants: string[]; // Array of user_ids
}

export interface PayingForParticipantsMessage {
  type: 'paying_for_participants';
  order_item_id: string;
  paying_for_participants: string[]; // Array of user_ids
}

export type WebSocketMessage =
  | SessionStateMessage
  | ParticipantJoinedMessage
  | ParticipantLeftMessage
  | ItemAssignedMessage
  | AssignmentUpdatedMessage
  | AssignmentRemovedMessage
  | SummaryUpdatedMessage
  | ErrorMessage
  | SelectableParticipantsMessage
  | PayingForParticipantsMessage;

export interface JoinSessionMessage {
  type: 'join_session';
  user_id: string;
}

export interface AssignItemMessage {
  type: 'assign_item';
  order_item_id: string;
  creditor_id: string;
  debtor_id?: string | null;
  assigned_amount: number;
}

export interface UpdateAssignmentMessage {
  type: 'update_assignment';
  assignment_id: string;
  assigned_amount: number;
}

export interface RemoveAssignmentMessage {
  type: 'remove_assignment';
  assignment_id: string;
}

export interface GetSelectableParticipantsMessage {
  type: 'get_selectable_participants';
  order_item_id: string;
  user_id: string;
}

export interface GetPayingForParticipantsMessage {
  type: 'get_paying_for_participants';
  order_item_id: string;
  user_id: string;
}

export type OutgoingWebSocketMessage =
  | JoinSessionMessage
  | AssignItemMessage
  | UpdateAssignmentMessage
  | RemoveAssignmentMessage
  | GetSelectableParticipantsMessage
  | GetPayingForParticipantsMessage;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners: Set<(message: WebSocketMessage) => void> = new Set();
  private onConnectCallbacks: Set<() => void> = new Set();
  private onDisconnectCallbacks: Set<() => void> = new Set();
  private onErrorCallbacks: Set<(error: Error) => void> = new Set();

  connect(sessionId: string, userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN && this.sessionId === sessionId) {
        resolve();
        return;
      }

      this.disconnect();
      this.sessionId = sessionId;

      const url = getWebSocketUrl(`/api/ws/table_sessions/${sessionId}`);
      const token = getAuthToken();
      
      // For WebSocket, we can't set headers directly in React Native
      // The backend should handle auth via query params or accept without auth for now
      // If auth is required, we might need to pass token as query param
      const wsUrl = token ? `${url}?token=${token}` : url;

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.onConnectCallbacks.forEach((cb) => cb());
          
          // Send join_session message
          if (userId) {
            const joinMessage: JoinSessionMessage = {
              type: 'join_session',
              user_id: userId,
            };
            this.send(joinMessage);
          }
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.listeners.forEach((listener) => listener(message));
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          const err = new Error('WebSocket connection error');
          this.onErrorCallbacks.forEach((cb) => cb(err));
          reject(err);
        };

        this.ws.onclose = (event) => {
          this.onDisconnectCallbacks.forEach((cb) => cb());
          
          // Attempt to reconnect if not a normal closure
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
              if (this.sessionId && userId) {
                this.connect(this.sessionId, userId).catch(() => {
                  // Reconnection failed, will be handled by error callbacks
                });
              }
            }, this.reconnectDelay * this.reconnectAttempts);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.sessionId = null;
    this.reconnectAttempts = 0;
  }

  send(message: OutgoingWebSocketMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        const messageStr = JSON.stringify(message);
        this.ws.send(messageStr);
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        throw error;
      }
    } else {
      const errorMsg = `WebSocket is not open. State: ${this.ws?.readyState}, Message: ${JSON.stringify(message)}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  onMessage(callback: (message: WebSocketMessage) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  onConnect(callback: () => void): () => void {
    this.onConnectCallbacks.add(callback);
    return () => {
      this.onConnectCallbacks.delete(callback);
    };
  }

  onDisconnect(callback: () => void): () => void {
    this.onDisconnectCallbacks.add(callback);
    return () => {
      this.onDisconnectCallbacks.delete(callback);
    };
  }

  onError(callback: (error: Error) => void): () => void {
    this.onErrorCallbacks.add(callback);
    return () => {
      this.onErrorCallbacks.delete(callback);
    };
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}

export const websocketService = new WebSocketService();

