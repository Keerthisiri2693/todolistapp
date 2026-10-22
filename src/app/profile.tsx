
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import API from "../../services/api";
import { SafeAreaView } from "react-native-safe-area-context";
type UserProfile = {
  userId?: string;
  userName?: string;
  email?: string;
  Description?: string;
  profilePicUrl?: string;
};

const COLORS = {
  background: "#F3F8F5",
  surface: "#FFFFFF",
  primary: "#21866F",
  mint: "#45C7A5",
  paleMint: "#E2F5ED",
  dark: "#173C35",
  text: "#36574D",
  muted: "#80938B",
  border: "#E1EBE5",
  input: "#F8FBF9",
  danger: "#C74B4B",
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile>({});
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);

      const userId = await AsyncStorage.getItem("userId");

      if (!userId) {
        Alert.alert(
          "Login required",
          "Please log in to view your profile."
        );
        return;
      }

      const response = await API.post("/api/getUser", { userId });

      if (!response.data?.success) {
        throw new Error(
          response.data?.error || "Unable to load profile."
        );
      }

      const data = response.data.data as UserProfile;

      setProfile(data);
      setUserName(data.userName || "");
      setEmail(data.email || "");
      setDescription(data.Description || "");
    } catch (error: any) {
      console.log(
        "LOAD PROFILE ERROR:",
        error?.response?.data || error.message
      );

      Alert.alert(
        "Unable to load profile",
        error?.response?.data?.error ||
          error.message ||
          "Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const pickImage = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission required",
          "Allow photo library access to choose a profile picture."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        setImage(result.assets[0]);
      }
    } catch (error) {
      console.log("IMAGE PICKER ERROR:", error);
      Alert.alert("Error", "Unable to select a profile photo.");
    }
  };


