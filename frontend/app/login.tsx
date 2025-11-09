import React, { useState, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Eye, EyeOff } from 'lucide-react-native';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import {
  Box,
  VStack,
  HStack,
  Input,
  InputField,
  InputIcon,
  InputSlot,
  Button,
  ButtonText,
  Text,
  Heading,
  Alert,
  AlertText,
  Spinner,
} from '@/components/ui';
import { apiService, setAuthToken, setCurrentUser } from '@/services/api';

type StatusType = 'idle' | 'loading' | 'success' | 'error';

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [status, setStatus] = useState<StatusType>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const emailInputRef = useRef<any>(null);
  const passwordInputRef = useRef<any>(null);
  const [emailValue, setEmailValue] = useState('');
  const [passwordValue, setPasswordValue] = useState('');

  const handleTogglePassword = () => {
    setShowPassword((showState) => !showState);
  };

  // Sync local state with formData
  React.useEffect(() => {
    setFormData((prev) => ({ ...prev, email: emailValue }));
  }, [emailValue]);

  React.useEffect(() => {
    setFormData((prev) => ({ ...prev, password: passwordValue }));
  }, [passwordValue]);

  const validateForm = (): string | null => {
    const email = emailValue || formData.email;
    const password = passwordValue || formData.password;
    if (!email.trim()) {
      return 'Email is required';
    }
    if (!email.includes('@')) {
      return 'Please enter a valid email address';
    }
    if (!password) {
      return 'Password is required';
    }
    return null;
  };

  const handleLogin = async () => {
    const validationError = validateForm();
    if (validationError) {
      setStatus('error');
      setStatusMessage(validationError);
      return;
    }

    setStatus('loading');
    setStatusMessage('');

    try {
      const email = emailValue || formData.email;
      const password = passwordValue || formData.password;
      const response = await apiService.login({
        email,
        password,
      });

      setAuthToken(response.access_token);
      setCurrentUser(response.user);
      setStatus('success');
      setStatusMessage('Login successful! Redirecting...');

      // Redirect after a short delay
      setTimeout(() => {
        // If there's a redirectSessionId from deeplink, go to scan screen
        const redirectSessionId = params.redirectSessionId;
        if (redirectSessionId && typeof redirectSessionId === 'string') {
          router.replace({
            pathname: '/scan',
            params: { sessionId: redirectSessionId }
          });
        } else {
          router.replace('/home');
        }
      }, 1500);
    } catch (error: any) {
      setStatus('error');
      setStatusMessage(error.message || 'Login failed. Please check your credentials.');
    }
  };

  return (
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
        <Box className="flex-1 bg-background-0 p-6">
          <VStack space="lg" className="flex-1 justify-center">
            <VStack space="md" className="mb-8 items-center">
              <Image
                source={require('@/assets/images/logo.png')}
                style={{ width: 150, height: 150 }}
                contentFit="contain"
              />
              <Heading size="2xl" className="text-typography-900">
                Welcome Back
              </Heading>
              <Text className="text-typography-600">
                Sign in to continue to YoPagoCL
              </Text>
            </VStack>

            {status === 'error' && (
              <Alert action="error" variant="solid">
                <AlertText>{statusMessage}</AlertText>
              </Alert>
            )}

            {status === 'success' && (
              <Alert action="success" variant="solid">
                <AlertText>{statusMessage}</AlertText>
              </Alert>
            )}

            <VStack space="md">
              <VStack space="xs">
                <Text className="text-typography-700 font-medium">Email</Text>
                <Input>
                  <InputField
                    ref={emailInputRef}
                    placeholder="Enter your email"
                    value={emailValue}
                    onChangeText={setEmailValue}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="username"
                    autoComplete="email"
                    // @ts-ignore - autoCompleteType is deprecated but needed for some iOS versions
                    autoCompleteType="email"
                    returnKeyType="next"
                    enablesReturnKeyAutomatically={true}
                    clearButtonMode="while-editing"
                  />
                </Input>
              </VStack>

              <VStack space="xs">
                <Text className="text-typography-700 font-medium">Password</Text>
                <Input>
                  <InputField
                    ref={passwordInputRef}
                    placeholder="Enter your password"
                    value={passwordValue}
                    onChangeText={setPasswordValue}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="password"
                    autoComplete="password"
                    // @ts-ignore - autoCompleteType is deprecated but needed for some iOS versions
                    autoCompleteType="password"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    enablesReturnKeyAutomatically={true}
                  />
                  <InputSlot className="pr-3" onPress={handleTogglePassword}>
                    <InputIcon
                      as={showPassword ? Eye : EyeOff}
                      className="text-typography-600"
                    />
                  </InputSlot>
                </Input>
              </VStack>

              <Button
                onPress={handleLogin}
                disabled={status === 'loading'}
                action="primary"
                variant="solid"
                size="lg"
                className="mt-4"
              >
                {status === 'loading' ? (
                  <HStack space="sm" className="items-center">
                    <Spinner size="small" color="white" />
                    <ButtonText>Logging in...</ButtonText>
                  </HStack>
                ) : (
                  <ButtonText>Login</ButtonText>
                )}
              </Button>

              <HStack space="sm" className="justify-center items-center mt-4">
                <Text className="text-typography-600">Don't have an account?</Text>
                <Button
                  variant="link"
                  onPress={() => router.replace('/register')}
                  className="p-0"
                >
                  <ButtonText className="text-primary-500">Register</ButtonText>
                </Button>
              </HStack>
            </VStack>
          </VStack>
        </Box>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

