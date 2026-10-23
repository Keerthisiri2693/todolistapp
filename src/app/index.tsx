import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  
  StatusBar,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  background: '#B8E9DE',
  primary: '#39BFA5',
  dark: '#20243B',
  secondary: '#7B8292',
  white: '#FFFFFF',
  light: '#E8F8F3',
};

export default function SplashScreen() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isCheckingLogin, setIsCheckingLogin] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkLoginStatus = async () => {
      try {
        // IMPORTANT: This key must match the key used after successful login.
        const token = await AsyncStorage.getItem('login_token');

        if (!isMounted) return;

        // A saved token means the user has already logged in.
        // The Home screen/API can handle expired-token redirects if needed.
        const loggedIn = Boolean(token && token.trim().length > 0);
        setIsLoggedIn(loggedIn);

        if (loggedIn) {
          router.replace('/home');
        } else {
          router.replace('/loginscreen');
        }
      } catch (error) {
        console.error('Failed to read login status:', error);
        if (isMounted) {
          setIsLoggedIn(false);
          router.replace('/loginscreen');
        }
      } finally {
        if (isMounted) setIsCheckingLogin(false);
      }
    };

    checkLoginStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleGetStarted = () => {
    if (isCheckingLogin || isLoggedIn === null) return;
    router.replace(isLoggedIn ? '/home' : '/loginscreen');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.background}
      />

      <View style={styles.container}>
        {/* App Branding */}
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons
              name="checkmark-done"
              size={30}
              color={COLORS.white}
            />
          </View>

          <Text style={styles.brandName}>TaskFlow</Text>
        </View>

        {/* Main Welcome Card */}
        <View style={styles.card}>
          <View style={styles.topRow}>
            <Text style={styles.welcomeLabel}>WELCOME ABOARD</Text>

            <View style={styles.skipButton}>
              <Pressable
                onPress={handleGetStarted}
                disabled={isCheckingLogin || isLoggedIn === null}
                accessibilityRole="button"
              >
                <Text style={styles.skipText}>Skip</Text>
              </Pressable>
            </View>
          </View>

          {/* Illustration */}
          <View style={styles.illustration}>
            <View style={styles.decorCircle} />

            <View style={styles.calendarCard}>
              <View style={styles.calendarHeader}>
                <View style={styles.calendarHeaderDot} />
                <View style={styles.calendarHeaderDot} />
                <View style={styles.calendarHeaderDot} />
              </View>

              <View style={styles.calendarBody}>
                <View style={styles.calendarRow}>
                  <View style={styles.calendarLine} />
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={COLORS.primary}
                  />
                </View>

                <View style={styles.calendarRow}>
                  <View style={styles.calendarLineShort} />
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={COLORS.primary}
                  />
                </View>

                <View style={styles.calendarRow}>
                  <View style={styles.calendarLine} />
                  <View style={styles.pendingDot} />
                </View>

                <View style={styles.calendarRow}>
                  <View style={styles.calendarLineShort} />
                  <View style={styles.pendingDot} />
                </View>
              </View>
            </View>

            {/* Floating badges */}
            <View style={styles.checkBadge}>
              <Ionicons
                name="checkmark"
                size={26}
                color={COLORS.white}
              />
            </View>

            <View style={styles.notificationBadge}>
              <Ionicons
                name="notifications"
                size={20}
                color="#E9A526"
              />
            </View>

            <View style={styles.starBadge}>
              <Ionicons
                name="sparkles"
                size={21}
                color={COLORS.primary}
              />
            </View>
          </View>

          {/* Welcome Content */}
          <View style={styles.content}>
            <Text style={styles.title}>
              Get things done,
            </Text>

            <Text style={styles.titleAccent}>
              one task at a time.
            </Text>

            <Text style={styles.description}>
              Organize your day, build better habits,
              and achieve your goals with a simpler
              way to manage your tasks.
            </Text>
          </View>

          {/* Page Indicators */}
          <View style={styles.pagination}>
            <View style={styles.activeDot} />
            <View style={styles.inactiveDot} />
            <View style={styles.inactiveDot} />
          </View>

          {/* Get Started Button */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleGetStarted}
            disabled={isCheckingLogin || isLoggedIn === null}
            accessibilityRole="button"
          >
            {isCheckingLogin ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.primaryButtonText}>
                Get Started
              </Text>
            )}

            <Ionicons
              name="arrow-forward"
              size={21}
              color={COLORS.white}
            />
          </Pressable>

          <Text style={styles.footerText}>
            Plan better. Do more. Feel accomplished.
          </Text>
        </View>

        <Text style={styles.bottomBrand}>
          YOUR DAY, YOUR WAY
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 12,
  },

  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 18,
  },

  logo: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandName: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.dark,
    letterSpacing: -0.8,
  },

  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#387E70',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 8,
  },

  topRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  welcomeLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: COLORS.secondary,
  },

  skipButton: {
    backgroundColor: '#FFF2C2',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
  },

  skipText: {
    color: '#A87800',
    fontWeight: '700',
    fontSize: 12,
  },

  illustration: {
    width: '100%',
    height: 205,
    alignItems: 'center',
    justifyContent: 'center',
  },

  decorCircle: {
    position: 'absolute',
    width: 185,
    height: 185,
    borderRadius: 93,
    backgroundColor: COLORS.light,
  },

  calendarCard: {
    width: 157,
    height: 165,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#DCEFE8',
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#427D70',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },

  calendarHeader: {
    height: 32,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  calendarHeaderDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.white,
  },

  calendarBody: {
    flex: 1,
    justifyContent: 'space-evenly',
    paddingHorizontal: 13,
  },

  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  calendarLine: {
    width: 75,
    height: 6,
    borderRadius: 5,
    backgroundColor: '#D9E8E2',
  },

  calendarLineShort: {
    width: 55,
    height: 6,
    borderRadius: 5,
    backgroundColor: '#D9E8E2',
  },

  pendingDot: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#D6E3DD',
  },

  checkBadge: {
    position: 'absolute',
    right: 28,
    bottom: 22,
    width: 47,
    height: 47,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },

  notificationBadge: {
    position: 'absolute',
    left: 20,
    top: 25,
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: '#FFF5D9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  starBadge: {
    position: 'absolute',
    right: 28,
    top: 25,
    width: 39,
    height: 39,
    borderRadius: 14,
    backgroundColor: '#E8F8F3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    width: '100%',
    alignItems: 'center',
  },

  title: {
    color: COLORS.dark,
    fontSize: 27,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.8,
  },

  titleAccent: {
    color: COLORS.primary,
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 3,
    letterSpacing: -0.8,
  },

  description: {
    marginTop: 15,
    color: COLORS.secondary,
    fontSize: 13,
    lineHeight: 21,
    textAlign: 'center',
    paddingHorizontal: 3,
  },

  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginVertical: 10,
  },

  activeDot: {
    width: 22,
    height: 7,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },

  inactiveDot: {
    width: 7,
    height: 7,
    borderRadius: 5,
    backgroundColor: '#D8E8E3',
  },

  primaryButton: {
    width: '100%',
    minHeight: 55,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },

  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },

  primaryButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },

  footerText: {
    color: COLORS.secondary,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 12,
  },

  bottomBrand: {
    color: '#438F80',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
    textAlign: 'center',
    marginTop: 15,
  },
});