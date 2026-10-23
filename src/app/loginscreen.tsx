import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getMessaging,
  requestPermission,
  getToken,
  AuthorizationStatus,
} from "@react-native-firebase/messaging";

import { getApp } from "@react-native-firebase/app";
import { router } from "expo-router";
import API from "../../services/api";


const COLORS = {
  primary: "#39BFA5",
  background: "#F5F8F7",
  white: "#FFFFFF",
  dark: "#20243B",
  secondary: "#8A91A0",
  border: "#E8EEEB",
  mint: "#E3F7F0",
  paleMint: "#F0FBF7",
  red: "#F16B6B",
};

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

const requestFCMPermission = async (): Promise<string | null> => {
  try {
    const app = getApp();
    const messagingInstance = getMessaging(app);

    const authStatus = await requestPermission(messagingInstance);

    const enabled =
      authStatus === AuthorizationStatus.AUTHORIZED ||
      authStatus === AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.warn("FCM notification permission not granted");
      return null;
    }

    const token = await getToken(messagingInstance);

    if (!token) {
      console.warn("Firebase returned an empty FCM token");
      return null;
    }

    console.log("FCM token generated successfully:", token);
    return token;
  } catch (error: any) {
    console.error(
      "FCM initialization/token error:",
      error?.code,
      error?.message || error
    );
    return null;
  }
};

  const handleLogin = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      Alert.alert("Required", "Please enter your email.");
      return;
    }

    if (!password.trim()) {
      Alert.alert("Required", "Please enter your password.");
      return;
    }

    if (loading) return;

    setLoading(true);
    try {
      const response = await API.post("/api/userLoginOrLogout", {
        type: "login",
        email: trimmedEmail,
        password,
      });

      const data = response?.data;
      const userId = data?.userId ?? data?.userid ?? data?.user_id;
      const loginToken = data?.token ?? data?.accessToken ?? data?.access_token;
      const userName = data?.userName ?? data?.username ?? data?.name ?? "";

      if (!userId) {
        Alert.alert(
          "Login failed",
          data?.message || "The server did not return a user ID."
        );
        return;
      }

      if (!loginToken) {
        Alert.alert(
          "Login failed",
          data?.message || "The server did not return an authentication token."
        );
        return;
      }

      const normalizedUserId = String(userId).trim();
      const normalizedToken = String(loginToken).trim();

      if (!normalizedUserId || !normalizedToken) {
        Alert.alert("Login failed", "The server returned invalid login details.");
        return;
      }

      // Persist the authenticated session for the Splash Screen.
      await AsyncStorage.multiSet([
        ["userId", normalizedUserId],
        ["login_token", normalizedToken],
        ["userEmail", trimmedEmail],
        ["isLoggedIn", "true"],
      ]);

      if (userName) {
        await AsyncStorage.setItem("userName", String(userName));
      }

      // FCM is optional. Continue login if permission/token setup fails.
      const fcmToken = await requestFCMPermission();

      if (fcmToken) {
        await AsyncStorage.multiSet([
          ["fcmToken", fcmToken],
          ["fcmUserId", normalizedUserId],
        ]);

        try {
          await API.post(
            "/api/sendFcmTokenToBackend",
            { token: fcmToken },
            { headers: { Authorization: `Bearer ${normalizedToken}` } }
          );
        } catch (error: any) {
          console.warn(
            "Could not upload FCM token:",
            error?.response?.data || error?.message || error
          );
        }
      }

     

      // Navigate only after the credentials/session have been saved.
      router.replace("/home");
    } catch (error: any) {
      console.error(
        "Login error:",
        error?.response?.data || error?.message || error
      );

      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Unable to log in. Please check your details and try again.";

      Alert.alert("Login failed", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <View style={styles.topAccent}>
            <View style={styles.brandIcon}>
              <Ionicons name="checkmark-done" size={34} color={COLORS.primary} />
            </View>
            <Text style={styles.brandName}>My Todo</Text>
            <Text style={styles.brandCaption}>Plan your day. Make it count.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.greeting}>Welcome back 👋</Text>
            <Text style={styles.title}>Login to your account</Text>
            <Text style={styles.subtitle}>
              Pick up where you left off and keep your day on track.
            </Text>

            <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
            <View style={styles.inputContainer}>
              <View style={styles.inputIcon}>
                <Ionicons name="mail-outline" size={20} color={COLORS.primary} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#A3AAA8"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                returnKeyType="next"
              />
            </View>

            <Text style={styles.fieldLabel}>PASSWORD</Text>
            <View style={styles.inputContainer}>
              <View style={styles.inputIcon}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={COLORS.primary}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#A3AAA8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <Pressable
                onPress={() => setShowPassword((current) => !current)}
                disabled={loading}
                hitSlop={10}
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={21}
                  color={COLORS.secondary}
                />
              </Pressable>
            </View>

            <Pressable
              style={[styles.loginButton, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Text style={styles.loginButtonText}>Login</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={20}
                    color={COLORS.white}
                  />
                </>
              )}
            </Pressable>

            <View style={styles.registerRow}>
              <Text style={styles.registerText}>Don't have an account?</Text>
              <Pressable
                onPress={() => router.push("/registerscreen")}
                disabled={loading}
                hitSlop={8}
              >
                <Text style={styles.registerLink}>Create account</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.footer}>
            <Ionicons name="leaf-outline" size={17} color={COLORS.primary} />
            <Text style={styles.footerText}>
              Small steps lead to big achievements.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboard: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 28,
  },
  topAccent: {
    alignItems: "center",
    marginBottom: 26,
  },
  brandIcon: {
    width: 70,
    height: 70,
    borderRadius: 24,
    backgroundColor: COLORS.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  brandName: {
    color: COLORS.dark,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  brandCaption: {
    color: COLORS.secondary,
    fontSize: 13,
    marginTop: 5,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 26,
    padding: 23,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#263B35",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  greeting: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
  },
  title: {
    color: COLORS.dark,
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  subtitle: {
    color: COLORS.secondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 24,
  },
  fieldLabel: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 4,
  },
  inputContainer: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FBFDFC",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    paddingHorizontal: 12,
    marginBottom: 17,
  },
  inputIcon: {
    width: 35,
    height: 35,
    borderRadius: 11,
    backgroundColor: COLORS.mint,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  input: {
    flex: 1,
    minHeight: 52,
    color: COLORS.dark,
    fontSize: 14,
    paddingVertical: 10,
  },
  loginButton: {
    minHeight: 55,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  loginButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "800",
  },
  registerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 22,
    gap: 5,
  },
  registerText: {
    color: COLORS.secondary,
    fontSize: 13,
  },
  registerLink: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 24,
  },
  footerText: {
    color: COLORS.secondary,
    fontSize: 11,
  },
});
