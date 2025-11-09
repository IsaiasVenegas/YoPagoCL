import { Stack, useRouter } from "expo-router";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { initializePushNotifications } from '@/services/notifications';
import { getAuthToken } from '@/services/api';
import '@/global.css';

// UUID regex pattern
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    // Initialize push notifications
    const token = getAuthToken();
    if (token) {
      initializePushNotifications();
    }

    // Handle initial URL (when app is opened via deeplink)
    const handleInitialURL = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleDeepLink(initialUrl);
      }
    };

    // Handle URL changes (when app is already open)
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    handleInitialURL();

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {
    try {
      const { hostname, path, queryParams } = Linking.parse(url);
      
      if (hostname === 'session' && path) {
        // Extract session ID from path
        // URL format: yopagocl://session/{session_id}
        const pathParts = path.split('/').filter(Boolean);
        const sessionId = pathParts[pathParts.length - 1];
        
        if (sessionId && UUID_REGEX.test(sessionId)) {
          // Navigate to scan screen with session ID
          router.push({
            pathname: '/scan',
            params: { sessionId }
          });
        }
      }
    } catch (error) {
      console.error('Error handling deeplink:', error);
    }
  };

  return (
    <SafeAreaProvider>
      <GluestackUIProvider mode="system">
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        />
      </GluestackUIProvider>
    </SafeAreaProvider>
  );
}
