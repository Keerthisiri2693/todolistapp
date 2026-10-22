import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  PanResponder,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import { useSecurity } from "@/security/SecurityProvider";

type PatternGridProps = {
  onComplete: (pattern: number[]) => void;
  disabled?: boolean;
  resetKey?: number;
};

function PatternGrid({
  onComplete,
  disabled = false,
  resetKey = 0,
}: PatternGridProps) {
  const { width: windowWidth } = useWindowDimensions();
  const gridSize = Math.min(windowWidth - 72, 300);
  const dotRadius = 12;
  const hitRadius = 28;
  const [selected, setSelected] = useState<number[]>([]);
  const selectedRef = useRef<number[]>([]);
  const gridSizeRef = useRef(gridSize);
  const completedRef = useRef(false);

  gridSizeRef.current = gridSize;

  const centers = useMemo(
    () =>
      Array.from({ length: 9 }, (_, index) => ({
        x: (index % 3) * (gridSize / 3) + gridSize / 6,
        y: Math.floor(index / 3) * (gridSize / 3) + gridSize / 6,
      })),
    [gridSize]
  );

  const clearPattern = () => {
    selectedRef.current = [];
    setSelected([]);
    completedRef.current = false;
  };

  React.useEffect(() => {
    clearPattern();
  }, [resetKey]);

  const addDotAt = (x: number, y: number) => {
    const size = gridSizeRef.current;
    const cell = size / 3;
    const col = Math.max(0, Math.min(2, Math.round((x - cell / 2) / cell)));
    const row = Math.max(0, Math.min(2, Math.round((y - cell / 2) / cell)));
    const index = row * 3 + col;
    const centerX = col * cell + cell / 2;
    const centerY = row * cell + cell / 2;

    if (Math.hypot(x - centerX, y - centerY) > hitRadius) return;
    if (selectedRef.current.includes(index)) return;

    // Android-style behavior: when a move skips over the middle dot in a
    // straight line, include that dot in the pattern as well.
    const previous = selectedRef.current[selectedRef.current.length - 1];
    if (previous !== undefined) {
      const prevRow = Math.floor(previous / 3);
      const prevCol = previous % 3;
      const rowDiff = row - prevRow;
      const colDiff = col - prevCol;

      if (Math.abs(rowDiff) === 2 && colDiff === 0) {
        const middle = (prevRow + row) / 2 * 3 + col;
        if (!selectedRef.current.includes(middle)) {
          selectedRef.current = [...selectedRef.current, middle];
        }
      } else if (Math.abs(colDiff) === 2 && rowDiff === 0) {
        const middle = row * 3 + (prevCol + col) / 2;
        if (!selectedRef.current.includes(middle)) {
          selectedRef.current = [...selectedRef.current, middle];
        }
      } else if (Math.abs(rowDiff) === 2 && Math.abs(colDiff) === 2) {
        const middle = ((prevRow + row) / 2) * 3 + (prevCol + col) / 2;
        if (!selectedRef.current.includes(middle)) {
          selectedRef.current = [...selectedRef.current, middle];
        }
      }
    }

    selectedRef.current = [...selectedRef.current, index];
    setSelected(selectedRef.current);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (event) => {
          if (disabled) return;
          clearPattern();
          addDotAt(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY
          );
        },
        onPanResponderMove: (event) => {
          if (disabled || completedRef.current) return;
          addDotAt(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY
          );
        },
        onPanResponderRelease: () => {
          if (disabled || completedRef.current) return;
          completedRef.current = true;
          const result = [...selectedRef.current];
          if (result.length >= 4) {
            onComplete(result);
          } else {
            clearPattern();
            Alert.alert(
              "Pattern too short",
              "Connect at least 4 dots to create a pattern."
            );
          }
        },
        onPanResponderTerminate: clearPattern,
        onPanResponderTerminationRequest: () => false,
      }),
    [disabled, onComplete, gridSize]
  );

  return (
    <View
      style={{
        width: gridSize,
        height: gridSize,
        alignSelf: "center",
        position: "relative",
        marginVertical: 12,
      }}
      {...panResponder.panHandlers}
      accessibilityLabel="3 by 3 pattern grid"
    >
      {centers.map((center, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: center.x - dotRadius,
            top: center.y - dotRadius,
            width: dotRadius * 2,
            height: dotRadius * 2,
            borderRadius: dotRadius,
            borderWidth: 2,
            borderColor: "#10B981",
            backgroundColor: selected.includes(index) ? "#10B981" : "#FFFFFF",
          }}
        />
      ))}
      {selected.slice(1).map((index, position) => {
        const from = centers[selected[position]];
        const to = centers[index];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        return (
          <View
            key={`line-${position}`}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: from.x,
              top: from.y - 2,
              width: length,
              height: 4,
              borderRadius: 2,
              backgroundColor: "#10B981",
              transform: [{ rotate: `${angle}rad` }],
              transformOrigin: "left center" as never,
            }}
          />
        );
      })}
    </View>
  );
}

