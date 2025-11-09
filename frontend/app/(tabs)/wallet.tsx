import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Box,
  VStack,
  Text,
  Heading,
  Button,
  ButtonText,
  Input,
  InputField,
  Spinner,
  Alert,
  AlertText,
  HStack,
} from '@/components/ui';
import { apiService, getAuthToken, getCurrentUser } from '@/services/api';

export default function WalletScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    // Check if user is authenticated
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
    } else {
      setIsAuthenticated(true);
      loadWallet();
      loadTransactions();
    }
  }, []);

  // Reload data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const token = getAuthToken();
      if (token && isAuthenticated) {
        // Clear any previous status messages when tab is focused
        setStatus('idle');
        setStatusMessage('');
        loadWallet();
        loadTransactions();
      }
    }, [isAuthenticated])
  );

  const loadWallet = async () => {
    const user = getCurrentUser();
    if (user) {
      try {
        const walletData = await apiService.getUserWallet(user.id);
        setWallet(walletData);
      } catch (error) {
        console.error('Failed to load wallet:', error);
      }
    }
  };

  const loadTransactions = async () => {
    const user = getCurrentUser();
    if (!user) return;

    setLoadingTransactions(true);
    try {
      const transactionsData = await apiService.getWalletTransactions(user.id, 20);
      setTransactions(transactionsData);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  // Format number with thousand separators (points)
  const formatNumber = (num: number | string): string => {
    const numStr = typeof num === 'string' ? num.replace(/\./g, '') : num.toString();
    const numValue = parseInt(numStr, 10);
    if (isNaN(numValue)) return '';
    return numValue.toLocaleString('es-CL');
  };

  // Parse formatted number (remove thousand separators)
  const parseFormattedNumber = (formatted: string): number => {
    const cleaned = formatted.replace(/\./g, '');
    return parseInt(cleaned, 10) || 0;
  };

  const handleAmountChange = (text: string) => {
    // Remove all non-numeric characters except we'll allow typing
    const cleaned = text.replace(/[^\d]/g, '');
    if (cleaned === '') {
      setAmount('');
      return;
    }
    // Format with thousand separators
    const formatted = formatNumber(cleaned);
    setAmount(formatted);
  };

  const handleTopUp = async () => {
    const amountNum = parseFormattedNumber(amount);
    if (!amount || amountNum <= 0) {
      setStatus('error');
      setStatusMessage('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setStatus('idle');
    setStatusMessage('');

    try {
      // amountNum is in pesos (user enters pesos, e.g., 10000)
      // API expects pesos and converts to centavos internally (multiplies by 100)
      const response = await apiService.topUpWallet(amountNum);
      setStatus('success');
      setStatusMessage(`Successfully added $${formatNumber(amountNum)} to your wallet!`);
      setAmount('');
      await loadWallet(); // Refresh wallet balance
      await loadTransactions(); // Refresh transactions
    } catch (error: any) {
      setStatus('error');
      setStatusMessage(error.message || 'Failed to top up wallet. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  // Format balance without decimals and with thousand separators
  const formatBalance = (balance: number): string => {
    // Balance is in centavos, convert to pesos (divide by 100) and format
    const pesos = Math.floor(balance / 100);
    return pesos.toLocaleString('es-CL');
  };

  const balance = wallet ? formatBalance(wallet.balance) : '0';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background-0">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <Box className="flex-1 bg-background-0 p-6">
              <VStack space="lg" className="flex-1">
                <VStack space="md" className="mt-8">
                  <Heading size="3xl" className="text-typography-900">
                    Wallet
                  </Heading>
                </VStack>

                <VStack space="md" className="mt-4">
                  <Heading size="lg" className="text-typography-900">
                    Balance
                  </Heading>
                  <Box className="bg-background-50 p-4 rounded-lg">
                    <Text className="text-typography-600 mb-1">Current Balance</Text>
                    <Text className="text-typography-900 text-2xl font-bold">
                      ${balance} CLP
                    </Text>
                  </Box>

                  <VStack space="sm">
                    <Text className="text-typography-700 font-medium">Add money to my wallet</Text>
                    <Input>
                      <InputField
                        placeholder="Enter amount (e.g., 10.000)"
                        value={amount}
                        onChangeText={handleAmountChange}
                        keyboardType="numeric"
                      />
                    </Input>
                    <Button
                      onPress={handleTopUp}
                      disabled={loading}
                      size="lg"
                    >
                      {loading ? (
                        <Spinner size="small" />
                      ) : (
                        <ButtonText>Add (via Transbank)</ButtonText>
                      )}
                    </Button>
                  </VStack>

                  {status !== 'idle' && (
                    <Alert action={status === 'success' ? 'success' : 'error'} variant="solid">
                      <AlertText>{statusMessage}</AlertText>
                    </Alert>
                  )}
                </VStack>

                {/* Transactions History */}
                <VStack space="md" className="mt-6">
                  <Heading size="lg" className="text-typography-900">
                    Recent Transactions
                  </Heading>

                  {loadingTransactions ? (
                    <Box className="items-center py-4">
                      <Spinner size="small" />
                    </Box>
                  ) : transactions.length === 0 ? (
                    <Box className="bg-background-50 p-4 rounded-lg">
                      <Text className="text-typography-600 text-center">
                        No transactions yet
                      </Text>
                    </Box>
                  ) : (
                    <VStack space="sm">
                      {transactions.map((transaction) => {
                        const amount = transaction.amount / 100;
                        const isPositive = amount > 0;
                        const formatAmount = (amt: number) => {
                          const pesos = Math.floor(Math.abs(amt));
                          return pesos.toLocaleString('es-CL');
                        };

                        return (
                          <Box key={transaction.id} className="bg-background-50 p-3 rounded-lg border border-typography-200">
                            <HStack space="md" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                              <VStack space="xs" className="flex-1">
                                <Text className="text-typography-900 font-medium">
                                  {transaction.description || transaction.type || 'Transaction'}
                                </Text>
                                {transaction.created_at && (
                                  <Text className="text-typography-600 text-xs">
                                    {new Date(transaction.created_at).toLocaleDateString('es-CL', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </Text>
                                )}
                              </VStack>
                              <Text
                                className={`font-bold text-lg ${
                                  isPositive ? 'text-success-600' : 'text-error-600'
                                }`}
                              >
                                {isPositive ? '+' : '-'}${formatAmount(amount)} {transaction.currency || 'CLP'}
                              </Text>
                            </HStack>
                          </Box>
                        );
                      })}
                    </VStack>
                  )}
                </VStack>
              </VStack>
            </Box>
          </TouchableWithoutFeedback>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

