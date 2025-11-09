import React, { useEffect, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
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

export default function GroupDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const groupId = params.id as string;
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
    } else {
      setIsAuthenticated(true);
      loadGroupData();
    }
  }, [groupId]);

  const loadGroupData = async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [groupData, membersData] = await Promise.all([
        apiService.getGroup(groupId),
        apiService.getGroupMembers(groupId),
      ]);
      setGroup(groupData);
      setMembers(membersData);
    } catch (error) {
      console.error('Failed to load group data:', error);
      Alert.alert('Error', 'Failed to load group data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAddMember = async () => {
    if (!newMemberEmail.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    setAddingMember(true);
    try {
      // Search for user by email
      const user = await apiService.searchUserByEmail(newMemberEmail.trim());
      
      // Check if user is already a member
      const isAlreadyMember = members.some(m => m.user_id === user.id);
      if (isAlreadyMember) {
        Alert.alert('Error', 'This user is already a member of the group');
        setAddingMember(false);
        return;
      }

      // Add user to group
      await apiService.addGroupMember(groupId, user.id);
      
      // Reset form and reload data
      setNewMemberEmail('');
      setShowAddMember(false);
      await loadGroupData();
      
      Alert.alert('Success', `${user.name || user.email} has been added to the group`);
    } catch (error: any) {
      console.error('Failed to add member:', error);
      Alert.alert('Error', error.message || 'Failed to add member. User may not exist or is already a member.');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = (userId: string, userName: string) => {
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove "${userName}" from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.removeGroupMember(groupId, userId);
              await loadGroupData();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to remove member');
            }
          },
        },
      ]
    );
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
          <RefreshControl refreshing={refreshing} onRefresh={() => loadGroupData(true)} />
        }
      >
        <Box className="flex-1 bg-background-0 p-6">
          {loading ? (
            <Box className="items-center py-8">
              <Spinner size="large" />
            </Box>
          ) : group ? (
            <VStack space="lg" className="flex-1">
              <VStack space="md">
                <Heading size="3xl" className="text-typography-900">
                  {group.name}
                </Heading>
                {group.description && (
                  <Text className="text-typography-600">
                    {group.description}
                  </Text>
                )}
                {group.slug && (
                  <Text className="text-typography-500 text-sm">
                  Slug: {group.slug}
                  </Text>
                )}
              </VStack>

              <Box className="bg-background-50 p-4 rounded-lg">
                <HStack space="md" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Heading size="lg" className="text-typography-900">
                    Members ({members.length})
                  </Heading>
                  <Button
                    onPress={() => setShowAddMember(true)}
                    variant="outline"
                    size="sm"
                  >
                    <ButtonText>Add Member</ButtonText>
                  </Button>
                </HStack>

                {showAddMember && (
                  <Box className="bg-background-0 p-4 rounded-lg border border-typography-200 mb-4">
                    <VStack space="md">
                      <Heading size="md" className="text-typography-900">
                        Add New Member
                      </Heading>
                      <Input>
                        <InputField
                          placeholder="Enter email address"
                          value={newMemberEmail}
                          onChangeText={setNewMemberEmail}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </Input>
                      <HStack space="sm">
                        <Button
                          onPress={handleAddMember}
                          variant="solid"
                          size="sm"
                          isDisabled={addingMember}
                          className="flex-1"
                        >
                          {addingMember ? (
                            <Spinner size="small" />
                          ) : (
                            <ButtonText>Add</ButtonText>
                          )}
                        </Button>
                        <Button
                          onPress={() => {
                            setShowAddMember(false);
                            setNewMemberEmail('');
                          }}
                          variant="outline"
                          size="sm"
                          isDisabled={addingMember}
                          className="flex-1"
                        >
                          <ButtonText>Cancel</ButtonText>
                        </Button>
                      </HStack>
                    </VStack>
                  </Box>
                )}

                {members.length === 0 ? (
                  <Text className="text-typography-600">No members yet</Text>
                ) : (
                  <VStack space="sm">
                    {members.map((member) => (
                      <Box key={member.id} className="bg-background-0 p-3 rounded border border-typography-200">
                        <HStack space="md" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                          <VStack space="xs">
                            <Text className="text-typography-900 font-medium">
                              {member.user?.name || member.user?.email || 'Unknown User'}
                            </Text>
                            {member.user?.email && (
                              <Text className="text-typography-600 text-sm">
                                {member.user.email}
                              </Text>
                            )}
                          </VStack>
                          {member.user_id !== currentUser?.id && (
                            <Button
                              onPress={() => handleRemoveMember(member.user_id, member.user?.name || 'Member')}
                              variant="outline"
                              size="sm"
                              className="border-error-500"
                            >
                              <ButtonText className="text-error-500">Remove</ButtonText>
                            </Button>
                          )}
                        </HStack>
                      </Box>
                    ))}
                  </VStack>
                )}
              </Box>

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
              <Text className="text-typography-600">Group not found</Text>
            </Box>
          )}
        </Box>
      </ScrollView>
    </SafeAreaView>
  );
}