export default function SecuritySettingsScreen() {
  const {
    config,
    setPin,
    changePin,
    updateSettings,
    enableAppLock,
    disableAppLock,
    setPattern,
    removeAppPattern,
  } = useSecurity();

  const [newPin, setNewPin] = useState("");
  const [oldPin, setOldPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);

  const [patternSetupVisible, setPatternSetupVisible] = useState(false);
  const [firstPattern, setFirstPattern] = useState<number[] | null>(null);
  const [patternResetKey, setPatternResetKey] = useState(0);
  const [patternMessage, setPatternMessage] = useState(
    "Draw a pattern connecting at least 4 dots."
  );

  const hasPin = Boolean(config.pinHash && config.pinSalt);
  const hasPattern = Boolean(config.patternHash && config.patternSalt);
  const hasUnlockMethod = hasPin || hasPattern;

  const savePin = async () => {
    if (!/^\d{6,8}$/.test(newPin)) {
      Alert.alert("Invalid PIN", "Enter 6–8 digits.");
      return;
    }

    if (newPin !== confirmPin) {
      Alert.alert("PIN mismatch", "The two PINs do not match.");
      return;
    }

    setBusy(true);
    try {
      if (hasPin) {
        const changed = await changePin(oldPin, newPin);
        if (!changed) {
          Alert.alert("Incorrect PIN", "Your current PIN is incorrect.");
          return;
        }
      } else {
        await setPin(newPin);
      }

      setOldPin("");
      setNewPin("");
      setConfirmPin("");
      Alert.alert("PIN saved", "Your security PIN has been updated.");
    } catch (error) {
      Alert.alert(
        "Unable to save PIN",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleAppLock = async (enabled: boolean) => {
    try {
      if (enabled) {
        if (!hasUnlockMethod) {
          Alert.alert(
            "Set a PIN or pattern first",
            "Create a security PIN or pattern before enabling app lock."
          );
          return;
        }
        await enableAppLock();
      } else {
        await disableAppLock();
      }
    } catch (error) {
      Alert.alert(
        "Unable to update app lock",
        error instanceof Error ? error.message : "Please try again."
      );
    }
  };

  const toggleBiometrics = async (enabled: boolean) => {
    try {
      if (!enabled) {
        await updateSettings({ biometricEnabled: false });
        return;
      }

      if (!hasPin) {
        Alert.alert(
          "Set a PIN first",
          "Configure a security PIN before enabling biometric unlock."
        );
        return;
      }

      const hardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hardware || !enrolled) {
        Alert.alert(
          "Biometrics unavailable",
          "Set up a fingerprint or supported biometric in your Android device settings first."
        );
        return;
      }

      await updateSettings({ biometricEnabled: true });
      Alert.alert("Enabled", "Biometric unlock is enabled.");
    } catch (error) {
      Alert.alert(
        "Unable to update biometrics",
        error instanceof Error ? error.message : "Please try again."
      );
    }
  };

  const beginPatternSetup = () => {
    setFirstPattern(null);
    setPatternMessage("Draw a pattern connecting at least 4 dots.");
    setPatternResetKey((key) => key + 1);
    setPatternSetupVisible(true);
  };

  const handlePatternDrawn = async (drawnPattern: number[]) => {
    if (!firstPattern) {
      setFirstPattern(drawnPattern);
      setPatternMessage("Draw the same pattern again to confirm.");
      setPatternResetKey((key) => key + 1);
      return;
    }

    if (
      firstPattern.length !== drawnPattern.length ||
      firstPattern.some((dot, index) => dot !== drawnPattern[index])
    ) {
      setFirstPattern(null);
      setPatternMessage("Patterns did not match. Start again.");
      setPatternResetKey((key) => key + 1);
      return;
    }

    setBusy(true);
    try {
      await setPattern(drawnPattern);
      setPatternSetupVisible(false);
      setFirstPattern(null);
      Alert.alert("Pattern saved", "Your pattern lock has been configured.");
    } catch (error) {
      Alert.alert(
        "Unable to save pattern",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setBusy(false);
      setPatternResetKey((key) => key + 1);
    }
  };

  const handleRemovePattern = () => {
    Alert.alert(
      "Remove pattern lock?",
      "You will no longer be able to unlock using this pattern.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await removeAppPattern();
                Alert.alert("Pattern removed", "Your pattern has been removed.");
              } catch (error) {
                Alert.alert(
                  "Unable to remove pattern",
                  error instanceof Error ? error.message : "Please try again."
                );
              }
            })();
          },
        },
      ]
    );
  };

  const Row = ({
    title,
    description,
    value,
    onValueChange,
  }: {
    title: string;
    description: string;
    value: boolean;
    onValueChange: (value: boolean) => void | Promise<void>;
  }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(nextValue) => void onValueChange(nextValue)}
        trackColor={{ false: "#D1D5DB", true: "#A7F3D0" }}
        thumbColor={value ? "#059669" : "#F9FAFB"}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Privacy & Security</Text>
        <Text style={styles.subtitle}>
          Protect your notes and control private previews.
        </Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>PIN protection</Text>

          {hasPin ? (
            <>
              <Text style={styles.configuredText}>
                A security PIN is configured.
              </Text>
              <TextInput
                value={oldPin}
                onChangeText={(value) =>
                  setOldPin(value.replace(/\D/g, "").slice(0, 8))
                }
                placeholder="Current PIN"
                placeholderTextColor="#7B8794"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                style={styles.input}
              />
            </>
          ) : (
            <Text style={styles.rowDescription}>
              Create a PIN to enable PIN-based unlock.
            </Text>
          )}

          <TextInput
            value={newPin}
            onChangeText={(value) =>
              setNewPin(value.replace(/\D/g, "").slice(0, 8))
            }
            placeholder="New 6–8 digit PIN"
            placeholderTextColor="#7B8794"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            style={styles.input}
          />

          <TextInput
            value={confirmPin}
            onChangeText={(value) =>
              setConfirmPin(value.replace(/\D/g, "").slice(0, 8))
            }
            placeholder="Confirm new PIN"
            placeholderTextColor="#7B8794"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            style={styles.input}
          />

          <Pressable
            disabled={busy}
            onPress={() => void savePin()}
            style={[styles.primaryButton, busy && styles.disabledButton]}
          >
            <Text style={styles.primaryButtonText}>
              {busy ? "Saving..." : hasPin ? "Change PIN" : "Set PIN"}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.card, styles.patternCard]}>
          <Text style={styles.sectionTitle}>Pattern lock</Text>
          <Text style={styles.rowDescription}>
            Draw a pattern on the 3×3 grid. You must connect at least four dots
            and confirm the same pattern twice.
          </Text>

          <View style={styles.patternStatus}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: hasPattern ? "#10B981" : "#9CA3AF" },
              ]}
            />
            <Text style={styles.patternStatusText}>
              {hasPattern ? "Pattern lock is configured" : "No pattern configured"}
            </Text>
          </View>

          {patternSetupVisible ? (
            <View style={styles.patternSetup}>
              <Text style={styles.patternMessage}>{patternMessage}</Text>
              <PatternGrid
                key={patternResetKey}
                resetKey={patternResetKey}
                disabled={busy}
                onComplete={handlePatternDrawn}
              />
              <Pressable
                onPress={() => {
                  setPatternSetupVisible(false);
                  setFirstPattern(null);
                }}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.patternActions}>
              <Pressable
                onPress={beginPatternSetup}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>
                  {hasPattern ? "Change Pattern" : "Set Pattern Lock"}
                </Text>
              </Pressable>

              {hasPattern && (
                <Pressable
                  onPress={handleRemovePattern}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeButtonText}>Remove Pattern</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        <View style={[styles.card, styles.settingsCard]}>
          <Text style={styles.sectionTitle}>App security settings</Text>

          <Row
            title="Require app lock"
            description="Require authentication when opening the protected app."
            value={config.appLockEnabled}
            onValueChange={toggleAppLock}
          />

          <Row
            title="Fingerprint / biometrics"
            description="Use your device's native biometric prompt."
            value={config.biometricEnabled}
            onValueChange={toggleBiometrics}
          />

          <Row
            title="Auto-lock"
            description="Lock when the app leaves the foreground."
            value={config.autoLockEnabled}
            onValueChange={(value) =>
              updateSettings({ autoLockEnabled: value })
            }
          />

          <Row
            title="Hide private previews"
            description="Hide locked note titles and content previews."
            value={config.hidePrivatePreviews}
            onValueChange={(value) =>
              updateSettings({ hidePrivatePreviews: value })
            }
          />
        </View>

        <Text style={styles.footnote}>
          Keep your PIN or pattern safe. This local implementation does not
          provide PIN or pattern recovery.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  screen: {
    flex: 1,
    backgroundColor: "#F3F8F5",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 26,
    fontWeight: "800" as const,
    color: "#172B22",
  },
  subtitle: {
    color: "#718278",
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E1EAE4",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800" as const,
    color: "#172B22",
    marginBottom: 12,
  },
  configuredText: {
    color: "#059669",
    marginBottom: 12,
    fontWeight: "600" as const,
  },
  input: {
    backgroundColor: "#F6FAF7",
    borderWidth: 1,
    borderColor: "#E1EAE4",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#172B22",
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: "#10B981",
    borderRadius: 12,
    padding: 15,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 6,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800" as const,
  },
  patternCard: {
    marginTop: 16,
  },
  patternStatus: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginTop: 14,
    marginBottom: 8,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  patternStatusText: {
    color: "#52645A",
    fontSize: 13,
    fontWeight: "600" as const,
  },
  patternSetup: {
    marginTop: 8,
    alignItems: "center" as const,
  },
  patternMessage: {
    textAlign: "center" as const,
    color: "#52645A",
    lineHeight: 20,
    marginTop: 8,
  },
  patternActions: {
    marginTop: 8,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#D6E5DC",
    borderRadius: 12,
    padding: 13,
    alignItems: "center" as const,
    width: "100%" as const,
    marginTop: 10,
  },
  secondaryButtonText: {
    color: "#52645A",
    fontWeight: "700" as const,
  },
  removeButton: {
    borderWidth: 1,
    borderColor: "#F3C5C9",
    borderRadius: 12,
    padding: 14,
    alignItems: "center" as const,
    marginTop: 10,
  },
  removeButtonText: {
    color: "#C53030",
    fontWeight: "700" as const,
  },
  settingsCard: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  row: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EFEA",
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#172B22",
  },
  rowDescription: {
    marginTop: 4,
    color: "#718278",
    fontSize: 12,
    lineHeight: 18,
  },
  footnote: {
    color: "#718278",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 16,
  },
};
