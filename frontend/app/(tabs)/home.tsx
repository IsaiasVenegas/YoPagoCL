import React, { useEffect, useState } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
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

export default function HomeScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingInvoices, setPendingInvoices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
    } else {
      setIsAuthenticated(true);
      loadData();
    }
  }, []);

  // Reload data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const token = getAuthToken();
      if (token && isAuthenticated && !loading) {
        // Only reload if not already loading
        loadData(true); // Use refreshing state when refocusing
      }
    }, [isAuthenticated, loading])
  );

  const loadData = async (showRefreshing = false) => {
    const user = getCurrentUser();
    if (!user) return;

    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      // Load data in parallel
      try {
        const [invoicesData, groupsData] = await Promise.all([
          apiService.getUserPendingInvoices(user.id),
          apiService.getGroups(),
        ]);
        setPendingInvoices(invoicesData);
        setGroups(groupsData);
      } catch (error) {
        console.error('Failed to load invoices or groups:', error);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatAmount = (amount: number): string => {
    const pesos = Math.floor(amount / 100);
    return pesos.toLocaleString('es-CL');
  };

  if (!isAuthenticated) {
    return null;
  }

  const user = getCurrentUser();
  const totalPending = pendingInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background-0">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />
        }
      >
        <Box className="flex-1 bg-background-0 p-6">
          <VStack space="lg" className="flex-1">
            <VStack space="md" className="mt-4">
              <Heading size="3xl" className="text-typography-900">
                Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!
              </Heading>
              <Text className="text-typography-600 text-lg">
                Here's your general overview
              </Text>
            </VStack>

            {loading ? (
              <Box className="items-center py-8">
                <Spinner size="large" />
              </Box>
            ) : (
              <>
                {/* Pending Invoices */}
                <Box className="bg-background-50 p-4 rounded-lg">
                  <HStack space="md" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Heading size="lg" className="text-typography-900">
                      Pending Invoices
                    </Heading>
                    <Button
                      onPress={() => router.push('/invoices')}
                      variant="link"
                      size="sm"
                    >
                      <ButtonText className="text-primary-500">View All</ButtonText>
                    </Button>
                  </HStack>
                  
                  {pendingInvoices.length === 0 ? (
                    <Text className="text-typography-600">No pending invoices</Text>
                  ) : (
                    <VStack space="sm">
                      <Text className="text-typography-700 font-semibold text-lg">
                        Total: ${formatAmount(totalPending)} CLP
                      </Text>
                      <Text className="text-typography-600">
                        {pendingInvoices.length} invoice{pendingInvoices.length !== 1 ? 's' : ''} pending
                      </Text>
                      {pendingInvoices.slice(0, 3).map((invoice) => {
                        const isOwed = invoice.to_user === user?.id; // I'm the creditor (they owe me)
                        const iOwe = invoice.from_user === user?.id; // I'm the debtor (I owe them)
                        const otherUserId = isOwed ? invoice.from_user : invoice.to_user;
                        const otherUserName = invoice.from_user_rel?.name || invoice.to_user_rel?.name || 
                                             invoice.from_user_rel?.email || invoice.to_user_rel?.email ||
                                             `User ${otherUserId.substring(0, 8)}`;
                        
                        return (
                          <Box key={invoice.id} className="bg-background-0 p-3 rounded border border-typography-200">
                            <Text className="text-typography-900 font-medium">
                              ${formatAmount(invoice.total_amount)} CLP
                            </Text>
                            <Text className="text-typography-600 text-sm">
                              {isOwed ? `Owed by ${otherUserName}` : iOwe ? `Owe to ${otherUserName}` : 'Pending payment'}
                            </Text>
                            <Text className="text-typography-500 text-xs">
                              {invoice.status === 'pending' ? 'Pending payment' : invoice.status}
                            </Text>
                          </Box>
                        );
                      })}
                    </VStack>
                  )}
                </Box>

                {/* Groups */}
                <Box className="bg-background-50 p-4 rounded-lg">
                  <HStack space="md" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Heading size="lg" className="text-typography-900">
                      My Groups
                    </Heading>
                    <Button
                      onPress={() => router.push('/groups')}
                      variant="link"
                      size="sm"
                    >
                      <ButtonText className="text-primary-500">View All</ButtonText>
                    </Button>
                  </HStack>
                  
                  {groups.length === 0 ? (
                    <VStack space="sm">
                      <Text className="text-typography-600">No groups yet</Text>
                      <Button
                        onPress={() => router.push('/groups')}
                        variant="outline"
                        size="sm"
                      >
                        <ButtonText>Create Group</ButtonText>
                      </Button>
                    </VStack>
                  ) : (
                    <VStack space="sm">
                      {groups.slice(0, 3).map((group) => (
                        <TouchableOpacity
                          key={group.id}
                          onPress={() => router.push(`/groups/${group.id}`)}
                        >
                          <Box className="bg-background-0 p-3 rounded border border-typography-200">
                            <Text className="text-typography-900 font-medium">
                              {group.name}
                            </Text>
                            {group.description && (
                              <Text className="text-typography-600 text-sm">
                                {group.description}
                              </Text>
                            )}
                          </Box>
                        </TouchableOpacity>
                      ))}
                    </VStack>
                  )}
                </Box>
              </>
            )}
          </VStack>
        </Box>
      </ScrollView>
    </SafeAreaView>
  );
}

