import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StyleSheet, View, Alert, TouchableOpacity, ScrollView } from 'react-native';
import {
  Box,
  VStack,
  Text,
  Heading,
  Button,
  ButtonText,
  Alert as UIAlert,
  AlertText,
  Spinner,
  HStack,
  Avatar,
} from '@/components/ui';
import { getAuthToken, getCurrentUser } from '@/services/api';
import {
  websocketService,
  WebSocketMessage,
  SessionStateMessage,
  ItemAssignedMessage,
  AssignmentUpdatedMessage,
  AssignmentRemovedMessage,
} from '@/services/websocket';

// UUID regex pattern
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionStateMessage | null>(
    null
  );
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    // Check if user is authenticated
    const token = getAuthToken();
    if (!token) {
      // If there's a sessionId from deeplink, pass it to login for redirect
      if (params.sessionId && typeof params.sessionId === 'string') {
        router.replace({
          pathname: '/login',
          params: { redirectSessionId: params.sessionId }
        });
      } else {
        router.replace('/login');
      }
    } else {
      setIsAuthenticated(true);
    }
  }, [params.sessionId]);

  useEffect(() => {
    // Check if session ID came from deeplink
    if (params.sessionId && typeof params.sessionId === 'string' && isAuthenticated) {
      const deeplinkSessionId = params.sessionId;
      if (UUID_REGEX.test(deeplinkSessionId)) {
        // User came from deeplink and is authenticated, connect to session
        handleDeeplinkSession(deeplinkSessionId);
      }
    }
  }, [params.sessionId, isAuthenticated]);

  const handleDeeplinkSession = async (sessionId: string) => {
    setScanned(true);
    setSessionId(sessionId);
    setError(null);

    const user = getCurrentUser();
    if (!user) {
      setError('User not found. Please login again.');
      router.replace('/login');
      return;
    }

    try {
      await websocketService.connect(sessionId, user.id);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to session');
      setScanned(false);
      setSessionId(null);
    }
  };

  useEffect(() => {
    // Set up websocket message listener
    const unsubscribe = websocketService.onMessage((message: WebSocketMessage) => {
      console.log('[WebSocket] Message received:', message.type, message);
      
      if (message.type === 'session_state') {
        console.log('[WebSocket] session_state received, assignments:', message.assignments.length);
        setSessionData(message);
        setWsConnected(true);
        setError(null);
      } else if (message.type === 'error') {
        console.error('[WebSocket] Error message received:', message.message);
        setError(message.message);
        // Don't set wsConnected to false on error - connection might still be open
      } else if (message.type === 'item_assigned') {
        console.log('[WebSocket] item_assigned received:', message);
        // Update session data with new assignment
        setSessionData((prev) => {
          if (!prev) {
            console.warn('[WebSocket] item_assigned: no previous session data');
            return prev;
          }
          // Check if assignment already exists to prevent duplicates
          const exists = prev.assignments.some((a) => a.id === message.assignment_id);
          if (exists) {
            console.log('[WebSocket] item_assigned: assignment already exists, skipping');
            return prev;
          }
          
          const newAssignments = [...prev.assignments, {
            id: message.assignment_id,
            order_item_id: message.order_item_id,
            creditor_id: message.creditor_id,
            debtor_id: message.debtor_id,
            assigned_amount: message.assigned_amount,
          }];
          console.log(`[WebSocket] item_assigned: ${prev.assignments.length} -> ${newAssignments.length} assignments`);
          return {
            ...prev,
            assignments: newAssignments,
          };
        });
      } else if (message.type === 'assignment_updated') {
        // Update existing assignment
        setSessionData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            assignments: prev.assignments.map((a) =>
              a.id === message.assignment_id
                ? { ...a, assigned_amount: message.assigned_amount }
                : a
            ),
          };
        });
      } else if (message.type === 'assignment_removed') {
        console.log('[WebSocket] assignment_removed received:', message.assignment_id);
        // Remove assignment
        setSessionData((prev) => {
          if (!prev) {
            console.warn('[WebSocket] assignment_removed: no previous session data');
            return prev;
          }
          const beforeCount = prev.assignments.length;
          const filtered = prev.assignments.filter((a) => a.id !== message.assignment_id);
          console.log(`[WebSocket] assignment_removed: ${beforeCount} -> ${filtered.length} assignments`);
          return {
            ...prev,
            assignments: filtered,
          };
        });
      } else if (
        message.type === 'participant_joined' ||
        message.type === 'participant_left'
      ) {
        // For participant changes, we might want to refresh the session state
        // or handle incrementally - for now, we'll just note it happened
      }
    });

    const unsubscribeConnect = websocketService.onConnect(() => {
      setWsConnected(true);
      setError(null);
    });

    const unsubscribeDisconnect = websocketService.onDisconnect(() => {
      setWsConnected(false);
    });

    const unsubscribeError = websocketService.onError((err) => {
      setError(err.message);
      setWsConnected(false);
    });

    return () => {
      unsubscribe();
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeError();
    };
  }, []);

  useEffect(() => {
    // Cleanup websocket on unmount
    return () => {
      websocketService.disconnect();
    };
  }, []);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;

    const trimmedData = data.trim();
    let sessionId: string | null = null;

    // Only accept deeplink URL format: yopagocl://session/{session_id}
    if (trimmedData.startsWith('yopagocl://session/')) {
      // Extract session ID from deeplink URL
      const urlParts = trimmedData.split('/');
      const extractedId = urlParts[urlParts.length - 1];
      if (UUID_REGEX.test(extractedId)) {
        sessionId = extractedId;
      }
    }

    if (!sessionId) {
      Alert.alert(
        'Invalid QR Code',
        'The scanned QR code must be in the format: yopagocl://session/{session_id}'
      );
      return;
    }

    setScanned(true);
    setSessionId(sessionId);
    setError(null);

    // Get current user
    const user = getCurrentUser();
    if (!user) {
      setError('User not found. Please login again.');
      router.replace('/login');
      return;
    }

    try {
      // Connect to websocket
      await websocketService.connect(sessionId, user.id);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to session');
      setScanned(false);
      setSessionId(null);
    }
  };

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    if (!result.granted) {
      Alert.alert(
        'Camera Permission Required',
        'Please enable camera access in your device settings to scan QR codes.'
      );
    }
  };

  const handleRescan = () => {
    setScanned(false);
    setSessionId(null);
    setSessionData(null);
    setWsConnected(false);
    setError(null);
    websocketService.disconnect();
  };

  // Get current user's participant ID
  const currentParticipantId = useMemo(() => {
    if (!sessionData) return null;
    const user = getCurrentUser();
    if (!user) return null;
    
    const participant = sessionData.participants.find(
      (p) => p.user_id === user.id
    );
    return participant?.id || null;
  }, [sessionData]);

  // Get assignments for current user (for toggling)
  const getUserAssignments = useMemo(() => {
    if (!sessionData || !currentParticipantId) {
      console.log('[getUserAssignments] No sessionData or currentParticipantId');
      return new Map();
    }
    
    console.log('[getUserAssignments] Calculating assignments', {
      totalAssignments: sessionData.assignments.length,
      currentParticipantId,
      assignments: sessionData.assignments.map(a => ({
        id: a.id,
        order_item_id: a.order_item_id,
        creditor_id: a.creditor_id,
      }))
    });
    
    // Group assignments by order_item_id and sum amounts (only for current user)
    const assignmentMap = new Map<string, { ids: string[]; totalAmount: number }>();
    sessionData.assignments.forEach((assignment) => {
      if (assignment.creditor_id === currentParticipantId) {
        const existing = assignmentMap.get(assignment.order_item_id);
        if (existing) {
          existing.ids.push(assignment.id);
          existing.totalAmount += assignment.assigned_amount;
        } else {
          assignmentMap.set(assignment.order_item_id, {
            ids: [assignment.id],
            totalAmount: assignment.assigned_amount,
          });
        }
      }
    });
    
    console.log('[getUserAssignments] Result:', {
      mapSize: assignmentMap.size,
      assignedItems: Array.from(assignmentMap.entries()).map(([itemId, data]) => ({
        itemId,
        assignmentIds: data.ids,
        totalAmount: data.totalAmount,
      }))
    });
    
    return assignmentMap;
  }, [sessionData, currentParticipantId]);

  // Get all assignments grouped by item (for display)
  const getAllAssignmentsByItem = useMemo(() => {
    if (!sessionData) return new Map();
    
    const assignmentMap = new Map<string, { 
      totalAmount: number; 
      assignments: Array<{ creditor_id: string; amount: number }> 
    }>();
    
    sessionData.assignments.forEach((assignment) => {
      const existing = assignmentMap.get(assignment.order_item_id);
      if (existing) {
        existing.totalAmount += assignment.assigned_amount;
        // Only add unique participants
        if (!existing.assignments.some(a => a.creditor_id === assignment.creditor_id)) {
          existing.assignments.push({
            creditor_id: assignment.creditor_id,
            amount: assignment.assigned_amount,
          });
        }
      } else {
        assignmentMap.set(assignment.order_item_id, {
          totalAmount: assignment.assigned_amount,
          assignments: [{
            creditor_id: assignment.creditor_id,
            amount: assignment.assigned_amount,
          }],
        });
      }
    });
    
    return assignmentMap;
  }, [sessionData]);

  // Helper to get participant info by ID
  const getParticipantInfo = (participantId: string) => {
    if (!sessionData) return null;
    return sessionData.participants.find(p => p.id === participantId);
  };

  // Helper to get initials from user ID or participant
  const getInitials = (participantId: string) => {
    const participant = getParticipantInfo(participantId);
    if (participant?.user_id) {
      // Use first letter of user ID as fallback
      return participant.user_id.substring(0, 1).toUpperCase();
    }
    return '?';
  };

  // Handle item toggle
  const handleItemToggle = (orderItemId: string, itemPrice: number) => {
    console.log('handleItemToggle called', { orderItemId, itemPrice, currentParticipantId, wsConnected });
    
    if (!currentParticipantId || !sessionData) {
      const errorMsg = `Unable to assign items. Participant ID: ${currentParticipantId}, Session Data: ${!!sessionData}`;
      console.error(errorMsg);
      setError(errorMsg);
      return;
    }

    if (!wsConnected) {
      const errorMsg = 'WebSocket is not connected. Please wait for connection.';
      console.error(errorMsg);
      setError(errorMsg);
      return;
    }

    if (!websocketService.isConnected()) {
      const errorMsg = 'WebSocket service reports not connected.';
      console.error(errorMsg);
      setError(errorMsg);
      return;
    }

    const existingAssignments = getUserAssignments.get(orderItemId);
    console.log('Existing assignments:', existingAssignments);

    try {
      if (existingAssignments && existingAssignments.ids.length > 0) {
        // Remove all assignments for this item (remove them one by one)
        // Start with the first one - the UI will update as each is removed
        const assignmentIdToRemove = existingAssignments.ids[0];
        const message = {
          type: 'remove_assignment',
          assignment_id: assignmentIdToRemove,
        };
        console.log('Sending remove_assignment message:', message);
        websocketService.send(message);
      } else {
        // Create new assignment
        const message = {
          type: 'assign_item',
          order_item_id: orderItemId,
          creditor_id: currentParticipantId,
          debtor_id: null,
          assigned_amount: itemPrice, // Assign full item price
        };
        console.log('Sending assign_item message:', message);
        websocketService.send(message);
      }
    } catch (error: any) {
      console.error('Error sending websocket message:', error);
      setError(error.message || 'Failed to send assignment message');
    }
  };

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  if (!permission) {
    // Camera permissions are still loading
    return (
      <Box className="flex-1 bg-background-0 p-6">
        <VStack space="lg" className="flex-1 justify-center items-center">
          <Spinner size="large" />
          <Text className="text-typography-600">Loading camera...</Text>
        </VStack>
      </Box>
    );
  }

  if (!permission.granted) {
    // Camera permission not granted
    return (
      <Box className="flex-1 bg-background-0 p-6">
        <VStack space="lg" className="flex-1 justify-center items-center">
          <Heading size="2xl" className="text-typography-900">
            Camera Permission Required
          </Heading>
          <Text className="text-typography-600 text-lg text-center">
            We need access to your camera to scan QR codes.
          </Text>
          <Button
            onPress={handleRequestPermission}
            action="primary"
            variant="solid"
            size="lg"
            className="mt-4"
          >
            <ButtonText>Grant Camera Permission</ButtonText>
          </Button>
        </VStack>
      </Box>
    );
  }

  // If session is connected, show session data
  if (sessionId && wsConnected && sessionData) {
    const userTotal = Array.from(getUserAssignments.values()).reduce(
      (sum, assignment) => sum + assignment.totalAmount,
      0
    );

    return (
      <Box className="flex-1 bg-background-0 p-6">
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <VStack space="lg" className="flex-1">
            <VStack space="md">
              <Heading size="2xl" className="text-typography-900">
                Session Connected
              </Heading>
              <Text className="text-typography-600">
                Session ID: {sessionId.substring(0, 8)}...
              </Text>
            </VStack>

            <VStack space="md" className="flex-1">
              <Box className="bg-background-50 p-4 rounded-lg">
                <VStack space="sm">
                  <Text className="text-typography-700 font-semibold">
                    Session Status: {sessionData.session.status}
                  </Text>
                  <Text className="text-typography-600">
                    Total Amount: {sessionData.session.total_amount / 100}{' '}
                    {sessionData.session.currency}
                  </Text>
                  <Text className="text-typography-600">
                    Participants: {sessionData.participants.length}
                  </Text>
                  <Text className="text-typography-600">
                    Order Items: {sessionData.order_items.length}
                  </Text>
                  {currentParticipantId && (
                    <Text className="text-typography-700 font-semibold mt-2">
                      Your Total: {userTotal / 100} {sessionData.session.currency}
                    </Text>
                  )}
                </VStack>
              </Box>

              {sessionData.order_items.length > 0 && (
                <Box className="bg-background-50 p-4 rounded-lg">
                  <Text className="text-typography-700 font-semibold mb-3">
                    Select Items to Pay For:
                  </Text>
                  <VStack space="sm">
                    {sessionData.order_items.map((item) => {
                      const isAssignedByMe = getUserAssignments.has(item.id);
                      const myAssignment = getUserAssignments.get(item.id);
                      const allAssignments = getAllAssignmentsByItem.get(item.id);
                      const isAssignedByAnyone = !!allAssignments && allAssignments.totalAmount > 0;
                      
                      console.log(`[Render] Item ${item.item_name}: isAssignedByMe=${isAssignedByMe}, allAssignments=`, allAssignments);
                      
                      return (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => {
                            console.log('Item tapped:', item.item_name, item.id);
                            handleItemToggle(item.id, item.unit_price);
                          }}
                          activeOpacity={0.7}
                          style={{ marginBottom: 8 }}
                        >
                          <HStack
                            className={`p-3 rounded-lg border-2 ${
                              isAssignedByMe
                                ? 'bg-primary-50 border-primary-500'
                                : isAssignedByAnyone
                                ? 'bg-background-50 border-primary-300'
                                : 'bg-background-0 border-border-300'
                            }`}
                            style={{ alignItems: 'center', gap: 12 }}
                          >
                            {/* Toggle on the left */}
                            <View
                              className={`w-6 h-6 rounded-full border-2 ${
                                isAssignedByMe
                                  ? 'bg-primary-500 border-primary-600'
                                  : isAssignedByAnyone
                                  ? 'bg-primary-300 border-primary-400'
                                  : 'bg-transparent border-typography-400'
                              }`}
                              style={{
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                              pointerEvents="none"
                            >
                              {isAssignedByMe && (
                                <Text className="text-white text-xs font-bold">✓</Text>
                              )}
                              {!isAssignedByMe && isAssignedByAnyone && (
                                <Text className="text-primary-700 text-xs font-bold">○</Text>
                              )}
                            </View>

                            {/* Item info in the middle */}
                            <VStack className="flex-1" space="xs">
                              <Text
                                className={`font-semibold ${
                                  isAssignedByMe ? 'text-primary-900' : 'text-typography-900'
                                }`}
                              >
                                {item.item_name}
                              </Text>
                              <Text className="text-typography-700 font-medium">
                                  Total: {item.unit_price / 100} {sessionData.session.currency}
                              </Text>
                              
                              {/* Calculate remaining amount */}
                              {(() => {
                                const totalAssigned = allAssignments?.totalAmount || 0;
                                const remaining = item.unit_price - totalAssigned;
                                const isFullyCovered = remaining <= 0;
                                
                                return (
                                  <>
                                    {isAssignedByMe && myAssignment && (
                                      <Text className="text-primary-700 text-sm">
                                        You: {myAssignment.totalAmount / 100}{' '}
                                        {sessionData.session.currency}
                                        {myAssignment.ids.length > 1 && ` (${myAssignment.ids.length} assignments)`}
                                      </Text>
                                    )}
                                    {isAssignedByAnyone && allAssignments && !isAssignedByMe && (
                                      <Text className="text-typography-600 text-sm">
                                        Assigned by others: {allAssignments.totalAmount / 100}{' '}
                                        {sessionData.session.currency}
                                      </Text>
                                    )}
                                    {isAssignedByMe && allAssignments && allAssignments.totalAmount > myAssignment!.totalAmount && (
                                      <Text className="text-typography-600 text-sm">
                                        Others: {(allAssignments.totalAmount - myAssignment!.totalAmount) / 100}{' '}
                                        {sessionData.session.currency}
                                      </Text>
                                    )}
                                    <Text 
                                      className={`text-sm font-semibold ${
                                        isFullyCovered 
                                          ? 'text-green-600' 
                                          : remaining < item.unit_price * 0.1 
                                          ? 'text-orange-600'
                                          : 'text-red-600'
                                      }`}
                                    >
                                      {isFullyCovered 
                                        ? '✓ Fully covered' 
                                        : `Remaining: ${remaining / 100} ${sessionData.session.currency}`}
                                    </Text>
                                  </>
                                );
                              })()}
                            </VStack>

                            {/* Avatars on the right */}
                            {allAssignments && allAssignments.assignments.length > 0 && (
                              <HStack space="xs" style={{ flexShrink: 0, alignItems: 'center' }}>
                                {allAssignments.assignments.map((assignment, index) => {
                                  const participant = getParticipantInfo(assignment.creditor_id);
                                  const isCurrentUser = assignment.creditor_id === currentParticipantId;
                                  
                                  return (
                                    <Avatar
                                      key={`${assignment.creditor_id}-${index}`}
                                      size="sm"
                                      fallbackText={getInitials(assignment.creditor_id)}
                                      style={{
                                        borderWidth: isCurrentUser ? 2 : 0,
                                        borderColor: '#4F46E5',
                                      }}
                                    />
                                  );
                                })}
                              </HStack>
                            )}
                          </HStack>
                        </TouchableOpacity>
                      );
                    })}
                  </VStack>
                </Box>
              )}

              {sessionData.participants.length > 0 && (
                <Box className="bg-background-50 p-4 rounded-lg">
                  <Text className="text-typography-700 font-semibold mb-2">
                    Participants ({sessionData.participants.length}):
                  </Text>
                  <VStack space="xs">
                    {sessionData.participants.map((participant) => {
                      const user = getCurrentUser();
                      const isCurrentUser = participant.user_id === user?.id;
                      return (
                        <Text
                          key={participant.id}
                          className={`${
                            isCurrentUser
                              ? 'text-primary-700 font-semibold'
                              : 'text-typography-600'
                          }`}
                        >
                          • {participant.user_id ? `User ${participant.user_id.substring(0, 8)}` : 'Anonymous'}
                          {isCurrentUser && ' (You)'}
                        </Text>
                      );
                    })}
                  </VStack>
                </Box>
              )}
            </VStack>

            <Button
              onPress={handleRescan}
              action="secondary"
              variant="outline"
              size="lg"
              className="mb-4"
            >
              <ButtonText>Scan Another QR Code</ButtonText>
            </Button>
          </VStack>
        </ScrollView>
      </Box>
    );
  }

  // Show camera scanner
  return (
    <Box className="flex-1 bg-background-0">
      <View style={styles.container}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
        >
          <View style={styles.overlay}>
            <View style={styles.scanArea}>
              <View style={styles.corner} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <Text className="text-white text-center mt-4 text-lg font-semibold">
              Position QR code within the frame
            </Text>
          </View>
        </CameraView>
      </View>

      {error && (
        <Box className="p-4">
          <UIAlert action="error" variant="solid">
            <AlertText>{error}</AlertText>
          </UIAlert>
        </Box>
      )}

      {scanned && !wsConnected && (
        <Box className="pt-4 pb-12">
          <VStack space="sm" className="items-center">
            <Spinner size="small" />
            <Text className="text-typography-600">Connecting to session...</Text>
          </VStack>
        </Box>
      )}
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#fff',
    borderTopWidth: 3,
    borderLeftWidth: 3,
    top: 0,
    left: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    left: 'auto',
    borderRightWidth: 3,
    borderTopWidth: 3,
    borderLeftWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    top: 'auto',
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    top: 'auto',
    left: 'auto',
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
});
