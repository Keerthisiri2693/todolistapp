import "react-native-gesture-handler";

import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Notifications from "expo-notifications";

import {
  AppThemeProvider,
  useAppTheme,
} from "../../context/app-theme-context";

import { SecurityProvider } from "../security/SecurityProvider";
import SecurityGate from "../security/SecurityGate";

// Configure notifications outside React components.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function RootNavigator() {
  const { isDark, colors } = useAppTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SecurityProvider>
        <StatusBar style={isDark ? "light" : "dark"} />

        <SecurityGate>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "fade",
              contentStyle: {
                backgroundColor: colors.background,
              },
            }}
          />
        </SecurityGate>
      </SecurityProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <RootNavigator />
    </AppThemeProvider>
  );
}