
import React from "react";
import { View, StyleSheet } from "react-native";

import { useSecurity } from "./SecurityProvider";
import SecurityLockScreen from "./SecurityLockScreen";

export default function SecurityGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { ready, isLocked, config } = useSecurity();

  if (!ready) {
    return <View style={styles.loadingContainer} />;
  }

  const shouldShowLock =
    config.appLockEnabled && isLocked;

  // Do not render the protected app while locked.
  if (shouldShowLock) {
    return (
      <View style={styles.lockScreen}>
        <SecurityLockScreen />
      </View>
    );
  }

  return <View style={styles.container}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F5F6FB",
  },
  lockScreen: {
    flex: 1,
    backgroundColor: "#F5F6FB",
  },
});
