import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StyleSheet, View, Alert, TouchableOpacity, ScrollView, Modal, Animated, Dimensions } from 'react-native';
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
  SelectableParticipantsMessage,
  PayingForParticipantsMessage,
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
  const [expandedAvatars, setExpandedAvatars] = useState<Set<string>>(new Set());
  const [menuModalVisible, setMenuModalVisible] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [participantsModalVisible, setParticipantsModalVisible] = useState(false);
  const [selectableParticipants, setSelectableParticipants] = useState<string[]>([]);
  const [payingForParticipants, setPayingForParticipants] = useState<string[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set());
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const participantsModalVisibleRef = useRef(false);
  const selectedItemIdRef = useRef<string | null>(null);

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
      
      if (message.type === 'session_state') {
        setSessionData(message);
        setWsConnected(true);
        setError(null);
      } else if (message.type === 'error') {
        console.error('[WebSocket] Error message received:', message.message);
        setError(message.message);
        // Don't set wsConnected to false on error - connection might still be open
      } else if (message.type === 'item_assigned') {
        // Update session data with new assignment
        setSessionData((prev) => {
          if (!prev) {
            console.warn('[WebSocket] item_assigned: no previous session data');
            return prev;
          }
          // Check if assignment already exists to prevent duplicates
          const exists = prev.assignments.some((a) => a.id === message.assignment_id);
          if (exists) {
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
        // Remove assignment
        // Note: We don't update payingForParticipants here because changes are only applied when "Accept" is pressed
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
      } else if (message.type === 'selectable_participants') {
        setSelectableParticipants(message.selectable_participants);
        // Don't set loading to false here - wait for both messages
      } else if (message.type === 'paying_for_participants') {
        setPayingForParticipants(message.paying_for_participants);
        // Set initial selected participants to the paying_for_participants
        setSelectedParticipants(new Set(message.paying_for_participants));
        setLoadingParticipants(false);
        setParticipantsModalVisible(true);
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

  useEffect(() => {
    // Update refs when state changes
    participantsModalVisibleRef.current = participantsModalVisible;
    selectedItemIdRef.current = selectedItemId;
  }, [participantsModalVisible, selectedItemId]);

  useEffect(() => {
    // Animate modal content slide when opening
    if (participantsModalVisible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    }
  }, [participantsModalVisible]);

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
  // Only count assignments where debtor_id is null (user paying for themselves)
  const getUserAssignments = useMemo(() => {
    if (!sessionData || !currentParticipantId) {
      return new Map();
    }
    
    
    // Group assignments by order_item_id and sum amounts (only for current user)
    // Only count assignments where debtor_id is null (user paying for themselves)
    const assignmentMap = new Map<string, { ids: string[]; totalAmount: number }>();
    sessionData.assignments.forEach((assignment) => {
      if (assignment.creditor_id === currentParticipantId && assignment.debtor_id === null) {
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
    
    return assignmentMap;
  }, [sessionData, currentParticipantId]);

  // Get total amount for current user (includes all assignments where user is creditor)
  const getUserTotal = useMemo(() => {
    if (!sessionData || !currentParticipantId) {
      return 0;
    }
    
    // Sum all assignments where current user is the creditor (regardless of debtor_id)
    const total = sessionData.assignments
      .filter(assignment => assignment.creditor_id === currentParticipantId)
      .reduce((sum, assignment) => sum + assignment.assigned_amount, 0);
    
    return total;
  }, [sessionData, currentParticipantId]);

  // Get all assignments grouped by item (for display)
  const getAllAssignmentsByItem = useMemo(() => {
    if (!sessionData) return new Map();
    
    const assignmentMap = new Map<string, { 
      totalAmount: number; 
      assignments: Array<{ creditor_id: string; debtor_id: string | null; amount: number }> 
    }>();
    
    sessionData.assignments.forEach((assignment) => {
      const existing = assignmentMap.get(assignment.order_item_id);
      if (existing) {
        existing.totalAmount += assignment.assigned_amount;
        // Add assignment with creditor and debtor info
        existing.assignments.push({
          creditor_id: assignment.creditor_id,
          debtor_id: assignment.debtor_id,
          amount: assignment.assigned_amount,
        });
      } else {
        assignmentMap.set(assignment.order_item_id, {
          totalAmount: assignment.assigned_amount,
          assignments: [{
            creditor_id: assignment.creditor_id,
            debtor_id: assignment.debtor_id,
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

  // Handle menu button click
  const handleMenuClick = (orderItemId: string, e: any) => {
    e.stopPropagation();
    setSelectedItemId(orderItemId);
    setMenuModalVisible(true);
  };

  // Handle "Pay for other user" option
  const handlePayForOthers = async () => {
    if (!selectedItemId || !currentParticipantId || !sessionData) {
      setError('Unable to get selectable participants');
      setMenuModalVisible(false);
      return;
    }

    const user = getCurrentUser();
    if (!user) {
      setError('User not found');
      setMenuModalVisible(false);
      return;
    }

    setMenuModalVisible(false);
    setLoadingParticipants(true);
    setSelectedParticipants(new Set());
    setSelectableParticipants([]);
    setPayingForParticipants([]);

    try {
      // Send both messages to get selectable and paying_for participants
      const selectableMessage = {
        type: 'get_selectable_participants',
        order_item_id: selectedItemId,
        user_id: user.id,
      };
      websocketService.send(selectableMessage);

      const payingForMessage = {
        type: 'get_paying_for_participants',
        order_item_id: selectedItemId,
        user_id: user.id,
      };
      websocketService.send(payingForMessage);
    } catch (error: any) {
      console.error('Error sending get participants messages:', error);
      setError(error.message || 'Failed to get participants');
      setLoadingParticipants(false);
    }
  };

  // Handle participant selection toggle
  // Only updates local state - actual changes are applied when "Accept" is pressed
  const handleParticipantToggle = (userId: string) => {
    setSelectedParticipants((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  // Handle accept button in participants modal
  const handleAcceptParticipants = () => {
    if (!selectedItemId || !currentParticipantId || !sessionData) {
      slideAnim.setValue(300);
      setParticipantsModalVisible(false);
      setSelectedItemId(null);
      setSelectedParticipants(new Set());
      setSelectableParticipants([]);
      setPayingForParticipants([]);
      return;
    }

    const item = sessionData.order_items.find((i) => i.id === selectedItemId);
    if (!item) {
      setError('Item not found');
      slideAnim.setValue(300);
      setParticipantsModalVisible(false);
      setSelectedItemId(null);
      setSelectedParticipants(new Set());
      setSelectableParticipants([]);
      setPayingForParticipants([]);
      return;
    }

    // Find users that need to be added (in selectedParticipants but not in payingForParticipants)
    const newlySelected = Array.from(selectedParticipants).filter(
      (userId) => !payingForParticipants.includes(userId)
    );

    // Find users that need to be removed (in payingForParticipants but not in selectedParticipants)
    const toBeRemoved = payingForParticipants.filter(
      (userId) => !selectedParticipants.has(userId)
    );

    // Remove assignments for users that were unselected
    toBeRemoved.forEach((userId) => {
      const participant = sessionData.participants.find((p) => p.user_id === userId);
      if (!participant) {
        console.warn(`Participant not found for user_id: ${userId}`);
        return;
      }

      // Find the assignment where:
      // - order_item_id = selectedItemId
      // - creditor_id = currentParticipantId
      // - debtor_id = participant.id
      const assignment = sessionData.assignments.find(
        (a) =>
          a.order_item_id === selectedItemId &&
          a.creditor_id === currentParticipantId &&
          a.debtor_id === participant.id
      );

      if (assignment) {
        try {
          const message = {
            type: 'remove_assignment',
            assignment_id: assignment.id,
          };
          websocketService.send(message);
        } catch (error: any) {
          console.error('Error sending remove_assignment message:', error);
          setError(error.message || 'Failed to remove assignment');
        }
      } else {
        console.warn(`Assignment not found for user_id: ${userId}`);
      }
    });

    // Send assignment for each newly selected participant
    // The backend will automatically recalculate the amount per person
    // We send the full item price, and the backend will divide it correctly
    newlySelected.forEach((userId) => {
      // Find participant by user_id
      const participant = sessionData.participants.find((p) => p.user_id === userId);
      if (!participant) {
        console.warn(`Participant not found for user_id: ${userId}`);
        return;
      }

      try {
        // Send the full item price - the backend will recalculate the amount per person
        // based on the total number of assignments
        const message = {
          type: 'assign_item',
          order_item_id: selectedItemId,
          creditor_id: currentParticipantId,
          debtor_id: participant.id,
          assigned_amount: item.unit_price, // Backend will recalculate this
        };
        websocketService.send(message);
      } catch (error: any) {
        console.error('Error sending assign_item message:', error);
        setError(error.message || 'Failed to assign item');
      }
    });

    // Close modal regardless of whether there are new assignments
    slideAnim.setValue(300);
    setParticipantsModalVisible(false);
    setSelectedItemId(null);
    setSelectedParticipants(new Set());
    setSelectableParticipants([]);
    setPayingForParticipants([]);
  };

  // Handle cancel button in participants modal
  const handleCancelParticipants = () => {
    slideAnim.setValue(300);
    setParticipantsModalVisible(false);
    setSelectedItemId(null);
    setSelectedParticipants(new Set());
    setSelectableParticipants([]);
    setPayingForParticipants([]);
  };

  // Get participant display name by user_id
  const getParticipantDisplayName = (userId: string) => {
    if (!sessionData) return userId.substring(0, 8);
    const participant = sessionData.participants.find((p) => p.user_id === userId);
    if (!participant) return userId.substring(0, 8);
    return `User ${userId.substring(0, 8)}`;
  };

  // Handle item toggle
  const handleItemToggle = (orderItemId: string, itemPrice: number) => {
    
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

    try {
      if (existingAssignments && existingAssignments.ids.length > 0) {
        // Remove all assignments for this item (remove them one by one)
        // Start with the first one - the UI will update as each is removed
        const assignmentIdToRemove = existingAssignments.ids[0];
        const message = {
          type: 'remove_assignment',
          assignment_id: assignmentIdToRemove,
        };
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
                      
                      return (
                        <View key={item.id} style={{ marginBottom: 8 }}>
                          <TouchableOpacity
                            onPress={() => {
                              handleItemToggle(item.id, item.unit_price);
                            }}
                            activeOpacity={0.7}
                          >
                            <HStack
                              className={`p-3 rounded-lg border-2 ${
                                isAssignedByMe
                                  ? 'bg-primary-50 border-primary-600'
                                  : 'bg-background-0 border-typography-400'
                              }`}
                              style={{ alignItems: 'center', gap: 12 }}
                            >
                              {/* Toggle on the left */}
                              <View
                                className={`w-6 h-6 rounded-full border-2 ${
                                  isAssignedByMe
                                    ? 'bg-primary-500 border-primary-600'
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
                              <HStack space="xs" style={{ flexShrink: 0, alignItems: 'center' }}>
                                {allAssignments && allAssignments.assignments.length > 0 && (
                                  <>
                                    {allAssignments.assignments.length === 1 ? (
                                      // Single assignment - show creditor avatar, and debtor avatar if exists
                                      (() => {
                                        const assignment = allAssignments.assignments[0];
                                        const isCurrentUser = assignment.creditor_id === currentParticipantId;
                                        return (
                                          <HStack space="xs" style={{ alignItems: 'center' }}>
                                            <Avatar
                                              size="sm"
                                              fallbackText={getInitials(assignment.creditor_id)}
                                              style={{
                                                borderWidth: isCurrentUser ? 2 : 0,
                                                borderColor: '#4F46E5',
                                              }}
                                            />
                                            {assignment.debtor_id && (
                                              <Avatar
                                                size="xs"
                                                fallbackText={getInitials(assignment.debtor_id)}
                                                style={{
                                                  marginLeft: -8,
                                                  borderWidth: 1,
                                                  borderColor: '#fff',
                                                }}
                                              />
                                            )}
                                          </HStack>
                                        );
                                      })()
                                    ) : (
                                      // Multiple assignments - show first avatar + plus indicator
                                      <>
                                        {(() => {
                                          const firstAssignment = allAssignments.assignments[0];
                                          const isCurrentUser = firstAssignment.creditor_id === currentParticipantId;
                                          return (
                                            <HStack space="xs" style={{ alignItems: 'center' }}>
                                              <Avatar
                                                size="sm"
                                                fallbackText={getInitials(firstAssignment.creditor_id)}
                                                style={{
                                                  borderWidth: isCurrentUser ? 2 : 0,
                                                  borderColor: '#4F46E5',
                                                }}
                                              />
                                              {firstAssignment.debtor_id && (
                                                <Avatar
                                                  size="xs"
                                                  fallbackText={getInitials(firstAssignment.debtor_id)}
                                                  style={{
                                                    marginLeft: -8,
                                                    borderWidth: 1,
                                                    borderColor: '#fff',
                                                  }}
                                                />
                                              )}
                                            </HStack>
                                          );
                                        })()}
                                        <TouchableOpacity
                                          onPress={(e) => {
                                            e.stopPropagation();
                                            setExpandedAvatars((prev) => {
                                              const newSet = new Set(prev);
                                              if (newSet.has(item.id)) {
                                                newSet.delete(item.id);
                                              } else {
                                                newSet.add(item.id);
                                              }
                                              return newSet;
                                            });
                                          }}
                                          className="w-6 h-6 rounded-full bg-background-100 items-center justify-center ml-1"
                                        >
                                          <Text className="text-typography-700 text-xs font-bold">
                                            +{allAssignments.assignments.length - 1}
                                          </Text>
                                        </TouchableOpacity>
                                      </>
                                    )}
                                  </>
                                )}
                                {/* Elipsis button */}
                                <TouchableOpacity
                                  onPress={(e) => handleMenuClick(item.id, e)}
                                  className="w-8 h-8 rounded-full bg-background-100 items-center justify-center ml-2"
                                  style={{ flexShrink: 0 }}
                                >
                                  <Text className="text-typography-700 text-lg font-bold">⋯</Text>
                                </TouchableOpacity>
                              </HStack>
                            </HStack>
                          </TouchableOpacity>
                          
                          {/* Expanded avatars below the item */}
                          {allAssignments && 
                           allAssignments.assignments.length > 1 && 
                           expandedAvatars.has(item.id) && (
                            <VStack space="xs" className="mt-2 ml-8">
                              <Text className="text-typography-600 text-xs font-semibold mb-1">
                                Assigned to:
                              </Text>
                              <HStack space="xs" style={{ flexWrap: 'wrap' }}>
                                {allAssignments.assignments.map((assignment, index) => {
                                  const isCurrentUser = assignment.creditor_id === currentParticipantId;
                                  return (
                                    <HStack
                                      key={`${assignment.creditor_id}-${assignment.debtor_id || 'null'}-${index}`}
                                      space="xs"
                                      style={{ alignItems: 'center', marginRight: 8, marginBottom: 4 }}
                                    >
                                      <HStack space="xs" style={{ alignItems: 'center' }}>
                                        <Avatar
                                          size="sm"
                                          fallbackText={getInitials(assignment.creditor_id)}
                                          style={{
                                            borderWidth: isCurrentUser ? 2 : 0,
                                            borderColor: '#4F46E5',
                                          }}
                                        />
                                        {assignment.debtor_id && (
                                          <Avatar
                                            size="xs"
                                            fallbackText={getInitials(assignment.debtor_id)}
                                            style={{
                                              marginLeft: -8,
                                              borderWidth: 1,
                                              borderColor: '#fff',
                                            }}
                                          />
                                        )}
                                      </HStack>
                                      <Text className="text-typography-600 text-xs">
                                        {assignment.amount / 100} {sessionData.session.currency}
                                      </Text>
                                    </HStack>
                                  );
                                })}
                              </HStack>
                            </VStack>
                          )}
                        </View>
                      );
                    })}
                  </VStack>
                </Box>
              )}

              <Box className="bg-background-50 p-4 rounded-lg">
                <VStack space="sm">
                  <Text className="text-typography-700 font-semibold">
                    Session Status: {sessionData.session.status}
                  </Text>
                  <Text className="text-typography-600">
                    Total Amount: {sessionData.session.total_amount / 100}{' '}
                    {sessionData.session.currency}
                  </Text>
                  {currentParticipantId && (
                    <Text className="text-typography-700 font-semibold mt-2">
                      Your Total: {getUserTotal / 100} {sessionData.session.currency}
                    </Text>
                  )}
                </VStack>
              </Box>
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

        {/* Menu Modal */}
        <Modal
          visible={menuModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setMenuModalVisible(false)}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            activeOpacity={1}
            onPress={() => setMenuModalVisible(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              className="bg-background-0 rounded-lg p-4 min-w-[200px]"
            >
              <VStack space="md">
                <Button
                  onPress={handlePayForOthers}
                  action="primary"
                  variant="outline"
                  size="md"
                >
                  <ButtonText>Pay for other user</ButtonText>
                </Button>
                <Button
                  onPress={() => setMenuModalVisible(false)}
                  action="secondary"
                  variant="outline"
                  size="md"
                >
                  <ButtonText>Cancel</ButtonText>
                </Button>
              </VStack>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Participants Selection Modal */}
        <Modal
          visible={participantsModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={handleCancelParticipants}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              justifyContent: 'flex-end',
            }}
          >
            <TouchableOpacity
              style={{ 
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
              activeOpacity={1}
              onPress={handleCancelParticipants}
            />
            <Animated.View
              style={{
                transform: [{ translateY: slideAnim }],
                maxHeight: Dimensions.get('window').height * 0.8,
                width: '100%',
              }}
            >
              <Box className="bg-background-0 rounded-t-3xl" style={{ maxHeight: Dimensions.get('window').height * 0.8, overflow: 'hidden' }}>
                <View style={{ padding: 24 }}>
                  <Heading size="xl" className="text-typography-900" style={{ marginBottom: 16 }}>
                    Select users
                  </Heading>

                  {loadingParticipants ? (
                    <VStack space="md" className="items-center py-8">
                      <Spinner size="large" />
                      <Text className="text-typography-600">
                        Loading users...
                      </Text>
                    </VStack>
                  ) : payingForParticipants.length === 0 && selectableParticipants.length === 0 ? (
                    <Box className="py-8">
                      <Text className="text-typography-600 text-center">
                        There is no users available to select
                      </Text>
                    </Box>
                  ) : (
                    <View style={{ maxHeight: Dimensions.get('window').height * 0.5, marginBottom: 16 }}>
                      <ScrollView 
                        showsVerticalScrollIndicator={true}
                        nestedScrollEnabled={true}
                      >
                        <VStack space="md">
                          {/* First show checked participants (paying_for_participants) */}
                          {payingForParticipants.map((userId) => {
                            const isSelected = selectedParticipants.has(userId);
                            return (
                              <TouchableOpacity
                                key={userId}
                                onPress={() => handleParticipantToggle(userId)}
                                className={`p-4 rounded-lg border-2 ${
                                  isSelected
                                    ? 'bg-primary-50 border-primary-600'
                                    : 'bg-background-0 border-typography-400'
                                }`}
                              >
                                <HStack
                                  space="md"
                                  style={{ alignItems: 'center' }}
                                >
                                  <View
                                    className={`w-6 h-6 rounded border-2 ${
                                      isSelected
                                        ? 'bg-primary-500 border-primary-600'
                                        : 'bg-transparent border-typography-400'
                                    }`}
                                    style={{
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    {isSelected && (
                                      <Text className="text-white text-xs font-bold">
                                        ✓
                                      </Text>
                                    )}
                                  </View>
                                  <Text
                                    className={`${
                                      isSelected
                                        ? 'text-primary-900 font-semibold'
                                        : 'text-typography-900'
                                    }`}
                                  >
                                    {getParticipantDisplayName(userId)}
                                  </Text>
                                </HStack>
                              </TouchableOpacity>
                            );
                          })}
                          {/* Then show unchecked participants (excluding those already in paying_for) */}
                          {selectableParticipants
                            .filter((userId) => !payingForParticipants.includes(userId))
                            .map((userId) => {
                              const isSelected = selectedParticipants.has(userId);
                              return (
                                <TouchableOpacity
                                  key={userId}
                                  onPress={() => handleParticipantToggle(userId)}
                                  className={`p-4 rounded-lg border-2 ${
                                    isSelected
                                      ? 'bg-primary-50 border-primary-600'
                                      : 'bg-background-0 border-typography-400'
                                  }`}
                                >
                                  <HStack
                                    space="md"
                                    style={{ alignItems: 'center' }}
                                  >
                                    <View
                                      className={`w-6 h-6 rounded border-2 ${
                                        isSelected
                                          ? 'bg-primary-500 border-primary-600'
                                          : 'bg-transparent border-typography-400'
                                      }`}
                                      style={{
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      {isSelected && (
                                        <Text className="text-white text-xs font-bold">
                                          ✓
                                        </Text>
                                      )}
                                    </View>
                                    <Text
                                      className={`${
                                        isSelected
                                          ? 'text-primary-900 font-semibold'
                                          : 'text-typography-900'
                                      }`}
                                    >
                                      {getParticipantDisplayName(userId)}
                                    </Text>
                                  </HStack>
                                </TouchableOpacity>
                              );
                            })}
                        </VStack>
                      </ScrollView>
                    </View>
                  )}

                  <HStack space="md" style={{ justifyContent: 'flex-end' }}>
                    <Button
                      onPress={handleCancelParticipants}
                      action="secondary"
                      variant="outline"
                      size="md"
                    >
                      <ButtonText>Cancel</ButtonText>
                    </Button>
                    <Button
                      onPress={handleAcceptParticipants}
                      action="primary"
                      variant="solid"
                      size="md"
                      isDisabled={loadingParticipants}
                    >
                      <ButtonText>Accept</ButtonText>
                    </Button>
                  </HStack>
                </View>
              </Box>
            </Animated.View>
          </View>
        </Modal>
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
