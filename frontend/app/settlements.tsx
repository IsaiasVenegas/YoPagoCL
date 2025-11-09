import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Box,
  VStack,
  Text,
  Heading,
  Button,
  ButtonText,
  Spinner,
  HStack,
} from '@/components/ui';
import { getAuthToken, getCurrentUser, apiService } from '@/services/api';

export default function SettlementsScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settlements, setSettlements] = useState<any[]>([]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
    } else {
      setIsAuthenticated(true);
      loadSettlements();
    }
  }, []);

  const loadSettlements = async (showRefreshing = false) => {
    const user = getCurrentUser();
    if (!user) return;

    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const settlementsData = await apiService.getSettlements(user.id);
      setSettlements(settlementsData);
    } catch (error) {
      console.error('Failed to load settlements:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatAmount = (amount: number): string => {
    const pesos = Math.floor(amount / 100);
    return pesos.toLocaleString('es-CL');
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!isAuthenticated) {
    return null;
  }

  const currentUser = getCurrentUser();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background-0">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadSettlements(true)} />
        }
      >
        <Box className="flex-1 bg-background-0 p-6">
          <VStack space="lg" className="flex-1">
            <Heading size="3xl" className="text-typography-900">
              Settlements
            </Heading>

            {loading ? (
              <Box className="items-center py-8">
                <Spinner size="large" />
              </Box>
            ) : settlements.length === 0 ? (
              <Box className="bg-background-50 p-6 rounded-lg items-center">
                <Text className="text-typography-600 text-center">
                  No settlements found
                </Text>
              </Box>
            ) : (
              <VStack space="md">
                {settlements.map((settlement) => {
                  const isFromMe = settlement.from_user === currentUser?.id;
                  const isToMe = settlement.to_user === currentUser?.id;

                  return (
                    <Box key={settlement.id} className="bg-background-50 p-4 rounded-lg border border-typography-200">
                      <VStack space="sm">
                        <HStack space="md" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                          <Heading size="md" className="text-typography-900">
                            ${formatAmount(settlement.amount)} {settlement.currency || 'CLP'}
                          </Heading>
                          <Box
                            className={`px-2 py-1 rounded ${
                              isFromMe ? 'bg-error-100' : 'bg-success-100'
                            }`}
                          >
                            <Text
                              className={`text-xs font-semibold ${
                                isFromMe ? 'text-error-700' : 'text-success-700'
                              }`}
                            >
                              {isFromMe ? 'SENT' : 'RECEIVED'}
                            </Text>
                          </Box>
                        </HStack>

                        <Text className="text-typography-600">
                          {isFromMe
                            ? `To: ${settlement.to_user_name || 'User'}`
                            : `From: ${settlement.from_user_name || 'User'}`}
                        </Text>

                        {settlement.settlement_date && (
                          <Text className="text-typography-500 text-sm">
                            Date: {formatDate(settlement.settlement_date)}
                          </Text>
                        )}

                        {settlement.payment_method && (
                          <Text className="text-typography-500 text-sm">
                            Method: {settlement.payment_method}
                          </Text>
                        )}

                        {settlement.invoice_id && (
                          <Text className="text-typography-500 text-xs font-mono">
                            Invoice: {settlement.invoice_id.substring(0, 8)}...
                          </Text>
                        )}
                      </VStack>
                    </Box>
                  );
                })}
              </VStack>
            )}
          </VStack>
        </Box>
      </ScrollView>
    </SafeAreaView>
  );
}

