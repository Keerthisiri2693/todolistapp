import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";

// IMPORTANT:
// api.ts must be outside the app folder:
// services/api.ts
import API from "../../services/api";

export default function RegisterScreen() {
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(false);

  // Generate 6 digit user ID
  const generateRandomUserId = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  // Pick profile image
  const pickImage = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          "Please allow gallery access to select a profile image."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        setImage(result.assets[0]);
      }
    } catch (error) {
      console.log("IMAGE PICKER ERROR:", error);
      Alert.alert("Error", "Unable to select image.");
    }
  };

  // Register
  const handleRegister = async () => {
    // Validation
    if (!userName.trim()) {
      Alert.alert("Validation", "Please enter username.");
      return;
    }

    if (!email.trim()) {
      Alert.alert("Validation", "Please enter email.");
      return;
    }

    if (!password) {
      Alert.alert("Validation", "Please enter password.");
      return;
    }

    if (!confirmPassword) {
      Alert.alert("Validation", "Please confirm password.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Validation", "Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const userId = generateRandomUserId();

      const formData = new FormData();

      formData.append("userId", userId);
      formData.append("userName", userName.trim());
      formData.append("email", email.trim().toLowerCase());
      formData.append("password", password);
      formData.append("confirmPassword", confirmPassword);
      formData.append("Description", description.trim());

      // Add profile image
      if (image) {
        formData.append("profile", {
          uri: image.uri,
          name: image.fileName || "profile.jpg",
          type: image.mimeType || "image/jpeg",
        } as any);
      }

      console.log("REGISTER REQUEST:", {
        userId,
        userName,
        email,
      });

      const response = await API.post(
        "/api/userRegister",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      console.log("REGISTER RESPONSE:", response.data);

      if (response.data?.success) {
        Alert.alert(
          "Success",
          "Registered successfully!",
          [
            {
              text: "OK",
              onPress: () => {
                router.replace("/loginscreen");
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "Registration Failed",
          response.data?.message || "Registration failed."
        );
      }
    } catch (error: any) {
      console.log("=================================");
      console.log("REGISTER ERROR");
      console.log("=================================");

      console.log("FULL ERROR:", error);
      console.log("MESSAGE:", error?.message);
      console.log("CODE:", error?.code);
      console.log("STATUS:", error?.response?.status);
      console.log("DATA:", error?.response?.data);

      if (error?.response) {
        Alert.alert(
          "Server Error",
          error.response.data?.message ||
            `Server returned ${error.response.status}`
        );
      } else if (error?.request) {
        Alert.alert(
          "Network Error",
          "Unable to connect to the backend server.\n\nCheck your API URL, Wi-Fi connection, backend and Windows Firewall."
        );
      } else {
        Alert.alert(
          "Error",
          error?.message || "Something went wrong."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Create Account 🚀</Text>

      {/* Profile Image */}
      <TouchableOpacity
        style={styles.imageBox}
        onPress={pickImage}
        disabled={loading}
      >
        {image ? (
          <Image
            source={{ uri: image.uri }}
            style={styles.image}
          />
        ) : (
          <Text style={styles.imagePlaceholder}>
            Select Profile Image
          </Text>
        )}
      </TouchableOpacity>

      {/* Username */}
      <TextInput
        placeholder="Username"
        value={userName}
        style={styles.input}
        onChangeText={setUserName}
        autoCapitalize="none"
        editable={!loading}
      />

      {/* Email */}
      <TextInput
        placeholder="Email"
        value={email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        onChangeText={setEmail}
        editable={!loading}
      />

      {/* Password */}
      <TextInput
        placeholder="Password"
        value={password}
        secureTextEntry
        style={styles.input}
        onChangeText={setPassword}
        editable={!loading}
      />

      {/* Confirm Password */}
      <TextInput
        placeholder="Confirm Password"
        value={confirmPassword}
        secureTextEntry
        style={styles.input}
        onChangeText={setConfirmPassword}
        editable={!loading}
      />

      {/* Description */}
      <TextInput
        placeholder="Description"
        value={description}
        style={[styles.input, styles.descriptionInput]}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        editable={!loading}
      />

      {/* Register Button */}
      <TouchableOpacity
        style={[
          styles.button,
          loading && styles.buttonDisabled,
        ]}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>
              Registering...
            </Text>
          </>
        ) : (
          <Text style={styles.buttonText}>
            Register
          </Text>
        )}
      </TouchableOpacity>

      {/* Login */}
      <TouchableOpacity
        onPress={() =>
          router.replace("/auth/loginscreen")
        }
        disabled={loading}
      >
        <Text style={styles.loginText}>
          Already have an account? Login
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: "#fff",
    justifyContent: "center",
  },

  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 25,
  },

  imageBox: {
    alignSelf: "center",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 25,
    overflow: "hidden",
  },

  image: {
    width: 120,
    height: 120,
  },

  imagePlaceholder: {
    color: "#888",
    textAlign: "center",
    paddingHorizontal: 10,
  },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: "#fff",
  },

  descriptionInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },

  button: {
    backgroundColor: "#25D366",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
    minHeight: 52,
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },

  loadingText: {
    color: "#fff",
    marginTop: 5,
    fontSize: 13,
  },

  loginText: {
    textAlign: "center",
    color: "#128C7E",
    fontWeight: "600",
    fontSize: 15,
    paddingVertical: 10,
  },
});
