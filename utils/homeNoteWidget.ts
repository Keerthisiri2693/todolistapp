
import { NativeModules, Platform } from "react-native";

const { HomeNoteWidget } = NativeModules;

export async function updateHomeNoteWidget(
  title: string,
  body: string
): Promise<boolean> {
  if (Platform.OS !== "android" || !HomeNoteWidget) {
    console.warn("HomeNoteWidget native module is not registered");
    return false;
  }

  try {
    await HomeNoteWidget.updateNote(
      title || "My Notes",
      body || "No content yet."
    );
    return true;
  } catch (error) {
    console.error("Failed to update note widget:", error);
    return false;
  }
}
