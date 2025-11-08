import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Box,
  VStack,
  Text,
  Heading,
} from '@/components/ui';
import { getAuthToken } from '@/services/api';

export default function ScanScreen() {
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
    <Box className="flex-1 bg-background-0 p-6">
      <VStack space="lg" className="flex-1 justify-center items-center">
        <Heading size="3xl" className="text-typography-900">
          Scan QR Code
        </Heading>
        <Text className="text-typography-600 text-lg text-center">
          QR Code scanner will be implemented here
        </Text>
      </VStack>
    </Box>
  );
}

