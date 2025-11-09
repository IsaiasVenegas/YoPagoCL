import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StyleSheet, View, Alert, TouchableOpacity, ScrollView, Modal, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  Input,
  InputField,
} from '@/components/ui';
import { getAuthToken, getCurrentUser, apiService, API_BASE_URL } from '@/services/api';
import {
  websocketService,
  WebSocketMessage,
  SessionStateMessage,
  ItemAssignedMessage,
  AssignmentUpdatedMessage,
  AssignmentRemovedMessage,
  SelectableParticipantsMessage,
  PayingForParticipantsMessage,
  SummaryUpdatedMessage,
  AssignmentsValidatedMessage,
  SessionFinalizedMessage,
  SessionLockedMessage,
  SessionUnlockedMessage,
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
  const lastScannedDataRef = useRef<string | null>(null);
  const isProcessingScanRef = useRef<boolean>(false);
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
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [assignmentsValidated, setAssignmentsValidated] = useState<{ all_assigned: boolean; unassigned_items: string[] } | null>(null);
  const [sessionFinalized, setSessionFinalized] = useState(false);
  const [payingBill, setPayingBill] = useState(false);
  const [sessionLocked, setSessionLocked] = useState(false);
  const [lockedByUserId, setLockedByUserId] = useState<string | null>(null);
  const [showGroupSelection, setShowGroupSelection] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

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
    isProcessingScanRef.current = true;

    const user = getCurrentUser();
    if (!user) {
      setError('User not found. Please login again.');
      isProcessingScanRef.current = false;
      router.replace('/login');
      return;
    }

    try {
      await websocketService.connect(sessionId, user.id);
      isProcessingScanRef.current = false;
    } catch (err: any) {
      setError(err.message || 'Failed to connect to session');
      // Don't reset scanned to false - keep it true to prevent camera from reopening
      // User can manually rescan using the "Scan Another QR Code" button
      isProcessingScanRef.current = false;
    }
  };

  useEffect(() => {
    // Set up websocket message listener
    const unsubscribe = websocketService.onMessage((message: WebSocketMessage) => {
      
      if (message.type === 'session_state') {
        setSessionData(message);
        setWsConnected(true);
        setError(null);
        // Update lock state from session data
        if (message.session.locked !== undefined) {
          setSessionLocked(message.session.locked);
          setLockedByUserId(message.session.locked_by_user_id || null);
        }
        // If session is already locked when we connect, request validation
        if (message.session.locked && !assignmentsValidated) {
          // Request validation to show the status
          setTimeout(() => {
            if (websocketService.isConnected()) {
              websocketService.send({ type: 'validate_assignments' });
            }
          }, 500);
        }
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
          return {
            ...prev,
            assignments: filtered,
          };
        });
      } else if (message.type === 'participant_joined') {
        console.log('[WebSocket] Received participant_joined message:', message);
        // Update session data to include the new participant
        setSessionData((prev) => {
          if (!prev) {
            console.warn('[WebSocket] participant_joined: no previous session data');
            return prev;
          }
          // Check if participant already exists to prevent duplicates
          const exists = prev.participants.some((p) => p.id === message.participant_id);
          if (exists) {
            console.log('[WebSocket] participant_joined: participant already exists, skipping');
            return prev;
          }
          console.log('[WebSocket] participant_joined: adding new participant to state');
          return {
            ...prev,
            participants: [
              ...prev.participants,
              {
                id: message.participant_id,
                user_id: message.user_id,
                joined_at: message.joined_at,
                user_name: message.user_name,
                user_avatar_url: message.user_avatar_url,
              },
            ],
          };
        });
      } else if (message.type === 'participant_left') {
        // Remove participant from session data
        setSessionData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            participants: prev.participants.filter(
              (p) => p.id !== message.participant_id
            ),
          };
        });
      } else if (message.type === 'selectable_participants') {
        setSelectableParticipants(message.selectable_participants);
        // Don't set loading to false here - wait for both messages
      } else if (message.type === 'paying_for_participants') {
        setPayingForParticipants(message.paying_for_participants);
        // Set initial selected participants to the paying_for_participants
        setSelectedParticipants(new Set(message.paying_for_participants));
        setLoadingParticipants(false);
        setParticipantsModalVisible(true);
      } else if (message.type === 'summary_updated') {
        setSummary(message.summary);
      } else if (message.type === 'assignments_validated') {
        setAssignmentsValidated({
          all_assigned: message.all_assigned,
          unassigned_items: message.unassigned_items,
        });
          } else if (message.type === 'session_finalized') {
            setSessionFinalized(true);
            Alert.alert('Session Finalized', 'The session has been finalized and is ready for invoices.');
          } else if (message.type === 'session_locked') {
            setSessionLocked(true);
            setLockedByUserId(message.locked_by_user_id);
          } else if (message.type === 'session_unlocked') {
            setSessionLocked(false);
            setLockedByUserId(null);
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
    // Prevent multiple scans from being processed simultaneously
    if (scanned || isProcessingScanRef.current) return;

    const trimmedData = data.trim();
    
    // Prevent showing the same error multiple times for the same QR code
    if (lastScannedDataRef.current === trimmedData) {
      return;
    }
    
    // Mark that we're processing a scan
    isProcessingScanRef.current = true;
    lastScannedDataRef.current = trimmedData;
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
      // Set scanned to true temporarily to prevent multiple alerts
      setScanned(true);
      Alert.alert(
        'Invalid QR Code',
        'The scanned QR code must be in the format: yopagocl://session/{session_id}',
        [
          {
            text: 'OK',
            onPress: () => {
              // Reset after a short delay to allow scanning again
              setTimeout(() => {
                setScanned(false);
                lastScannedDataRef.current = null;
                isProcessingScanRef.current = false;
              }, 1000);
            },
          },
        ]
      );
      return;
    }

    setScanned(true);
    setSessionId(sessionId);
    setError(null);
    lastScannedDataRef.current = null; // Reset for valid QR codes

    // Get current user
    const user = getCurrentUser();
    if (!user) {
      setError('User not found. Please login again.');
      isProcessingScanRef.current = false;
      router.replace('/login');
      return;
    }

    // Defer websocket connection to allow React to render the "Connecting" state first
    setTimeout(async () => {
      try {
        // Connect to websocket
        await websocketService.connect(sessionId, user.id);
        // Only reset processing flag on successful connection
        // If connection fails, keep scanned=true to prevent camera from reopening
        isProcessingScanRef.current = false;
      } catch (err: any) {
        setError(err.message || 'Failed to connect to session');
        // Don't reset scanned to false - keep it true to prevent camera from reopening
        // User can manually rescan using the "Scan Another QR Code" button
        isProcessingScanRef.current = false;
      }
    }, 0);
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
    lastScannedDataRef.current = null;
    setWsConnected(false);
    setError(null);
    isProcessingScanRef.current = false;
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

  // Helper to calculate payment breakdown for an item
  const getItemPaymentBreakdown = (orderItemId: string) => {
    if (!sessionData || !currentParticipantId) {
      return {
        youPayingForYourself: 0,
        youPayingForOthers: 0,
        othersPayingForYou: 0,
        othersPayingForOthers: 0,
      };
    }

    const allAssignments = getAllAssignmentsByItem.get(orderItemId);
    if (!allAssignments) {
      return {
        youPayingForYourself: 0,
        youPayingForOthers: 0,
        othersPayingForYou: 0,
        othersPayingForOthers: 0,
      };
    }

    let youPayingForYourself = 0;
    let youPayingForOthers = 0;
    let othersPayingForYou = 0;
    let othersPayingForOthers = 0;

    allAssignments.assignments.forEach((assignment) => {
      const isYouCreditor = assignment.creditor_id === currentParticipantId;
      const isYouDebtor = assignment.debtor_id === currentParticipantId;

      if (isYouCreditor && assignment.debtor_id === null) {
        // You paying for yourself
        youPayingForYourself += assignment.amount;
      } else if (isYouCreditor && assignment.debtor_id !== null) {
        // You paying for others
        youPayingForOthers += assignment.amount;
      } else if (isYouDebtor) {
        // Others paying for you
        othersPayingForYou += assignment.amount;
      } else {
        // Others paying for others
        othersPayingForOthers += assignment.amount;
      }
    });

    return {
      youPayingForYourself,
      youPayingForOthers,
      othersPayingForYou,
      othersPayingForOthers,
    };
  };

  // Helper to get participant info by ID
  const getParticipantInfo = (participantId: string) => {
    if (!sessionData) return null;
    return sessionData.participants.find(p => p.id === participantId);
  };

  // Helper to get initials from user ID or participant
  const getInitials = (participantId: string) => {
    const participant = getParticipantInfo(participantId);
    if (participant?.user_name) {
      return participant.user_name.substring(0, 1).toUpperCase();
    }
    if (participant?.user_id) {
      // Use first letter of user ID as fallback
      return participant.user_id.substring(0, 1).toUpperCase();
    }
    return '?';
  };

  // Helper to get avatar source for a participant
  const getAvatarSource = (participantId: string) => {
    const participant = getParticipantInfo(participantId);
    if (participant?.user_avatar_url) {
      const avatarUrl = participant.user_avatar_url.startsWith('http')
        ? participant.user_avatar_url
        : `${API_BASE_URL}${participant.user_avatar_url}`;
      // Note: No cache-busting needed here as WebSocket provides fresh session data
      return { uri: avatarUrl };
    }
    return undefined;
  };

  // Handle menu button click
  const handleMenuClick = (orderItemId: string, e: any) => {
    e.stopPropagation();
    // Check if session is locked
    if (sessionLocked) {
      Alert.alert('Session Locked', 'The session is locked. Assignments cannot be modified.');
      return;
    }
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

  // Handle request summary
  const handleRequestSummary = () => {
    if (!wsConnected || !websocketService.isConnected()) {
      setError('WebSocket is not connected');
      return;
    }
    try {
      websocketService.send({ type: 'request_summary' });
    } catch (error: any) {
      setError(error.message || 'Failed to request summary');
    }
  };

  // Handle validate assignments
  const handleValidateAssignments = () => {
    if (!wsConnected || !websocketService.isConnected()) {
      setError('WebSocket is not connected');
      return;
    }
    try {
      websocketService.send({ type: 'validate_assignments' });
    } catch (error: any) {
      setError(error.message || 'Failed to validate assignments');
    }
  };

  // Handle pay bill - first show group selection
  const handlePayBill = async () => {
    if (!sessionData || !sessionId) {
      setError('Session data not available');
      return;
    }

    const user = getCurrentUser();
    if (!user) {
      setError('User not found');
      return;
    }

    // Calculate total amount user needs to pay
    const userParticipant = sessionData.participants.find(
      (p) => p.user_id === user.id
    );
    if (!userParticipant) {
      setError('You are not a participant in this session');
      return;
    }

    // Get all assignments where user is the creditor (they're paying for these items)
    const userCreditorAssignments = sessionData.assignments.filter(
      (a) => a.creditor_id === userParticipant.id
    );
    const totalAmount = userCreditorAssignments.reduce(
      (sum, a) => sum + a.assigned_amount,
      0
    );

    if (totalAmount === 0) {
      Alert.alert('No Bills', 'You have no bills to pay in this session.');
      return;
    }

    // Get all debtors (users we're paying for)
    const debtors = new Set<string>();
    userCreditorAssignments.forEach((assignment) => {
      if (assignment.debtor_id) {
        const debtorParticipant = sessionData.participants.find(
          (p) => p.id === assignment.debtor_id
        );
        if (debtorParticipant?.user_id) {
          debtors.add(debtorParticipant.user_id);
        }
      }
    });

    // Load available groups for all debtors
    setLoadingGroups(true);
    setShowGroupSelection(true);
    try {
      if (debtors.size > 0) {
        const groupsPromises = Array.from(debtors).map((debtorId) =>
          apiService.getAvailableGroups(debtorId, user.id)
        );
        const groupsArrays = await Promise.all(groupsPromises);
        
        // Find common groups across all debtors
        if (groupsArrays.length > 0 && groupsArrays[0].length > 0) {
          let commonGroups = groupsArrays[0];
          for (let i = 1; i < groupsArrays.length; i++) {
            const groupIds = new Set(commonGroups.map((g: any) => g.id));
            commonGroups = groupsArrays[i].filter((g: any) => groupIds.has(g.id));
          }
          setAvailableGroups(commonGroups || []);
        } else {
          setAvailableGroups([]);
        }
      } else {
        // If no debtors (user paying for themselves), get all user groups
        const allGroups = await apiService.getGroups();
        setAvailableGroups(allGroups || []);
      }
    } catch (error: any) {
      console.error('Error loading groups:', error);
      Alert.alert('Error', error.message || 'Failed to load groups');
      setShowGroupSelection(false);
      setAvailableGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  // Handle create group from payment flow
  const handleCreateGroupFromPayment = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Error', 'Group name is required');
      return;
    }

    if (!sessionData) {
      Alert.alert('Error', 'Session data not available');
      return;
    }

    const user = getCurrentUser();
    if (!user) {
      Alert.alert('Error', 'User not found');
      return;
    }

    setCreatingGroup(true);
    try {
      // Get all participant user IDs from the session
      const participantUserIds = sessionData.participants
        .map((p) => p.user_id)
        .filter((id): id is string => id !== null && id !== undefined);

      // Create group with all participants as members
      const newGroup = await apiService.createGroup({
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || undefined,
        member_ids: participantUserIds,
      });

      // Use the newly created group for payment
      setSelectedGroupId(newGroup.id);
      setShowCreateGroup(false);
      setNewGroupName('');
      setNewGroupDescription('');
      
      // Add the new group to available groups list
      setAvailableGroups((prev) => [...(prev || []), newGroup]);
      
      // Reopen the group selection modal with the new group
      setShowGroupSelection(true);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  // Helper to reload groups for payment
  const loadGroupsForPayment = async () => {
    const user = getCurrentUser();
    if (!user || !sessionData) return;

    const debtors = new Set<string>();
    const userParticipant = sessionData.participants.find(
      (p) => p.user_id === user.id
    );
    if (!userParticipant) return;

    const userCreditorAssignments = sessionData.assignments.filter(
      (a) => a.creditor_id === userParticipant.id
    );

    userCreditorAssignments.forEach((assignment) => {
      if (assignment.debtor_id) {
        const debtorParticipant = sessionData.participants.find(
          (p) => p.id === assignment.debtor_id
        );
        if (debtorParticipant?.user_id) {
          debtors.add(debtorParticipant.user_id);
        }
      }
    });

    if (debtors.size > 0) {
      const groupsPromises = Array.from(debtors).map((debtorId) =>
        apiService.getAvailableGroups(debtorId, user.id)
      );
      const groupsArrays = await Promise.all(groupsPromises);
      
      if (groupsArrays.length > 0 && groupsArrays[0].length > 0) {
        let commonGroups = groupsArrays[0];
        for (let i = 1; i < groupsArrays.length; i++) {
          const groupIds = new Set(commonGroups.map((g: any) => g.id));
          commonGroups = groupsArrays[i].filter((g: any) => groupIds.has(g.id));
        }
        setAvailableGroups(commonGroups || []);
      } else {
        setAvailableGroups([]);
      }
    } else {
      const allGroups = await apiService.getGroups();
      setAvailableGroups(allGroups || []);
    }
  };

  // Actually process the payment after group is selected
  const processPayment = async () => {
    if (!sessionData || !sessionId || !selectedGroupId) {
      Alert.alert('Error', 'Please select a group');
      return;
    }

    const user = getCurrentUser();
    if (!user) {
      Alert.alert('Error', 'User not found');
      return;
    }

    const userParticipant = sessionData.participants.find(
      (p) => p.user_id === user.id
    );
    if (!userParticipant) {
      Alert.alert('Error', 'You are not a participant in this session');
      return;
    }

    const userCreditorAssignments = sessionData.assignments.filter(
      (a) => a.creditor_id === userParticipant.id
    );
    const totalAmount = userCreditorAssignments.reduce(
      (sum, a) => sum + a.assigned_amount,
      0
    );

    setPayingBill(true);
    setShowGroupSelection(false);
    try {
      const response = await apiService.payBill(
        sessionId,
        selectedGroupId,
        totalAmount / 100, // Convert from centavos to pesos
        sessionData.session.currency
      );
      
      Alert.alert('Payment Successful', `Your bill of ${(totalAmount / 100).toFixed(2)} ${sessionData.session.currency} has been paid from your wallet!`);
      setSelectedGroupId(null);
      // Refresh session data - the WebSocket will update automatically
    } catch (error: any) {
      Alert.alert('Payment Failed', error.message || 'Failed to process payment');
    } finally {
      setPayingBill(false);
    }
  };


  // Handle unlock session
  const handleUnlockSession = () => {
    if (!wsConnected || !websocketService.isConnected()) {
      setError('WebSocket is not connected');
      return;
    }
    try {
      websocketService.send({ type: 'unlock_session' });
    } catch (error: any) {
      setError(error.message || 'Failed to unlock session');
    }
  };

  // Handle item toggle
  const handleItemToggle = (orderItemId: string, itemPrice: number) => {
    // Check if session is locked
    if (sessionLocked) {
      Alert.alert('Session Locked', 'The session is locked. Assignments cannot be modified.');
      return;
    }
    
    if (!sessionData) {
      Alert.alert('Session Not Ready', 'Please wait for the session to load.');
      return;
    }
    
    if (!currentParticipantId) {
      const user = getCurrentUser();
      if (!user) {
        Alert.alert('Authentication Error', 'Please log in again.');
        return;
      }
      // Check if user is in participants list but participant ID wasn't found
      const userInParticipants = sessionData.participants.some(p => p.user_id === user.id);
      if (userInParticipants) {
        // This shouldn't happen, but if it does, refresh session state
        Alert.alert('Please Wait', 'Your session is being set up. Please try again in a moment.');
        return;
      }
      // User hasn't joined yet - this should be handled by the backend sending session_state after join
      Alert.alert('Joining Session', 'Please wait while you join the session...');
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
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background-0">
        <Box className="flex-1 bg-background-0 p-6">
          <VStack space="lg" className="flex-1 justify-center items-center">
            <Spinner size="large" />
            <Text className="text-typography-600">Loading camera...</Text>
          </VStack>
        </Box>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    // Camera permission not granted
    return (
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background-0">
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
      </SafeAreaView>
    );
  }

  // If session is connected, check if it's finished
  if (sessionId && wsConnected && sessionData) {
    // Check if session is finished (closed or paid)
    const isSessionFinished = sessionData.session.status === 'closed' || sessionData.session.status === 'paid';
    
    if (isSessionFinished) {
      return (
        <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background-0">
          <Box className="flex-1 bg-background-0 p-6">
            <VStack space="lg" className="flex-1 justify-center items-center">
              <Heading size="2xl" className="text-typography-900">
                Session Finished
              </Heading>
              <Text className="text-typography-600 text-lg text-center">
                This session has been completed and is no longer active.
              </Text>
              <Text className="text-typography-500 text-center mt-2">
                Session Status: {sessionData.session.status}
              </Text>
              {sessionData.session.total_amount && (
                <Text className="text-typography-700 font-semibold mt-2">
                  Total Amount: {sessionData.session.total_amount / 100} {sessionData.session.currency}
                </Text>
              )}
              <Button
                onPress={handleRescan}
                action="primary"
                variant="outline"
                size="lg"
                className="mt-6"
              >
                <ButtonText>Scan Another QR Code</ButtonText>
              </Button>
            </VStack>
          </Box>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background-0">
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
                      const paymentBreakdown = getItemPaymentBreakdown(item.id);
                      
                      // Determine border style based on payment scenarios
                      const hasYouPayingForYourself = paymentBreakdown.youPayingForYourself > 0;
                      const hasYouPayingForOthers = paymentBreakdown.youPayingForOthers > 0;
                      const hasOthersPayingForYou = paymentBreakdown.othersPayingForYou > 0;
                      
                      // Border and background colors only change if user checked it themselves
                      let borderClass = 'bg-background-0 border-typography-400';
                      if (hasYouPayingForYourself) {
                        borderClass = 'bg-primary-50 border-primary-600';
                      }
                      
                      return (
                        <View key={item.id} style={{ marginBottom: 8 }}>
                          <TouchableOpacity
                            onPress={() => {
                              handleItemToggle(item.id, item.unit_price);
                            }}
                            activeOpacity={sessionLocked ? 1 : 0.7}
                            disabled={sessionLocked}
                          >
                            <HStack
                              className={`p-3 rounded-lg border-2 ${borderClass}`}
                              style={{ alignItems: 'center', gap: 12 }}
                            >
                              {/* Toggle on the left */}
                              <View
                                className={`w-6 h-6 rounded-full border-2 ${
                                  hasYouPayingForYourself
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
                                {hasYouPayingForYourself && (
                                  <Text className="text-white text-xs font-bold">✓</Text>
                                )}
                              </View>

                              {/* Item info in the middle */}
                              <VStack className="flex-1" space="xs">
                                <Text
                                  className={`font-semibold ${
                                    hasYouPayingForYourself || hasYouPayingForOthers
                                      ? hasYouPayingForYourself
                                        ? 'text-primary-900'
                                        : 'text-info-900'
                                      : hasOthersPayingForYou
                                      ? 'text-success-900'
                                      : 'text-typography-900'
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
                                      {paymentBreakdown.youPayingForYourself > 0 && (
                                        <Text className="text-primary-700 text-sm font-medium">
                                          You're paying for yourself: {paymentBreakdown.youPayingForYourself / 100}{' '}
                                          {sessionData.session.currency}
                                        </Text>
                                      )}
                                      {paymentBreakdown.youPayingForOthers > 0 && (
                                        <Text className="text-info-700 text-sm font-medium">
                                          You're paying for others: {paymentBreakdown.youPayingForOthers / 100}{' '}
                                          {sessionData.session.currency}
                                        </Text>
                                      )}
                                      {paymentBreakdown.othersPayingForYou > 0 && (
                                        <Text className="text-success-700 text-sm font-medium">
                                          Others are paying for you: {paymentBreakdown.othersPayingForYou / 100}{' '}
                                          {sessionData.session.currency}
                                        </Text>
                                      )}
                                      {paymentBreakdown.othersPayingForOthers > 0 && (
                                        <Text className="text-typography-600 text-sm">
                                          Others: {paymentBreakdown.othersPayingForOthers / 100}{' '}
                                          {sessionData.session.currency}
                                        </Text>
                                      )}
                                      <Text 
                                        className={`text-sm font-semibold ${
                                          isFullyCovered 
                                            ? 'text-success-600' 
                                            : remaining < item.unit_price * 0.1 
                                            ? 'text-warning-600'
                                            : 'text-error-600'
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
                                        const isCurrentUserDebtor = assignment.debtor_id === currentParticipantId;
                                        return (
                                          <View style={{ position: 'relative' }}>
                                            <Avatar
                                              size="sm"
                                              source={getAvatarSource(assignment.creditor_id)}
                                              fallbackText={getInitials(assignment.creditor_id)}
                                              style={{
                                                borderWidth: isCurrentUser ? 2 : 0,
                                                borderColor: '#4F46E5',
                                              }}
                                            />
                                            {assignment.debtor_id && (
                                              <Avatar
                                                size="xs"
                                                source={getAvatarSource(assignment.debtor_id)}
                                                fallbackText={getInitials(assignment.debtor_id)}
                                                style={{
                                                  position: 'absolute',
                                                  bottom: -2,
                                                  right: -2,
                                                  borderWidth: isCurrentUserDebtor ? 2 : 1,
                                                  borderColor: isCurrentUserDebtor ? '#4F46E5' : '#fff',
                                                }}
                                              />
                                            )}
                                          </View>
                                        );
                                      })()
                                    ) : (
                                      // Multiple assignments - show first avatar + plus indicator
                                      <>
                                        {(() => {
                                          const firstAssignment = allAssignments.assignments[0];
                                          const isCurrentUser = firstAssignment.creditor_id === currentParticipantId;
                                          const isCurrentUserDebtor = firstAssignment.debtor_id === currentParticipantId;
                                          return (
                                            <View style={{ position: 'relative' }}>
                                              <Avatar
                                                size="sm"
                                                source={getAvatarSource(firstAssignment.creditor_id)}
                                                fallbackText={getInitials(firstAssignment.creditor_id)}
                                                style={{
                                                  borderWidth: isCurrentUser ? 2 : 0,
                                                  borderColor: '#4F46E5',
                                                }}
                                              />
                                              {firstAssignment.debtor_id && (
                                                <Avatar
                                                  size="xs"
                                                  source={getAvatarSource(firstAssignment.debtor_id)}
                                                  fallbackText={getInitials(firstAssignment.debtor_id)}
                                                  style={{
                                                    position: 'absolute',
                                                    bottom: -2,
                                                    right: -2,
                                                    borderWidth: isCurrentUserDebtor ? 2 : 1,
                                                    borderColor: isCurrentUserDebtor ? '#4F46E5' : '#fff',
                                                  }}
                                                />
                                              )}
                                            </View>
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
                                  style={{ flexShrink: 0, opacity: sessionLocked ? 0.5 : 1 }}
                                  disabled={sessionLocked}
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
                                  const isCurrentUserDebtor = assignment.debtor_id === currentParticipantId;
                                  return (
                                    <HStack
                                      key={`${assignment.creditor_id}-${assignment.debtor_id || 'null'}-${index}`}
                                      space="xs"
                                      style={{ alignItems: 'center', marginRight: 8, marginBottom: 4 }}
                                    >
                                      <View style={{ position: 'relative' }}>
                                        <Avatar
                                          size="sm"
                                          source={getAvatarSource(assignment.creditor_id)}
                                          fallbackText={getInitials(assignment.creditor_id)}
                                          style={{
                                            borderWidth: isCurrentUser ? 2 : 0,
                                            borderColor: '#4F46E5',
                                          }}
                                        />
                                        {assignment.debtor_id && (
                                          <Avatar
                                            size="xs"
                                            source={getAvatarSource(assignment.debtor_id)}
                                            fallbackText={getInitials(assignment.debtor_id)}
                                            style={{
                                              position: 'absolute',
                                              bottom: -2,
                                              right: -6,
                                              borderWidth: isCurrentUserDebtor ? 2 : 1,
                                              borderColor: isCurrentUserDebtor ? '#4F46E5' : '#fff',
                                              marginRight: 4,
                                            }}
                                          />
                                        )}
                                      </View>
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
                  {currentParticipantId && (
                    <Text className="text-typography-700 font-semibold mt-2">
                      Your Total: {getUserTotal / 100} {sessionData.session.currency}
                    </Text>
                  )}
                  {summary && (
                    <VStack space="xs" className="mt-2">
                      <Text className="text-typography-700 font-semibold">Summary:</Text>
                      {Object.entries(summary).map(([participantId, amount]) => (
                        <Text key={participantId} className="text-typography-600 text-sm">
                          Participant {participantId.substring(0, 8)}: {amount / 100} {sessionData.session.currency}
                        </Text>
                      ))}
                    </VStack>
                  )}
                      {sessionLocked && (
                        <VStack space="xs" className="mt-2">
                          {assignmentsValidated ? (
                            <Text className={`font-semibold ${
                              assignmentsValidated.all_assigned ? 'text-success-700' : 'text-warning-700'
                            }`}>
                              {assignmentsValidated.all_assigned 
                                ? '✓ All items are fully assigned' 
                                : `${assignmentsValidated.unassigned_items.length} items not fully assigned`}
                            </Text>
                          ) : (
                            <Text className="text-typography-600 text-sm">
                              Session is locked. Validating assignments...
                            </Text>
                          )}
                        </VStack>
                      )}
                </VStack>
              </Box>

              {/* Action Buttons */}
              <VStack space="sm" className="mt-4">
                <Button
                  onPress={handleRequestSummary}
                  action="secondary"
                  variant="outline"
                  size="lg"
                >
                  <ButtonText>View Summary</ButtonText>
                </Button>

                {sessionLocked ? (
                  (() => {
                    const user = getCurrentUser();
                    const isCurrentUserLocked = user && lockedByUserId === user.id;
                    return isCurrentUserLocked ? (
                      <Button
                        onPress={handleUnlockSession}
                        action="secondary"
                        variant="outline"
                        size="lg"
                        className="border-warning-600"
                      >
                        <ButtonText className="text-warning-700">Unlock Session</ButtonText>
                      </Button>
                    ) : (
                      <Box className="bg-warning-50 p-4 rounded-lg border-2 border-warning-600">
                        <Text className="text-warning-900 font-semibold text-center">
                          Session is locked. Assignments cannot be modified.
                        </Text>
                      </Box>
                    );
                  })()
                ) : (
                  <Button
                    onPress={handleValidateAssignments}
                    action="secondary"
                    variant="outline"
                    size="lg"
                  >
                    <ButtonText>Lock to pay</ButtonText>
                  </Button>
                )}

                    {sessionLocked && assignmentsValidated?.all_assigned && (
                      <Button
                        onPress={handlePayBill}
                        disabled={payingBill}
                        action="primary"
                        variant="solid"
                        size="lg"
                      >
                        {payingBill ? (
                          <>
                            <Spinner size="small" />
                            <ButtonText className="ml-2">Processing Payment...</ButtonText>
                          </>
                        ) : (
                          <ButtonText>Pay my bill</ButtonText>
                        )}
                      </Button>
                    )}

                    {sessionFinalized && (
                      <Box className="bg-success-50 p-4 rounded-lg border-2 border-success-600">
                        <Text className="text-success-900 font-semibold text-center">
                          ✓ Session Finalized - Ready for Invoices
                        </Text>
                      </Box>
                    )}
              </VStack>
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
                  className="border-info-600"
                >
                  <ButtonText className="text-info-700">Pay for other user</ButtonText>
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
                                    ? 'bg-info-50 border-info-600'
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
                                        ? 'bg-info-500 border-info-600'
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
                                        ? 'text-info-900 font-semibold'
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
                                      ? 'bg-info-50 border-info-600'
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
                                          ? 'bg-info-500 border-info-600'
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
                                          ? 'text-info-900 font-semibold'
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
                      variant="outline"
                      size="md"
                      isDisabled={loadingParticipants}
                      className="border-info-600"
                    >
                      <ButtonText className="text-info-700">Accept</ButtonText>
                    </Button>
                  </HStack>
                </View>
              </Box>
            </Animated.View>
          </View>
        </Modal>

        {/* Group Selection Modal */}
        <Modal
          visible={showGroupSelection}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setShowGroupSelection(false);
            setSelectedGroupId(null);
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 24,
            }}
          >
            <Box className="bg-background-0 rounded-lg p-6 w-full max-w-md">
              <VStack space="md">
                <Heading size="xl" className="text-typography-900">
                  Select Group
                </Heading>
                <Text className="text-typography-600">
                  Choose a group for this payment. All participants must be members of the selected group.
                </Text>

                {loadingGroups ? (
                  <Box className="items-center py-8">
                    <Spinner size="large" />
                    <Text className="text-typography-600 mt-4">Loading groups...</Text>
                  </Box>
                ) : !availableGroups || availableGroups.length === 0 ? (
                  <VStack space="md">
                    <Box className="bg-warning-50 p-4 rounded-lg">
                      <Text className="text-warning-700 text-center mb-2">
                        No common groups found. Create a new group to continue with payment.
                      </Text>
                      <Text className="text-warning-600 text-sm text-center">
                        All participants in this session will be automatically added to the group.
                      </Text>
                    </Box>
                    <Button
                      onPress={() => {
                        setShowGroupSelection(false);
                        setShowCreateGroup(true);
                      }}
                      action="primary"
                      variant="solid"
                      size="md"
                    >
                      <ButtonText>Create New Group</ButtonText>
                    </Button>
                  </VStack>
                ) : (
                  <ScrollView style={{ maxHeight: 300 }}>
                    <VStack space="sm">
                      {Array.isArray(availableGroups) && availableGroups.map((group) => (
                        <TouchableOpacity
                          key={group.id}
                          onPress={() => setSelectedGroupId(group.id)}
                        >
                          <Box
                            className={`p-4 rounded-lg border-2 ${
                              selectedGroupId === group.id
                                ? 'bg-primary-50 border-primary-600'
                                : 'bg-background-0 border-typography-200'
                            }`}
                          >
                            <HStack space="sm" style={{ alignItems: 'center' }}>
                              <Text className="text-typography-900 font-semibold flex-1">
                                {group.name}
                              </Text>
                              {selectedGroupId === group.id && (
                                <Text className="text-primary-600 font-bold">✓</Text>
                              )}
                            </HStack>
                            {group.slug && (
                              <Text className="text-typography-600 text-sm">
                                {group.slug}
                              </Text>
                            )}
                          </Box>
                        </TouchableOpacity>
                      ))}
                    </VStack>
                  </ScrollView>
                )}

                <HStack space="sm" style={{ justifyContent: 'flex-end' }}>
                  <Button
                    onPress={() => {
                      setShowGroupSelection(false);
                      setSelectedGroupId(null);
                    }}
                    variant="outline"
                    size="md"
                  >
                    <ButtonText>Cancel</ButtonText>
                  </Button>
                  <Button
                    onPress={processPayment}
                    disabled={!selectedGroupId || payingBill}
                    action="primary"
                    variant="solid"
                    size="md"
                  >
                    {payingBill ? (
                      <Spinner size="small" />
                    ) : (
                      <ButtonText>Pay</ButtonText>
                    )}
                  </Button>
                </HStack>
              </VStack>
            </Box>
          </View>
        </Modal>

        {/* Create Group Modal */}
        <Modal
          visible={showCreateGroup}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setShowCreateGroup(false);
            setNewGroupName('');
            setNewGroupDescription('');
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 24,
            }}
          >
            <Box className="bg-background-0 rounded-lg p-6 w-full max-w-md">
              <VStack space="md">
                <Heading size="xl" className="text-typography-900">
                  Create New Group
                </Heading>
                <Text className="text-typography-600">
                  Create a group to continue with payment. All participants in this session will be automatically added.
                </Text>

                <VStack space="sm">
                  <Text className="text-typography-700 font-medium">Group Name *</Text>
                  <Input>
                    <InputField
                      placeholder="Enter group name"
                      value={newGroupName}
                      onChangeText={setNewGroupName}
                    />
                  </Input>
                </VStack>

                <VStack space="sm">
                  <Text className="text-typography-700 font-medium">Description (Optional)</Text>
                  <Input>
                    <InputField
                      placeholder="Enter description"
                      value={newGroupDescription}
                      onChangeText={setNewGroupDescription}
                      multiline
                      numberOfLines={3}
                    />
                  </Input>
                </VStack>

                <HStack space="sm" style={{ justifyContent: 'flex-end' }}>
                  <Button
                    onPress={() => {
                      setShowCreateGroup(false);
                      setNewGroupName('');
                      setNewGroupDescription('');
                    }}
                    variant="outline"
                    size="md"
                  >
                    <ButtonText>Cancel</ButtonText>
                  </Button>
                  <Button
                    onPress={handleCreateGroupFromPayment}
                    disabled={creatingGroup || !newGroupName.trim()}
                    action="primary"
                    variant="solid"
                    size="md"
                  >
                    {creatingGroup ? (
                      <Spinner size="small" />
                    ) : (
                      <ButtonText>Create & Continue</ButtonText>
                    )}
                  </Button>
                </HStack>
              </VStack>
            </Box>
          </View>
        </Modal>
        </Box>
      </SafeAreaView>
    );
  }

  // Show camera scanner
  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background-0">
      <Box className="flex-1 bg-background-0">
      {!scanned && (
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
      )}

      {error && (
        <Box className="p-4">
          <UIAlert action="error" variant="solid">
            <AlertText>{error}</AlertText>
          </UIAlert>
        </Box>
      )}

      {scanned && !wsConnected && !isProcessingScanRef.current && !error && (
        <Box className="pt-4 pb-12">
          <VStack space="sm" className="items-center">
            <Spinner size="small" />
            <Text className="text-typography-600">Connecting to session...</Text>
            <Button
              onPress={handleRescan}
              action="secondary"
              variant="outline"
              size="lg"
              className="mt-4"
            >
              <ButtonText>Scan Another QR Code</ButtonText>
            </Button>
          </VStack>
        </Box>
      )}

      {scanned && !wsConnected && !isProcessingScanRef.current && error && (
        <Box className="pt-4 pb-12 px-4">
          <VStack space="md" className="items-center">
            <UIAlert action="error" variant="solid">
              <AlertText>{error}</AlertText>
            </UIAlert>
            <Text className="text-typography-600 text-center">
              Failed to connect to session. Please try again or scan another QR code.
            </Text>
            <Button
              onPress={handleRescan}
              action="primary"
              variant="outline"
              size="lg"
              className="mt-4"
            >
              <ButtonText>Scan Another QR Code</ButtonText>
            </Button>
          </VStack>
        </Box>
      )}
      </Box>
    </SafeAreaView>
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
