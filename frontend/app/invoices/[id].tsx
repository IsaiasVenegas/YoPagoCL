import React, { useEffect, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScrollView, Alert } from 'react-native';
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

export default function InvoiceDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const invoiceId = params.id as string;
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<any>(null);
  const [payingInvoice, setPayingInvoice] = useState(false);
  const [markedAsPaidInCash, setMarkedAsPaidInCash] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
    } else {
      setIsAuthenticated(true);
      loadInvoice();
    }
  }, [invoiceId]);

  const loadInvoice = async () => {
    setLoading(true);
    try {
      const invoiceData = await apiService.getInvoice(invoiceId);
      setInvoice(invoiceData);
      // Check if invoice is paid and was marked as paid (not via wallet payment)
      // We'll show "paid in cash" if the invoice is paid and we previously marked it
      // For now, we'll show it if the invoice is paid and the user is the creditor
      const user = getCurrentUser();
      if (invoiceData.status === 'paid' && invoiceData.to_user === user?.id) {
        // If user is the creditor and invoice is paid, it might have been marked as paid
        // We'll keep the state if it was already set, or check wallet transactions
        // For simplicity, we'll show it if markedAsPaidInCash is true
      }
    } catch (error) {
      console.error('Failed to load invoice:', error);
      Alert.alert('Error', 'Failed to load invoice');
    } finally {
      setLoading(false);
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
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleMarkPaid = async () => {
    Alert.alert(
      'Mark as Paid',
      'Are you sure you want to mark this invoice as paid?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as paid',
          onPress: async () => {
            try {
              await apiService.markInvoicePaid(invoiceId);
              setMarkedAsPaidInCash(true);
              await loadInvoice();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to mark invoice as paid');
            }
          },
        },
      ]
    );
  };

  const handlePayInvoice = async () => {
    if (!invoice) {
      Alert.alert('Error', 'Invoice data not available');
      return;
    }

    const user = getCurrentUser();
    if (!user) {
      Alert.alert('Error', 'User not found');
      return;
    }

    // Check if user owes money (user is from_user/debtor)
    if (invoice.from_user !== user.id) {
      Alert.alert('Error', 'You do not owe money for this invoice');
      return;
    }

    Alert.alert(
      'Pay Invoice',
      'Are you sure you want to pay this invoice? This will mark it as paid and create wallet transactions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay',
          onPress: async () => {
            try {
              setPayingInvoice(true);
              await apiService.markInvoicePaid(invoiceId);
              await loadInvoice();
              Alert.alert('Success', 'Invoice has been paid successfully!');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to pay invoice');
            } finally {
              setPayingInvoice(false);
            }
          },
        },
      ]
    );
  };


  if (!isAuthenticated) {
    return null;
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background-0">
      <ScrollView className="flex-1">
        <Box className="flex-1 bg-background-0 p-6">
          {loading ? (
            <Box className="items-center py-8">
              <Spinner size="large" />
            </Box>
          ) : invoice ? (
            <VStack space="lg" className="flex-1">
              <VStack space="md">
                <Heading size="3xl" className="text-typography-900">
                  Invoice Details
                </Heading>
                <Box
                  className={`px-3 py-2 rounded ${
                    invoice.status === 'paid' ? 'bg-success-100' : 'bg-warning-100'
                  }`}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <Text
                    className={`font-semibold ${
                      invoice.status === 'paid' ? 'text-success-700' : 'text-warning-700'
                    }`}
                  >
                    {invoice.status.toUpperCase()}
                  </Text>
                </Box>
              </VStack>

              <Box className="bg-background-50 p-4 rounded-lg">
                <VStack space="md">
                  <HStack space="md" style={{ justifyContent: 'space-between' }}>
                    <Text className="text-typography-700 font-medium">Total Amount</Text>
                    <Text className="text-typography-900 font-bold text-lg">
                      ${formatAmount(invoice.total_amount)} {invoice.currency || 'CLP'}
                    </Text>
                  </HStack>

                  {invoice.created_at && (
                    <HStack space="md" style={{ justifyContent: 'space-between' }}>
                      <Text className="text-typography-700 font-medium">Created</Text>
                      <Text className="text-typography-600">{formatDate(invoice.created_at)}</Text>
                    </HStack>
                  )}

                  {invoice.paid_at && (
                    <HStack space="md" style={{ justifyContent: 'space-between' }}>
                      <Text className="text-typography-700 font-medium">Paid At</Text>
                      <VStack space="xs" style={{ alignItems: 'flex-end' }}>
                        <Text className="text-success-600">{formatDate(invoice.paid_at)}</Text>
                      </VStack>
                    </HStack>
                  )}

                  {invoice.creditor && (
                    <VStack space="xs">
                      <Text className="text-typography-700 font-medium">Creditor</Text>
                      <Text className="text-typography-600">
                        {invoice.creditor.name || invoice.creditor.email}
                      </Text>
                    </VStack>
                  )}

                  {invoice.debtor && (
                    <VStack space="xs">
                      <Text className="text-typography-700 font-medium">Debtor</Text>
                      <Text className="text-typography-600">
                        {invoice.debtor.name || invoice.debtor.email}
                      </Text>
                    </VStack>
                  )}

                  {invoice.session_id && (
                    <VStack space="xs">
                      <Text className="text-typography-700 font-medium">Session ID</Text>
                      <Text className="text-typography-600 text-xs font-mono">
                        {invoice.session_id}
                      </Text>
                    </VStack>
                  )}

                  {invoice.group_id && (
                    <VStack space="xs">
                      <Text className="text-typography-700 font-medium">Group ID</Text>
                      <Text className="text-typography-600 text-xs font-mono">
                        {invoice.group_id}
                      </Text>
                    </VStack>
                  )}
                </VStack>
              </Box>

              {invoice.status === 'pending' && (() => {
                const user = getCurrentUser();
                const iOwe = invoice.from_user === user?.id; // I'm the debtor (I owe them)
                const isOwed = invoice.to_user === user?.id; // I'm the creditor (they owe me)
                
                return (
                  <VStack space="sm">
                    {iOwe && (
                      <Button
                        onPress={handlePayInvoice}
                        disabled={payingInvoice}
                        action="primary"
                        variant="solid"
                        size="lg"
                      >
                        {payingInvoice ? (
                          <>
                            <Spinner size="small" />
                            <ButtonText className="ml-2">Processing...</ButtonText>
                          </>
                        ) : (
                          <ButtonText>Pay</ButtonText>
                        )}
                      </Button>
                    )}
                    {isOwed && (
                      <Button
                        onPress={handleMarkPaid}
                        action="primary"
                        variant="solid"
                        size="lg"
                      >
                        <ButtonText>Mark as paid</ButtonText>
                      </Button>
                    )}
                  </VStack>
                );
              })()}

              <Button
                onPress={() => router.back()}
                variant="outline"
                size="lg"
              >
                <ButtonText>Back</ButtonText>
              </Button>
            </VStack>
          ) : (
            <Box className="items-center py-8">
              <Text className="text-typography-600">Invoice not found</Text>
            </Box>
          )}
        </Box>
      </ScrollView>
    </SafeAreaView>
  );
}

