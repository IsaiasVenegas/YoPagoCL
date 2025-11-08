import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Box,
  VStack,
  HStack,
  Button,
  ButtonText,
  Text,
  Heading,
  Alert,
  AlertText,
} from '@/components/ui';
import { apiService, getAuthToken } from '@/services/api';

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

  const handleLogout = async () => {
    try {
      await apiService.logout();
      router.replace('/login');
    } catch (error) {
      // Even if logout fails, clear token and redirect
      router.replace('/login');
    }
  };

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  return (
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

        <Box className="mt-auto mb-8">
          <Button
            onPress={handleLogout}
            variant="outline"
            className="border-error-500"
            size="lg"
          >
            <ButtonText className="text-error-500">Logout</ButtonText>
          </Button>
        </Box>
      </VStack>
    </Box>
  );
}

