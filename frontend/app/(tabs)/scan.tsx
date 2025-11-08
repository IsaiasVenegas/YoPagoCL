import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StyleSheet, View, Alert } from 'react-native';
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
} from '@/components/ui';
import { getAuthToken, getCurrentUser } from '@/services/api';
import {
  websocketService,
  WebSocketMessage,
  SessionStateMessage,
} from '@/services/websocket';

// UUID regex pattern
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ScanScreen() {
  const router = useRouter();
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
      router.replace('/login');
    } else {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    // Set up websocket message listener
    const unsubscribe = websocketService.onMessage((message: WebSocketMessage) => {
      if (message.type === 'session_state') {
        setSessionData(message);
        setWsConnected(true);
        setError(null);
      } else if (message.type === 'error') {
        setError(message.message);
        setWsConnected(false);
      } else {
        // Handle other message types (updates, etc.)
        // For real-time updates, we could update the session data incrementally
        // For now, we'll keep the initial session_state and show updates via alerts
        if (
          message.type === 'participant_joined' ||
          message.type === 'participant_left' ||
          message.type === 'item_assigned' ||
          message.type === 'assignment_updated' ||
          message.type === 'assignment_removed'
        ) {
          // Optionally request a new session state to get updated data
          // Or handle updates incrementally by updating the state
        }
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

    // Validate UUID format
    const trimmedData = data.trim();
    if (!UUID_REGEX.test(trimmedData)) {
      Alert.alert('Invalid QR Code', 'The scanned QR code does not contain a valid session ID.');
      return;
    }

    setScanned(true);
    setSessionId(trimmedData);
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
      await websocketService.connect(trimmedData, user.id);
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
        <VStack space="lg" className="flex-1">
          <VStack space="md">
            <Heading size="2xl" className="text-typography-900">
              Session Connected
            </Heading>
            <Text className="text-typography-600">
              Session ID: {sessionId}
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
                <Text className="text-typography-600">
                  Assignments: {sessionData.assignments.length}
                </Text>
              </VStack>
            </Box>

            {sessionData.participants.length > 0 && (
              <Box className="bg-background-50 p-4 rounded-lg">
                <Text className="text-typography-700 font-semibold mb-2">
                  Participants:
                </Text>
                <VStack space="xs">
                  {sessionData.participants.map((participant) => (
                    <Text key={participant.id} className="text-typography-600">
                      • {participant.user_id || 'Anonymous'} (Joined:{' '}
                      {new Date(participant.joined_at).toLocaleTimeString()})
                    </Text>
                  ))}
                </VStack>
              </Box>
            )}

            {sessionData.order_items.length > 0 && (
              <Box className="bg-background-50 p-4 rounded-lg">
                <Text className="text-typography-700 font-semibold mb-2">
                  Order Items:
                </Text>
                <VStack space="xs">
                  {sessionData.order_items.map((item) => (
                    <Text key={item.id} className="text-typography-600">
                      • {item.item_name} - {item.unit_price / 100}{' '}
                      {sessionData.session.currency}
                    </Text>
                  ))}
                </VStack>
              </Box>
            )}
          </VStack>

          <Button
            onPress={handleRescan}
            action="secondary"
            variant="outline"
            size="lg"
          >
            <ButtonText>Scan Another QR Code</ButtonText>
          </Button>
        </VStack>
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
