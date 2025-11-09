import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

export default function RegisterScreen() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });
  const [status, setStatus] = useState<StatusType>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleTogglePassword = () => {
    setShowPassword((showState) => !showState);
  };

  const handleToggleConfirmPassword = () => {
    setShowConfirmPassword((showState) => !showState);
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) {
      return 'Name is required';
    }
    if (!formData.email.trim()) {
      return 'Email is required';
    }
    if (!formData.email.includes('@')) {
      return 'Please enter a valid email address';
    }
    if (!formData.password) {
      return 'Password is required';
    }
    if (formData.password.length < 6) {
      return 'Password must be at least 6 characters';
    }
    if (formData.password !== formData.confirmPassword) {
      return 'Passwords do not match';
    }
    return null;
  };

  const handleRegister = async () => {
    const validationError = validateForm();
    if (validationError) {
      setStatus('error');
      setStatusMessage(validationError);
      return;
    }

    setStatus('loading');
    setStatusMessage('');

    try {
      const response = await apiService.register({
        email: formData.email,
        password: formData.password,
        name: formData.name,
        phone: formData.phone || undefined,
      });

      setAuthToken(response.access_token);
      setCurrentUser(response.user);
      setStatus('success');
      setStatusMessage('Registration successful! Redirecting...');

      // Redirect to home after a short delay
      setTimeout(() => {
        router.replace('/home');
      }, 1500);
    } catch (error: any) {
      setStatus('error');
      setStatusMessage(error.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} className="flex-1 bg-background-0">
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
            <VStack space="md" className="mb-8">
              <Heading size="2xl" className="text-typography-900">
                Create Account
              </Heading>
              <Text className="text-typography-600">
                Sign up to get started with YoPagoCL
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
                <Text className="text-typography-700 font-medium">Name</Text>
                <Input>
                  <InputField
                    placeholder="Enter your name"
                    value={formData.name}
                    onChangeText={(text) =>
                      setFormData({ ...formData, name: text })
                    }
                    autoCapitalize="words"
                  />
                </Input>
              </VStack>

              <VStack space="xs">
                <Text className="text-typography-700 font-medium">Email</Text>
                <Input>
                  <InputField
                    placeholder="Enter your email"
                    value={formData.email}
                    onChangeText={(text) =>
                      setFormData({ ...formData, email: text })
                    }
                    keyboardType="email-address"
                    autoCapitalize="none"
                    textContentType="emailAddress"
                    autoComplete="email"
                  />
                </Input>
              </VStack>

              <VStack space="xs">
                <Text className="text-typography-700 font-medium">Phone (Optional)</Text>
                <Input>
                  <InputField
                    placeholder="Enter your phone number"
                    value={formData.phone}
                    onChangeText={(text) =>
                      setFormData({ ...formData, phone: text })
                    }
                    keyboardType="phone-pad"
                  />
                </Input>
              </VStack>

              <VStack space="xs">
                <Text className="text-typography-700 font-medium">Password</Text>
                <Input>
                  <InputField
                    placeholder="Enter your password"
                    value={formData.password}
                    onChangeText={(text) =>
                      setFormData({ ...formData, password: text })
                    }
                    secureTextEntry={!showPassword}
                    textContentType="newPassword"
                    autoComplete="password-new"
                    passwordRules="minlength: 6;"
                  />
                  <InputSlot className="pr-3" onPress={handleTogglePassword}>
                    <InputIcon
                      as={showPassword ? Eye : EyeOff}
                      className="text-typography-600"
                    />
                  </InputSlot>
                </Input>
              </VStack>

              <VStack space="xs">
                <Text className="text-typography-700 font-medium">Confirm Password</Text>
                <Input>
                  <InputField
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChangeText={(text) =>
                      setFormData({ ...formData, confirmPassword: text })
                    }
                    secureTextEntry={!showConfirmPassword}
                    textContentType="newPassword"
                    autoComplete="password-new"
                  />
                  <InputSlot className="pr-3" onPress={handleToggleConfirmPassword}>
                    <InputIcon
                      as={showConfirmPassword ? Eye : EyeOff}
                      className="text-typography-600"
                    />
                  </InputSlot>
                </Input>
              </VStack>

              <Button
                onPress={handleRegister}
                disabled={status === 'loading'}
                action="primary"
                variant="solid"
                size="lg"
                className="mt-4"
              >
                {status === 'loading' ? (
                  <HStack space="sm" className="items-center">
                    <Spinner size="small" color="white" />
                    <ButtonText>Registering...</ButtonText>
                  </HStack>
                ) : (
                  <ButtonText>Register</ButtonText>
                )}
              </Button>

              <HStack space="sm" className="justify-center items-center mt-4">
                <Text className="text-typography-600">Already have an account?</Text>
                <Button
                  variant="link"
                  onPress={() => router.replace('/login')}
                  className="p-0"
                >
                  <ButtonText className="text-primary-500">Login</ButtonText>
                </Button>
              </HStack>
            </VStack>
          </VStack>
        </Box>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

