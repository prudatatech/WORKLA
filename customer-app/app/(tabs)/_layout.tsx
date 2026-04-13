import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import { Bell, BookOpen, Home, Search, User } from 'lucide-react-native';
import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

const { width } = Dimensions.get('window');

const PRIMARY = '#1A3FFF';

const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  bookings: 'Bookings',
  search: 'Search',
  explore: 'Alerts',
  profile: 'Profile',
};

const TAB_ICONS: Record<string, any> = {
  index: Home,
  bookings: BookOpen,
  search: Search,
  explore: Bell,
  profile: User,
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const Icon = TAB_ICONS[name];
  const label = TAB_LABELS[name];

  return (
    <View style={styles.iconContainer}>
      <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
        <Icon
          color={focused ? PRIMARY : '#94A3B8'}
          size={22}
          strokeWidth={focused ? 2.5 : 2}
        />
      </View>
      <Text
        style={[styles.tabLabel, focused && styles.tabLabelActive]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: PRIMARY,
        tabBarInactiveTintColor: '#94A3B8',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="index" focused={focused} />,
        }}
        listeners={{
          tabPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="bookings" focused={focused} />,
        }}
        listeners={{
          tabPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="search" focused={focused} />,
        }}
        listeners={{
          tabPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          tabBarIcon: ({ focused }) => (
            <View>
              <TabIcon name="explore" focused={focused} />
              {/* Notification badge */}
              <View style={styles.badge} />
            </View>
          ),
        }}
        listeners={{
          tabPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} />,
        }}
        listeners={{
          tabPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
        }}
      />
      {/* Hide support from tab bar but keep route */}
      <Tabs.Screen
        name="support"
        options={{ href: null }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 84, // Slightly taller for modern iPhones with bottom bars
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    elevation: 20,
    shadowColor: '#1A3FFF',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    paddingBottom: 24,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    width: width / 5,
  },
  iconWrap: {
    width: 44,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  iconWrapActive: {
    backgroundColor: 'rgba(26, 63, 255, 0.08)',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: PRIMARY,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
});
