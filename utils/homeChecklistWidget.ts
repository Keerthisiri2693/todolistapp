
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";

export type ChecklistWidgetTheme = "mint" | "light" | "dark";

const THEME_KEY = "home-checklist-widget-theme";
const DEFAULT_THEME: ChecklistWidgetTheme = "mint";
const TASK_IDS_KEY = "home-checklist-widget-task-ids";
const TOKEN_KEY = "home-checklist-widget-auth-token";

type ChecklistTask = {
  tdlId?: string;
  _id?: string;
  id?: string;
  title?: string;
  status?: "Upcoming" | "Today" | "Completed" | string;
  completed?: boolean;
  isCompleted?: boolean;
  isDone?: boolean;
};

type HomeChecklistWidgetNativeModule = {
  updateChecklist?: (title: string, items: string) => Promise<boolean>;
  setWidgetTheme?: (theme: string) => Promise<boolean>;
  refreshWidget?: () => Promise<boolean>;
  setChecklistTaskData?: (
    taskIdsJson: string,
    token: string
  ) => Promise<boolean>;
};

function getWidgetModule(): HomeChecklistWidgetNativeModule | undefined {
  return NativeModules.HomeChecklistWidget;
}

function isChecklistWidgetTheme(
  value: unknown
): value is ChecklistWidgetTheme {
  return value === "mint" || value === "light" || value === "dark";
}

export async function getChecklistWidgetTheme(): Promise<ChecklistWidgetTheme> {
  try {
    const savedTheme = await AsyncStorage.getItem(THEME_KEY);
    return isChecklistWidgetTheme(savedTheme)
      ? savedTheme
      : DEFAULT_THEME;
  } catch (error) {
    console.warn("Unable to read checklist widget theme:", error);
    return DEFAULT_THEME;
  }
}

export async function setChecklistWidgetTheme(
  theme: ChecklistWidgetTheme
): Promise<boolean> {
  try {
    if (!isChecklistWidgetTheme(theme)) return false;

    await AsyncStorage.setItem(THEME_KEY, theme);

    if (Platform.OS !== "android") return true;

    const widgetModule = getWidgetModule();

    if (typeof widgetModule?.setWidgetTheme !== "function") {
      console.error("Native setWidgetTheme() is unavailable.");
      return false;
    }

    await widgetModule.setWidgetTheme(theme);

    if (typeof widgetModule.refreshWidget === "function") {
      await widgetModule.refreshWidget();
    }

    return true;
  } catch (error) {
    console.error("Unable to apply checklist widget theme:", error);
    return false;
  }
}

/**
 * Save IDs and token in native SharedPreferences.
 * Call this before updating the visible widget.
 *
 * Pass the actual token used by your authenticated API requests.
 */
export async function saveChecklistWidgetTaskData(
  taskIds: string[],
  authToken: string
): Promise<boolean> {
  if (Platform.OS !== "android") return false;

  try {
    const widgetModule = getWidgetModule();

    if (typeof widgetModule?.setChecklistTaskData !== "function") {
      console.error(
        "Native setChecklistTaskData() is unavailable. " +
        "Add it to HomeChecklistWidgetModule.kt and rebuild Android."
      );
      return false;
    }

    if (!authToken?.trim()) {
      console.error("Cannot save checklist widget data: token is empty.");
      return false;
    }

    if (taskIds.some((id) => !id)) {
      console.error("Cannot save checklist widget data: a task ID is missing.");
      return false;
    }

    await widgetModule.setChecklistTaskData(
      JSON.stringify(taskIds),
      authToken
    );

    await AsyncStorage.setItem(TASK_IDS_KEY, JSON.stringify(taskIds));
    await AsyncStorage.setItem(TOKEN_KEY, authToken);

    return true;
  } catch (error) {
    console.error("Unable to save native checklist task data:", error);
    return false;
  }
}

/**
 * Update the native widget with the first five tasks.
 *
 * authToken must be supplied by your existing authentication logic.
 */
export async function updateChecklistHomeWidget(
  tasks: ChecklistTask[],
  authToken?: string
): Promise<boolean> {
  if (Platform.OS !== "android") return false;

  try {
    const widgetModule = getWidgetModule();

    if (typeof widgetModule?.updateChecklist !== "function") {
      console.warn("Native updateChecklist() is unavailable.");
      return false;
    }

    const visibleTasks = tasks.slice(0, 5);

    const taskIds = visibleTasks.map((task) => {
      const id = task.tdlId ?? task._id ?? task.id;
      return id ? String(id) : "";
    });

    const items = visibleTasks.map((task) => {
      const completed =
        task.status === "Completed" ||
        task.completed === true ||
        task.isCompleted === true ||
        task.isDone === true;

      const title = (task.title ?? "").trim();

      return `${completed ? "☑" : "☐"} ${title}`;
    }).join("\n");

    // Require real IDs so widget rows cannot update the wrong task.
    if (taskIds.some((id) => !id)) {
      console.error(
        "Widget update cancelled: every visible task needs tdlId, _id, or id."
      );
      return false;
    }

    // If the caller supplies a token, synchronize IDs and token natively.
    if (authToken) {
      const saved = await saveChecklistWidgetTaskData(taskIds, authToken);
      if (!saved) return false;
    } else {
      // Never assume AsyncStorage IDs are available to the Kotlin receiver.
      const existingIds = await AsyncStorage.getItem(TASK_IDS_KEY);
      const existingToken = await AsyncStorage.getItem(TOKEN_KEY);

      if (
        existingIds !== JSON.stringify(taskIds) ||
        !existingToken
      ) {
        console.error(
          "Widget task data is not synchronized. " +
          "Call updateChecklistHomeWidget(tasks, authToken)."
        );
        return false;
      }
    }

    await widgetModule.updateChecklist(
      "My Checklist",
      items || "No checklist items"
    );

    return true;
  } catch (error) {
    console.error("Unable to update checklist home widget:", error);
    return false;
  }
}

export async function getChecklistWidgetTaskIds(): Promise<string[]> {
  try {
    const storedIds = await AsyncStorage.getItem(TASK_IDS_KEY);
    if (!storedIds) return [];

    const parsed: unknown = JSON.parse(storedIds);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((id) => typeof id === "string" ? id : "");
  } catch (error) {
    console.warn("Unable to read checklist widget task IDs:", error);
    return [];
  }
}

export async function refreshChecklistHomeWidget(): Promise<boolean> {
  if (Platform.OS !== "android") return false;

  try {
    const widgetModule = getWidgetModule();

    if (typeof widgetModule?.refreshWidget !== "function") {
      console.warn("Native refreshWidget() is unavailable.");
      return false;
    }

    await widgetModule.refreshWidget();
    return true;
  } catch (error) {
    console.error("Unable to refresh checklist widget:", error);
    return false;
  }
}
