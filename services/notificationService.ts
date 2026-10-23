import messaging from "@react-native-firebase/messaging";

export async function getFCMToken(): Promise<string | null> {
  try {
    const messagingInstance = messaging();
    const authStatus = await messagingInstance.requestPermission();

    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.log("Notification permission denied");
      return null;
    }

    return await messagingInstance.getToken();
  } catch (error) {
    console.error("FCM token error:", error);
    return null;
  }
}