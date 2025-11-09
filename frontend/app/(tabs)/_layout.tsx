import { Tabs } from 'expo-router';
import { Home, Settings, QrCode } from 'lucide-react-native';
import { useColorScheme, View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const iconColor = colorScheme === 'dark' ? '#D4D4D4' : '#737373';
  const activeIconColor = '#8C52FF'; // primary-500

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeIconColor,
        tabBarInactiveTintColor: iconColor,
        tabBarStyle: {
          backgroundColor: colorScheme === 'dark' ? '#181719' : '#FBFBFB',
          borderTopWidth: 1,
          borderTopColor: colorScheme === 'dark' ? '#262626' : '#E5E5E5',
          height: 50 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          position: 'relative',
          overflow: 'visible',
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              <Home
                size={24}
                color={props.accessibilityState?.selected ? activeIconColor : iconColor}
              />
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          tabBarButton: (props) => {
            const isFocused = props.accessibilityState?.selected;
            const borderColor = colorScheme === 'dark' ? '#262626' : '#E5E5E5';
            return (
              <View
                style={{
                  position: 'absolute',
                  left: '50%',
                  marginLeft: -50,
                  width: 100,
                  height: 80,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colorScheme === 'dark' ? '#181719' : '#FBFBFB',
                  borderColor: borderColor,
                  borderWidth: 1,
                  borderTopWidth: 1,
                  borderBottomWidth: 0,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  top: -30,
                  zIndex: 10,
                  elevation: 5,
                }}
              >
                <TouchableOpacity
                  {...props}
                  style={{
                    width: '100%',
                    height: '100%',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <QrCode
                    size={40}
                    color={isFocused ? activeIconColor : iconColor}
                  />
                </TouchableOpacity>
              </View>
            );
          },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              <Settings
                size={24}
                color={props.accessibilityState?.selected ? activeIconColor : iconColor}
              />
            </TouchableOpacity>
          ),
        }}
      />
    </Tabs>
  );
}

