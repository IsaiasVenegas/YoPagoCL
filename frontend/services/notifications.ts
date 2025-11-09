import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { apiService, getAuthToken } from './api';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register for push notifications and get the Expo push token
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }
    
    // Get the push token
    // Try to get projectId from various sources
    let projectId: string | undefined;
    
    // First, try to get from Constants (from app.json extra.eas.projectId)
    if (Constants.expoConfig?.extra?.eas?.projectId) {
      projectId = Constants.expoConfig.extra.eas.projectId;
    } else if (Constants.expoConfig?.extra?.projectId) {
      projectId = Constants.expoConfig.extra.projectId;
    } else if (Constants.expoConfig?.projectId) {
      projectId = Constants.expoConfig.projectId;
    }
    
    // Check if projectId is a placeholder
    if (projectId === 'YOUR_PROJECT_ID_HERE') {
      projectId = undefined;
    }
    
    // If no projectId, we need to get it from EAS
    if (!projectId) {
      console.warn(
        '⚠️ Push notifications require a projectId.\n' +
        'To get your projectId:\n' +
        '1. Run: npx eas project:info\n' +
        '2. Copy the projectId\n' +
        '3. Add it to app.json under "extra.eas.projectId"\n' +
        '4. Restart your app\n\n' +
        'Alternatively, if you don\'t have an EAS project yet:\n' +
        '1. Run: npx eas init\n' +
        '2. This will create a project and add the projectId to app.json'
      );
      return null;
    }
    
    // Get the push token with projectId
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    
    const token = tokenData.data;
    console.log('Expo push token:', token);
    
    // Register token with backend if user is authenticated
    const authToken = getAuthToken();
    if (authToken && token) {
      try {
        await apiService.registerPushNotificationToken(token);
        console.log('Push notification token registered with backend');
      } catch (error) {
        console.error('Failed to register push notification token:', error);
      }
    }
    
    return token;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Initialize push notifications
 * Call this when the app starts
 */
export async function initializePushNotifications(): Promise<void> {
  // Register for push notifications
  await registerForPushNotificationsAsync();
  
  // Set up notification listeners if needed
  // You can add listeners here for handling notifications when app is open
}