const handleSave = async () => {
  if (!userName.trim()) {
    Alert.alert("Required", "Please enter your username.");
    return;
  }

  if (!email.trim()) {
    Alert.alert("Required", "Please enter your email address.");
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  if (!validEmail) {
    Alert.alert("Invalid email", "Please enter a valid email address.");
    return;
  }

  try {
    setSaving(true);

    const token = await AsyncStorage.getItem("login_token");

    if (!token) {
      Alert.alert(
        "Login required",
        "Login token not found. Please log in again."
      );
      return;
    }

    const formData = new FormData();

    formData.append("userName", userName.trim());
    formData.append("email", normalizedEmail);
    formData.append("Description", description.trim());

    if (image) {
      const fileName =
        image.fileName ||
        `profile_${Date.now()}.jpg`;

      formData.append(
        "file",
        {
          uri: image.uri,
          name: fileName,
          type: image.mimeType || "image/jpeg",
        } as any
      );
    }

    console.log("Updating profile...");
    console.log("API base URL:", API.defaults.baseURL);
    console.log("Profile image selected:", !!image);

    const response = await API.post(
      "/api/updateUserDetails",
      formData,
      {
        headers: {
          Authorization: token,
          // Do not manually set Content-Type here.
          // Axios/React Native should set the multipart boundary.
        },
        timeout: 30000,
      }
    );

    if (!response.data?.success) {
      throw new Error(
        response.data?.error ||
          response.data?.message ||
          "Unable to update profile."
      );
    }

    setProfile((previous) => ({
      ...previous,
      userName: userName.trim(),
      email: normalizedEmail,
      Description: description.trim(),
      ...(response.data.data || {}),
    }));

    setImage(null);

    Alert.alert("Success", "Your profile has been updated.");
  } catch (error: any) {
    console.log("UPDATE PROFILE ERROR:", {
      message: error?.message,
      code: error?.code,
      status: error?.response?.status,
      response: error?.response?.data,
      baseURL: API.defaults.baseURL,
    });

    let message = "Unable to connect to the server.";

    if (error?.response) {
      message =
        error.response.data?.error ||
        error.response.data?.message ||
        `Server error (${error.response.status}).`;
    } else if (error?.code === "ECONNABORTED") {
      message = "Request timed out. Please check your connection.";
    } else if (error?.message) {
      message = `${error.message}. Check your API URL and network connection.`;
    }

    Alert.alert("Profile update failed", message);
  } finally {
    setSaving(false);
  }
};


  const avatarUri = image?.uri || profile.profilePicUrl;
  const initial = userName.trim().charAt(0).toUpperCase() || "U";

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <View style={styles.loadingIcon}>
          <Ionicons name="person-outline" size={30} color={COLORS.primary} />
        </View>
        <ActivityIndicator
          size="small"
          color={COLORS.primary}
          style={{ marginTop: 18 }}
        />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView
    style={styles.safeArea}
    edges={["top", "left", "right"]}
  >
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.background}
      />

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.dark} />
          </TouchableOpacity>

          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>My Profile</Text>
            <Text style={styles.headerSubtitle}>
              Your personal space
            </Text>
          </View>

          <View style={styles.headerIcon}>
            <Ionicons
              name="person-circle-outline"
              size={25}
              color={COLORS.primary}
            />
          </View>
        </View>

        {/* Profile hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroDecoration} />

          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={pickImage}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
          >
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}

            <View style={styles.cameraButton}>
              <Ionicons name="camera" size={16} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <Text style={styles.heroName}>
            {userName.trim() || "Your Name"}
          </Text>
          <Text style={styles.heroEmail}>
            {email || "Add your email address"}
          </Text>

          <View style={styles.profileStatus}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Personal profile</Text>
          </View>

          <TouchableOpacity
            style={styles.photoButton}
            onPress={pickImage}
            disabled={saving}
          >
            <Ionicons
              name="image-outline"
              size={17}
              color={COLORS.primary}
            />
            <Text style={styles.photoButtonText}>Change photo</Text>
          </TouchableOpacity>
        </View>

        {/* User ID */}
        <View style={styles.idCard}>
          <View style={styles.idIcon}>
            <Ionicons
              name="shield-checkmark-outline"
              size={22}
              color={COLORS.primary}
            />
          </View>

          <View style={styles.idContent}>
            <Text style={styles.idLabel}>YOUR USER ID</Text>
            <Text style={styles.idValue}>
              {profile.userId || "Not available"}
            </Text>
          </View>

          <Ionicons
            name="checkmark-circle"
            size={21}
            color={COLORS.primary}
          />
        </View>

        {/* Form */}
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Personal information</Text>
          <Text style={styles.sectionDescription}>
            Update the details associated with your account.
          </Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>Username</Text>
          <View style={styles.inputWrapper}>
            <Ionicons
              name="person-outline"
              size={20}
              color={COLORS.muted}
            />
            <TextInput
              style={styles.input}
              value={userName}
              onChangeText={setUserName}
              placeholder="Enter your username"
              placeholderTextColor="#A2B1AA"
              autoCapitalize="none"
              editable={!saving}
              maxLength={50}
              returnKeyType="next"
            />
          </View>

          <Text style={styles.label}>Email address</Text>
          <View style={styles.inputWrapper}>
            <Ionicons
              name="mail-outline"
              size={20}
              color={COLORS.muted}
            />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              placeholderTextColor="#A2B1AA"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
              maxLength={254}
              returnKeyType="next"
            />
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.label}>About me</Text>
            <Text style={styles.optional}>OPTIONAL</Text>
          </View>

          <View style={[styles.inputWrapper, styles.descriptionWrapper]}>
            <Ionicons
              name="document-text-outline"
              size={20}
              color={COLORS.muted}
              style={styles.descriptionIcon}
            />
            <TextInput
              style={[styles.input, styles.descriptionInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Write a little about yourself..."
              placeholderTextColor="#A2B1AA"
              multiline
              textAlignVertical="top"
              editable={!saving}
              maxLength={300}
            />
          </View>

          <Text style={styles.characterCount}>
            {description.length}/300 characters
          </Text>

          <TouchableOpacity
            style={[
              styles.saveButton,
              saving && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save profile changes"
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={21}
                  color="#FFFFFF"
                />
                <Text style={styles.saveButtonText}>
                  Save Changes
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.secureNote}>
            <Ionicons
              name="lock-closed-outline"
              size={14}
              color={COLORS.muted}
            />
            <Text style={styles.secureText}>
              Your profile details are saved to your account.
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>Made for your everyday notes.</Text>
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

screen: {
  flex: 1,
  backgroundColor: COLORS.background,
},
  
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 18 : 12,
    paddingBottom: 35,
  },
  loadingScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  loadingIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: COLORS.paleMint,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: COLORS.muted,
    fontSize: 14,
    marginTop: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
    gap: 13,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 23,
    fontWeight: "800",
    color: COLORS.dark,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 3,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: COLORS.paleMint,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 20,
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  heroDecoration: {
    position: "absolute",
    top: -68,
    right: -40,
    width: 190,
    height: 150,
    borderRadius: 100,
    backgroundColor: "#E9F8F1",
    transform: [{ rotate: "-18deg" }],
  },
  avatarWrapper: {
    position: "relative",
    marginBottom: 15,
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#DDF4EA",
    backgroundColor: COLORS.paleMint,
  },
  avatarFallback: {
    width: 112,
    height: 112,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#DDF4EA",
    backgroundColor: COLORS.paleMint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 42,
    fontWeight: "800",
    color: COLORS.primary,
  },
  cameraButton: {
    position: "absolute",
    bottom: -3,
    right: -5,
    width: 35,
    height: 35,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  heroName: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.dark,
    textAlign: "center",
  },
  heroEmail: {
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 5,
    textAlign: "center",
  },
  profileStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#F0F8F3",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 13,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  statusText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: "600",
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 17,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CDE9DD",
    paddingHorizontal: 17,
    paddingVertical: 10,
    backgroundColor: "#FAFDFB",
  },
  photoButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primary,
  },
  idCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginTop: 16,
    backgroundColor: COLORS.paleMint,
    borderRadius: 18,
    gap: 12,
  },
  idIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  idContent: {
    flex: 1,
  },
  idLabel: {
    color: "#6D8B7E",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  idValue: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.dark,
    marginTop: 4,
  },
  sectionHeading: {
    marginTop: 27,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: COLORS.dark,
  },
  sectionDescription: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 19,
    marginTop: 5,
  },
  formCard: {
    backgroundColor: COLORS.surface,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 9,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    paddingHorizontal: 13,
    marginBottom: 20,
    minHeight: 53,
    gap: 11,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    color: COLORS.dark,
    fontSize: 14,
    minWidth: 0,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optional: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: "700",
    marginBottom: 9,
    letterSpacing: 0.7,
  },
  descriptionWrapper: {
    alignItems: "flex-start",
    minHeight: 112,
    paddingTop: 3,
    marginBottom: 4,
  },
  descriptionIcon: {
    marginTop: 13,
  },
  descriptionInput: {
    minHeight: 100,
    lineHeight: 21,
  },
  characterCount: {
    textAlign: "right",
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 5,
    marginBottom: 20,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
  },
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  secureNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 15,
  },
  secureText: {
    fontSize: 11,
    color: COLORS.muted,
    flexShrink: 1,
  },
  footer: {
    textAlign: "center",
    marginTop: 23,
    color: COLORS.muted,
    fontSize: 12,
  },
});
