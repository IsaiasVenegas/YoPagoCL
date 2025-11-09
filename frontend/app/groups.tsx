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
  Alert as UIAlert,
  AlertText,
} from '@/components/ui';
import { getAuthToken, getCurrentUser, apiService } from '@/services/api';

export default function GroupsScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDescription, setEditGroupDescription] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.replace('/login');
    } else {
      setIsAuthenticated(true);
      loadGroups();
    }
  }, []);

  const loadGroups = async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const groupsData = await apiService.getGroups();
      setGroups(groupsData);
    } catch (error) {
      console.error('Failed to load groups:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert('Error', 'Group name is required');
      return;
    }

    setCreating(true);
    try {
      await apiService.createGroup({
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || undefined,
      });
      setNewGroupName('');
      setNewGroupDescription('');
      setShowCreateModal(false);
      await loadGroups();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const handleEditGroup = (group: any) => {
    setEditingGroup(group);
    setEditGroupName(group.name);
    setEditGroupDescription(group.description || '');
    setShowEditModal(true);
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup) return;
    
    if (!editGroupName.trim()) {
      Alert.alert('Error', 'Group name is required');
      return;
    }

    setUpdating(true);
    try {
      await apiService.updateGroup(editingGroup.id, {
        name: editGroupName.trim(),
        description: editGroupDescription.trim() || undefined,
      });
      setShowEditModal(false);
      setEditingGroup(null);
      setEditGroupName('');
      setEditGroupDescription('');
      await loadGroups();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update group');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteGroup = (groupId: string, groupName: string, createdBy: string) => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      Alert.alert('Error', 'User not found');
      return;
    }

    // Check if current user is the owner
    if (createdBy !== currentUser.id) {
      Alert.alert('Error', 'Only the group owner can delete the group');
      return;
    }

    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${groupName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteGroup(groupId);
              await loadGroups();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete group');
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
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadGroups(true)} />
        }
      >
        <Box className="flex-1 bg-background-0 p-6">
          <VStack space="lg" className="flex-1">
            <HStack space="md" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Heading size="3xl" className="text-typography-900">
                My Groups
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
            ) : groups.length === 0 ? (
              <Box className="bg-background-50 p-6 rounded-lg items-center">
                <Text className="text-typography-600 text-center mb-4">
                  No groups yet. Create a group to start organizing your payments!
                </Text>
                <Button
                  onPress={() => setShowCreateModal(true)}
                  action="primary"
                  variant="solid"
                >
                  <ButtonText>Create your first group</ButtonText>
                </Button>
              </Box>
            ) : (
              <VStack space="md">
                {groups.map((group) => (
                  <TouchableOpacity
                    key={group.id}
                    onPress={() => router.push(`/groups/${group.id}`)}
                  >
                    <Box className="bg-background-50 p-4 rounded-lg border border-typography-200">
                      <HStack space="md" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <VStack space="xs" className="flex-1">
                          <Heading size="md" className="text-typography-900">
                            {group.name}
                          </Heading>
                          {group.description && (
                            <Text className="text-typography-600 text-sm">
                              {group.description}
                            </Text>
                          )}
                          {group.slug && (
                            <Text className="text-typography-500 text-xs">
                              {group.slug}
                            </Text>
                          )}
                        </VStack>
                        {group.created_by === getCurrentUser()?.id && (
                          <HStack space="sm">
                            <Button
                              onPress={(e) => {
                                e.stopPropagation();
                                handleEditGroup(group);
                              }}
                              variant="outline"
                              size="sm"
                              className="border-primary-500"
                            >
                              <ButtonText className="text-primary-500">Edit</ButtonText>
                            </Button>
                          </HStack>
                        )}
                      </HStack>
                    </Box>
                  </TouchableOpacity>
                ))}
              </VStack>
            )}
          </VStack>
        </Box>
      </ScrollView>

      {/* Create Group Modal */}
      {showCreateModal && (
        <Box
          className="absolute inset-0 bg-black/50 items-center justify-center p-6"
          style={{ position: 'absolute' }}
        >
          <Box className="bg-background-0 rounded-lg p-6 w-full max-w-md">
            <VStack space="md">
              <Heading size="lg" className="text-typography-900">
                Create New Group
              </Heading>
              
              <VStack space="sm">
                <Text className="text-typography-700 font-medium">Group Name *</Text>
                <Input>
                  <InputField
                    placeholder="Enter group name"
                    value={newGroupName}
                    onChangeText={setNewGroupName}
                  />
                </Input>
              </VStack>

              <VStack space="sm">
                <Text className="text-typography-700 font-medium">Description (Optional)</Text>
                <Input>
                  <InputField
                    placeholder="Enter description"
                    value={newGroupDescription}
                    onChangeText={setNewGroupDescription}
                    multiline
                    numberOfLines={3}
                  />
                </Input>
              </VStack>

              <HStack space="sm" style={{ justifyContent: 'flex-end' }}>
                <Button
                  onPress={() => {
                    setShowCreateModal(false);
                    setNewGroupName('');
                    setNewGroupDescription('');
                  }}
                  variant="outline"
                  size="md"
                >
                  <ButtonText>Cancel</ButtonText>
                </Button>
                <Button
                  onPress={handleCreateGroup}
                  disabled={creating}
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

      {/* Edit Group Modal */}
      {showEditModal && editingGroup && (
        <Box
          className="absolute inset-0 bg-black/50 items-center justify-center p-6"
          style={{ position: 'absolute' }}
        >
          <Box className="bg-background-0 rounded-lg p-6 w-full max-w-md">
            <VStack space="md">
              <Heading size="lg" className="text-typography-900">
                Edit Group
              </Heading>
              
              <VStack space="sm">
                <Text className="text-typography-700 font-medium">Group Name *</Text>
                <Input>
                  <InputField
                    placeholder="Enter group name"
                    value={editGroupName}
                    onChangeText={setEditGroupName}
                  />
                </Input>
              </VStack>

              <VStack space="sm">
                <Text className="text-typography-700 font-medium">Description (Optional)</Text>
                <Input>
                  <InputField
                    placeholder="Enter description"
                    value={editGroupDescription}
                    onChangeText={setEditGroupDescription}
                    multiline
                    numberOfLines={3}
                  />
                </Input>
              </VStack>

              <HStack space="sm" style={{ justifyContent: 'flex-end' }}>
                <Button
                  onPress={() => {
                    setShowEditModal(false);
                    setEditingGroup(null);
                    setEditGroupName('');
                    setEditGroupDescription('');
                  }}
                  variant="outline"
                  size="md"
                >
                  <ButtonText>Cancel</ButtonText>
                </Button>
                <Button
                  onPress={handleUpdateGroup}
                  disabled={updating || !editGroupName.trim()}
                  action="primary"
                  variant="solid"
                  size="md"
                >
                  {updating ? (
                    <Spinner size="small" />
                  ) : (
                    <ButtonText>Update</ButtonText>
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

