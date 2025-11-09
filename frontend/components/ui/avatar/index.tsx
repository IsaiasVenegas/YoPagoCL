import React from 'react';
import { View, ViewProps, Text, Image, ImageSourcePropType } from 'react-native';

type IAvatarProps = ViewProps & {
  className?: string;
  source?: ImageSourcePropType;
  fallbackText?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
};

const sizeMap = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
};

const Avatar = React.forwardRef<React.ComponentRef<typeof View>, IAvatarProps>(
  function Avatar({ className, source, fallbackText, size = 'md', style, ...props }, ref) {
    const avatarSize = sizeMap[size];
    const fontSize = size === 'xs' ? 10 : size === 'sm' ? 12 : size === 'md' ? 14 : size === 'lg' ? 16 : 18;

    return (
      <View
        ref={ref}
        {...props}
        style={[
          {
            width: avatarSize,
            height: avatarSize,
            borderRadius: avatarSize / 2,
            backgroundColor: '#E0E7FF',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          },
          style,
        ]}
        className={className}
      >
        {source ? (
          <Image
            source={source}
            style={{ width: avatarSize, height: avatarSize }}
            resizeMode="cover"
          />
        ) : (
          <Text
            style={{
              fontSize,
              fontWeight: '600',
              color: '#4F46E5',
            }}
          >
            {fallbackText || '?'}
          </Text>
        )}
      </View>
    );
  }
);

Avatar.displayName = 'Avatar';
export { Avatar };

