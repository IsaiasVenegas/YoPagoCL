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
  Input,
  InputField,
} from '@/components/ui';
import { getAuthToken, getCurrentUser, apiService } from '@/services/api';

export default function RemindersScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reminders, setReminders] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [reminderMessage, setReminderMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
    } else {
      setIsAuthenticated(true);
      loadReminders();
      loadInvoices();
    }
  }, []);

  const loadReminders = async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const remindersData = await apiService.getReminders();
      setReminders(remindersData);
    } catch (error) {
      console.error('Failed to load reminders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadInvoices = async () => {
    const user = getCurrentUser();
    if (!user) return;

    try {
      const invoicesData = await apiService.getUserPendingInvoices(user.id);
      setInvoices(invoicesData);
    } catch (error) {
      console.error('Failed to load invoices:', error);
    }
  };

  const handleCreateReminder = async () => {
    if (!selectedInvoiceId) {
      Alert.alert('Error', 'Please select an invoice');
      return;
    }

    setCreating(true);
    try {
      await apiService.createReminder({
        invoice_id: selectedInvoiceId,
        message: reminderMessage.trim() || undefined,
      });
      setSelectedInvoiceId('');
      setReminderMessage('');
      setShowCreateModal(false);
      await loadReminders();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create reminder');
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background-0">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadReminders(true)} />
        }
      >
        <Box className="flex-1 bg-background-0 p-6">
          <VStack space="lg" className="flex-1">
            <HStack space="md" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Heading size="3xl" className="text-typography-900">
                Payment Reminders
              </Heading>
              <Button
                onPress={() => setShowCreateModal(true)}
                action="primary"
                variant="solid"
                size="sm"
              >
                <ButtonText>Create</ButtonText>
              </Button>
            </HStack>

            {loading ? (
              <Box className="items-center py-8">
                <Spinner size="large" />
              </Box>
            ) : reminders.length === 0 ? (
              <Box className="bg-background-50 p-6 rounded-lg items-center">
                <Text className="text-typography-600 text-center mb-4">
                  No reminders yet. Create a reminder to notify someone about a payment!
                </Text>
                <Button
                  onPress={() => setShowCreateModal(true)}
                  action="primary"
                  variant="solid"
                >
                  <ButtonText>Create Reminder</ButtonText>
                </Button>
              </Box>
            ) : (
              <VStack space="md">
                {reminders.map((reminder) => (
                  <Box key={reminder.id} className="bg-background-50 p-4 rounded-lg border border-typography-200">
                    <VStack space="sm">
                      <HStack space="md" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text className="text-typography-900 font-semibold">
                          Invoice: {reminder.invoice_id?.substring(0, 8) || 'N/A'}
                        </Text>
                        {reminder.status && (
                          <Box
                            className={`px-2 py-1 rounded ${
                              reminder.status === 'sent' ? 'bg-success-100' : 'bg-warning-100'
                            }`}
                          >
                            <Text
                              className={`text-xs font-semibold ${
                                reminder.status === 'sent' ? 'text-success-700' : 'text-warning-700'
                              }`}
                            >
                              {reminder.status.toUpperCase()}
                            </Text>
                          </Box>
                        )}
                      </HStack>

                      {reminder.message && (
                        <Text className="text-typography-600">
                          {reminder.message}
                        </Text>
                      )}

                      {reminder.created_at && (
                        <Text className="text-typography-500 text-sm">
                          Created: {formatDate(reminder.created_at)}
                        </Text>
                      )}

                      {reminder.reminder_date && (
                        <Text className="text-typography-500 text-sm">
                          Reminder Date: {formatDate(reminder.reminder_date)}
                        </Text>
                      )}
                    </VStack>
                  </Box>
                ))}
              </VStack>
            )}
          </VStack>
        </Box>
      </ScrollView>

      {/* Create Reminder Modal */}
      {showCreateModal && (
        <Box
          className="absolute inset-0 bg-black/50 items-center justify-center p-6"
          style={{ position: 'absolute' }}
        >
          <Box className="bg-background-0 rounded-lg p-6 w-full max-w-md">
            <VStack space="md">
              <Heading size="lg" className="text-typography-900">
                Create Payment Reminder
              </Heading>
              
              <VStack space="sm">
                <Text className="text-typography-700 font-medium">Invoice *</Text>
                {invoices.length === 0 ? (
                  <Box className="bg-warning-50 p-3 rounded">
                    <Text className="text-warning-700 text-sm">
                      No pending invoices available
                    </Text>
                  </Box>
                ) : (
                  <ScrollView style={{ maxHeight: 150 }}>
                    <VStack space="xs">
                      {invoices.map((invoice) => (
                        <TouchableOpacity
                          key={invoice.id}
                          onPress={() => setSelectedInvoiceId(invoice.id)}
                        >
                          <Box
                            className={`p-3 rounded border-2 ${
                              selectedInvoiceId === invoice.id
                                ? 'bg-primary-50 border-primary-500'
                                : 'bg-background-0 border-typography-200'
                            }`}
                          >
                            <Text className="text-typography-900 font-medium">
                              ${Math.floor(invoice.total_amount / 100).toLocaleString('es-CL')} CLP
                            </Text>
                            <Text className="text-typography-600 text-xs">
                              {invoice.id.substring(0, 8)}...
                            </Text>
                          </Box>
                        </TouchableOpacity>
                      ))}
                    </VStack>
                  </ScrollView>
                )}
              </VStack>

              <VStack space="sm">
                <Text className="text-typography-700 font-medium">Message (Optional)</Text>
                <Input>
                  <InputField
                    placeholder="Enter reminder message"
                    value={reminderMessage}
                    onChangeText={setReminderMessage}
                    multiline
                    numberOfLines={3}
                  />
                </Input>
              </VStack>

              <HStack space="sm" style={{ justifyContent: 'flex-end' }}>
                <Button
                  onPress={() => {
                    setShowCreateModal(false);
                    setSelectedInvoiceId('');
                    setReminderMessage('');
                  }}
                  variant="outline"
                  size="md"
                >
                  <ButtonText>Cancel</ButtonText>
                </Button>
                <Button
                  onPress={handleCreateReminder}
                  disabled={creating || !selectedInvoiceId || invoices.length === 0}
                  action="primary"
                  variant="solid"
                  size="md"
                >
                  {creating ? (
                    <Spinner size="small" />
                  ) : (
                    <ButtonText>Create</ButtonText>
                  )}
                </Button>
              </HStack>
            </VStack>
          </Box>
        </Box>
      )}
    </SafeAreaView>
  );
}

