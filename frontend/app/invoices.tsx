import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
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
import SendReminderModal from '@/components/SendReminderModal';

export default function InvoicesScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
    } else {
      setIsAuthenticated(true);
      loadInvoices();
    }
  }, [filter]);

  const loadInvoices = async (showRefreshing = false) => {
    const user = getCurrentUser();
    if (!user) return;

    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      let invoicesData;
      if (filter === 'pending') {
        invoicesData = await apiService.getUserPendingInvoices(user.id);
      } else if (filter === 'paid') {
        invoicesData = await apiService.getUserInvoices(user.id);
        invoicesData = invoicesData.filter((inv: any) => inv.status === 'paid');
      } else {
        invoicesData = await apiService.getUserInvoices(user.id);
      }
      setInvoices(invoicesData);
    } catch (error) {
      console.error('Failed to load invoices:', error);
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

  const handleMarkPaid = async (invoiceId: string) => {
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
              await loadInvoices();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to mark invoice as paid');
            }
          },
        },
      ]
    );
  };

  const handlePayInvoice = async (invoiceId: string) => {
    Alert.alert(
      'Pay Invoice',
      'Are you sure you want to pay this invoice? This will mark it as paid and create wallet transactions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay',
          onPress: async () => {
            try {
              await apiService.markInvoicePaid(invoiceId);
              await loadInvoices();
              Alert.alert('Success', 'Invoice has been paid successfully!');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to pay invoice');
            }
          },
        },
      ]
    );
  };

  const handleSendReminder = async (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setShowReminderModal(true);
  };

  const handleSendReminderMessage = async (message?: string) => {
    try {
      await apiService.sendPushNotification(selectedInvoiceId, message);
      Alert.alert('Success', 'Reminder sent successfully!');
      await loadInvoices(); // Refresh the list
    } catch (error: any) {
      // Show user-friendly error message
      const errorMessage = error.message || 'Failed to send reminder';
      Alert.alert(
        'Unable to Send Reminder',
        errorMessage,
        [{ text: 'OK' }]
      );
      throw error;
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  const pendingCount = invoices.filter((inv) => inv.status === 'pending').length;
  const paidCount = invoices.filter((inv) => inv.status === 'paid').length;
  const totalPending = invoices
    .filter((inv) => inv.status === 'pending')
    .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background-0">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadInvoices(true)} />
        }
      >
        <Box className="flex-1 bg-background-0 p-6">
          <VStack space="lg" className="flex-1">
            <Heading size="3xl" className="text-typography-900">
              Invoices
            </Heading>

            {/* Summary */}
            <Box className="bg-background-50 p-4 rounded-lg">
              <VStack space="sm">
                <Text className="text-typography-700 font-semibold">Summary</Text>
                <HStack space="md" style={{ justifyContent: 'space-between' }}>
                  <VStack space="xs">
                    <Text className="text-typography-600 text-sm">Pending</Text>
                    <Text className="text-typography-900 font-bold">{pendingCount}</Text>
                  </VStack>
                  <VStack space="xs">
                    <Text className="text-typography-600 text-sm">Paid</Text>
                    <Text className="text-typography-900 font-bold">{paidCount}</Text>
                  </VStack>
                  <VStack space="xs">
                    <Text className="text-typography-600 text-sm">Total Pending</Text>
                    <Text className="text-typography-900 font-bold">
                      ${formatAmount(totalPending)} CLP
                    </Text>
                  </VStack>
                </HStack>
              </VStack>
            </Box>

            {/* Filters */}
            <HStack space="sm">
              <Button
                onPress={() => setFilter('all')}
                variant={filter === 'all' ? 'solid' : 'outline'}
                size="sm"
                action={filter === 'all' ? 'primary' : 'secondary'}
              >
                <ButtonText>All</ButtonText>
              </Button>
              <Button
                onPress={() => setFilter('pending')}
                variant={filter === 'pending' ? 'solid' : 'outline'}
                size="sm"
                action={filter === 'pending' ? 'primary' : 'secondary'}
              >
                <ButtonText>Pending</ButtonText>
              </Button>
              <Button
                onPress={() => setFilter('paid')}
                variant={filter === 'paid' ? 'solid' : 'outline'}
                size="sm"
                action={filter === 'paid' ? 'primary' : 'secondary'}
              >
                <ButtonText>Paid</ButtonText>
              </Button>
            </HStack>

            {loading ? (
              <Box className="items-center py-8">
                <Spinner size="large" />
              </Box>
            ) : invoices.length === 0 ? (
              <Box className="bg-background-50 p-6 rounded-lg items-center">
                <Text className="text-typography-600 text-center">
                  No invoices found
                </Text>
              </Box>
            ) : (
              <VStack space="md">
                {invoices.map((invoice) => {
                  const user = getCurrentUser();
                  const isOwed = invoice.to_user === user?.id; // I'm the creditor (they owe me)
                  const iOwe = invoice.from_user === user?.id; // I'm the debtor (I owe them)
                  
                  return (
                    <TouchableOpacity
                      key={invoice.id}
                      onPress={() => router.push(`/invoices/${invoice.id}`)}
                    >
                      <Box className="bg-background-50 p-4 rounded-lg border border-typography-200">
                        <HStack space="md" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <VStack space="xs" className="flex-1">
                            <HStack space="sm" style={{ alignItems: 'center' }}>
                              <Heading size="md" className="text-typography-900">
                                ${formatAmount(invoice.total_amount)} CLP
                              </Heading>
                              <Box
                                className={`px-2 py-1 rounded ${
                                  invoice.status === 'paid'
                                    ? 'bg-success-100'
                                    : 'bg-warning-100'
                                }`}
                              >
                                <Text
                                  className={`text-xs font-semibold ${
                                    invoice.status === 'paid'
                                      ? 'text-success-700'
                                      : 'text-warning-700'
                                  }`}
                                >
                                  {invoice.status.toUpperCase()}
                                </Text>
                              </Box>
                            </HStack>
                            {invoice.created_at && (
                              <Text className="text-typography-600 text-sm">
                                Created: {formatDate(invoice.created_at)}
                              </Text>
                            )}
                            {invoice.paid_at && (
                              <Text className="text-success-600 text-sm">
                                Paid: {formatDate(invoice.paid_at)}
                              </Text>
                            )}
                            {invoice.currency && (
                              <Text className="text-typography-500 text-xs">
                                Currency: {invoice.currency}
                              </Text>
                            )}
                          </VStack>
                          {invoice.status === 'pending' && (
                            <VStack space="xs">
                              {isOwed && (
                                <>
                                  <Button
                                    onPress={(e) => {
                                      e.stopPropagation();
                                      handleSendReminder(invoice.id);
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="border-primary-500"
                                  >
                                    <ButtonText className="text-primary-500">Send reminder</ButtonText>
                                  </Button>
                                  <Button
                                    onPress={(e) => {
                                      e.stopPropagation();
                                      handleMarkPaid(invoice.id);
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="border-success-500"
                                  >
                                    <ButtonText className="text-success-500">Mark as paid</ButtonText>
                                  </Button>
                                </>
                              )}
                              {iOwe && (
                                <Button
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    handlePayInvoice(invoice.id);
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className="border-primary-500"
                                >
                                  <ButtonText className="text-primary-500">Pay</ButtonText>
                                </Button>
                              )}
                            </VStack>
                          )}
                        </HStack>
                      </Box>
                    </TouchableOpacity>
                  );
                })}
              </VStack>
            )}
          </VStack>
        </Box>
      </ScrollView>

      <SendReminderModal
        visible={showReminderModal}
        onClose={() => {
          setShowReminderModal(false);
          setSelectedInvoiceId('');
        }}
        invoiceId={selectedInvoiceId}
        onSend={handleSendReminderMessage}
      />
    </SafeAreaView>
  );
}

