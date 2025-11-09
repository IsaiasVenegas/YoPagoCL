import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  Box,
  VStack,
  Heading,
  Button,
  ButtonText,
  Input,
  InputField,
  Text,
  Avatar,
} from '@/components/ui';
import { apiService, getAuthToken, setCurrentUser, User } from '@/services/api';
import { API_BASE_URL } from '@/services/api';

export default function SettingsScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarTimestamp, setAvatarTimestamp] = useState(Date.now());
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
  });

  useEffect(() => {
    // Check if user is authenticated
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
    } else {
      setIsAuthenticated(true);
      loadUserData();
    }
  }, []);

  const loadUserData = async () => {
    try {
      setLoading(true);
      const userData = await apiService.getCurrentUser();
      setUser(userData);
      setCurrentUser(userData);
      setFormData({
        name: userData.name || '',
        phone: userData.phone || '',
      });
    } catch (error) {
      console.error('Error loading user data:', error);
      Alert.alert('Error', 'Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const updatedUser = await apiService.updateCurrentUser({
        name: formData.name,
        phone: formData.phone || undefined,
      });
      setUser(updatedUser);
      setCurrentUser(updatedUser);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarPress = () => {
    const options: any[] = [
      { text: 'Camera', onPress: pickImageFromCamera },
      { text: 'Photo Library', onPress: pickImageFromLibrary },
    ];
    
    // Only show "Remove Avatar" option if user has an avatar
    if (user?.avatar_url) {
      options.push({ text: 'Remove Avatar', onPress: removeAvatar, style: 'destructive' });
    }
    
    options.push({ text: 'Cancel', style: 'cancel' });
    
    Alert.alert(
      'Change Avatar',
      'Choose an option',
      options,
      { cancelable: true }
    );
  };

  const pickImageFromCamera = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'Camera permission is required to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadAvatar(result.assets[0].uri);
    }
  };

  const pickImageFromLibrary = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'Photo library permission is required');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadAvatar(result.assets[0].uri);
    }
  };

  const uploadAvatar = async (imageUri: string) => {
    try {
      setUploadingAvatar(true);
      
      // Create FormData for React Native
      const formData = new FormData();
      const filename = imageUri.split('/').pop() || 'avatar.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';
      
      formData.append('file', {
        uri: imageUri,
        name: filename,
        type: type,
      } as any);

      const updatedUser = await apiService.uploadAvatar(formData);
      setUser(updatedUser);
      setCurrentUser(updatedUser);
      setAvatarTimestamp(Date.now()); // Update timestamp to force image refresh
      Alert.alert('Success', 'Avatar updated successfully');
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      Alert.alert('Error', error.message || 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    try {
      setUploadingAvatar(true);
      const updatedUser = await apiService.updateCurrentUser({
        avatar_url: null,
      });
      setUser(updatedUser);
      setCurrentUser(updatedUser);
      setAvatarTimestamp(Date.now()); // Update timestamp to force image refresh
      Alert.alert('Success', 'Avatar removed successfully');
    } catch (error: any) {
      console.error('Error removing avatar:', error);
      Alert.alert('Error', error.message || 'Failed to remove avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiService.logout();
      router.replace('/login');
    } catch (error) {
      // Even if logout fails, clear token and redirect
      router.replace('/login');
    }
  };

  const getAvatarSource = () => {
    if (user?.avatar_url) {
      let avatarUrl = user.avatar_url.startsWith('http')
        ? user.avatar_url
        : `${API_BASE_URL}${user.avatar_url}`;
      // Add cache-busting query parameter to ensure image refreshes after upload
      const separator = avatarUrl.includes('?') ? '&' : '?';
      avatarUrl = `${avatarUrl}${separator}t=${avatarTimestamp}`;
      return { uri: avatarUrl };
    }
    return undefined;
  };

  if (!isAuthenticated || loading) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background-0">
        <Box className="flex-1 bg-background-0 p-6 justify-center items-center">
          <ActivityIndicator size="large" />
        </Box>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background-0">
      <ScrollView className="flex-1">
        <Box className="flex-1 bg-background-0 p-6">
          <VStack space="lg" className="flex-1">
            <VStack space="md" className="mt-8">
              <Heading size="3xl" className="text-typography-900">
                Settings
              </Heading>
            </VStack>

            {/* Avatar Section */}
            <VStack space="md" className="items-center py-6">
              <TouchableOpacity
                onPress={handleAvatarPress}
                disabled={uploadingAvatar}
                activeOpacity={0.7}
              >
                <Box className="relative">
                  <Avatar
                    source={getAvatarSource()}
                    fallbackText={user?.name?.[0]?.toUpperCase() || '?'}
                    size="xl"
                  />
                  {uploadingAvatar && (
                    <Box
                      className="absolute inset-0 bg-black/50 rounded-full items-center justify-center"
                      style={{ width: 64, height: 64 }}
                    >
                      <ActivityIndicator color="white" />
                    </Box>
                  )}
                  <Box
                    className="absolute bottom-0 right-0 bg-primary-500 rounded-full p-2"
                    style={{ width: 24, height: 24 }}
                  >
                    <Text className="text-white text-xs text-center">+</Text>
                  </Box>
                </Box>
              </TouchableOpacity>
              <Text className="text-typography-600 text-sm">Tap to change avatar</Text>
            </VStack>

            {/* Profile Form */}
            <VStack space="md">
              <VStack space="xs">
                <Text className="text-typography-700 font-medium">Email</Text>
                <Input variant="outline" size="md" isDisabled>
                  <InputField value={user?.email || ''} placeholder="Email" />
                </Input>
                <Text className="text-typography-500 text-xs">Email cannot be changed</Text>
              </VStack>

              <VStack space="xs">
                <Text className="text-typography-700 font-medium">Name</Text>
                <Input variant="outline" size="md">
                  <InputField
                    value={formData.name}
                    onChangeText={(text) => setFormData({ ...formData, name: text })}
                    placeholder="Your name"
                  />
                </Input>
              </VStack>

              <VStack space="xs">
                <Text className="text-typography-700 font-medium">Phone</Text>
                <Input variant="outline" size="md">
                  <InputField
                    value={formData.phone}
                    onChangeText={(text) => setFormData({ ...formData, phone: text })}
                    placeholder="Your phone number"
                    keyboardType="phone-pad"
                  />
                </Input>
              </VStack>

              <Button
                onPress={handleSave}
                disabled={saving}
                size="lg"
                className="mt-4"
              >
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <ButtonText>Save Changes</ButtonText>
                )}
              </Button>
            </VStack>

            <Box className="mt-auto mb-8">
              <Button
                onPress={handleLogout}
                variant="outline"
                className="border-error-500"
                size="lg"
              >
                <ButtonText className="text-error-500">Logout</ButtonText>
              </Button>
            </Box>
          </VStack>
        </Box>
      </ScrollView>
    </SafeAreaView>
  );
}

