
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API from '../../services/api';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAppTheme } from "../../context/app-theme-context";

// Keep these paths aligned with your app/ filenames.
const ROUTES = {
  quickNotes: '/quicknotes',
  createTodo: '/cretenote',
  viewTodos: '/viewlist',
  settings: '/settings',
} as const;

type Palette = {
  background: string;
  card: string;
  ink: string;
  secondary: string;
  border: string;
  mint: string;
  deepGreen: string;
  softMint: string;
  white: string;
  heroText: string;
  heroSubtext: string;
};

const LIGHT_COLORS: Palette = {
  background: '#F3F9F6',
  card: '#FFFFFF',
  ink: '#183B32',
  secondary: '#71877E',
  border: '#DFEDE6',
  mint: '#32AD91',
  deepGreen: '#17483F',
  softMint: '#E3F5ED',
  white: '#FFFFFF',
  heroText: '#E9FFF5',
  heroSubtext: '#D9F5E9',
};

const DARK_COLORS: Palette = {
  background: '#101C19',
  card: '#1B2B26',
  ink: '#F0FAF5',
  secondary: '#A4B9AF',
  border: '#30453C',
  mint: '#5AD5B0',
  deepGreen: '#143D33',
  softMint: '#243F35',
  white: '#FFFFFF',
  heroText: '#E9FFF5',
  heroSubtext: '#D9F5E9',
};

type ActionCardProps = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradient: readonly [string, string, ...string[]];
  onPress: () => void;
};

function ActionCard({
  title,
  subtitle,
  icon,
  gradient,
  onPress,
}: ActionCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionWrap,
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.actionCard}
      >
        <View style={styles.actionTop}>
          <View style={styles.actionIcon}>
            <Ionicons name={icon} size={23} color="#FFFFFF" />
          </View>

          <View style={styles.arrowBubble}>
            <Ionicons
              name="arrow-forward"
              size={15}
              color="#FFFFFF"
            />
          </View>
        </View>

        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </LinearGradient>
    </Pressable>
  );
}

type HomeUser = {
  userName?: string;
  email?: string;
  Description?: string;
  profilePicUrl?: string;
};

