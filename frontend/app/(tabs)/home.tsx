import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Box,
  VStack,
  Text,
  Heading,
  Alert,
  AlertText,
} from '@/components/ui';
import { getAuthToken } from '@/services/api';

export default function HomeScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is authenticated
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
    } else {
      setIsAuthenticated(true);
    }
  }, []);

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background-0">
      <Box className="flex-1 bg-background-0 p-6">
        <VStack space="lg" className="flex-1">
          <VStack space="md" className="mt-8">
            <Heading size="3xl" className="text-typography-900">
              Welcome to YoPagoCL
            </Heading>
            <Text className="text-typography-600 text-lg">
              You're successfully logged in!
            </Text>
          </VStack>

          <Alert action="success" variant="solid" className="mt-4">
            <AlertText>You are authenticated and ready to use the app.</AlertText>
          </Alert>

          <VStack space="md" className="mt-8">
            <Text className="text-typography-700">
              This is your home screen. You can start using the app features from here.
            </Text>
          </VStack>
        </VStack>
      </Box>
    </SafeAreaView>
  );
}

