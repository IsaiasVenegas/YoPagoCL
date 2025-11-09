import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
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

interface SendReminderModalProps {
  visible: boolean;
  onClose: () => void;
  invoiceId: string;
  onSend: (message: string) => Promise<void>;
}

export default function SendReminderModal({
  visible,
  onClose,
  invoiceId,
  onSend,
}: SendReminderModalProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setMessage('');
      setSending(false);
    }
  }, [visible]);

  const handleSend = async () => {
    if (sending) return;

    setSending(true);
    try {
      await onSend(message.trim() || undefined);
      // On success, reset and close
      setMessage('');
      setSending(false);
      onClose();
    } catch (error: any) {
      // Error is already handled by the parent component
      // Reset sending state so user can try again
      setSending(false);
    }
  };

  const handleClose = () => {
    if (!sending) {
      setMessage('');
      setSending(false);
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <Box
      className="absolute inset-0 bg-black/50 items-center justify-center p-6"
      style={{ position: 'absolute', zIndex: 1000 }}
    >
      <Box className="bg-background-0 rounded-lg p-6 w-full max-w-md">
        <VStack space="md">
          <Heading size="lg" className="text-typography-900">
            Send Reminder
          </Heading>

          <VStack space="sm">
            <Text className="text-typography-700 font-medium">Message (Optional)</Text>
            <Input>
              <InputField
                placeholder="Enter a brief message..."
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={4}
                editable={!sending}
              />
            </Input>
          </VStack>

          <HStack space="sm" style={{ justifyContent: 'flex-end' }}>
            <Button
              onPress={handleClose}
              variant="outline"
              size="md"
              disabled={sending}
            >
              <ButtonText>Cancel</ButtonText>
            </Button>
            <Button
              onPress={handleSend}
              disabled={sending}
              action="primary"
              variant="solid"
              size="md"
            >
              {sending ? (
                <Spinner size="small" />
              ) : (
                <ButtonText>Send</ButtonText>
              )}
            </Button>
          </HStack>
        </VStack>
      </Box>
    </Box>
  );
}