export default function HomeScreen() {
  const router = useRouter();
  const { isDark, colors: appColors } = useAppTheme();

  const [user, setUser] = useState<HomeUser | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const getUser = useCallback(async () => {
    try {
      const userId = await AsyncStorage.getItem('userId');

      if (!userId) {
        console.warn('getUser: userId was not found in AsyncStorage.');
        setUser(null);
        return;
      }

      const response = await API.post('/api/getUser', { userId });

      if (response.data?.success) {
        const userData =
          response.data.user ??
          response.data.data ??
          response.data.userDetails ??
          response.data;

        setUser({
          userName: userData?.userName ?? '',
          email: userData?.email ?? '',
          Description: userData?.Description ?? '',
          profilePicUrl: userData?.profilePicUrl ?? '',
        });
      } else {
        console.warn(
          'getUser failed:',
          response.data?.message ?? 'The server did not return success.',
        );
      }
    } catch (error: any) {
      console.error(
        'getUser API error:',
        error?.response?.data ?? error?.message ?? error,
      );
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    getUser();
  }, [getUser]);

  // Use the shared app theme so Settings changes are reflected here.
  // Keep the dashboard's mint-green accent in both light and dark modes.
  const baseColors = isDark ? DARK_COLORS : LIGHT_COLORS;
  const colors: Palette = {
    ...baseColors,
    background: appColors.background,
    card: appColors.surface,
    ink: appColors.text,
    secondary: appColors.secondaryText,
    border: appColors.border,
    mint: appColors.primary,
    softMint: isDark ? DARK_COLORS.softMint : LIGHT_COLORS.softMint,
  };

  const themed = createStyles(colors);

  const openRoute = (
    route: (typeof ROUTES)[keyof typeof ROUTES],
  ) => {
    router.push(route as never);
  };

  return (
    <SafeAreaView
      style={themed.safeArea}
      edges={['top', 'left', 'right']}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
     <View style={styles.header}>
  <View style={styles.brandRow}>
    <LinearGradient
      colors={["#45C7A5", "#21866F"]}
      style={styles.brandIcon}
    >
      <Ionicons name="leaf" size={24} color="#FFFFFF" />
    </LinearGradient>

    <View style={{ flexShrink: 1 }}>
      <Text style={themed.brandName}>E-diary</Text>
      <Text style={themed.brandCaption} numberOfLines={1}>
        {user?.userName
          ? `WELCOME, ${user.userName.toUpperCase()}`
          : profileLoading
            ? 'YOUR PERSONAL WORKSPACE'
            : 'YOUR PERSONAL WORKSPACE'}
      </Text>
    </View>
  </View>

  <View style={styles.headerActions}>


    {/* Settings Button */}
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open Settings"
      onPress={() => openRoute(ROUTES.settings)}
      style={({ pressed }) => [
        themed.settingsButton,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name="settings-outline"
        size={22}
        color={colors.mint}
      />
    </Pressable>

    
    {/* Profile Button: show the saved profile picture when available */}
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open Profile"
      onPress={() => router.push('/profile')}
      style={({ pressed }) => [
        themed.settingsButton,
        { overflow: 'hidden', padding: 0 },
        pressed && styles.pressed,
      ]}
    >
      {user?.profilePicUrl &&
      /^https?:\/\//i.test(user.profilePicUrl) ? (
        <Image
          source={{ uri: user.profilePicUrl }}
          style={styles.profileImage}
          resizeMode="cover"
          onError={() =>
            console.warn('Unable to load profile picture URL.')
          }
        />
      ) : (
        <Ionicons
          name="person-circle-outline"
          size={25}
          color={colors.mint}
        />
      )}
    </Pressable>

    
  </View>
</View>

        {/* Welcome hero */}
        <LinearGradient
          colors={['#17483F', '#237D6B', '#39BFA5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroCircleOne} />
          <View style={styles.heroCircleTwo} />

          <View style={styles.heroCopy}>
            <View style={styles.welcomePill}>
              <Ionicons
                name="sparkles"
                size={13}
                color="#E9FFF5"
              />
              <Text style={styles.welcomeText}>A FRESH START</Text>
            </View>

            <Text style={styles.heroTitle}>
              {user?.userName ? `Hello, ${user.userName}!` : 'Your ideas.'}
              {'\n'}
              Your day. Your space.
            </Text>

            <Text style={styles.heroSubtitle}>
              Write it down, plan what matters, and keep your
              day beautifully organized.
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => openRoute(ROUTES.quickNotes)}
              style={({ pressed }) => [
                styles.heroButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.heroButtonText}>
                Create a quick note
              </Text>
              <Ionicons
                name="arrow-forward"
                size={17}
                color="#17483F"
              />
            </Pressable>
          </View>

          {/* Decorative note illustration */}
          <View
            style={styles.paperBack}
            pointerEvents="none"
          />

          <View
            style={styles.paperFront}
            pointerEvents="none"
          >
            <View style={styles.paperDots}>
              <View style={styles.paperDot} />
              <View style={[styles.paperDot, { opacity: 0.55 }]} />
              <View style={[styles.paperDot, { opacity: 0.3 }]} />
            </View>

            <View style={styles.paperLine} />
            <View style={styles.paperShortLine} />

            <View style={styles.paperCheckRow}>
              <View style={styles.paperCheck}>
                <Ionicons
                  name="checkmark"
                  size={10}
                  color="#FFFFFF"
                />
              </View>
              <View style={styles.paperMediumLine} />
            </View>

            <View style={styles.paperCheckRow}>
              <View style={styles.paperEmptyCheck} />
              <View style={styles.paperLine} />
            </View>
          </View>

          <View style={styles.floatingSparkle}>
            <Ionicons
              name="sparkles"
              size={19}
              color="#FFF1BC"
            />
          </View>
        </LinearGradient>

        {/* Workspace heading */}
        <View style={styles.sectionHeading}>
          <View>
            <Text style={themed.eyebrow}>
              MADE FOR YOUR EVERYDAY
            </Text>
            <Text style={themed.sectionTitle}>
              Your workspace
            </Text>
          </View>

          <View style={themed.sectionIcon}>
            <Ionicons
              name="apps-outline"
              size={20}
              color={colors.mint}
            />
          </View>
        </View>

        {/* Quick Notes + Create To-Do */}
        <View style={styles.actionGrid}>
          <ActionCard
            title="Quick Notes"
            subtitle="Capture ideas quickly"
            icon="flash-outline"
            gradient={['#A78BFA', '#7C3AED', '#6D28D9']}
            onPress={() => openRoute(ROUTES.quickNotes)}
          />

          <ActionCard
            title="Create To-Do"
            subtitle="Organize your day"
            icon="checkbox-outline"
            gradient={['#FDBA74', '#F97316', '#EA580C']}
            onPress={() => openRoute(ROUTES.createTodo)}
          />
        </View>

        {/* View saved items */}
        
<Pressable
  accessibilityRole="button"
  accessibilityLabel="View saved items"
  onPress={() => openRoute(ROUTES.viewTodos)}
  style={({ pressed }) => [
    themed.savedCard,
    {
      backgroundColor: "#FFF0F3",
      borderColor: "#FFD2DC",
      borderWidth: 1,
    },
    pressed && styles.pressed,
  ]}
>
  <View
    style={[
      themed.savedIcon,
      { backgroundColor: "#FFD5DF" },
    ]}
  >
    <Ionicons
      name="albums-outline"
      size={25}
      color="#E34D75"
    />
  </View>

  <View style={styles.savedCopy}>
    <Text style={themed.savedTitle}>
      View saved items
    </Text>
    <Text style={themed.savedSubtitle}>
      All your notes and to-do lists in one place
    </Text>
  </View>

  <View
    style={[
      themed.savedArrow,
      { backgroundColor: "#FFD5DF" },
    ]}
  >
    <Ionicons
      name="arrow-forward"
      size={17}
      color="#E34D75"
    />
  </View>
</Pressable>


        {/* Footer */}
        <View style={styles.footer}>
          <Ionicons
            name="leaf-outline"
            size={17}
            color={colors.mint}
          />
          <Text style={themed.footerText}>
            Less clutter. More clarity.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    brandName: {
      color: colors.ink,
      fontSize: 24,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    brandCaption: {
      color: colors.secondary,
      fontSize: 8,
      fontWeight: '800',
      letterSpacing: 1.2,
      marginTop: 3,
    },
    settingsButton: {
      width: 46,
      height: 46,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    eyebrow: {
      color: colors.mint,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.5,
      marginBottom: 5,
    },
    sectionTitle: {
      color: colors.ink,
      fontSize: 22,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    sectionIcon: {
      width: 42,
      height: 42,
      borderRadius: 15,
      backgroundColor: colors.softMint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    savedCard: {
      minHeight: 94,
      borderRadius: 23,
      padding: 15,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#173B35',
      shadowOpacity: 0.04,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },
    savedIcon: {
      width: 49,
      height: 49,
      borderRadius: 16,
      backgroundColor: colors.softMint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    savedTitle: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: '900',
    },
    savedSubtitle: {
      color: colors.secondary,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 5,
    },
    savedArrow: {
      width: 32,
      height: 32,
      borderRadius: 11,
      backgroundColor: colors.softMint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerText: {
      color: colors.secondary,
      fontSize: 11,
      fontWeight: '600',
    },
  });
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 35,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileImage: {
    width: 44,
    height: 44,
    borderRadius: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 23,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  brandIcon: {
    width: 49,
    height: 49,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    minHeight: 300,
    borderRadius: 29,
    padding: 22,
    overflow: 'hidden',
    marginBottom: 29,
    position: 'relative',
  },
  heroCopy: {
    width: '76%',
    zIndex: 2,
  },
  welcomePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 16,
  },
  welcomeText: {
    color: '#E9FFF5',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  heroSubtitle: {
    color: '#D9F5E9',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 11,
    maxWidth: 235,
  },
  heroButton: {
    alignSelf: 'flex-start',
    marginTop: 17,
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  heroButtonText: {
    color: '#17483F',
    fontSize: 12,
    fontWeight: '800',
  },
  heroCircleOne: {
    position: 'absolute',
    width: 215,
    height: 215,
    borderRadius: 108,
    backgroundColor: 'rgba(255,255,255,0.07)',
    right: -75,
    top: -78,
  },
  heroCircleTwo: {
    position: 'absolute',
    width: 175,
    height: 175,
    borderRadius: 88,
    backgroundColor: 'rgba(255,255,255,0.06)',
    right: 8,
    bottom: -115,
  },
  paperBack: {
    position: 'absolute',
    width: 70,
    height: 95,
    right: 12,
    bottom: 33,
    borderRadius: 11,
    backgroundColor: '#C7F2E5',
    transform: [{ rotate: '12deg' }],
  },
  paperFront: {
    position: 'absolute',
    width: 76,
    height: 105,
    right: 23,
    bottom: 27,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    padding: 10,
    transform: [{ rotate: '-7deg' }],
    elevation: 5,
    shadowColor: '#0B332C',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  paperDots: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 10,
  },
  paperDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#39BFA5',
  },
  paperLine: {
    height: 4,
    width: '100%',
    borderRadius: 4,
    backgroundColor: '#E4EBE8',
    marginBottom: 7,
  },
  paperShortLine: {
    height: 4,
    width: '65%',
    borderRadius: 4,
    backgroundColor: '#E4EBE8',
    marginBottom: 10,
  },
  paperCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 7,
  },
  paperCheck: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: '#39BFA5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paperEmptyCheck: {
    width: 10,
    height: 10,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#B8C9C2',
  },
  paperMediumLine: {
    height: 4,
    width: 32,
    borderRadius: 4,
    backgroundColor: '#D9E5E0',
  },
  floatingSparkle: {
    position: 'absolute',
    right: 5,
    top: 105,
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 17,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  actionWrap: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  actionCard: {
    minHeight: 160,
    padding: 14,
    justifyContent: 'center',
  },
  actionTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  arrowBubble: {
    width: 27,
    height: 27,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  actionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  actionSubtitle: {
    color: '#FFFFFF',
    opacity: 0.92,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },
  savedCopy: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 25,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
});
