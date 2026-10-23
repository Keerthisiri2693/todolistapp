import { useCallback, useEffect, useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { updateChecklistHomeWidget } from "../../utils/homeChecklistWidget";

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import axios from "axios";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import { router, useFocusEffect } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAppTheme } from "../../context/app-theme-context";

// Show notification banners while the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ============================================================
// LOCAL REMINDER NOTIFICATIONS
// ============================================================
const REMINDER_CHANNEL_ID = "reminders";

const cancelLocalReminderNotifications = async (todoId: string) => {
  const id = String(todoId || "").trim();
  if (!id) return;

  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const matching = pending.filter(
    (notification) => String(notification.content.data?.todoId ?? "") === id,
  );

  await Promise.all(
    matching.map((notification) =>
      Notifications.cancelScheduledNotificationAsync(notification.identifier),
    ),
  );
};

const scheduleLocalReminderNotification = async (
  todoId: string,
  title: string,
  scheduledAt: Date,
): Promise<string> => {
  const id = String(todoId || "").trim();
  if (!id) throw new Error("A note ID is required to schedule a reminder.");
  if (!(scheduledAt instanceof Date) || Number.isNaN(scheduledAt.getTime())) {
    throw new Error("The reminder date or time is invalid.");
  }
  if (scheduledAt.getTime() <= Date.now()) {
    throw new Error("Choose a reminder time in the future.");
  }

  const permission = await Notifications.getPermissionsAsync();
  let status = permission.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") {
    throw new Error(
      "Notification permission is disabled. Allow notifications in Android Settings and try again.",
    );
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: "Reminders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      enableVibrate: true,
      enableLights: true,
    });
  }

  // Replacing a reminder must replace its previous local notification too.
  await cancelLocalReminderNotifications(id);

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Reminder",
      body: title.trim() || "You have a task to do.",
      sound: "default",
      data: { todoId: id, type: "todo-reminder" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: scheduledAt,
      ...(Platform.OS === "android" ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
  });
};

const makeReminderDateTime = (
  dateValue: string,
  timeValue: string,
): Date | null => {
  // Expected values: YYYY-MM-DD and HH:mm
  const dateMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  const timeMatch = timeValue.match(/^(\d{1,2}):(\d{2})$/);

  if (!dateMatch || !timeMatch) {
    console.warn("[Reminder] Invalid date/time:", {
      dateValue,
      timeValue,
    });
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  // Construct local device time (not UTC).
  const reminderDate = new Date(year, month - 1, day, hour, minute, 0, 0);

  // Reject invalid calendar dates.
  if (
    reminderDate.getFullYear() !== year ||
    reminderDate.getMonth() !== month - 1 ||
    reminderDate.getDate() !== day
  ) {
    return null;
  }

  return reminderDate;
};

// ============================================================
// API
// ============================================================
const API_BASE_URL = "https://todolistbackend-855c.onrender.com/";

// ============================================================
// THEME
// ============================================================
const COLORS = {
  // Matched to the original green login-page theme.
  bg: "#EAFBF4",
  surface: "#FFFFFF",
  ink: "#064E3B",
  sub: "#648477",
  mute: "#8BA99B",
  line: "#D5E9DF",
  chip: "#D1FAE5",
  primary: "#10B981",
  primarySoft: "#D1FAE5",
  hero: "#064E3B",
  heroSoft: "#047857",
  today: "#059669",
  upcoming: "#0EA5E9",
  done: "#047857",
  danger: "#F16B6B",
  dangerSoft: "#FDECEC",
  amber: "#E9A23B",
};

// Shared short alias used by the existing screen styles.
const C = COLORS;
const NOTE_IMAGE_PATTERNS: Record<
  string,
  "plain" | "lined" | "dotted" | "grid"
> = {
  // Patterns are assigned by image ID; the gallery currently uses cute1–cute19.
  cute1: "lined",
  cute2: "dotted",
  cute3: "grid",
  cute4: "plain",
  cute5: "lined",
  cute6: "dotted",
  cute7: "grid",
  cute8: "lined",
  cute9: "dotted",
  cute10: "grid",
  cute11: "plain",
  cute12: "lined",
  cute13: "dotted",
  cute14: "grid",
  cute15: "lined",
  cute16: "dotted",
  cute17: "grid",
  cute18: "plain",
  cute19: "lined",
  // Also support the note1.jpg–note11.jpg naming scheme if you use those assets.
  "note1.jpg": "lined",
  "note2.jpg": "dotted",
  "note3.jpg": "grid",
  "note4.jpg": "plain",
  "note5.jpg": "lined",
  "note6.jpg": "dotted",
  "note7.jpg": "grid",
  "note8.jpg": "lined",
  "note9.jpg": "dotted",
  "note10.jpg": "grid",
  "note11.jpg": "plain",
};
// ============================================================
// TYPES
// ============================================================
type Todo = {
  _id?: string;
  tdlId: string;
  userId?: string;
  title?: string | null;
  date?: string | null;
  text?: string | null;
  type?: string[];
  fileIds?: string[];
  alarm?: string | null;
  reminderDate?: string | null;
  reminderTime?: string | null;
  recurring?: string | null;
  noteType?: string | null;
  isPin?: boolean | string;
  locked?: boolean;
  createdAt?: string;
  updatedAt?: string;
  status?: "Today" | "Upcoming" | "Completed" | string;
};

type NoteOrganizationMeta = {
  folderId?: string;
  categoryIds?: string[];
  tags?: string[];
  favorite?: boolean;
  archived?: boolean;
  trashed?: boolean;
  priority?: "Low" | "Medium" | "High";
  noteColor?: string;
  notePattern?: "plain" | "lined" | "dotted" | "grid";
  noteBackgroundImage?: string;
};

type NoteFolder = { id: string; name: string };
type NoteCategory = { id: string; name: string; color: string };
type OrganizationModalType = "folder" | "category" | "tag" | null;

type QuickNoteMeta = {
  isQuickNote?: boolean;
  quickNoteColor?: string;
  // Persisted by the Create Quick Note screen on this device.
  notePattern?: "plain" | "lined" | "dotted" | "grid" | string;
  backgroundImageUri?: string;
  noteBackgroundImage?: string;
  quickNoteTheme?: {
    id?: string;
    label?: string;
    kind?: string;
    colors?: string[] | null;
    pattern?: string | null;
    ink?: string | null;
    uri?: string | null;
    bg?: string | null;
  };
  quickNotePinned?: boolean;
  title?: string;
  updatedAt?: string;
};

type FilterType = "All" | "Today" | "Upcoming" | "Completed";

type SheetAction = {
  key: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  onPress: () => void;
};

// ============================================================
// HELPERS
// ============================================================
const getAuthorizationHeader = (value: string) => {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return clean.toLowerCase().startsWith("bearer ") ? clean : `Bearer ${clean}`;
};

const isValidDate = (value?: string | null) => {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
};

const formatTodoDate = (value?: string | null) => {
  if (!isValidDate(value)) return "No date";
  return new Date(value!).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};
const formatAlarm = (value?: string | null) => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    // If older data contains a plain HH:mm value, still convert it to AM/PM.
    return format12HourTime(String(value));
  }

  return `${date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  })} · ${date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}`;
};

const format12HourTime = (time: string): string => {
  if (!time) return "";

  // Handle 24-hour time, such as "14:30"
  const match = time.match(/^(\d{1,2}):(\d{2})$/);

  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (hours > 23 || minutes > 59) return time;

    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;

    return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
  }

  // Handle ISO date strings or other parseable time values
  const date = new Date(time);

  if (!Number.isNaN(date.getTime()) && time.includes("T")) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  return time;
};

const getTodoReminder = (todo: Todo) => {
  // Prefer the separate reminder fields when present so the saved date and time
  // are displayed consistently. Keep `alarm` as a backward-compatible fallback.
  const date = todo.reminderDate ? formatTodoDate(todo.reminderDate) : "";

  const time = todo.reminderTime
    ? format12HourTime(String(todo.reminderTime))
    : "";

  if (date && time) return `${date} · ${time}`;
  if (date) return date;
  if (time) return time;
  if (todo.alarm) return formatAlarm(todo.alarm);

  return "";
};

const getStatusMeta = (status?: string) => {
  switch (status) {
    case "Today":
      return { color: C.today, bg: "#E6F0FF", icon: "today" };
    case "Upcoming":
      return { color: C.upcoming, bg: "#F0E9FF", icon: "calendar" };
    case "Completed":
      return { color: C.done, bg: "#DDF7F3", icon: "checkmark-circle" };
    default:
      return { color: C.sub, bg: C.chip, icon: "ellipse-outline" };
  }
};

const PRIORITY_STYLE: Record<string, { color: string; bg: string }> = {
  High: { color: "#B91C1C", bg: "#FEE2E2" },
  Medium: { color: "#92400E", bg: "#FEF3C7" },
  Low: { color: "#166534", bg: "#DCFCE7" },
};

const CATEGORY_COLORS = [
  "#DBEAFE",
  "#DCFCE7",
  "#FEF3C7",
  "#FCE7F3",
  "#EDE9FE",
  "#FEE2E2",
  "#CCFBF1",
  "#E2E8F0",
];

// Local image assets used by the per-note background gallery.
const NOTE_BACKGROUND_IMAGES = [
  {
    id: "cute1",
    label: "Cute 1",
    category: "Cute",
    source: require("../../assets/images/cute1.jpg"),
  },
  {
    id: "cute2",
    label: "Cute 2",
    category: "Cute",
    source: require("../../assets/images/cute2.jpg"),
  },
  {
    id: "cute3",
    label: "Cute 3",
    category: "Cute",
    source: require("../../assets/images/cute3.jpg"),
  },
  {
    id: "cute4",
    label: "Cute 4",
    category: "Cute",
    source: require("../../assets/images/cute4.jpg"),
  },
  {
    id: "cute5",
    label: "Cute 5",
    category: "Cute",
    source: require("../../assets/images/cute5.jpg"),
  },
  {
    id: "cute6",
    label: "Cute 6",
    category: "Cute",
    source: require("../../assets/images/cute6.jpg"),
  },
  {
    id: "cute7",
    label: "Cute 7",
    category: "Cute",
    source: require("../../assets/images/cute7.jpg"),
  },
  {
    id: "cute8",
    label: "Cute 8",
    category: "Cute",
    source: require("../../assets/images/cute8.jpg"),
  },
  {
    id: "cute9",
    label: "Cute 9",
    category: "Cute",
    source: require("../../assets/images/cute9.jpg"),
  },
  {
    id: "cute10",
    label: "Cute 10",
    category: "Cute",
    source: require("../../assets/images/cute10.jpg"),
  },
  {
    id: "cute11",
    label: "Cute 11",
    category: "Cute",
    source: require("../../assets/images/cute11.jpg"),
  },
  {
    id: "cute12",
    label: "Cute 12",
    category: "Cute",
    source: require("../../assets/images/cute12.jpg"),
  },
  {
    id: "cute13",
    label: "Cute 13",
    category: "Cute",
    source: require("../../assets/images/cute13.jpg"),
  },
  {
    id: "cute14",
    label: "Cute 14",
    category: "Cute",
    source: require("../../assets/images/cute14.jpg"),
  },
  {
    id: "cute15",
    label: "Cute 15",
    category: "Cute",
    source: require("../../assets/images/cute15.jpg"),
  },
  {
    id: "cute16",
    label: "Cute 16",
    category: "Cute",
    source: require("../../assets/images/cute16.jpg"),
  },
  {
    id: "cute17",
    label: "Cute 17",
    category: "Cute",
    source: require("../../assets/images/cute17.jpg"),
  },
  {
    id: "cute18",
    label: "Cute 18",
    category: "Cute",
    source: require("../../assets/images/cute18.jpg"),
  },
  {
    id: "cute19",
    label: "Cute 19",
    category: "Cute",
    source: require("../../assets/images/cute19.jpg"),
  },
];
const NOTE_BACKGROUND_CATEGORIES = ["All", "Cute"];

// ============================================================
// SCREEN
// ============================================================
export default function ViewTodolistScreen() {
  const {
    theme: sharedTheme,
    isDark,
    colors: sharedColors,
    setTheme,
  } = useAppTheme();
  const appTheme: "light" | "dark" = isDark ? "dark" : "light";

  const [todos, setTodos] = useState<Todo[]>([]);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("All");
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [quickNoteMeta, setQuickNoteMeta] = useState<
    Record<string, QuickNoteMeta>
  >({});
  const [sortBy, setSortBy] = useState<
    "date" | "title" | "modified" | "priority"
  >("date");
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [gridLayout, setGridLayout] = useState(false);
  const [calendarView, setCalendarView] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [organizationMeta, setOrganizationMeta] = useState<
    Record<string, NoteOrganizationMeta>
  >({});
  const [noteFolders, setNoteFolders] = useState<NoteFolder[]>([]);
  const [noteCategories, setNoteCategories] = useState<NoteCategory[]>([]);
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [organizationModal, setOrganizationModal] =
    useState<OrganizationModalType>(null);
  const [organizationInput, setOrganizationInput] = useState("");
  const [editingOrganizationId, setEditingOrganizationId] = useState<
    string | null
  >(null);
  const [selectedOrganizationColor, setSelectedOrganizationColor] = useState(
    CATEGORY_COLORS[0],
  );
  const [tagTodoId, setTagTodoId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [actionTodo, setActionTodo] = useState<Todo | null>(null);
  const [reminderTodo, setReminderTodo] = useState<Todo | null>(null);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [reminderDateValue, setReminderDateValue] = useState(new Date());
  const [reminderTimeValue, setReminderTimeValue] = useState(() => {
    const next = new Date();
    next.setMinutes(next.getMinutes() + 5, 0, 0);
    return next;
  });
  const [reminderBusy, setReminderBusy] = useState(false);
  const [lockDialogVisible, setLockDialogVisible] = useState(false);
  const [lockDialogMode, setLockDialogMode] = useState<
    "lock" | "unlock" | "changePin"
  >("lock");
  const [lockTarget, setLockTarget] = useState<Todo | null>(null);
  const [currentLockPin, setCurrentLockPin] = useState("");
  const [newLockPin, setNewLockPin] = useState("");
  const [confirmLockPin, setConfirmLockPin] = useState("");
  const [lockRequestBusy, setLockRequestBusy] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [selectedSketchUri, setSelectedSketchUri] = useState<string | null>(
    null,
  );

  const [appearanceVisible, setAppearanceVisible] = useState(false);
  const [backgroundGalleryVisible, setBackgroundGalleryVisible] =
    useState(false);
  const [backgroundCategory, setBackgroundCategory] = useState("All");
  const [accentColor, setAccentColor] = useState(C.primary);
  const [defaultNoteColor, setDefaultNoteColor] = useState("#FFF8DC");
  const [notePattern, setNotePattern] = useState<
    "plain" | "lined" | "dotted" | "grid"
  >("plain");
  const [notebookStyle, setNotebookStyle] = useState<
    "classic" | "minimal" | "rounded"
  >("rounded");
  const [noteFontSize, setNoteFontSize] = useState<
    "small" | "medium" | "large"
  >("medium");
  const [noteFontFamily, setNoteFontFamily] = useState<
    "System" | "serif" | "monospace"
  >("System");

  const [showHero, setShowHero] = useState(true);
  const [showQuickNotes, setShowQuickNotes] = useState(true);
  const [showCategories, setShowCategories] = useState(true);
  const [homeLayoutDensity, setHomeLayoutDensity] = useState<
    "compact" | "comfortable" | "spacious"
  >("comfortable");
  const [showHomeGreeting, setShowHomeGreeting] = useState(true);
  const appearanceColors = [
    "#FFF8DC",
    "#FFFFFF",
    "#FDE2E4",
    "#E0F2FE",
    "#DCFCE7",
    "#EDE9FE",
    "#FEF3C7",
    "#F3E8FF",
    "#F1F5F9",
    "#D1FAE5",
    "#FFE4E6",
    "#DBEAFE",
  ];

  const saveAppearance = useCallback(
    async (patch: Record<string, any>) => {
      const next = {
        appTheme,
        accentColor,
        defaultNoteColor,
        notePattern,
        notebookStyle,
        noteFontSize,
        noteFontFamily,
        showHero,
        showQuickNotes,
        showCategories,
        homeLayout: homeLayoutDensity,
        showHomeGreeting,
        showHomeStats: showHero,
        ...patch,
      };
      try {
        await AsyncStorage.setItem(
          "notes:appearance-settings",
          JSON.stringify(next),
        );
      } catch (error) {
        console.warn("Could not save appearance settings", error);
      }
    },
    [
      appTheme,
      accentColor,
      defaultNoteColor,
      notePattern,
      notebookStyle,
      noteFontSize,
      noteFontFamily,
      showHero,
      showQuickNotes,
      showCategories,
      homeLayoutDensity,
      showHomeGreeting,
    ],
  );

  const updateAppearance = useCallback(
    (patch: Record<string, any>) => {
      if (patch.appTheme !== undefined)
        void setTheme(patch.appTheme === "dark" ? "Dark" : "Light");
      if (patch.accentColor !== undefined) setAccentColor(patch.accentColor);
      if (patch.defaultNoteColor !== undefined)
        setDefaultNoteColor(patch.defaultNoteColor);
      if (patch.notePattern !== undefined) setNotePattern(patch.notePattern);
      if (patch.notebookStyle !== undefined)
        setNotebookStyle(patch.notebookStyle);
      if (patch.noteFontSize !== undefined) setNoteFontSize(patch.noteFontSize);
      if (patch.noteFontFamily !== undefined)
        setNoteFontFamily(patch.noteFontFamily);

      if (patch.showHero !== undefined) setShowHero(patch.showHero);
      if (patch.showQuickNotes !== undefined)
        setShowQuickNotes(patch.showQuickNotes);
      if (patch.showCategories !== undefined)
        setShowCategories(patch.showCategories);
      void saveAppearance(patch);
    },
    [saveAppearance, setTheme],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const raw = await AsyncStorage.getItem("notes:appearance-settings");
          if (!active || !raw) return;
          const a = JSON.parse(raw);
          if (a.accentColor) setAccentColor(a.accentColor);
          if (a.defaultNoteColor) setDefaultNoteColor(a.defaultNoteColor);
          if (["plain", "lined", "dotted", "grid"].includes(a.notePattern))
            setNotePattern(a.notePattern);
          if (["classic", "minimal", "rounded"].includes(a.notebookStyle))
            setNotebookStyle(a.notebookStyle);
          if (["small", "medium", "large"].includes(a.noteFontSize))
            setNoteFontSize(a.noteFontSize);
          if (["System", "serif", "monospace"].includes(a.noteFontFamily))
            setNoteFontFamily(a.noteFontFamily);
          if (typeof a.showHero === "boolean") setShowHero(a.showHero);
          if (typeof a.showQuickNotes === "boolean")
            setShowQuickNotes(a.showQuickNotes);
          if (typeof a.showCategories === "boolean")
            setShowCategories(a.showCategories);
          if (
            a.homeLayout === "compact" ||
            a.homeLayout === "comfortable" ||
            a.homeLayout === "spacious"
          )
            setHomeLayoutDensity(a.homeLayout);
          if (typeof a.showHomeGreeting === "boolean")
            setShowHomeGreeting(a.showHomeGreeting);
        } catch (error) {
          console.warn("Could not load appearance settings", error);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  // Alerts/modals can't open while another Modal is closing on iOS, so defer.
  const afterModal = useCallback((fn: () => void) => {
    setTimeout(fn, 260);
  }, []);

  // ==========================================================
  // AUTH + LOAD
  // ==========================================================
  const loadAuth = useCallback(async () => {
    try {
      const storedToken = await AsyncStorage.getItem("login_token");
      if (storedToken) setToken(storedToken);
      return storedToken || "";
    } catch (error) {
      console.error("❌ LOAD AUTH ERROR:", error);
      return "";
    }
  }, []);

  const mergeTodos = (localItems: Todo[], serverItems: Todo[]): Todo[] => {
    const serverKeys = new Set(
      serverItems.map((item) => String(item.tdlId || item._id || "")),
    );
    const visibleLocalItems = localItems.filter(
      (item) => !serverKeys.has(String(item.tdlId || item._id || "")),
    );
    return [...visibleLocalItems, ...serverItems];
  };

  const loadTodos = useCallback(
    async (showLoader = true) => {
      let localTodos: Todo[] = [];
      let cachedTodos: Todo[] = [];
      let currentToken = token;
      let hasRenderedLocalData = false;

      try {
        if (showLoader) setLoading(true);

        // Read token + cached data together to avoid serial AsyncStorage round trips.
        const stored = await AsyncStorage.multiGet([
          "login_token",
          "local_todos",
          "view_todolist_cache",
        ]);
        const values = Object.fromEntries(stored) as Record<
          string,
          string | null
        >;
        currentToken = currentToken || values["login_token"] || "";
        if (currentToken && currentToken !== token) setToken(currentToken);

        try {
          const parsedLocal = values["local_todos"]
            ? JSON.parse(values["local_todos"]!)
            : [];
          localTodos = Array.isArray(parsedLocal)
            ? parsedLocal.filter(
                (item: any) => item && (item.tdlId || item._id),
              )
            : [];
        } catch (e) {
          console.warn("Could not read local notes:", e);
        }

        try {
          const parsedCache = values["view_todolist_cache"]
            ? JSON.parse(values["view_todolist_cache"]!)
            : [];
          cachedTodos = Array.isArray(parsedCache)
            ? parsedCache.filter(
                (item: any) => item && (item.tdlId || item._id),
              )
            : [];
        } catch (e) {
          console.warn("Could not read cached notes:", e);
        }

        // Show cached notes immediately while the server refresh happens in the background.
        const initialItems = mergeTodos(localTodos, cachedTodos);
        if (initialItems.length > 0) {
          setTodos(initialItems);
          setLoading(false);
          hasRenderedLocalData = true;
        }

        if (!currentToken) {
          if (!hasRenderedLocalData) setLoading(false);
          return;
        }

        const response = await axios.get(`${API_BASE_URL}/api/todolist`, {
          headers: { Authorization: getAuthorizationHeader(currentToken) },
          timeout: 10000,
        });

        if (response.data?.success === true) {
          const payload = response.data?.data;
          const taskList = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.tasks)
              ? payload.tasks
              : [];
          const serverTodos: Todo[] = taskList.filter(
            (item: any) => item && (item.tdlId || item._id),
          );
          const mergedTodos = mergeTodos(localTodos, serverTodos);
          setTodos(mergedTodos);
          // Persist a small JSON snapshot so the next screen opening feels instant.
          void AsyncStorage.setItem(
            "view_todolist_cache",
            JSON.stringify(serverTodos),
          ).catch(() => {});
        } else {
          setTodos(mergeTodos(localTodos, cachedTodos));
        }
      } catch (error: any) {
        console.error(
          "❌ LOAD TODOS ERROR:",
          error?.response?.data || error?.message || error,
        );
        setTodos((previous) =>
          previous.length ? previous : mergeTodos(localTodos, cachedTodos),
        );
        // Do not interrupt the user with an alert for a slow/offline refresh.
        // Cached/local notes remain visible and the user can pull to refresh again.
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  const getTodoKey = (todo: any): string =>
    String(todo?.tdlId ?? todo?._id ?? todo?.id ?? todo?.title ?? "");
  const getQuickNoteMeta = useCallback(
    (todo: Todo): QuickNoteMeta => {
      const id = getTodoKey(todo);
      const titleKey = String(todo.title || "")
        .trim()
        .toLowerCase();
      const localMeta = quickNoteMeta[id] || quickNoteMeta[titleKey] || {};
      const data: any = todo;
      return {
        ...localMeta,
        isQuickNote:
          localMeta.isQuickNote ??
          (data.noteType === "quick" ||
            data.note_type === "quick" ||
            data.quickNote === true),
        quickNoteColor: localMeta.quickNoteColor || data.quickNoteColor,
        notePattern: localMeta.notePattern || data.notePattern,
        backgroundImageUri:
          localMeta.backgroundImageUri || data.backgroundImageUri,
        noteBackgroundImage:
          localMeta.noteBackgroundImage || data.noteBackgroundImage,
        quickNoteTheme:
          localMeta.quickNoteTheme || data.quickNoteTheme || data.theme,
      };
    },
    [getTodoKey, quickNoteMeta],
  );
  useEffect(() => {
    loadAuth();
    loadTodos(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncChecklistWidget = async () => {
      try {
        const checklistTasks = todos
          .filter((todo) => {
            const meta = organizationMeta[getTodoKey(todo)] || {};

            return (
              !meta.archived &&
              !meta.trashed &&
              getQuickNoteMeta(todo).isQuickNote !== true
            );
          })
          .slice(0, 5)
          .map((todo) => ({
            id: String(todo.tdlId || todo._id || ""),
            title: String(todo.title || "Untitled task"),
            status: todo.status,
            completed: todo.status === "Completed",
          }))
          .filter((task) => task.id.length > 0);

        // IMPORTANT: Replace "token" with your actual AsyncStorage
        // authentication-token key if it has a different name.
        const authToken = await AsyncStorage.getItem("login_token");

        if (cancelled) return;

        if (!authToken) {
          console.warn(
            "Checklist widget sync skipped: authentication token not found.",
          );
          return;
        }

        await updateChecklistHomeWidget(checklistTasks, authToken);
      } catch (error) {
        console.error("Checklist widget synchronization failed:", error);
      }
    };

    void syncChecklistWidget();

    return () => {
      cancelled = true;
    };
  }, [todos, organizationMeta, getTodoKey, getQuickNoteMeta]);

  const getOrganizationMeta = useCallback(
    (todo: Todo): NoteOrganizationMeta =>
      organizationMeta[getTodoKey(todo)] || {},
    [getTodoKey, organizationMeta],
  );

  // ==========================================================
  // ORGANIZATION (local)
  // ==========================================================
  const persistOrganization = useCallback(
    async (
      nextMeta: Record<string, NoteOrganizationMeta>,
      nextFolders = noteFolders,
      nextCategories = noteCategories,
    ) => {
      setOrganizationMeta(nextMeta);
      setNoteFolders(nextFolders);
      setNoteCategories(nextCategories);
      try {
        await AsyncStorage.multiSet([
          ["notes:organization-meta", JSON.stringify(nextMeta)],
          ["notes:folders", JSON.stringify(nextFolders)],
          ["notes:categories", JSON.stringify(nextCategories)],
        ]);
      } catch {
        Alert.alert(
          "Save failed",
          "Could not save note organization on this device.",
        );
      }
    },
    [noteFolders, noteCategories],
  );

  useEffect(() => {
    void (async () => {
      try {
        const pairs = await AsyncStorage.multiGet([
          "notes:organization-meta",
          "notes:folders",
          "notes:categories",
        ]);
        const stored: Record<string, string | null> = Object.fromEntries(pairs);
        if (stored["notes:organization-meta"])
          setOrganizationMeta(JSON.parse(stored["notes:organization-meta"]!));
        if (stored["notes:folders"])
          setNoteFolders(JSON.parse(stored["notes:folders"]!));
        if (stored["notes:categories"])
          setNoteCategories(JSON.parse(stored["notes:categories"]!));
      } catch (error) {
        console.warn("Could not load local note organization metadata", error);
      }
    })();
  }, []);

  const updateNoteMeta = useCallback(
    async (todo: Todo, patch: Partial<NoteOrganizationMeta>) => {
      const id = getTodoKey(todo);
      if (!id) return;
      const next = {
        ...organizationMeta,
        [id]: { ...(organizationMeta[id] || {}), ...patch },
      };
      await persistOrganization(next);
    },
    [getTodoKey, organizationMeta, persistOrganization],
  );

  const selectBackgroundForActionTodo = useCallback(
    async (backgroundId: string) => {
      if (!actionTodo) {
        setBackgroundGalleryVisible(false);
        return;
      }

      // Selecting an image also assigns its matching pattern to this note.
      // Both values are saved in this note's local metadata.
      const notePattern = NOTE_IMAGE_PATTERNS[backgroundId] ?? "plain";
      await updateNoteMeta(actionTodo, {
        noteBackgroundImage: backgroundId,
        notePattern,
      });

      setBackgroundGalleryVisible(false);
      setAppearanceVisible(false);
      setActionTodo(null);
    },
    [actionTodo, updateNoteMeta],
  );

  const clearBackgroundForActionTodo = useCallback(async () => {
    if (actionTodo)
      await updateNoteMeta(actionTodo, { noteBackgroundImage: undefined });
    setBackgroundGalleryVisible(false);
  }, [actionTodo, updateNoteMeta]);

  const openOrganizationEditor = useCallback(
    (type: Exclude<OrganizationModalType, null>, id?: string) => {
      setOrganizationModal(type);
      setEditingOrganizationId(id || null);
      if (type === "folder") {
        setOrganizationInput(noteFolders.find((x) => x.id === id)?.name || "");
      } else if (type === "category") {
        const item = noteCategories.find((x) => x.id === id);
        setOrganizationInput(item?.name || "");
        setSelectedOrganizationColor(item?.color || CATEGORY_COLORS[0]);
      } else {
        setOrganizationInput("");
      }
    },
    [noteFolders, noteCategories],
  );

  const saveOrganizationEditor = useCallback(async () => {
    const name = organizationInput.trim();
    if (!name) {
      Alert.alert("Name required", "Please enter a name.");
      return;
    }
    const id = editingOrganizationId || `${organizationModal}-${Date.now()}`;
    if (organizationModal === "folder") {
      const next = editingOrganizationId
        ? noteFolders.map((item) => (item.id === id ? { ...item, name } : item))
        : [...noteFolders, { id, name }];
      await persistOrganization(organizationMeta, next, noteCategories);
    } else if (organizationModal === "category") {
      const next = editingOrganizationId
        ? noteCategories.map((item) =>
            item.id === id
              ? { ...item, name, color: selectedOrganizationColor }
              : item,
          )
        : [...noteCategories, { id, name, color: selectedOrganizationColor }];
      await persistOrganization(organizationMeta, noteFolders, next);
    } else if (organizationModal === "tag" && editingOrganizationId) {
      const isEdit = editingOrganizationId.includes("::");
      const noteId = isEdit
        ? editingOrganizationId.split("::")[0]
        : editingOrganizationId;
      const oldTag = isEdit
        ? editingOrganizationId.slice(editingOrganizationId.indexOf("::") + 2)
        : "";
      const current = organizationMeta[noteId] || {};
      const tags = current.tags || [];
      const nextTags = isEdit
        ? tags.map((tag) => (tag === oldTag ? name : tag))
        : [...tags, name];
      await persistOrganization({
        ...organizationMeta,
        [noteId]: { ...current, tags: Array.from(new Set(nextTags)) },
      });
      // Stay in the tag manager so several tags can be added in a row.
      setEditingOrganizationId(noteId);
      setOrganizationInput("");
      return;
    }
    setOrganizationModal(null);
    setOrganizationInput("");
  }, [
    organizationInput,
    editingOrganizationId,
    organizationModal,
    noteFolders,
    noteCategories,
    organizationMeta,
    persistOrganization,
    selectedOrganizationColor,
  ]);

  const chooseFolderForNote = useCallback(
    (todo: Todo) => {
      Alert.alert("Move note", "Choose a destination folder", [
        {
          text: "No folder",
          onPress: () => void updateNoteMeta(todo, { folderId: undefined }),
        },
        ...noteFolders.map((folder) => ({
          text: folder.name,
          onPress: () => void updateNoteMeta(todo, { folderId: folder.id }),
        })),
        { text: "Cancel", style: "cancel" as const },
      ]);
    },
    [noteFolders, updateNoteMeta],
  );

  const chooseCategoryForNote = useCallback(
    (todo: Todo) => {
      const current = getOrganizationMeta(todo).categoryIds || [];
      if (!noteCategories.length) {
        Alert.alert(
          "No categories yet",
          "Create one from the menu (⋮) → New category.",
        );
        return;
      }
      Alert.alert("Categories", "Tap a category to add or remove it.", [
        ...noteCategories.map((category) => ({
          text: `${current.includes(category.id) ? "✓ " : ""}${category.name}`,
          onPress: () =>
            void updateNoteMeta(todo, {
              categoryIds: current.includes(category.id)
                ? current.filter((id) => id !== category.id)
                : [...current, category.id],
            }),
        })),
        { text: "Cancel", style: "cancel" as const },
      ]);
    },
    [getOrganizationMeta, noteCategories, updateNoteMeta],
  );

  const choosePriority = useCallback(
    (todo: Todo) => {
      Alert.alert("Priority", "Choose priority", [
        {
          text: "Low",
          onPress: () => void updateNoteMeta(todo, { priority: "Low" }),
        },
        {
          text: "Medium",
          onPress: () => void updateNoteMeta(todo, { priority: "Medium" }),
        },
        {
          text: "High",
          onPress: () => void updateNoteMeta(todo, { priority: "High" }),
        },
        {
          text: "Clear",
          onPress: () => void updateNoteMeta(todo, { priority: undefined }),
        },
        { text: "Cancel", style: "cancel" as const },
      ]);
    },
    [updateNoteMeta],
  );

  const manageTags = useCallback(
    (todo: Todo) => {
      setTagTodoId(getTodoKey(todo));
      setOrganizationModal("tag");
      setEditingOrganizationId(getTodoKey(todo));
      setOrganizationInput("");
    },
    [getTodoKey],
  );

  const moveToTrash = useCallback(
    (todo: Todo) => {
      Alert.alert(
        "Move to Trash",
        `Move “${todo.title || "Untitled note"}” to Trash?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Move to Trash",
            style: "destructive",
            onPress: () =>
              void updateNoteMeta(todo, { trashed: true, archived: false }),
          },
        ],
      );
    },
    [updateNoteMeta],
  );

  const restoreFromTrash = useCallback(
    (todo: Todo) => {
      void updateNoteMeta(todo, { trashed: false });
    },
    [updateNoteMeta],
  );

  const permanentlyDeleteTodo = useCallback(
    (todo: Todo) => {
      Alert.alert(
        "Delete forever",
        `“${todo.title || "Untitled note"}” will be permanently deleted. This can't be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete forever",
            style: "destructive",
            onPress: async () => {
              const id = getTodoKey(todo);
              try {
                const currentToken =
                  token || (await AsyncStorage.getItem("login_token")) || "";
                if (currentToken && todo.tdlId) {
                  const response = await axios.post(
                    `${API_BASE_URL}/api/deleteTodos/${encodeURIComponent(todo.tdlId)}`,
                    {},
                    {
                      headers: {
                        Authorization: getAuthorizationHeader(currentToken),
                      },
                    },
                  );
                  if (response.data?.success !== true)
                    throw new Error("Backend deletion failed");
                }
                const next = { ...organizationMeta };
                delete next[id];
                await persistOrganization(next);
                setTodos((items) =>
                  items.filter((item) => getTodoKey(item) !== id),
                );
              } catch (error: any) {
                Alert.alert(
                  "Delete failed",
                  error?.response?.data?.message ||
                    error?.message ||
                    "Could not permanently delete this note.",
                );
              }
            },
          },
        ],
      );
    },
    [getTodoKey, organizationMeta, persistOrganization, token],
  );

  const deleteFolder = useCallback(
    (folder: NoteFolder) => {
      Alert.alert(
        "Delete folder",
        `Delete “${folder.name}”? Notes stay and become unfiled.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              const nextMeta = { ...organizationMeta };
              Object.keys(nextMeta).forEach((id) => {
                if (nextMeta[id].folderId === folder.id)
                  nextMeta[id] = { ...nextMeta[id], folderId: undefined };
              });
              await persistOrganization(
                nextMeta,
                noteFolders.filter((item) => item.id !== folder.id),
                noteCategories,
              );
              if (collectionFilter === folder.id) setCollectionFilter("all");
            },
          },
        ],
      );
    },
    [
      organizationMeta,
      noteFolders,
      noteCategories,
      persistOrganization,
      collectionFilter,
    ],
  );

  const deleteCategory = useCallback(
    (category: NoteCategory) => {
      Alert.alert(
        "Delete category",
        `Remove “${category.name}” from all notes?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              const nextMeta = { ...organizationMeta };
              Object.keys(nextMeta).forEach((id) => {
                nextMeta[id] = {
                  ...nextMeta[id],
                  categoryIds: (nextMeta[id].categoryIds || []).filter(
                    (cid) => cid !== category.id,
                  ),
                };
              });
              await persistOrganization(
                nextMeta,
                noteFolders,
                noteCategories.filter((item) => item.id !== category.id),
              );
              if (categoryFilter === category.id) setCategoryFilter("all");
            },
          },
        ],
      );
    },
    [
      organizationMeta,
      noteFolders,
      noteCategories,
      persistOrganization,
      categoryFilter,
    ],
  );

  // ==========================================================
  // QUICK NOTES / PINS
  // ==========================================================

  const loadQuickNoteMetadata = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const metaKeys = keys.filter((key) => key.startsWith("quick-note-meta:"));
      const entries = await AsyncStorage.multiGet(metaKeys);
      const next: Record<string, QuickNoteMeta> = {};
      for (const [key, value] of entries) {
        if (!value) continue;
        try {
          const meta = JSON.parse(value) as QuickNoteMeta;
          next[key.slice("quick-note-meta:".length)] = meta;
          if (meta.title) next[meta.title.trim().toLowerCase()] = meta;
        } catch {
          /* Ignore malformed local metadata. */
        }
      }
      setQuickNoteMeta(next);
    } catch (error) {
      console.warn("Unable to load quick-note metadata:", error);
    }
  }, []);

  useEffect(() => {
    void AsyncStorage.getItem("notes:pinnedIds")
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed))
            setPinnedIds(parsed.filter((id) => typeof id === "string"));
        }
      })
      .catch(() => undefined);
    void loadQuickNoteMetadata();
  }, [loadQuickNoteMetadata]);

  const togglePin = useCallback(
    async (todo: Todo) => {
      const id = getTodoKey(todo);
      if (!id) return;
      const meta = getQuickNoteMeta(todo);
      const isPinned = pinnedIds.includes(id) || meta.quickNotePinned === true;
      const next = isPinned
        ? pinnedIds.filter((value) => value !== id)
        : [...pinnedIds, id];
      setPinnedIds(next);
      try {
        await AsyncStorage.setItem("notes:pinnedIds", JSON.stringify(next));
        if (meta.isQuickNote) {
          const updated = {
            ...meta,
            quickNotePinned: !isPinned,
            title: String(todo.title || ""),
          };
          await AsyncStorage.setItem(
            `quick-note-meta:${id}`,
            JSON.stringify(updated),
          );
          const titleKey = String(todo.title || "")
            .trim()
            .toLowerCase();
          if (titleKey)
            await AsyncStorage.setItem(
              `quick-note-meta:${titleKey}`,
              JSON.stringify(updated),
            );
          setQuickNoteMeta((current) => ({
            ...current,
            [id]: updated,
            [titleKey]: updated,
          }));
        }
      } catch {
        Alert.alert("Pin failed", "Could not save this pin on this device.");
      }
    },
    [getTodoKey, getQuickNoteMeta, pinnedIds],
  );

  const convertQuickNoteToTodo = useCallback(
    async (todo: Todo) => {
      const id = getTodoKey(todo);
      const meta = getQuickNoteMeta(todo);
      if (!id) return;
      const updated = {
        ...meta,
        isQuickNote: false,
        quickNotePinned: false,
        title: String(todo.title || ""),
        updatedAt: new Date().toISOString(),
      };
      try {
        await AsyncStorage.setItem(
          `quick-note-meta:${id}`,
          JSON.stringify(updated),
        );
        const titleKey = String(todo.title || "")
          .trim()
          .toLowerCase();
        if (titleKey)
          await AsyncStorage.setItem(
            `quick-note-meta:${titleKey}`,
            JSON.stringify(updated),
          );
        setQuickNoteMeta((current) => ({
          ...current,
          [id]: updated,
          [titleKey]: updated,
        }));
        setPinnedIds((current) => current.filter((value) => value !== id));
        const storedPins = await AsyncStorage.getItem("notes:pinnedIds");
        const nextPins = (
          storedPins ? (JSON.parse(storedPins) as string[]) : []
        ).filter((value) => value !== id);
        await AsyncStorage.setItem("notes:pinnedIds", JSON.stringify(nextPins));
        Alert.alert(
          "Converted to Todo",
          "Edit it to add a due date or reminder.",
        );
      } catch {
        Alert.alert(
          "Conversion failed",
          "Could not update this quick note on this device.",
        );
      }
    },
    [getTodoKey, getQuickNoteMeta],
  );

  // ==========================================================
  // NOTE LOCK / UNLOCK / CHANGE SECURITY PIN
  // ==========================================================
  const openLockDialog = useCallback(
    (todo: Todo, mode: "lock" | "unlock" | "changePin") => {
      // The backend security routes look up notes by `tdlId`, so do not send
      // MongoDB `_id` as a substitute when `tdlId` is missing.
      const id = String(todo.tdlId || "").trim();

      if (!id || id.startsWith("local-")) {
        Alert.alert(
          "Save note first",
          "Security locking is available for notes saved to your account. Save this note to the server first.",
        );
        return;
      }

      setLockTarget(todo);
      setLockDialogMode(mode);
      setCurrentLockPin("");
      setNewLockPin("");
      setConfirmLockPin("");
      setLockDialogVisible(true);
    },
    [],
  );

  const submitLockDialog = useCallback(async () => {
    if (!lockTarget || lockRequestBusy) return;

    // Backend route examples use findOne({ tdlId: req.params.id }).
    const id = String(lockTarget.tdlId || "").trim();

    if (!id || id.startsWith("local-")) {
      Alert.alert(
        "Invalid note",
        "This note does not have a valid server note ID. Save it to your account first.",
      );
      return;
    }

    const validPin = (value: string) => /^\d{4,6}$/.test(value);

    if (lockDialogMode === "lock" || lockDialogMode === "changePin") {
      if (!validPin(newLockPin)) {
        Alert.alert("Invalid PIN", "Enter a 4–6 digit numeric PIN.");
        return;
      }

      if (newLockPin !== confirmLockPin) {
        Alert.alert("PIN mismatch", "New PIN and confirmation do not match.");
        return;
      }
    }

    if (lockDialogMode === "unlock" || lockDialogMode === "changePin") {
      if (!validPin(currentLockPin)) {
        Alert.alert("Invalid PIN", "Enter your current 4–6 digit PIN.");
        return;
      }
    }

    let endpoint: "lockNote" | "unlockNote" | "changeLockPin";
    let body: Record<string, string>;

    if (lockDialogMode === "lock") {
      endpoint = "lockNote";
      body = { lockPin: newLockPin };
    } else if (lockDialogMode === "unlock") {
      endpoint = "unlockNote";
      body = { lockPin: currentLockPin };
    } else {
      endpoint = "changeLockPin";
      body = {
        currentPin: currentLockPin,
        newPin: newLockPin,
      };
    }

    setLockRequestBusy(true);

    try {
      const currentToken =
        token || (await AsyncStorage.getItem("login_token")) || "";

      if (!currentToken) {
        Alert.alert(
          "Sign in required",
          "Please sign in before changing note security.",
        );
        return;
      }

      const requestUrl = `${API_BASE_URL}/api/${endpoint}/${encodeURIComponent(id)}`;

      console.log("[Note security] Request:", endpoint, requestUrl);

      const response = await axios.post(requestUrl, body, {
        headers: {
          Authorization: getAuthorizationHeader(currentToken),
        },
        timeout: 12000,
      });

      if (response.data?.success !== true) {
        throw new Error(
          response.data?.message || "The security update failed.",
        );
      }

      const isLocked = lockDialogMode !== "unlock";

      setTodos((previousTodos) =>
        previousTodos.map((item) =>
          String(item.tdlId || "").trim() === id
            ? { ...item, locked: isLocked }
            : item,
        ),
      );

      // Update the local cache to avoid showing the note's content in the list
      // while locked. This is UI/cache hygiene, not a replacement for backend
      // authorization on note-content endpoints.
      try {
        const updateCache = (items: any[]) =>
          items.map((item) => {
            if (String(item?.tdlId || "").trim() !== id) return item;

            if (isLocked) {
              return {
                ...item,
                locked: true,
                title: "Locked note",
                text: "",
                fileIds: [],
                type: [],
              };
            }

            return { ...item, locked: false };
          });

        for (const key of ["view_todolist_cache", "local_todos"]) {
          const cacheRaw = await AsyncStorage.getItem(key);
          if (!cacheRaw) continue;

          try {
            const cached = JSON.parse(cacheRaw);
            if (Array.isArray(cached)) {
              await AsyncStorage.setItem(
                key,
                JSON.stringify(updateCache(cached)),
              );
            }
          } catch (parseError) {
            console.warn(`Could not parse ${key}`, parseError);
          }
        }
      } catch (cacheError) {
        console.warn("Could not update note security cache", cacheError);
      }

      setLockDialogVisible(false);
      setLockTarget(null);
      setCurrentLockPin("");
      setNewLockPin("");
      setConfirmLockPin("");

      const title =
        lockDialogMode === "lock"
          ? "Note locked"
          : lockDialogMode === "unlock"
            ? "Note unlocked"
            : "PIN changed";

      const message =
        lockDialogMode === "lock"
          ? "Your note is now locked."
          : lockDialogMode === "unlock"
            ? "Your note is now unlocked."
            : "Your security PIN has been changed.";

      Alert.alert(title, message);
      await loadTodos(false);
    } catch (error: any) {
      const status = error?.response?.status;
      const serverMessage = error?.response?.data?.message;
      console.error("[Note security] Failed:", {
        endpoint,
        id,
        status,
        url: error?.config?.url,
        response: error?.response?.data,
        message: error?.message,
      });

      let message = serverMessage || error?.message || "Please try again.";

      if (status === 404) {
        message =
          endpoint === "changeLockPin"
            ? "The change-security-PIN API was not found (404). Add the backend POST /api/changeLockPin/:id route and confirm it is mounted correctly."
            : `The ${endpoint} API returned 404. Confirm the backend route exists and that this note's tdlId matches a database record.`;
      }

      Alert.alert("Security update failed", message);
    } finally {
      setLockRequestBusy(false);
    }
  }, [
    lockTarget,
    lockRequestBusy,
    lockDialogMode,
    newLockPin,
    confirmLockPin,
    currentLockPin,
    token,
    loadTodos,
  ]);
  // ==========================================================
  // NOTE ACTIONS
  // ==========================================================
  const showDetails = useCallback(async (todo: Todo) => {
    const item = todo as any;

    setSelectedTodo(todo);
    setSelectedSketchUri(
      item.drawingUri ?? item.sketchUri ?? item.sketchImage ?? null,
    );
    setDetailsVisible(true);

    const todoId = item.tdlId ?? item.todoId ?? item._id ?? item.id;

    if (todoId == null) {
      console.warn("Todo ID missing; cannot load sketch");
      return;
    }

    try {
      const savedSketch = await AsyncStorage.getItem(
        `note-drawing:${String(todoId)}`,
      );

      if (savedSketch) {
        setSelectedSketchUri(savedSketch);
        console.log("Sketch loaded successfully:", savedSketch);
      } else {
        console.log("Sketch not found in local storage:", todoId);
      }
    } catch (error) {
      console.warn("Failed to load sketch:", error);
    }
  }, []);

  const duplicateTodo = useCallback(
    async (todo: Todo) => {
      try {
        const originalTitle = String(todo.title || "Untitled note").trim();

        const now = new Date().toISOString();

        const copy: Todo = {
          ...todo,
          tdlId: `local-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          _id: undefined,
          title: `${originalTitle} (Copy)`,
          text: String(todo.text || ""),
          date: todo.date || now.slice(0, 10),
          createdAt: now,
          updatedAt: now,
        };

        // Save the copy locally
        const storageKey = "local_todos";
        const storedTodos = await AsyncStorage.getItem(storageKey);

        const localTodos: Todo[] = storedTodos ? JSON.parse(storedTodos) : [];

        const nextLocalTodos = [
          copy,
          ...localTodos.filter(
            (item) =>
              String(item.tdlId || item._id || "") !== String(copy.tdlId),
          ),
        ];
        await AsyncStorage.setItem(storageKey, JSON.stringify(nextLocalTodos));

        // Show the new copy immediately and avoid duplicate entries in React state.
        setTodos((previousTodos) => [
          copy,
          ...previousTodos.filter(
            (item) =>
              String(item.tdlId || item._id || "") !== String(copy.tdlId),
          ),
        ]);

        Alert.alert("Duplicated", `"${copy.title}" was created locally.`);
      } catch (error: any) {
        Alert.alert(
          "Duplicate failed",
          error?.message || "Unable to duplicate note.",
        );
      }
    },
    [setTodos],
  );

  const editTodo = (todo: Todo) => {
    router.push({
      pathname: "/cretenote",
      params: { isEditMode: "true", editTodo: JSON.stringify(todo) },
    });
  };

  const hasReminder = (todo: Todo) =>
    Boolean(todo.alarm || todo.reminderDate || todo.reminderTime);

  // Manage only the reminder from this screen; the note itself is never edited.
  const openReminderEditor = (todo: Todo) => {
    const initialDate = todo.reminderDate || todo.date;
    const parsedDate = initialDate ? new Date(initialDate) : new Date();
    const safeDate = Number.isNaN(parsedDate.getTime())
      ? new Date()
      : parsedDate;
    const rawTime = String(todo.reminderTime || todo.alarm || "");
    const match = rawTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    const nextTime = new Date();
    if (match) {
      let hours = Number(match[1]) % 12;
      if ((match[3] || "").toUpperCase() === "PM") hours += 12;
      nextTime.setHours(hours, Number(match[2]), 0, 0);
    } else {
      nextTime.setMinutes(nextTime.getMinutes() + 5, 0, 0);
    }
    setReminderTodo(todo);
    setReminderDateValue(safeDate);
    setReminderTimeValue(nextTime);
    setReminderModalVisible(true);
  };

  const openReminderDatePicker = () => {
    DateTimePickerAndroid.open({
      value: reminderDateValue,
      mode: "date",
      minimumDate: new Date(new Date().setHours(0, 0, 0, 0)),
      onChange: (event, selectedDate) => {
        if (event.type === "set" && selectedDate)
          setReminderDateValue(selectedDate);
      },
    });
  };

  const openReminderTimePicker = () => {
    DateTimePickerAndroid.open({
      value: reminderTimeValue,
      mode: "time",
      is24Hour: false,
      onChange: (event, selectedTime) => {
        if (event.type === "set" && selectedTime)
          setReminderTimeValue(selectedTime);
      },
    });
  };

  const formatReminderDate = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const formatReminderTime = (value: Date) =>
    `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;

  const saveReminderFromView = async () => {
    if (!reminderTodo || reminderBusy) return;

    const id = String(reminderTodo.tdlId || reminderTodo._id || "").trim();

    if (!id || id.startsWith("local-")) {
      Alert.alert(
        "Save the note first",
        "Reminders can be added after this note has been saved to your account.",
      );
      return;
    }

    // Build date and time directly from the selected Date objects.
    const selectedDate = new Date(reminderDateValue);
    const selectedTime = new Date(reminderTimeValue);

    if (
      Number.isNaN(selectedDate.getTime()) ||
      Number.isNaN(selectedTime.getTime())
    ) {
      Alert.alert(
        "Invalid reminder",
        "Please select a valid reminder date and time.",
      );
      return;
    }

    const currentDate = [
      selectedDate.getFullYear(),
      String(selectedDate.getMonth() + 1).padStart(2, "0"),
      String(selectedDate.getDate()).padStart(2, "0"),
    ].join("-");

    const currentTime = [
      String(selectedTime.getHours()).padStart(2, "0"),
      String(selectedTime.getMinutes()).padStart(2, "0"),
    ].join(":");

    const alarmLabel = selectedTime.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

    // Combine the chosen calendar date and clock time in local time.
    const scheduledAt = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      selectedTime.getHours(),
      selectedTime.getMinutes(),
      0,
      0,
    );

    console.log("[Reminder] Device now:", new Date().toString());
    console.log("[Reminder] Selected date:", currentDate);
    console.log("[Reminder] Selected time:", currentTime);
    console.log("[Reminder] Scheduled date:", scheduledAt.toString());

    if (scheduledAt.getTime() <= Date.now()) {
      Alert.alert(
        "Choose a future time",
        "The selected reminder time has passed. Please choose a future date and time.",
      );
      return;
    }

    setReminderBusy(true);

    try {
      const currentToken =
        token || (await AsyncStorage.getItem("login_token")) || "";

      if (!currentToken) {
        throw new Error("Please sign in and try again.");
      }

      const headers = {
        Authorization: getAuthorizationHeader(currentToken),
      };

      const payload = {
        reminderDate: currentDate,
        reminderTime: currentTime,
        alarm: alarmLabel,
      };

      if (hasReminder(reminderTodo)) {
        await axios.post(
          `${API_BASE_URL}/api/editReminder/${encodeURIComponent(id)}`,
          payload,
          { headers, timeout: 15000 },
        );
      } else {
        await axios.post(
          `${API_BASE_URL}/api/addReminder/${encodeURIComponent(id)}`,
          payload,
          { headers, timeout: 15000 },
        );
      }

      // Keep existing date/time API endpoints in sync.
      await axios.post(
        `${API_BASE_URL}/api/setReminderDate/${encodeURIComponent(id)}`,
        { reminderDate: currentDate, date: currentDate },
        { headers, timeout: 15000 },
      );

      await axios.post(
        `${API_BASE_URL}/api/setReminderTime/${encodeURIComponent(id)}`,
        {
          reminderTime: currentTime,
          time: currentTime,
          alarm: alarmLabel,
        },
        { headers, timeout: 15000 },
      );

      let localNotificationError = "";

      try {
        await scheduleLocalReminderNotification(
          id,
          String(reminderTodo.title || "You have a task to do."),
          scheduledAt,
        );
      } catch (notificationError: any) {
        localNotificationError =
          notificationError?.message ||
          "The device notification could not be scheduled.";

        console.warn(
          "[Reminder] Local notification scheduling failed:",
          notificationError,
        );
      }

      const updated: Todo = {
        ...reminderTodo,
        reminderDate: currentDate,
        reminderTime: currentTime,
        alarm: alarmLabel,
        updatedAt: new Date().toISOString(),
      };

      setTodos((items) =>
        items.map((item) =>
          getTodoKey(item) === getTodoKey(reminderTodo) ? updated : item,
        ),
      );

      for (const key of ["view_todolist_cache", "local_todos"]) {
        try {
          const raw = await AsyncStorage.getItem(key);

          if (raw) {
            const parsed = JSON.parse(raw);

            if (Array.isArray(parsed)) {
              await AsyncStorage.setItem(
                key,
                JSON.stringify(
                  parsed.map((item: Todo) =>
                    getTodoKey(item) === getTodoKey(reminderTodo)
                      ? updated
                      : item,
                  ),
                ),
              );
            }
          }
        } catch (cacheError) {
          console.warn(
            `Could not update ${key} after saving reminder`,
            cacheError,
          );
        }
      }

      setReminderModalVisible(false);
      setReminderTodo(null);

      Alert.alert(
        localNotificationError
          ? "Reminder saved, notification not scheduled"
          : "Reminder saved",
        localNotificationError
          ? `The reminder was saved to your account, but this device could not schedule the notification. ${localNotificationError}`
          : `Reminder set for ${currentDate} at ${alarmLabel}.`,
      );
    } catch (error: any) {
      console.error(
        "[Reminder] Save failed:",
        error?.response?.data || error?.message || error,
      );

      Alert.alert(
        "Reminder failed",
        error?.response?.data?.message ||
          error?.message ||
          "Could not save this reminder.",
      );
    } finally {
      setReminderBusy(false);
    }
  };

  const handleSnooze = useCallback(
    async (todo: Todo, minutes: number) => {
      const id = String(todo.tdlId || todo._id || "").trim();

      if (!id || id.startsWith("local-")) {
        Alert.alert("Cannot snooze", "Save this note to your account first.");
        return;
      }

      try {
        const currentToken =
          token || (await AsyncStorage.getItem("login_token")) || "";

        if (!currentToken) {
          throw new Error("Please sign in and try again.");
        }

        const snoozedAt = new Date(Date.now() + minutes * 60 * 1000);
        const date = formatReminderDate(snoozedAt);
        const time = formatReminderTime(snoozedAt);
        const alarm = snoozedAt.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        });

        // Update the saved reminder on the server.
        await axios.post(
          `${API_BASE_URL}/api/snoozeReminder/${encodeURIComponent(id)}`,
          {
            reminderDate: date,
            reminderTime: time,
            snoozeMinutes: minutes,
            minutes,
          },
          {
            headers: {
              Authorization: getAuthorizationHeader(currentToken),
            },
            timeout: 15000,
          },
        );

        // Schedule the notification on this device.
        let notificationFailed = false;

        try {
          await scheduleLocalReminderNotification(
            id,
            String(todo.title || "You have a task to do."),
            snoozedAt,
          );
        } catch (notificationError: any) {
          notificationFailed = true;

          console.warn(
            "[Reminder] Snooze notification scheduling failed:",
            notificationError,
          );
        }

        const updated: Todo = {
          ...todo,
          reminderDate: date,
          reminderTime: time,
          alarm,
          updatedAt: new Date().toISOString(),
        };

        setTodos((items) =>
          items.map((item) =>
            getTodoKey(item) === getTodoKey(todo) ? updated : item,
          ),
        );

        Alert.alert(
          notificationFailed
            ? "Reminder snoozed on account"
            : "Reminder snoozed",
          notificationFailed
            ? `The reminder was moved ${minutes} minutes later on your account, but the device notification could not be scheduled. Check notification permissions and try again.`
            : `The reminder will notify you in ${minutes} minutes.`,
        );
      } catch (error: any) {
        console.error(
          "[Reminder] Snooze failed:",
          error?.response?.data || error?.message || error,
        );

        Alert.alert(
          "Snooze failed",
          error?.response?.data?.message ||
            error?.message ||
            "Could not snooze this reminder.",
        );
      }
    },
    [token, getTodoKey],
  );

  const snoozeReminder = useCallback(
    (todo: Todo) => {
      Alert.alert("Snooze reminder", "How long would you like to snooze?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "5 minutes",
          onPress: () => handleSnooze(todo, 5),
        },
        {
          text: "10 minutes",
          onPress: () => handleSnooze(todo, 10),
        },
        {
          text: "15 minutes",
          onPress: () => handleSnooze(todo, 15),
        },
      ]);
    },
    [handleSnooze],
  );

  const deleteReminder = useCallback(
    (todo: Todo) => {
      Alert.alert(
        "Delete reminder?",
        `Remove the reminder for “${todo.title || "Untitled note"}”? The note itself will remain.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete reminder",
            style: "destructive",
            onPress: async () => {
              const id = String(todo.tdlId || "").trim();
              if (!id || id.startsWith("local-")) {
                Alert.alert(
                  "Cannot update reminder",
                  "This note is not saved to your account yet. Open the note, clear its reminder, and save it.",
                );
                return;
              }

              try {
                const currentToken =
                  token || (await AsyncStorage.getItem("login_token")) || "";
                if (!currentToken)
                  throw new Error("Please sign in and try again.");

                await axios.post(
                  `${API_BASE_URL}/api/deleteReminder/${encodeURIComponent(id)}`,
                  {},
                  {
                    headers: {
                      Authorization: getAuthorizationHeader(currentToken),
                    },
                    timeout: 15000,
                  },
                );

                // Cancel every pending local notification belonging to this note.
                await cancelLocalReminderNotifications(id);

                const cleared = {
                  ...todo,
                  alarm: null,
                  reminderDate: null,
                  reminderTime: null,
                  recurring: "none",
                  updatedAt: new Date().toISOString(),
                };
                setTodos((items) =>
                  items.map((item) =>
                    getTodoKey(item) === getTodoKey(todo) ? cleared : item,
                  ),
                );
                for (const key of ["view_todolist_cache", "local_todos"]) {
                  try {
                    const raw = await AsyncStorage.getItem(key);
                    if (!raw) continue;
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                      await AsyncStorage.setItem(
                        key,
                        JSON.stringify(
                          parsed.map((item: Todo) =>
                            getTodoKey(item) === getTodoKey(todo)
                              ? cleared
                              : item,
                          ),
                        ),
                      );
                    }
                  } catch (cacheError) {
                    console.warn(
                      `Could not update ${key} after deleting reminder`,
                      cacheError,
                    );
                  }
                }
                Alert.alert(
                  "Reminder deleted",
                  "The reminder has been removed and its pending notifications cancelled.",
                );
              } catch (error: any) {
                console.error(
                  "[Reminder] Delete failed:",
                  error?.response?.data || error?.message || error,
                );
                Alert.alert(
                  "Delete failed",
                  error?.response?.data?.message ||
                    error?.message ||
                    "Could not delete this reminder.",
                );
              }
            },
          },
        ],
      );
    },
    [token, getTodoKey],
  );

  const addTodo = () => {
    setCreateModalVisible(true);
  };

  const createQuickNote = () => {
    setCreateModalVisible(false);

    router.push({
      pathname: "/quicknotes",
      params: { quickNote: "true" },
    });
  };

  const createTodoTask = () => {
    setCreateModalVisible(false);

    router.push({
      pathname: "/cretenote",
      params: { quickNote: "false" },
    });
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTodos(false);
  }, [loadTodos]);

  // ==========================================================
  // DERIVED DATA
  // ==========================================================
  const filteredTodos = useMemo(() => {
    let result = [...todos];

    const searchText = search.trim().toLowerCase();
    if (searchText) {
      result = result.filter(
        (todo) =>
          String(todo.title || "")
            .toLowerCase()
            .includes(searchText) ||
          String(todo.text || "")
            .toLowerCase()
            .includes(searchText),
      );
    }

    if (filter !== "All")
      result = result.filter((todo) => todo.status === filter);

    result = result.filter((todo) => {
      const meta = organizationMeta[getTodoKey(todo)] || {};
      if (collectionFilter === "favorites" && !meta.favorite) return false;
      if (collectionFilter === "archived" && !meta.archived) return false;
      if (collectionFilter === "trash" && !meta.trashed) return false;
      if (collectionFilter !== "trash" && meta.trashed) return false;
      if (
        collectionFilter !== "archived" &&
        collectionFilter !== "trash" &&
        meta.archived
      )
        return false;
      if (
        !["all", "favorites", "archived", "trash"].includes(collectionFilter) &&
        meta.folderId !== collectionFilter
      )
        return false;
      if (
        categoryFilter !== "all" &&
        !(meta.categoryIds || []).includes(categoryFilter)
      )
        return false;
      return true;
    });

    result.sort((a, b) => {
      const aKey = String(a.tdlId || a._id || "");
      const bKey = String(b.tdlId || b._id || "");

      const aTitleKey = String(a.title || "")
        .trim()
        .toLowerCase();
      const bTitleKey = String(b.title || "")
        .trim()
        .toLowerCase();

      const aMeta = quickNoteMeta[aKey] || quickNoteMeta[aTitleKey] || {};

      const bMeta = quickNoteMeta[bKey] || quickNoteMeta[bTitleKey] || {};

      // 1. Pinned notes always appear first
      const aPinned =
        pinnedIds.includes(aKey) || aMeta.quickNotePinned === true;

      const bPinned =
        pinnedIds.includes(bKey) || bMeta.quickNotePinned === true;

      if (aPinned !== bPinned) {
        return aPinned ? -1 : 1;
      }

      // 2. Quick Notes appear before regular notes
      const aQuick = aMeta.isQuickNote === true;
      const bQuick = bMeta.isQuickNote === true;

      if (aQuick !== bQuick) {
        return aQuick ? -1 : 1;
      }

      // 3. Apply the selected sort option
      switch (sortBy) {
        case "title":
          return String(a.title || "").localeCompare(
            String(b.title || ""),
            undefined,
            { sensitivity: "base" },
          );

        case "modified": {
          const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();

          const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();

          const safeATime = Number.isFinite(aTime) ? aTime : 0;
          const safeBTime = Number.isFinite(bTime) ? bTime : 0;

          // Most recently modified first
          return safeBTime - safeATime;
        }

        case "priority": {
          const rank: Record<string, number> = {
            High: 3,
            Medium: 2,
            Low: 1,
          };

          const aPriority = organizationMeta[getTodoKey(a)]?.priority || "";

          const bPriority = organizationMeta[getTodoKey(b)]?.priority || "";

          return (rank[bPriority] || 0) - (rank[aPriority] || 0);
        }

        case "date":
        default: {
          const aTime = a.date
            ? new Date(a.date).getTime()
            : Number.MAX_SAFE_INTEGER;

          const bTime = b.date
            ? new Date(b.date).getTime()
            : Number.MAX_SAFE_INTEGER;

          const safeATime = Number.isFinite(aTime)
            ? aTime
            : Number.MAX_SAFE_INTEGER;

          const safeBTime = Number.isFinite(bTime)
            ? bTime
            : Number.MAX_SAFE_INTEGER;

          // Earliest date first; notes without a date appear last
          return safeATime - safeBTime;
        }
      }
    });

    return result;
  }, [
    todos,
    search,
    filter,
    pinnedIds,
    sortBy,
    quickNoteMeta,
    organizationMeta,
    collectionFilter,
    categoryFilter,
    getTodoKey,
  ]);

  const quickNoteTodos = useMemo(
    () =>
      filteredTodos.filter(
        (todo) => getQuickNoteMeta(todo).isQuickNote === true,
      ),
    [filteredTodos, getQuickNoteMeta],
  );
  const regularTodos = useMemo(
    () =>
      filteredTodos.filter(
        (todo) => getQuickNoteMeta(todo).isQuickNote !== true,
      ),
    [filteredTodos, getQuickNoteMeta],
  );

  // Counts only cover active notes (not archived / trashed).
  const counts = useMemo(() => {
    const active = todos.filter((todo) => {
      const meta = organizationMeta[getTodoKey(todo)] || {};
      return !meta.trashed && !meta.archived;
    });
    return {
      all: active.length,
      today: active.filter((t) => t.status === "Today").length,
      upcoming: active.filter((t) => t.status === "Upcoming").length,
      completed: active.filter((t) => t.status === "Completed").length,
    };
  }, [todos, organizationMeta, getTodoKey]);

  const progress =
    counts.all > 0 ? Math.round((counts.completed / counts.all) * 100) : 0;

  const collectionLabel = useMemo(() => {
    if (collectionFilter === "all") return null;
    if (collectionFilter === "favorites") return "Favorites";
    if (collectionFilter === "archived") return "Archived";
    if (collectionFilter === "trash") return "Trash";
    return noteFolders.find((f) => f.id === collectionFilter)?.name || null;
  }, [collectionFilter, noteFolders]);

  const sortLabel = {
    date: "Date",
    title: "Title",
    modified: "Modified",
    priority: "Priority",
  }[sortBy];
  const cycleSort = () =>
    setSortBy((v) =>
      v === "date"
        ? "title"
        : v === "title"
          ? "modified"
          : v === "modified"
            ? "priority"
            : "date",
    );

  // ==========================================================
  // SHARE NOTE
  // ==========================================================
  // Read note content from common legacy field names as well as `text`.
  // Some older notes may store their body under `content` or `description`.

  const getShareableNoteText = useCallback(
    (todo: Todo, includeDetails = false) => {
      const data = todo as Todo & Record<string, any>;

      const title = String(data.title || data.name || "Untitled note").trim();

      const rawDescription = data.description ?? data.desc ?? "";

      const description =
        typeof rawDescription === "string"
          ? rawDescription.trim()
          : String(rawDescription || "").trim();

      const rawBody = data.text ?? data.content ?? data.note ?? data.body ?? "";

      const body =
        typeof rawBody === "string"
          ? rawBody.trim()
          : String(rawBody || "").trim();

      const lines: string[] = [
        `Title: ${title}`,
        ...(description ? ["", `Description: ${description}`] : []),
        ...(body ? ["", body] : []),
      ];

      if (includeDetails) {
        lines.push("", "──────────────", "📋 Note Details");

        // Date
        if (data.date) {
          lines.push(`📅 Date: ${formatTodoDate(data.date)}`);
        }

        // Status
        if (data.status) {
          lines.push(`📌 Status: ${data.status}`);
        }

        // Reminder
        const reminder = getTodoReminder(todo);
        if (reminder) {
          lines.push(`⏰ Reminder: ${reminder}`);
        }

        // Tags
        const tags = getOrganizationMeta(todo).tags || [];
        if (tags.length > 0) {
          lines.push(`🏷️ Tags: ${tags.join(", ")}`);
        }

        // Additional fields, when available
        if (data.category) {
          lines.push(`📂 Category: ${data.category}`);
        }

        if (data.folderName || data.folder) {
          lines.push(`📁 Folder: ${data.folderName || data.folder}`);
        }

        if (data.priority) {
          lines.push(`⚡ Priority: ${data.priority}`);
        }

        if (data.createdAt) {
          lines.push(`🗓️ Created: ${formatTodoDate(data.createdAt)}`);
        }

        if (data.updatedAt) {
          lines.push(`🔄 Updated: ${formatTodoDate(data.updatedAt)}`);
        }

        if (data.completedAt) {
          lines.push(`✅ Completed: ${formatTodoDate(data.completedAt)}`);
        }

        lines.push("", "Shared from Notes");
      }

      return lines.join("\n").trim();
    },
    [getOrganizationMeta],
  );

  const shareNoteAsText = useCallback(
    async (todo: Todo) => {
      if (todo.locked) {
        Alert.alert("Note locked", "Unlock this note before sharing it.");
        return;
      }
      const message = getShareableNoteText(todo, false);
      if (!message.trim()) {
        Alert.alert(
          "Nothing to share",
          "This note does not contain any text yet.",
        );
        return;
      }
      try {
        await Share.share({
          message,
          title: String(todo.title || "Untitled note"),
        });
      } catch (error: any) {
        Alert.alert(
          "Share failed",
          error?.message || "Could not share this note.",
        );
      }
    },
    [getShareableNoteText],
  );

  const shareNoteThroughOtherApps = useCallback(
    async (todo: Todo) => {
      if (todo.locked) {
        Alert.alert("Note locked", "Unlock this note before sharing it.");
        return;
      }

      const plainText = getShareableNoteText(todo, false);
      const detailedText = getShareableNoteText(todo, true);
      if (!plainText.trim()) {
        Alert.alert(
          "Nothing to share",
          "This note does not contain any text yet.",
        );
        return;
      }

      // Give the user useful choices instead of making both share actions feel identical.
      Alert.alert("Share note", "Choose how you want to share this note.", [
        {
          text: "Share text only",
          onPress: () => {
            void Share.share({
              message: plainText,
              title: String(todo.title || "Untitled note"),
            }).catch((error: any) =>
              Alert.alert(
                "Share failed",
                error?.message || "Could not share this note.",
              ),
            );
          },
        },
        {
          text: "Share with details",
          onPress: () => {
            void Share.share(
              {
                message: detailedText,
                title: String(todo.title || "Untitled note"),
              },
              { dialogTitle: "Share note with details" },
            ).catch((error: any) =>
              Alert.alert(
                "Share failed",
                error?.message || "Could not open the share menu.",
              ),
            );
          },
        },
        {
          text: "Copy note text",
          onPress: () => {
            void Clipboard.setStringAsync(detailedText)
              .then(() =>
                Alert.alert(
                  "Copied",
                  "The note text and details were copied. You can paste them into any app.",
                ),
              )
              .catch((error: any) =>
                Alert.alert(
                  "Copy failed",
                  error?.message || "Could not copy this note.",
                ),
              );
          },
        },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [getShareableNoteText],
  );

  // ==========================================================
  // ACTION SHEET CONTENT
  // ==========================================================
  const buildSheetActions = (todo: Todo): SheetAction[] => {
    const meta = getOrganizationMeta(todo);
    const quick = getQuickNoteMeta(todo);
    const id = getTodoKey(todo);
    const pinned = pinnedIds.includes(id) || quick.quickNotePinned === true;

    if (meta.trashed) {
      return [
        {
          key: "restore",
          label: "Restore",
          icon: "refresh",
          color: C.done,
          bg: "#DDF7F3",
          onPress: () => restoreFromTrash(todo),
        },
        {
          key: "forever",
          label: "Delete forever",
          icon: "trash-bin",
          color: C.danger,
          bg: C.dangerSoft,
          onPress: () => permanentlyDeleteTodo(todo),
        },
        {
          key: "details",
          label: "Details",
          icon: "eye",
          color: C.sub,
          bg: C.chip,
          onPress: () => showDetails(todo),
        },
      ];
    }

    // A locked note exposes only security actions. Details, edit, duplicate and
    // organization actions are intentionally unavailable until it is unlocked.
    if (todo.locked) {
      return [
        {
          key: "security",
          label: "Unlock note",
          icon: "lock-open-outline",
          color: C.done,
          bg: "#DDF7F3",
          onPress: () => openLockDialog(todo, "unlock"),
        },
        {
          key: "changePin",
          label: "Change PIN",
          icon: "key-outline",
          color: "#B45309",
          bg: "#FEF3C7",
          onPress: () => openLockDialog(todo, "changePin"),
        },
      ];
    }

    const list: SheetAction[] = [
      {
        key: "shareText",
        label: "Share as text",
        icon: "document-text-outline",
        color: C.primary,
        bg: C.primarySoft,
        onPress: () => void shareNoteAsText(todo),
      },
      {
        key: "shareApps",
        label: "Share with apps",
        icon: "share-social-outline",
        color: "#0F766E",
        bg: "#D5F5EF",
        onPress: () => void shareNoteThroughOtherApps(todo),
      },
      {
        key: "security",
        label: todo.locked ? "Unlock note" : "Lock note",
        icon: todo.locked ? "lock-open-outline" : "lock-closed-outline",
        color: "#7C3AED",
        bg: "#EDE9FE",
        onPress: () => openLockDialog(todo, todo.locked ? "unlock" : "lock"),
      },
      {
        key: "edit",
        label: "Edit",
        icon: "create-outline",
        color: C.primary,
        bg: C.primarySoft,
        onPress: () => {
          if (todo.locked) {
            Alert.alert("Note locked", "Unlock this note before editing it.");
          } else {
            editTodo(todo);
          }
        },
      },

      // Add or edit reminder
      {
        key: "addReminder",
        label: hasReminder(todo) ? "Edit reminder" : "Add reminder",
        icon: "alarm-outline",
        color: C.today,
        bg: "#E6F0FF",
        onPress: () => openReminderEditor(todo),
      },

      // Delete reminder only when one exists
      ...(hasReminder(todo)
        ? [
            {
              key: "deleteReminder",
              label: "Delete reminder",
              icon: "notifications-off-outline",
              color: C.danger,
              bg: C.dangerSoft,
              onPress: () => deleteReminder(todo),
            } as SheetAction,
            {
              key: "snoozeReminder",
              label: "Snooze 10 min",
              icon: "time-outline",
              color: "#B45309",
              bg: "#FEF3C7",
              onPress: () => snoozeReminder(todo),
            } as SheetAction,
          ]
        : []),

      // Details
      {
        key: "details",
        label: "Details",
        icon: "eye-outline",
        color: C.sub,
        bg: C.chip,
        onPress: () => showDetails(todo),
      },

      // Duplicate
      {
        key: "duplicate",
        label: "Duplicate",
        icon: "copy-outline",
        color: C.sub,
        bg: C.chip,
        onPress: () => void duplicateTodo(todo),
      },

      // Move to trash
      {
        key: "trash",
        label: "Trash",
        icon: "trash-outline",
        color: C.danger,
        bg: C.dangerSoft,
        onPress: () => moveToTrash(todo),
      },

      {
        key: "fav",
        label: meta.favorite ? "Unfavorite" : "Favorite",
        icon: meta.favorite ? "star" : "star-outline",
        color: C.amber,
        bg: "#FEF3C7",
        onPress: () =>
          void updateNoteMeta(todo, {
            favorite: !meta.favorite,
          }),
      },
      {
        key: "pin",
        label: pinned ? "Unpin" : "Pin",
        icon: pinned ? "bookmark" : "bookmark-outline",
        color: "#D97706",
        bg: "#FFEDD5",
        onPress: () => void togglePin(todo),
      },
      {
        key: "folder",
        label: "Move to folder",
        icon: "folder-open-outline",
        color: C.today,
        bg: "#E6F0FF",
        onPress: () => chooseFolderForNote(todo),
      },
      {
        key: "category",
        label: "Categories",
        icon: "color-palette-outline",
        color: C.upcoming,
        bg: "#F0E9FF",
        onPress: () => chooseCategoryForNote(todo),
      },
      {
        key: "tags",
        label: "Tags",
        icon: "pricetags-outline",
        color: "#0F766E",
        bg: "#D5F5EF",
        onPress: () => manageTags(todo),
      },
      {
        key: "priority",
        label: "Priority",
        icon: "flag-outline",
        color: "#B45309",
        bg: "#FEF3C7",
        onPress: () => choosePriority(todo),
      },
      {
        key: "archive",
        label: meta.archived ? "Unarchive" : "Archive",
        icon: meta.archived ? "archive" : "archive-outline",
        color: C.sub,
        bg: C.chip,
        onPress: () =>
          void updateNoteMeta(todo, {
            archived: !meta.archived,
            trashed: false,
          }),
      },
    ];
    if (quick.isQuickNote) {
      list.push({
        key: "convert",
        label: "Make a Todo",
        icon: "checkbox-outline",
        color: C.primary,
        bg: C.primarySoft,
        onPress: () => void convertQuickNoteToTodo(todo),
      });
    }

    return list;
  };

  // ==========================================================
  // RENDER: MEDIA
  // ==========================================================
  const renderMedia = (todo: Todo) => {
    if (!todo.fileIds || todo.fileIds.length === 0) return null;
    const firstType = todo.type?.[0] || "";
    const mediaUrl = `${API_BASE_URL}/api/media/${todo.fileIds[0]}`;

    if (firstType.startsWith("image")) {
      return (
        <View style={styles.mediaContainer}>
          <Image
            source={{ uri: mediaUrl }}
            style={styles.todoImage}
            resizeMode="cover"
          />
          {todo.fileIds.length > 1 && (
            <View style={styles.mediaCount}>
              <Ionicons name="images" size={12} color="#FFFFFF" />
              <Text style={styles.mediaCountText}>{todo.fileIds.length}</Text>
            </View>
          )}
        </View>
      );
    }

    const icon =
      firstType === "audio"
        ? "mic"
        : firstType === "video"
          ? "videocam"
          : "document-text";
    const label =
      firstType === "audio"
        ? "Voice note"
        : firstType === "video"
          ? "Video"
          : "File";
    return (
      <View style={styles.attachmentRow}>
        <View style={styles.attachmentIcon}>
          <Ionicons name={icon as any} size={16} color={C.primary} />
        </View>
        <Text style={styles.attachmentTitle}>
          {label}
          {todo.fileIds.length > 1 ? `  +${todo.fileIds.length - 1}` : ""}
        </Text>
      </View>
    );
  };

  // ==========================================================
  // RENDER: CARD
  // ==========================================================
  const renderTodo = ({ item }: { item: Todo }) => {
    const status = getStatusMeta(item.status);
    const noteMeta = getQuickNoteMeta(item);
    const isQuickNote = noteMeta.isQuickNote === true;
    const itemId = getTodoKey(item);
    const isPinned =
      pinnedIds.includes(itemId) || noteMeta.quickNotePinned === true;
    const organization = getOrganizationMeta(item);
    const folderName = noteFolders.find(
      (folder) => folder.id === organization.folderId,
    )?.name;
    const itemCategories = noteCategories.filter((c) =>
      (organization.categoryIds || []).includes(c.id),
    );
    const isFavorite = organization.favorite === true;
    const isTrashed = organization.trashed === true;
    const isCompleted = item.status === "Completed";
    const priority = organization.priority
      ? PRIORITY_STYLE[organization.priority]
      : null;

    const savedTheme = isQuickNote ? noteMeta.quickNoteTheme : undefined;
    // Support both theme objects and the standalone fields saved by older editor versions.
    const themeImageUri =
      (savedTheme?.kind === "image" && typeof savedTheme.uri === "string"
        ? savedTheme.uri
        : undefined) ||
      (typeof noteMeta.backgroundImageUri === "string"
        ? noteMeta.backgroundImageUri
        : undefined);
    const backgroundId =
      organization.noteBackgroundImage || noteMeta.noteBackgroundImage;
    const selectedBackground = NOTE_BACKGROUND_IMAGES.find(
      (image) => image.id === backgroundId,
    )?.source;
    const useSavedThemeImage = !selectedBackground && !!themeImageUri;
    const useSavedGradient =
      !selectedBackground &&
      !useSavedThemeImage &&
      savedTheme?.kind === "gradient" &&
      Array.isArray(savedTheme.colors) &&
      savedTheme.colors.length >= 2;
    const savedThemeColor =
      savedTheme?.bg ||
      savedTheme?.colors?.[0] ||
      noteMeta.quickNoteColor ||
      defaultNoteColor;
    const activePattern = String(
      savedTheme?.pattern ||
        noteMeta.notePattern ||
        organization.notePattern ||
        "plain",
    )
      .toLowerCase()
      .trim();
    const CardContainer: any =
      selectedBackground || useSavedThemeImage
        ? ImageBackground
        : useSavedGradient
          ? LinearGradient
          : View;
    const cardContainerProps: any = selectedBackground
      ? {
          source: selectedBackground,
          imageStyle: {
            borderRadius:
              notebookStyle === "classic"
                ? 8
                : notebookStyle === "minimal"
                  ? 14
                  : 20,
          },
          resizeMode: "cover",
        }
      : useSavedThemeImage
        ? {
            source: { uri: themeImageUri },
            imageStyle: {
              borderRadius:
                notebookStyle === "classic"
                  ? 8
                  : notebookStyle === "minimal"
                    ? 14
                    : 20,
            },
            resizeMode: "cover",
          }
        : useSavedGradient
          ? {
              colors: savedTheme.colors,
              start: { x: 0, y: 0 },
              end: { x: 1, y: 1 },
            }
          : {};

    return (
      <CardContainer
        {...cardContainerProps}
        style={[
          styles.card,
          {
            backgroundColor:
              selectedBackground || useSavedThemeImage
                ? "rgba(255,255,255,0.48)"
                : savedThemeColor,
            borderColor: organization.noteColor || savedThemeColor,
          },
          appTheme === "dark" &&
            !organization.noteColor &&
            !isQuickNote &&
            defaultNoteColor === "#FFF8DC" && {
              backgroundColor: "#1E293B",
              borderColor: "#334155",
            },
        ]}
      >
        {/* Render the pattern saved by Create Quick Note, even when it is stored as notePattern. */}
        {isQuickNote && activePattern !== "plain" && (
          <View pointerEvents="none" style={styles.notePatternOverlay}>
            {(() => {
              const raw = activePattern;
              const aliases: Record<string, string> = {
                line: "stripes",
                lines: "stripes",
                lined: "stripes",
                dot: "dots",
                dotted: "dots",
                hearts: "heart",
                stars: "star",
                flowers: "flower",
                leaves: "leaf",
                checks: "checker",
                checkered: "checker",
              };
              const pattern = aliases[raw] || raw;
              const ink = savedTheme?.ink || "rgba(99,102,241,0.42)";
              const rows = Array.from({ length: 7 });
              const cols = Array.from({ length: 6 });

              if (
                pattern === "heart" ||
                pattern === "star" ||
                pattern === "flower" ||
                pattern === "leaf"
              ) {
                const glyph =
                  pattern === "heart"
                    ? "♥"
                    : pattern === "star"
                      ? "★"
                      : pattern === "flower"
                        ? "✿"
                        : "❧";
                return (
                  <View style={styles.savedThemeMotifGrid}>
                    {rows.map((_, row) =>
                      cols.map((__, col) => (
                        <Text
                          key={`${pattern}-${row}-${col}`}
                          style={{
                            position: "absolute",
                            left: 8 + col * 48 + (row % 2 ? 12 : 0),
                            top: 7 + row * 28,
                            color: ink,
                            fontSize: pattern === "heart" ? 17 : 16,
                            lineHeight: 21,
                            opacity: 0.95,
                          }}
                        >
                          {glyph}
                        </Text>
                      )),
                    )}
                  </View>
                );
              }

              if (pattern === "stripes") {
                return (
                  <View style={styles.savedThemeMotifGrid}>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <View
                        key={`stripe-${i}`}
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: 10 + i * 18,
                          height: 2,
                          backgroundColor: ink,
                        }}
                      />
                    ))}
                  </View>
                );
              }

              if (pattern === "dots") {
                return (
                  <View style={styles.savedThemeMotifGrid}>
                    {rows.map((_, row) =>
                      cols.map((__, col) => (
                        <View
                          key={`dot-${row}-${col}`}
                          style={{
                            position: "absolute",
                            left: 12 + col * 42,
                            top: 12 + row * 28,
                            width: 5,
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: ink,
                          }}
                        />
                      )),
                    )}
                  </View>
                );
              }

              if (pattern === "grid" || pattern === "checker") {
                return (
                  <View style={styles.savedThemeMotifGrid}>
                    {pattern === "grid" ? (
                      <>
                        {Array.from({ length: 12 }).map((_, i) => (
                          <View
                            key={`gv-${i}`}
                            style={{
                              position: "absolute",
                              top: 0,
                              bottom: 0,
                              left: 12 + i * 28,
                              width: 1,
                              backgroundColor: ink,
                            }}
                          />
                        ))}
                        {Array.from({ length: 10 }).map((_, i) => (
                          <View
                            key={`gh-${i}`}
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              top: 10 + i * 18,
                              height: 1,
                              backgroundColor: ink,
                            }}
                          />
                        ))}
                      </>
                    ) : (
                      rows.map((_, row) =>
                        cols.map((__, col) =>
                          (row + col) % 2 === 0 ? (
                            <View
                              key={`checker-${row}-${col}`}
                              style={{
                                position: "absolute",
                                left: col * 40,
                                top: row * 26,
                                width: 20,
                                height: 13,
                                backgroundColor: ink,
                                opacity: 0.45,
                              }}
                            />
                          ) : null,
                        ),
                      )
                    )}
                  </View>
                );
              }
              return null;
            })()}
          </View>
        )}

        {!isQuickNote && (organization.notePattern || "plain") !== "plain" && (
          <View pointerEvents="none" style={styles.notePatternOverlay}>
            {organization.notePattern === "lined" &&
              Array.from({ length: 24 }).map((_, i) => (
                <View
                  key={`line-${i}`}
                  style={[styles.notePatternLine, { top: 12 + i * 18 }]}
                />
              ))}
            {organization.notePattern === "dotted" &&
              Array.from({ length: 24 }).map((_, i) => (
                <View
                  key={`dot-row-${i}`}
                  style={[styles.notePatternDotRow, { top: 10 + i * 18 }]}
                >
                  {Array.from({ length: 9 }).map((__, j) => (
                    <View key={`dot-${j}`} style={styles.notePatternDot} />
                  ))}
                </View>
              ))}
            {organization.notePattern === "grid" && (
              <View style={styles.notePatternGrid}>
                {Array.from({ length: 13 }).map((_, i) => (
                  <View
                    key={`grid-v-${i}`}
                    style={[
                      styles.notePatternGridVertical,
                      { left: `${(i + 1) * (100 / 14)}%` },
                    ]}
                  />
                ))}
                {Array.from({ length: 24 }).map((_, i) => (
                  <View
                    key={`grid-h-${i}`}
                    style={[
                      styles.notePatternGridHorizontal,
                      { top: 10 + i * 18 },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Title row */}
        <View style={styles.cardTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={2}
              style={[
                styles.cardTitle,
                appTheme === "dark" && { color: "#F8FAFC" },
                {
                  fontSize:
                    noteFontSize === "small"
                      ? 14
                      : noteFontSize === "large"
                        ? 19
                        : 16.5,
                  fontFamily:
                    noteFontFamily === "System" ? undefined : noteFontFamily,
                },
                isCompleted && styles.cardTitleDone,
              ]}
            >
              {item.locked ? "Locked note" : item.title || "Untitled note"}
            </Text>

            {/* Recurring reminder indicator */}
            {item.recurring && item.recurring !== "none" && (
              <View style={styles.recurringBadge}>
                <Ionicons
                  name="repeat"
                  size={13}
                  color={appTheme === "dark" ? "#A78BFA" : "#6D28D9"}
                />
                <Text
                  style={[
                    styles.recurringBadgeText,
                    appTheme === "dark" && { color: "#C4B5FD" },
                  ]}
                >
                  {item.recurring.charAt(0).toUpperCase() +
                    item.recurring.slice(1)}
                </Text>
              </View>
            )}
          </View>

          {isPinned && (
            <Ionicons
              name="bookmark"
              size={15}
              color="#D97706"
              style={{ marginTop: 3 }}
            />
          )}

          {item.locked && (
            <Ionicons
              name="lock-closed"
              size={15}
              color="#7C3AED"
              style={{ marginTop: 3 }}
            />
          )}

          <Pressable
            hitSlop={8}
            style={styles.iconBtn}
            onPress={() => void updateNoteMeta(item, { favorite: !isFavorite })}
            accessibilityLabel={isFavorite ? "Remove favorite" : "Add favorite"}
          >
            <Ionicons
              name={isFavorite ? "star" : "star-outline"}
              size={18}
              color={isFavorite ? C.amber : C.mute}
            />
          </Pressable>

          <Pressable
            hitSlop={8}
            style={styles.iconBtn}
            onPress={() => setActionTodo(item)}
            accessibilityLabel="More actions"
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={C.sub} />
          </Pressable>
        </View>

        {/* Chips */}
        <View style={styles.chipRow}>
          <View style={[styles.pill, { backgroundColor: status.bg }]}>
            <View style={[styles.pillDot, { backgroundColor: status.color }]} />
            <Text style={[styles.pillText, { color: status.color }]}>
              {item.status || "Todo"}
            </Text>
          </View>
          {isQuickNote && (
            <View
              style={[
                styles.pill,
                { backgroundColor: "rgba(255,255,255,0.8)" },
              ]}
            >
              <Ionicons name="flash" size={11} color="#B45309" />
              <Text style={[styles.pillText, { color: "#92400E" }]}>
                Quick note
              </Text>
            </View>
          )}
          {priority && (
            <View style={[styles.pill, { backgroundColor: priority.bg }]}>
              <Ionicons name="flag" size={10} color={priority.color} />
              <Text style={[styles.pillText, { color: priority.color }]}>
                {organization.priority}
              </Text>
            </View>
          )}
          {folderName ? (
            <View style={styles.pill}>
              <Ionicons name="folder" size={11} color={C.sub} />
              <Text style={styles.pillText}>{folderName}</Text>
            </View>
          ) : null}
          {itemCategories.map((category) => (
            <View
              key={category.id}
              style={[styles.pill, { backgroundColor: category.color }]}
            >
              <Text style={[styles.pillText, { color: C.ink }]}>
                {category.name}
              </Text>
            </View>
          ))}
          {(organization.tags || []).map((tag) => (
            <View key={tag} style={styles.pill}>
              <Text style={styles.pillText}>#{tag}</Text>
            </View>
          ))}
          {organization.archived ? (
            <View style={styles.pill}>
              <Ionicons name="archive" size={11} color={C.sub} />
              <Text style={styles.pillText}>Archived</Text>
            </View>
          ) : null}
        </View>

        {/* Body */}
        {item.locked ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 10,
            }}
          >
            <Ionicons name="lock-closed" size={16} color={C.sub} />
            <Text style={[styles.cardText, { fontWeight: "700" }]}>
              Content hidden · Unlock to view
            </Text>
          </View>
        ) : (
          !!item.text && (
            <Text
              numberOfLines={3}
              ellipsizeMode="tail"
              style={[
                styles.cardText,
                appTheme === "dark" && { color: "#CBD5E1" },
                {
                  fontSize:
                    noteFontSize === "small"
                      ? 12
                      : noteFontSize === "large"
                        ? 16
                        : 14,
                  fontFamily:
                    noteFontFamily === "System" ? undefined : noteFontFamily,
                },
                isCompleted && styles.cardTextDone,
              ]}
            >
              {item.text}
            </Text>
          )
        )}

        {!item.locked && renderMedia(item)}

        {/* Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.footerItem}>
            <Ionicons name="calendar-outline" size={14} color={C.mute} />
            <Text style={styles.footerText}>{formatTodoDate(item.date)}</Text>
          </View>

          <View style={styles.footerItem}>
            <Ionicons name="time-outline" size={14} color={C.mute} />
            <Text style={styles.footerText}>
              {new Date(item.date).toLocaleTimeString("en-IN", {
                timeZone: "Asia/Kolkata",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })}
            </Text>
          </View>
          {getTodoReminder(item) ? (
            <View style={[styles.footerItem, { flexShrink: 1 }]}>
              <Ionicons name="alarm-outline" size={14} color="#D97706" />
              <Text
                numberOfLines={1}
                style={[styles.footerText, { color: "#B45309" }]}
              >
                Remainder: {getTodoReminder(item)}
              </Text>
            </View>
          ) : null}
        </View>

        {isTrashed && (
          <View style={styles.trashBar}>
            <Pressable
              style={[styles.trashBtn, { backgroundColor: "#DDF7F3" }]}
              onPress={() => restoreFromTrash(item)}
            >
              <Ionicons name="refresh" size={15} color={C.done} />
              <Text style={[styles.trashBtnText, { color: C.done }]}>
                Restore
              </Text>
            </Pressable>
            <Pressable
              style={[styles.trashBtn, { backgroundColor: C.dangerSoft }]}
              onPress={() => permanentlyDeleteTodo(item)}
            >
              <Ionicons name="trash-bin" size={15} color={C.danger} />
              <Text style={[styles.trashBtnText, { color: C.danger }]}>
                Delete forever
              </Text>
            </Pressable>
          </View>
        )}
      </CardContainer>
    );
  };

  // ==========================================================
  // CALENDAR-BASED NOTE VIEW
  // ==========================================================

  const toCalendarKey = useCallback((value?: string | null) => {
    if (!value) return "";

    // Preserve date-only values without timezone conversion.
    const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (dateOnly) {
      return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) return "";

    return [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, "0"),
      String(parsed.getDate()).padStart(2, "0"),
    ].join("-");
  }, []);

  const getNoteCalendarKey = useCallback(
    (todo: Todo) =>
      toCalendarKey(todo.date || todo.createdAt || todo.updatedAt),
    [toCalendarKey],
  );

  // Counts use the same filtered notes as the list.
  const calendarNoteCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    filteredTodos.forEach((todo) => {
      const key = getNoteCalendarKey(todo);
      if (key) counts[key] = (counts[key] || 0) + 1;
    });

    return counts;
  }, [filteredTodos, getNoteCalendarKey]);

  // Selected calendar date filters the same list, including Quick Notes.
  const calendarVisibleTodos = useMemo(() => {
    if (!selectedCalendarDate) return [];

    return filteredTodos.filter(
      (todo) => getNoteCalendarKey(todo) === selectedCalendarDate,
    );
  }, [filteredTodos, selectedCalendarDate, getNoteCalendarKey]);

  const displayedTodos = calendarView ? calendarVisibleTodos : filteredTodos;

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number | null; key: string }> = [];
    for (let i = 0; i < firstWeekday; i++)
      cells.push({ day: null, key: `empty-${i}` });
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({
        day,
        key: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      });
    }
    while (cells.length % 7 !== 0)
      cells.push({ day: null, key: `end-${cells.length}` });
    return cells;
  }, [calendarMonth]);

  // ==========================================================
  // RENDER: EMPTY / LOADING
  // ==========================================================
  const renderEmpty = () => {
    if (loading) return null;
    const searching = search.trim().length > 0;
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <Ionicons
            name={searching ? "search" : "document-text-outline"}
            size={34}
            color={C.primary}
          />
        </View>
        <Text style={styles.emptyTitle}>
          {searching
            ? "No matches"
            : filter === "All" && !collectionLabel
              ? "Nothing here yet"
              : "No notes in this view"}
        </Text>
        <Text style={styles.emptyDescription}>
          {searching
            ? "Try a different keyword."
            : "Capture a quick note or plan a task to get started."}
        </Text>
        {!searching && (
          <Pressable style={styles.emptyButton} onPress={addTodo}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.emptyButtonText}>New note</Text>
          </Pressable>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.loadingText}>Loading your notes…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const sectionHeader = (
    icon: string,
    color: string,
    title: string,
    count: number,
  ) => (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon as any} size={15} color={color} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCount}>
        <Text style={styles.sectionCountText}>{count}</Text>
      </View>
    </View>
  );

  const menuSections: {
    title: string;
    items: {
      label: string;
      icon: string;
      active?: boolean;
      action: () => void;
    }[];
  }[] = [
    {
      title: "Collections",
      items: [
        {
          label: "All notes",
          icon: "documents-outline",
          active:
            collectionFilter === "all" &&
            filter === "All" &&
            categoryFilter === "all",
          action: () => {
            setCollectionFilter("all");
            setCategoryFilter("all");
            setFilter("All");
          },
        },
        {
          label: "Favorites",
          icon: "star-outline",
          active: collectionFilter === "favorites",
          action: () => {
            setCollectionFilter("favorites");
            setFilter("All");
          },
        },
        {
          label: "Archived",
          icon: "archive-outline",
          active: collectionFilter === "archived",
          action: () => {
            setCollectionFilter("archived");
            setFilter("All");
          },
        },
        {
          label: "Trash",
          icon: "trash-outline",
          active: collectionFilter === "trash",
          action: () => {
            setCollectionFilter("trash");
            setFilter("All");
          },
        },
      ],
    },
    {
      title: "Create",
      items: [
        {
          label: "New folder",
          icon: "folder-outline",
          action: () => openOrganizationEditor("folder"),
        },
        {
          label: "New category",
          icon: "color-palette-outline",
          action: () => openOrganizationEditor("category"),
        },
      ],
    },

    {
      title: "View",
      items: [
        {
          label: gridLayout ? "List view" : "Grid view",
          icon: gridLayout ? "list-outline" : "grid-outline",
          action: () => setGridLayout((v) => !v),
        },
        {
          label: `Sort by ${sortLabel.toLowerCase()}`,
          icon: "swap-vertical-outline",
          action: cycleSort,
        },
      ],
    },
  ];

  // ==========================================================
  // RENDER
  // ==========================================================
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: sharedColors.background }]}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={sharedColors.background}
      />

      <View
        style={[styles.container, { backgroundColor: sharedColors.background }]}
      >
        {/* HEADER */}
        <View
          style={[styles.header, { backgroundColor: sharedColors.background }]}
        >
          <Pressable
            style={[styles.roundBtn, { backgroundColor: sharedColors.surface }]}
            onPress={() => router.back()}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={sharedColors.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: sharedColors.text }]}>
              My Notes
            </Text>
            <Text
              style={[
                styles.headerSubtitle,
                { color: sharedColors.secondaryText },
              ]}
            >
              {counts.today > 0
                ? `${counts.today} due today`
                : "Nothing due today"}
            </Text>
          </View>

          <Pressable
            style={[styles.roundBtn, { backgroundColor: sharedColors.surface }]}
            onPress={() => setMenuVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open notes menu"
            hitSlop={8}
          >
            <Ionicons
              name="options-outline"
              size={21}
              color={sharedColors.text}
            />
          </Pressable>
        </View>

        <FlatList
          data={displayedTodos}
          keyExtractor={(item, index) =>
            String(item.tdlId || item._id || index)
          }
          renderItem={({ item }) =>
            gridLayout ? (
              <View style={styles.gridCell}>{renderTodo({ item })}</View>
            ) : (
              renderTodo({ item })
            )
          }
          numColumns={gridLayout ? 2 : 1}
          key={gridLayout ? "notes-grid" : "notes-list"}
          columnWrapperStyle={gridLayout ? styles.gridRow : undefined}
          contentContainerStyle={[
            styles.listContent,
            displayedTodos.length === 0 &&
              quickNoteTodos.length === 0 &&
              styles.emptyListContent,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={40}
          windowSize={7}
          onEndReachedThreshold={0.35}
          ListFooterComponent={<View style={styles.listFooterSpace} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={accentColor}
              colors={[accentColor]}
            />
          }
          ListHeaderComponent={
            <View>
              {/* HERO OVERVIEW */}

              {showHero && (
                <View
                  style={[
                    styles.hero,
                    {
                      backgroundColor: "#123D32",
                      borderRadius: 24,
                      padding: 18,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: "#245B49",
                    },
                  ]}
                >
                  {/* Decorative dark mint shapes */}
                  <View
                    style={[
                      styles.heroBlobA,
                      { backgroundColor: "#28785C", opacity: 0.35 },
                    ]}
                  />
                  <View
                    style={[
                      styles.heroBlobB,
                      { backgroundColor: "#36A47B", opacity: 0.22 },
                    ]}
                  />

                  <View style={[styles.heroTop, { alignItems: "center" }]}>
                    <View style={styles.heroInfo}>
                      <Text
                        style={[
                          styles.heroLabel,
                          { color: "#A4E8CC", letterSpacing: 1.5 },
                        ]}
                      >
                        YOUR WORKSPACE
                      </Text>

                      <View style={styles.heroNumberRow}>
                        <Text style={[styles.heroNumber, { color: "#F0FFF8" }]}>
                          {counts.all}
                        </Text>

                        <Text style={[styles.heroUnit, { color: "#B8EBD5" }]}>
                          {counts.all === 1 ? "active item" : "active items"}
                        </Text>
                      </View>

                      <Text style={[styles.heroSubtitle, { color: "#A5D7C1" }]}>
                        Keep moving forward, one task at a time.
                      </Text>
                    </View>

                    <View
                      style={[styles.progressRing, { alignItems: "center" }]}
                    >
                      <View
                        style={[
                          styles.ring,
                          {
                            backgroundColor: "#1B4D3F",
                            borderColor: "#55D6A0",
                            borderWidth: 4,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.ringText,
                            { color: "#D8FFEC", fontWeight: "800" },
                          ]}
                        >
                          {progress}%
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.ringCaption,
                          {
                            color: "#A4E8CC",
                            fontWeight: "700",
                            letterSpacing: 1,
                          },
                        ]}
                      >
                        COMPLETED
                      </Text>
                    </View>
                  </View>

                  {/* Progress bar */}
                  <View
                    style={[
                      styles.progressTrack,
                      {
                        backgroundColor: "#285B49",
                        height: 8,
                        borderRadius: 10,
                        overflow: "hidden",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.max(0, Math.min(100, progress))}%`,
                          backgroundColor: "#55D6A0",
                          borderRadius: 10,
                        },
                      ]}
                    />
                  </View>

                  {/* Statistics */}
                  <View style={styles.heroStats}>
                    {[
                      { label: "Today", value: counts.today },
                      { label: "Upcoming", value: counts.upcoming },
                      { label: "Done", value: counts.completed },
                    ].map((s) => (
                      <View
                        key={s.label}
                        style={[
                          styles.heroStat,
                          {
                            backgroundColor: "#19483A",
                            borderColor: "#2D6A53",
                            borderWidth: 1,
                            borderRadius: 16,
                            paddingVertical: 12,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.heroStatDot,
                            { backgroundColor: "#55D6A0" },
                          ]}
                        />

                        <Text
                          style={[styles.heroStatValue, { color: "#F0FFF8" }]}
                        >
                          {s.value}
                        </Text>

                        <Text
                          style={[styles.heroStatLabel, { color: "#A4D9C2" }]}
                        >
                          {s.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* SEARCH */}

              <View style={styles.searchContainer}>
                <Ionicons name="search" size={18} color={C.mute} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search titles and text"
                  placeholderTextColor={C.mute}
                  style={styles.searchInput}
                  returnKeyType="search"
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={C.mute} />
                  </Pressable>
                )}
              </View>

              {/* CALENDAR VIEW TOGGLE */}
              <View style={styles.viewSwitcher}>
                <Pressable
                  onPress={() => setCalendarView(false)}
                  style={[
                    styles.viewSwitcherOption,
                    !calendarView && styles.viewSwitcherActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="List view"
                  accessibilityState={{ selected: !calendarView }}
                >
                  <Ionicons
                    name="list-outline"
                    size={16}
                    color={!calendarView ? "#FFFFFF" : C.primary}
                  />
                  <Text
                    style={[
                      styles.viewSwitcherText,
                      !calendarView && styles.viewSwitcherActiveText,
                    ]}
                  >
                    List
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setCalendarView(true)}
                  style={[
                    styles.viewSwitcherOption,
                    calendarView && styles.viewSwitcherActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Calendar view"
                  accessibilityState={{ selected: calendarView }}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color={calendarView ? "#FFFFFF" : C.primary}
                  />
                  <Text
                    style={[
                      styles.viewSwitcherText,
                      calendarView && styles.viewSwitcherActiveText,
                    ]}
                  >
                    Calendar
                  </Text>
                </Pressable>
              </View>

              {calendarView && (
                <View style={styles.calendarPanel}>
                  <View style={styles.calendarHeader}>
                    <Pressable
                      style={styles.calendarArrow}
                      onPress={() =>
                        setCalendarMonth(
                          (month) =>
                            new Date(
                              month.getFullYear(),
                              month.getMonth() - 1,
                              1,
                            ),
                        )
                      }
                      accessibilityLabel="Previous month"
                    >
                      <Ionicons name="chevron-back" size={19} color={C.ink} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const now = new Date();
                        setCalendarMonth(
                          new Date(now.getFullYear(), now.getMonth(), 1),
                        );
                        setSelectedCalendarDate(
                          `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
                        );
                      }}
                    >
                      <Text style={styles.calendarMonthTitle}>
                        {calendarMonth.toLocaleDateString("en-IN", {
                          month: "long",
                          year: "numeric",
                        })}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.calendarArrow}
                      onPress={() =>
                        setCalendarMonth(
                          (month) =>
                            new Date(
                              month.getFullYear(),
                              month.getMonth() + 1,
                              1,
                            ),
                        )
                      }
                      accessibilityLabel="Next month"
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={19}
                        color={C.ink}
                      />
                    </Pressable>
                  </View>
                  <View style={styles.calendarWeekRow}>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (day) => (
                        <Text key={day} style={styles.calendarWeekday}>
                          {day}
                        </Text>
                      ),
                    )}
                  </View>
                  <View style={styles.calendarGrid}>
                    {calendarCells.map((cell) => {
                      if (!cell.day)
                        return (
                          <View key={cell.key} style={styles.calendarDayCell} />
                        );
                      const active = selectedCalendarDate === cell.key;
                      const hasNotes = (calendarNoteCounts[cell.key] || 0) > 0;
                      const now = new Date();
                      const isToday =
                        cell.key ===
                        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                      return (
                        <Pressable
                          key={cell.key}
                          style={[
                            styles.calendarDayCell,
                            active && { backgroundColor: accentColor },
                            !active && isToday && styles.calendarTodayCell,
                          ]}
                          onPress={() => setSelectedCalendarDate(cell.key)}
                          accessibilityRole="button"
                          accessibilityLabel={`${cell.day}, ${calendarMonth.toLocaleDateString("en-IN", { month: "long" })}${hasNotes ? `, ${calendarNoteCounts[cell.key]} notes` : ""}`}
                        >
                          <Text
                            style={[
                              styles.calendarDayText,
                              active && { color: "#FFFFFF" },
                              !active &&
                                isToday && {
                                  color: C.primary,
                                  fontWeight: "800",
                                },
                            ]}
                          >
                            {cell.day}
                          </Text>
                          {hasNotes && (
                            <View
                              style={[
                                styles.calendarNoteDot,
                                active && { backgroundColor: "#FFFFFF" },
                              ]}
                            />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.calendarSelectedSummary}>
                    <View>
                      <Text style={styles.calendarSelectedTitle}>
                        {new Date(
                          `${selectedCalendarDate}T12:00:00`,
                        ).toLocaleDateString("en-IN", {
                          weekday: "long",
                          day: "numeric",
                          month: "short",
                        })}
                      </Text>
                      <Text style={styles.calendarSelectedSubtitle}>
                        {calendarVisibleTodos.length}{" "}
                        {calendarVisibleTodos.length === 1 ? "note" : "notes"}{" "}
                        on this date
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: "/cretenote",
                            params: {
                              quickNote: "false",
                              selectedDate: selectedCalendarDate,
                            },
                          })
                        }
                        style={[
                          styles.calendarTodayButton,
                          {
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 5,
                            backgroundColor: accentColor,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Create a note for ${selectedCalendarDate}`}
                      >
                        <Ionicons
                          name="add-circle-outline"
                          size={14}
                          color="#FFFFFF"
                        />
                        <Text
                          style={[
                            styles.calendarTodayButtonText,
                            { color: "#FFFFFF" },
                          ]}
                        >
                          Link note
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          const now = new Date();
                          setCalendarMonth(
                            new Date(now.getFullYear(), now.getMonth(), 1),
                          );
                          setSelectedCalendarDate(
                            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
                          );
                        }}
                        style={styles.calendarTodayButton}
                      >
                        <Text style={styles.calendarTodayButtonText}>
                          Today
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              )}

              {/* STATUS FILTERS */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipScroll}
              >
                {(
                  [
                    ["All", counts.all],
                    ["Today", counts.today],
                    ["Upcoming", counts.upcoming],
                    ["Completed", counts.completed],
                  ] as [FilterType, number][]
                ).map(([name, count]) => {
                  const active = filter === name;
                  return (
                    <Pressable
                      key={name}
                      style={[
                        styles.filterChip,
                        active && {
                          backgroundColor: accentColor,
                          borderColor: accentColor,
                        },
                      ]}
                      onPress={() => setFilter(name)}
                    >
                      <Text
                        style={[
                          styles.filterText,
                          active && styles.filterTextActive,
                        ]}
                      >
                        {name}
                      </Text>
                      <View
                        style={[
                          styles.filterCount,
                          active && styles.filterCountActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterCountText,
                            active && styles.filterCountTextActive,
                          ]}
                        >
                          {count}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* TOOLS: sort, layout, active collection, folders, categories */}
              {showCategories && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.chipScroll, { paddingTop: 0 }]}
                >
                  <Pressable style={styles.toolChip} onPress={cycleSort}>
                    <Ionicons
                      name="swap-vertical"
                      size={14}
                      color={C.primary}
                    />
                    <Text style={styles.toolChipText}>{sortLabel}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.toolChip}
                    onPress={() => setGridLayout((v) => !v)}
                  >
                    <Ionicons
                      name={gridLayout ? "list" : "grid"}
                      size={14}
                      color={C.primary}
                    />
                    <Text style={styles.toolChipText}>
                      {gridLayout ? "List" : "Grid"}
                    </Text>
                  </Pressable>

                  {collectionLabel && (
                    <Pressable
                      style={[styles.toolChip, styles.toolChipActive]}
                      onPress={() => setCollectionFilter("all")}
                    >
                      <Text style={[styles.toolChipText, { color: "#FFFFFF" }]}>
                        {collectionLabel}
                      </Text>
                      <Ionicons name="close" size={14} color="#FFFFFF" />
                    </Pressable>
                  )}

                  {noteFolders
                    .filter((f) => f.id !== collectionFilter)
                    .map((folder) => (
                      <Pressable
                        key={folder.id}
                        style={styles.toolChip}
                        onPress={() => setCollectionFilter(folder.id)}
                        onLongPress={() =>
                          Alert.alert(folder.name, "Manage this folder", [
                            {
                              text: "Rename",
                              onPress: () =>
                                openOrganizationEditor("folder", folder.id),
                            },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: () => deleteFolder(folder),
                            },
                            { text: "Cancel", style: "cancel" },
                          ])
                        }
                      >
                        <Ionicons name="folder" size={13} color={C.sub} />
                        <Text style={styles.toolChipText}>{folder.name}</Text>
                      </Pressable>
                    ))}

                  {noteCategories.map((category) => {
                    const active = categoryFilter === category.id;
                    return (
                      <Pressable
                        key={category.id}
                        style={[
                          styles.toolChip,
                          {
                            backgroundColor: category.color,
                            borderColor: active ? C.ink : category.color,
                          },
                        ]}
                        onPress={() =>
                          setCategoryFilter(active ? "all" : category.id)
                        }
                        onLongPress={() =>
                          Alert.alert(category.name, "Manage this category", [
                            {
                              text: "Edit / recolor",
                              onPress: () =>
                                openOrganizationEditor("category", category.id),
                            },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: () => deleteCategory(category),
                            },
                            { text: "Cancel", style: "cancel" },
                          ])
                        }
                      >
                        <Text style={[styles.toolChipText, { color: C.ink }]}>
                          {category.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {/* QUICK NOTES */}
              {showQuickNotes && quickNoteTodos.length > 0 && (
                <View style={{ marginTop: 6 }}>
                  {sectionHeader(
                    "flash",
                    C.amber,
                    "Quick notes",
                    quickNoteTodos.length,
                  )}
                  {quickNoteTodos.map((item, index) => (
                    <View
                      key={String(
                        item.tdlId || item._id || `quick-note-${index}`,
                      )}
                    >
                      {renderTodo({ item })}
                    </View>
                  ))}
                </View>
              )}

              {(regularTodos.length > 0 || quickNoteTodos.length > 0) &&
                sectionHeader(
                  "checkbox",
                  C.primary,
                  "Todos",
                  regularTodos.length,
                )}
            </View>
          }
          ListEmptyComponent={
            quickNoteTodos.length === 0 ? renderEmpty() : null
          }
        />

        {/* FAB */}
        <Pressable
          style={[styles.fab, { backgroundColor: accentColor }]}
          onPress={addTodo}
          accessibilityLabel="Create a note or todo"
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
          <Text style={styles.fabText}>New</Text>
        </Pressable>
      </View>

      {/* ======================= NOTES MENU (bottom sheet) ======================= */}
      <Modal
        transparent
        visible={menuVisible}
        animationType="slide"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setMenuVisible(false)}
        >
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Notes</Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 520 }}
            >
              {menuSections.map((section) => (
                <View key={section.title} style={{ marginTop: 14 }}>
                  <Text style={styles.sheetSection}>{section.title}</Text>
                  <View style={styles.menuGroup}>
                    {section.items.map((item, idx) => (
                      <Pressable
                        key={item.label}
                        style={[
                          styles.menuRow,
                          idx > 0 && styles.menuRowBorder,
                        ]}
                        onPress={() => {
                          setMenuVisible(false);
                          afterModal(item.action);
                        }}
                      >
                        <View
                          style={[
                            styles.menuIcon,
                            item.active && { backgroundColor: accentColor },
                          ]}
                        >
                          <Ionicons
                            name={item.icon as any}
                            size={17}
                            color={item.active ? "#FFFFFF" : accentColor}
                          />
                        </View>
                        <Text
                          style={[
                            styles.menuLabel,
                            item.active && { color: accentColor },
                          ]}
                        >
                          {item.label}
                        </Text>
                        {item.active ? (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color={accentColor}
                          />
                        ) : (
                          <Ionicons
                            name="chevron-forward"
                            size={15}
                            color={C.mute}
                          />
                        )}
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
              <View style={{ height: 12 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ======================= NOTE ACTIONS (bottom sheet grid) ======================= */}

      <Modal
        transparent
        visible={actionTodo !== null}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setActionTodo(null)}
      >
        <View style={styles.actionModalRoot}>
          <Pressable
            style={styles.sheetOverlay}
            onPress={() => setActionTodo(null)}
          />

          <View style={styles.sheet}>
            {/* Drag handle */}
            <View style={styles.sheetHandleContainer}>
              <View style={styles.sheetHandle} />
            </View>

            {/* Header */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderText}>
                <Text numberOfLines={2} style={styles.sheetTitle}>
                  {actionTodo?.locked
                    ? "Locked note"
                    : actionTodo?.title?.trim() || "Untitled note"}
                </Text>

                <Text style={styles.sheetSub}>
                  Choose an action for this note
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close note actions"
                onPress={() => setActionTodo(null)}
                style={styles.sheetCloseButton}
              >
                <Ionicons name="close" size={20} color={C.sub} />
              </Pressable>
            </View>

            <View style={styles.sheetDivider} />

            {/* Action grid */}
            <View style={styles.actionGrid}>
              {actionTodo &&
                buildSheetActions(actionTodo)
                  .filter((action): action is SheetAction =>
                    Boolean(
                      action &&
                      typeof action.key === "string" &&
                      action.key.length > 0 &&
                      typeof action.label === "string" &&
                      typeof action.icon === "string" &&
                      typeof action.onPress === "function",
                    ),
                  )
                  .map((action) => (
                    <Pressable
                      key={action.key}
                      accessibilityRole="button"
                      accessibilityLabel={action.label}
                      style={({ pressed }) => [
                        styles.actionCell,
                        pressed && styles.actionCellPressed,
                      ]}
                      onPress={() => {
                        setActionTodo(null);
                        afterModal(action.onPress);
                      }}
                    >
                      <View
                        style={[
                          styles.actionIcon,
                          { backgroundColor: action.bg },
                        ]}
                      >
                        <Ionicons
                          name={action.icon as any}
                          size={23}
                          color={action.color}
                        />
                      </View>

                      <Text numberOfLines={2} style={styles.actionLabel}>
                        {action.label}
                      </Text>
                    </Pressable>
                  ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================= REMINDER EDITOR ======================= */}
      <Modal
        transparent
        visible={reminderModalVisible}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !reminderBusy && setReminderModalVisible(false)}
      >
        <View style={styles.dialogOverlay}>
          <View style={styles.reminderDialog}>
            <View style={styles.reminderDialogHeader}>
              <View style={styles.reminderHeaderIcon}>
                <Ionicons name="alarm-outline" size={24} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dialogTitle}>
                  {reminderTodo && hasReminder(reminderTodo)
                    ? "Edit reminder"
                    : "Add reminder"}
                </Text>
                <Text style={styles.reminderSubtitle} numberOfLines={2}>
                  {reminderTodo?.title || "Untitled note"}
                </Text>
              </View>
              <Pressable
                onPress={() => !reminderBusy && setReminderModalVisible(false)}
                style={styles.reminderClose}
              >
                <Ionicons name="close" size={20} color={C.sub} />
              </Pressable>
            </View>
            <Text style={styles.reminderHint}>
              Only the reminder will change. Your note content stays untouched.
            </Text>
            <Text style={styles.reminderFieldLabel}>REMINDER DATE</Text>
            <Pressable
              style={styles.reminderPickerRow}
              onPress={openReminderDatePicker}
            >
              <View style={styles.reminderPickerIcon}>
                <Ionicons name="calendar-outline" size={20} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderPickerCaption}>Date</Text>
                <Text style={styles.reminderPickerValue}>
                  {reminderDateValue.toLocaleDateString([], {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.mute} />
            </Pressable>
            <Text style={styles.reminderFieldLabel}>REMINDER TIME</Text>
            <Pressable
              style={styles.reminderPickerRow}
              onPress={openReminderTimePicker}
            >
              <View style={styles.reminderPickerIcon}>
                <Ionicons name="time-outline" size={20} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderPickerCaption}>Time</Text>
                <Text style={styles.reminderPickerValue}>
                  {reminderTimeValue.toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.mute} />
            </Pressable>
            <View style={styles.reminderButtonRow}>
              <Pressable
                style={styles.reminderCancelButton}
                disabled={reminderBusy}
                onPress={() => setReminderModalVisible(false)}
              >
                <Text style={styles.reminderCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.reminderSaveButton,
                  reminderBusy && { opacity: 0.65 },
                ]}
                disabled={reminderBusy}
                onPress={() => void saveReminderFromView()}
              >
                {reminderBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={18}
                      color="#FFFFFF"
                    />
                    <Text style={styles.reminderSaveText}>Save reminder</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================= LOCK / UNLOCK / CHANGE PIN ======================= */}
      <Modal
        transparent
        visible={lockDialogVisible}
        animationType="fade"
        onRequestClose={() => !lockRequestBusy && setLockDialogVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.dialogOverlay}>
          <View style={styles.dialog}>
            <View style={{ alignItems: "center", marginBottom: 14 }}>
              <View
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 20,
                  backgroundColor: "#EDE9FE",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 10,
                }}
              >
                <Ionicons
                  name={
                    lockDialogMode === "unlock"
                      ? "lock-open"
                      : lockDialogMode === "changePin"
                        ? "key"
                        : "lock-closed"
                  }
                  size={27}
                  color="#7C3AED"
                />
              </View>
              <Text
                style={[
                  styles.dialogTitle,
                  { marginBottom: 4, textAlign: "center" },
                ]}
              >
                {lockDialogMode === "lock"
                  ? "Lock note"
                  : lockDialogMode === "unlock"
                    ? "Unlock note"
                    : "Change security PIN"}
              </Text>
              <Text
                style={{
                  color: C.sub,
                  fontSize: 13,
                  textAlign: "center",
                  lineHeight: 19,
                }}
              >
                {lockDialogMode === "lock"
                  ? "Create a 4–6 digit PIN to protect this note."
                  : lockDialogMode === "unlock"
                    ? "Enter the PIN to unlock this note."
                    : "Verify your current PIN, then create a new one."}
              </Text>
            </View>
            {(lockDialogMode === "unlock" ||
              lockDialogMode === "changePin") && (
              <TextInput
                value={currentLockPin}
                onChangeText={(v) =>
                  setCurrentLockPin(v.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="Current PIN"
                placeholderTextColor={C.mute}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                style={[styles.dialogInput, { marginBottom: 10 }]}
                editable={!lockRequestBusy}
              />
            )}
            {lockDialogMode !== "unlock" && (
              <>
                <TextInput
                  value={newLockPin}
                  onChangeText={(v) =>
                    setNewLockPin(v.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="New PIN (4–6 digits)"
                  placeholderTextColor={C.mute}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={6}
                  style={[styles.dialogInput, { marginBottom: 10 }]}
                  editable={!lockRequestBusy}
                />
                <TextInput
                  value={confirmLockPin}
                  onChangeText={(v) =>
                    setConfirmLockPin(v.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="Confirm new PIN"
                  placeholderTextColor={C.mute}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={6}
                  style={styles.dialogInput}
                  editable={!lockRequestBusy}
                />
              </>
            )}
            <View style={styles.dialogActions}>
              <Pressable
                style={styles.dialogCancel}
                disabled={lockRequestBusy}
                onPress={() => setLockDialogVisible(false)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.dialogSave,
                  {
                    backgroundColor: "#7C3AED",
                    opacity: lockRequestBusy ? 0.7 : 1,
                  },
                ]}
                disabled={lockRequestBusy}
                onPress={() => void submitLockDialog()}
              >
                {lockRequestBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.dialogSaveText}>
                    {lockDialogMode === "lock"
                      ? "Lock note"
                      : lockDialogMode === "unlock"
                        ? "Unlock"
                        : "Update PIN"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================= FOLDER / CATEGORY / TAG EDITOR ======================= */}
      <Modal
        transparent
        visible={organizationModal !== null}
        animationType="fade"
        onRequestClose={() => setOrganizationModal(null)}
      >
        <View style={styles.dialogOverlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>
              {organizationModal === "folder"
                ? editingOrganizationId
                  ? "Rename folder"
                  : "New folder"
                : organizationModal === "category"
                  ? editingOrganizationId
                    ? "Edit category"
                    : "New category"
                  : editingOrganizationId?.includes("::")
                    ? "Edit tag"
                    : "Tags"}
            </Text>

            <TextInput
              value={organizationInput}
              onChangeText={setOrganizationInput}
              placeholder={organizationModal === "tag" ? "Add a tag" : "Name"}
              placeholderTextColor={C.mute}
              style={styles.dialogInput}
              autoFocus
              onSubmitEditing={() => void saveOrganizationEditor()}
            />

            {organizationModal === "tag" && tagTodoId && (
              <View style={styles.tagList}>
                {(organizationMeta[tagTodoId]?.tags || []).map((tag) => (
                  <View key={tag} style={styles.tagRow}>
                    <Text style={styles.tagName}>#{tag}</Text>
                    <Pressable
                      onPress={() => {
                        setEditingOrganizationId(`${tagTodoId}::${tag}`);
                        setOrganizationInput(tag);
                      }}
                      style={styles.tagAction}
                    >
                      <Text style={styles.tagActionText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const nextMeta = {
                          ...organizationMeta,
                          [tagTodoId]: {
                            ...(organizationMeta[tagTodoId] || {}),
                            tags: (
                              organizationMeta[tagTodoId]?.tags || []
                            ).filter((value) => value !== tag),
                          },
                        };
                        void persistOrganization(nextMeta);
                      }}
                      style={[
                        styles.tagAction,
                        { backgroundColor: C.dangerSoft },
                      ]}
                    >
                      <Text style={[styles.tagActionText, { color: C.danger }]}>
                        Remove
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {organizationModal === "category" && (
              <>
                <Text style={styles.colorLabel}>Color</Text>
                <View style={styles.colorRow}>
                  {CATEGORY_COLORS.map((color) => (
                    <Pressable
                      key={color}
                      onPress={() => setSelectedOrganizationColor(color)}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: color },
                        selectedOrganizationColor === color &&
                          styles.colorSwatchSelected,
                      ]}
                    />
                  ))}
                </View>
              </>
            )}

            <View style={styles.dialogActions}>
              <Pressable
                style={styles.dialogCancel}
                onPress={() => setOrganizationModal(null)}
              >
                <Text style={styles.dialogCancelText}>
                  {organizationModal === "tag" ? "Done" : "Cancel"}
                </Text>
              </Pressable>
              <Pressable
                style={styles.dialogSave}
                onPress={() => void saveOrganizationEditor()}
              >
                <Text style={styles.dialogSaveText}>
                  {organizationModal === "tag" &&
                  !editingOrganizationId?.includes("::")
                    ? "Add"
                    : "Save"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* PER-NOTE IMAGE BACKGROUND GALLERY */}
      <Modal
        transparent
        visible={backgroundGalleryVisible}
        animationType="slide"
        onRequestClose={() => setBackgroundGalleryVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <View
            style={[
              styles.appearanceSheet,
              { maxHeight: "88%" },
              appTheme === "dark" && { backgroundColor: "#172033" },
            ]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.appearanceHeader}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.sheetTitle,
                    appTheme === "dark" && { color: "#F8FAFC" },
                  ]}
                >
                  Choose note background
                </Text>
                <Text
                  style={[
                    styles.sheetSub,
                    appTheme === "dark" && { color: "#CBD5E1" },
                  ]}
                >
                  Select an image for this note only
                </Text>
              </View>
              <Pressable
                onPress={() => setBackgroundGalleryVisible(false)}
                style={styles.detailsCloseButton}
              >
                <Ionicons name="close" size={21} color="#475569" />
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 10 }}
            >
              {NOTE_BACKGROUND_CATEGORIES.map((category) => (
                <Pressable
                  key={category}
                  onPress={() => setBackgroundCategory(category)}
                  style={{
                    paddingHorizontal: 13,
                    paddingVertical: 9,
                    borderRadius: 18,
                    backgroundColor:
                      backgroundCategory === category
                        ? accentColor
                        : appTheme === "dark"
                          ? "#263449"
                          : "#F1F5F9",
                  }}
                >
                  <Text
                    style={{
                      color:
                        backgroundCategory === category
                          ? "#FFFFFF"
                          : appTheme === "dark"
                            ? "#E2E8F0"
                            : "#475569",
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    {category}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <FlatList
              data={NOTE_BACKGROUND_IMAGES.filter(
                (image) =>
                  backgroundCategory === "All" ||
                  image.category === backgroundCategory,
              )}
              keyExtractor={(image) => image.id}
              numColumns={3}
              showsVerticalScrollIndicator={false}
              columnWrapperStyle={{ gap: 10 }}
              contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
              renderItem={({ item: image }) => {
                const selected = actionTodo
                  ? getOrganizationMeta(actionTodo).noteBackgroundImage ===
                    image.id
                  : false;
                return (
                  <Pressable
                    onPress={() => void selectBackgroundForActionTodo(image.id)}
                    style={{
                      flex: 1,
                      maxWidth: "33%",
                      borderRadius: 14,
                      padding: 4,
                      borderWidth: selected ? 2 : 1,
                      borderColor: selected ? accentColor : "#E2E8F0",
                      backgroundColor:
                        appTheme === "dark" ? "#1E293B" : "#FFFFFF",
                    }}
                  >
                    <Image
                      source={image.source}
                      resizeMode="cover"
                      style={{ width: "100%", height: 112, borderRadius: 10 }}
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        paddingVertical: 7,
                        textAlign: "center",
                        fontSize: 11,
                        fontWeight: "700",
                        color: appTheme === "dark" ? "#F8FAFC" : "#334155",
                      }}
                    >
                      {image.label}
                    </Text>
                    {selected && (
                      <View
                        style={{
                          position: "absolute",
                          top: 8,
                          right: 8,
                          backgroundColor: accentColor,
                          borderRadius: 12,
                          padding: 3,
                        }}
                      >
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
            <View style={{ flexDirection: "row", gap: 10, paddingTop: 8 }}>
              <Pressable
                onPress={() => void clearBackgroundForActionTodo()}
                style={[
                  styles.appearanceWideButton,
                  { flex: 1, borderColor: "#CBD5E1" },
                ]}
              >
                <Text style={styles.appearanceWideButtonText}>
                  Remove image
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setBackgroundGalleryVisible(false)}
                style={[
                  styles.appearanceApplyButton,
                  { flex: 1, backgroundColor: accentColor },
                ]}
              >
                <Text style={styles.appearanceApplyText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* PER-NOTE  NOTE DETAILS */}

      <Modal
        visible={detailsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailsVisible(false)}
      >
        <View style={styles.detailsOverlay}>
          <View style={styles.detailsCard}>
            {/* Header */}
            <View style={styles.detailsHeader}>
              <View style={styles.detailsTitleContainer}>
                <Text style={styles.detailsEyebrow}>NOTE DETAILS</Text>

                <Text style={styles.detailsTitle}>
                  {selectedTodo?.title || "Untitled note"}
                </Text>
              </View>

              <Pressable
                style={styles.detailsCloseButton}
                onPress={() => setDetailsVisible(false)}
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color={C.sub} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.detailsScroll}
              contentContainerStyle={styles.detailsScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Content */}
              <Text style={styles.detailsSectionTitle}>Content</Text>

              <View style={styles.detailsContentBox}>
                <Text style={styles.detailsContent}>
                  {selectedTodo?.text || "No content available"}
                </Text>
              </View>

              {/* Sketch / Drawing */}
              <Text style={styles.detailsSectionTitle}>Sketch / Drawing</Text>

              <View style={styles.detailsContentBox}>
                {selectedSketchUri ? (
                  <Image
                    source={{ uri: selectedSketchUri }}
                    style={styles.detailsSketchImage}
                    resizeMode="contain"
                    onError={(error) => {
                      console.warn(
                        "Unable to display sketch image:",
                        error.nativeEvent.error,
                      );
                    }}
                  />
                ) : (
                  <View style={styles.noSketchContainer}>
                    <Ionicons name="brush-outline" size={32} color={C.mute} />

                    <Text style={styles.noSketchText}>
                      No saved sketch found
                    </Text>
                  </View>
                )}
              </View>

              {/* Information */}
              <Text style={styles.detailsSectionTitle}>Information</Text>

              {[
                {
                  label: "Status",
                  value: selectedTodo?.status || "Unavailable",
                  icon: "checkmark-circle-outline" as const,
                },
                {
                  label: "Priority",
                  value: selectedTodo?.priority || "Not set",
                  icon: "flag-outline" as const,
                },
                {
                  label: "Folder",
                  value:
                    (selectedTodo as any)?.folderName ||
                    (selectedTodo as any)?.folder ||
                    "Uncategorized",
                  icon: "folder-outline" as const,
                },
                {
                  label: "Category",
                  value:
                    (selectedTodo as any)?.categoryName ||
                    (selectedTodo as any)?.category ||
                    "Uncategorized",
                  icon: "pricetag-outline" as const,
                },
                {
                  label: "Created",
                  value: selectedTodo?.createdAt
                    ? new Date(selectedTodo.createdAt).toLocaleString()
                    : "Unavailable",
                  icon: "calendar-outline" as const,
                },
                {
                  label: "Last modified",
                  value: selectedTodo?.updatedAt
                    ? new Date(selectedTodo.updatedAt).toLocaleString()
                    : "Unavailable",
                  icon: "time-outline" as const,
                },
              ].map((item) => (
                <View key={item.label} style={styles.detailsInfoRow}>
                  <View style={styles.detailsInfoIcon}>
                    <Ionicons name={item.icon} size={18} color={C.primary} />
                  </View>

                  <View style={styles.detailsInfoText}>
                    <Text style={styles.detailsInfoLabel}>{item.label}</Text>

                    <Text style={styles.detailsInfoValue}>{item.value}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 360,
              backgroundColor: "#FFFFFF",
              borderRadius: 20,
              padding: 22,
            }}
          >
            <Text
              style={{
                fontSize: 21,
                fontWeight: "700",
                color: "#064E3B",
                marginBottom: 6,
              }}
            >
              Create new
            </Text>

            <Text
              style={{
                color: "#648477",
                marginBottom: 20,
              }}
            >
              What would you like to create?
            </Text>

            <Pressable
              onPress={createQuickNote}
              style={{
                backgroundColor: "#D1FAE5",
                padding: 16,
                borderRadius: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: "#064E3B", fontWeight: "700" }}>
                📝 Quick Note
              </Text>
            </Pressable>

            <Pressable
              onPress={createTodoTask}
              style={{
                backgroundColor: "#ECFDF5",
                padding: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#A7F3D0",
                marginBottom: 12,
              }}
            >
              <Text style={{ color: "#064E3B", fontWeight: "700" }}>
                ✓ Todo Task
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setCreateModalVisible(false)}
              style={{ padding: 12, alignItems: "center" }}
            >
              <Text style={{ color: "#64748B", fontWeight: "600" }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================================
// STYLES
// ============================================================
const shadow = {
  shadowColor: "#1B1D4B",
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.07,
  shadowRadius: 16,
  elevation: 3,
} as const;

const styles = StyleSheet.create({
  homeGreeting: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    paddingHorizontal: 2,
  },
  safeArea: { flex: 1, backgroundColor: C.bg },
  container: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  roundBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
    shadowOpacity: 0.05,
  },
  headerCenter: { flex: 1, marginHorizontal: 14 },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: C.ink,
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 13,
    fontWeight: "500",
    color: C.sub,
  },

  // List
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  emptyListContent: { flexGrow: 1 },
  listFooterSpace: { height: 112 },
  gridRow: { gap: 12, alignItems: "stretch" },
  gridCell: { flex: 1, maxWidth: "50%", minWidth: 0 },

  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 14,
  },

  heroInfo: {
    flex: 1,
  },

  detailsOverlay: {
    flex: 1,
    backgroundColor: "rgba(6, 30, 22, 0.48)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },

  detailsCard: {
    width: "100%",
    maxHeight: "88%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#D5E9DF",
    overflow: "hidden",
  },

  detailsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 12,
  },

  detailsTitleContainer: {
    flex: 1,
  },

  detailsEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#10B981",
    marginBottom: 6,
  },

  detailsTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: "#064E3B",
  },

  detailsCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#EAFBF4",
    borderWidth: 1,
    borderColor: "#D5E9DF",
    alignItems: "center",
    justifyContent: "center",
  },

  detailsScroll: {
    flexGrow: 0,
  },

  detailsScrollContent: {
    paddingBottom: 12,
  },

  detailsSectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#064E3B",
    marginTop: 12,
    marginBottom: 10,
  },

  detailsContentBox: {
    backgroundColor: "#F5FCF8",
    borderWidth: 1,
    borderColor: "#D5E9DF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    minHeight: 58,
  },

  detailsContent: {
    fontSize: 14,
    lineHeight: 22,
    color: "#064E3B",
  },

  detailsSketchImage: {
    width: "100%",
    height: 220,
  },

  noSketchContainer: {
    minHeight: 110,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  recurringBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#F0EAFE",
  },

  recurringBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6D28D9",
  },
  noSketchText: {
    fontSize: 13,
    color: "#648477",
    textAlign: "center",
  },

  detailsInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 10,
    marginBottom: 8,
    backgroundColor: "#F5FCF8",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D5E9DF",
    gap: 12,
  },

  detailsInfoIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
  },

  detailsInfoText: {
    flex: 1,
  },

  detailsInfoLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#648477",
    marginBottom: 4,
  },

  detailsInfoValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#064E3B",
  },

  heroLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: C.sub,
    textTransform: "uppercase",
    marginBottom: 8,
  },

  heroNumberRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 8,
  },

  heroNumber: {
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1.5,
    color: C.ink,
  },

  heroUnit: {
    fontSize: 14,
    fontWeight: "600",
    color: C.sub,
  },

  heroSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: C.sub,
    marginTop: 6,
  },

  progressRing: {
    alignItems: "center",
    justifyContent: "center",
  },

  ring: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderWidth: 4,
    borderColor: C.primary,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },

  ringText: {
    fontSize: 18,
    fontWeight: "800",
    color: C.primary,
  },

  ringCaption: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: C.sub,
    marginTop: 7,
  },

  hero: {
    backgroundColor: "#312E81",
    borderRadius: 24,
    padding: 22,
    overflow: "hidden",
  },

  heroBlobA: {
    backgroundColor: "#6366F1",
    opacity: 0.28,
  },

  heroBlobB: {
    backgroundColor: "#8B5CF6",
    opacity: 0.22,
  },

  progressTrack: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },

  progressFill: {
    backgroundColor: "#6EE7B7",
  },

  heroStatValue: {
    color: "#FFFFFF",
  },

  heroStatLabel: {
    color: "#C7D2FE",
  },

  detailsSketchFallback: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 21,
    paddingVertical: 12,
  },

  heroStats: { flexDirection: "row", gap: 10, marginTop: 16 },
  heroStat: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  heroStatDot: { width: 7, height: 7, borderRadius: 4, marginBottom: 8 },

  detailsDoneButton: {
    marginTop: 18,
    backgroundColor: "#4F46E5",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },

  detailsDoneText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  // Search
  calendarViewToggle: {
    minHeight: 44,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  calendarViewToggleText: { color: C.ink, fontSize: 13, fontWeight: "700" },
  calendarPanel: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: C.line,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  calendarArrow: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAFBF4",
  },
  calendarMonthTitle: { color: C.ink, fontSize: 16, fontWeight: "800" },
  calendarWeekRow: { flexDirection: "row", marginBottom: 5 },
  calendarWeekday: {
    width: "14.2857%",
    textAlign: "center",
    color: C.sub,
    fontSize: 11,
    fontWeight: "700",
    paddingVertical: 7,
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarDayCell: {
    width: "14.2857%",
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    marginBottom: 2,
  },
  calendarDayText: { color: C.ink, fontSize: 13, fontWeight: "600" },
  calendarTodayCell: { borderWidth: 1, borderColor: C.primary },
  calendarNoteDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.primary,
    marginTop: 2,
  },
  calendarSelectedSummary: {
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 12,
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calendarSelectedTitle: { color: C.ink, fontSize: 13, fontWeight: "800" },
  calendarSelectedSubtitle: { color: C.sub, fontSize: 11, marginTop: 3 },
  calendarTodayButton: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  calendarTodayButtonText: { color: C.ink, fontWeight: "800", fontSize: 12 },
  searchContainer: {
    marginTop: 16,
    height: 50,
    paddingHorizontal: 16,
    borderRadius: 25,
    backgroundColor: C.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...shadow,
    shadowOpacity: 0.05,
  },
  searchInput: { flex: 1, paddingVertical: 0, fontSize: 15, color: C.ink },

  // Chips
  chipScroll: { paddingTop: 14, paddingBottom: 6, gap: 8, paddingRight: 8 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 38,
    paddingLeft: 15,
    paddingRight: 8,
    borderRadius: 19,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
  },
  filterChipActive: { backgroundColor: C.ink, borderColor: C.ink },
  filterText: { fontSize: 13, fontWeight: "700", color: C.sub },
  filterTextActive: { color: "#FFFFFF" },
  filterCount: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: C.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  filterCountActive: { backgroundColor: "rgba(255,255,255,0.18)" },
  filterCountText: { fontSize: 11, fontWeight: "800", color: C.sub },
  filterCountTextActive: { color: "#FFFFFF" },
  toolChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 17,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
  },
  toolChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  toolChipText: { fontSize: 12.5, fontWeight: "700", color: C.ink },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: C.ink,
  },
  sectionCount: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: C.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCountText: { fontSize: 11.5, fontWeight: "800", color: C.sub },

  // Card
  card: {
    backgroundColor: C.surface,
    borderRadius: 22,
    // Keep saved note patterns/images clipped to the rounded card.
    position: "relative",
    overflow: "hidden",
    paddingVertical: 16,
    paddingLeft: 19,
    paddingRight: 14,
    marginVertical: 7,
    borderWidth: 1,
    borderColor: "#DCEBE3",
    shadowColor: "#0F513D",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.075,
    shadowRadius: 13,
    elevation: 2,
  },
  cardDone: { opacity: 0.72 },
  cardAccent: {
    position: "absolute",
    left: 0,
    top: 14,
    bottom: 14,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardTitle: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "800",
    letterSpacing: -0.25,
    color: C.ink,
  },
  cardTitleDone: { textDecorationLine: "line-through", color: C.sub },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: C.chip,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: "700", color: C.sub },
  cardText: { marginTop: 10, fontSize: 13.5, lineHeight: 21, color: "#465B52" },
  cardTextDone: { color: C.mute, textDecorationLine: "line-through" },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 13,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(100,132,119,0.22)",
  },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerText: { fontSize: 11.5, fontWeight: "700", color: C.sub },
  trashBar: { flexDirection: "row", gap: 8, marginTop: 12 },
  trashBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 38,
    borderRadius: 12,
  },
  trashBtnText: { fontSize: 12.5, fontWeight: "800" },

  // Media
  mediaContainer: {
    height: 160,
    marginTop: 12,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: C.chip,
  },
  todoImage: { width: "100%", height: "100%" },
  mediaCount: {
    position: "absolute",
    right: 8,
    bottom: 8,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 13,
    backgroundColor: "rgba(18,20,43,0.7)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mediaCountText: { fontSize: 11, fontWeight: "800", color: "#FFFFFF" },
  attachmentRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 8,
    borderRadius: 14,
    backgroundColor: C.chip,
  },
  attachmentIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentTitle: { fontSize: 12.5, fontWeight: "700", color: C.ink },

  // Empty / loading
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 34,
    paddingVertical: 50,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: C.ink,
    textAlign: "center",
  },
  emptyDescription: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: C.sub,
    textAlign: "center",
  },
  emptyButton: {
    marginTop: 18,
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 23,
    backgroundColor: C.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emptyButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.bg,
    gap: 12,
  },
  loadingText: { fontSize: 13, fontWeight: "600", color: C.sub },

  // FAB
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    height: 56,
    paddingHorizontal: 22,
    borderRadius: 28,
    backgroundColor: C.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  fabText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },

  actionModalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetHandleContainer: {
    alignItems: "center",
    paddingVertical: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 18,
    gap: 12,
  },
  sheetHeaderText: { flex: 1 },
  sheetCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.line,
    marginBottom: 18,
  },
  actionCellPressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },

  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },

  appearanceSheet: {
    width: "100%",
    maxHeight: "92%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 24,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
  },

  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 10,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginTop: 3,
    marginBottom: 18,
  },

  appearanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 20,
  },

  sheetTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#172033",
    letterSpacing: -0.5,
  },

  sheetSub: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },

  appearanceSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334155",
    marginTop: 20,
    marginBottom: 11,
    letterSpacing: 0.2,
  },

  notePatternOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 14,
    overflow: "hidden",
  },
  savedThemeMotifGrid: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  notePatternLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(99, 102, 241, 0.20)",
  },
  notePatternDotRow: {
    position: "absolute",
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  notePatternDot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(99, 102, 241, 0.38)",
  },
  notePatternGrid: {
    ...StyleSheet.absoluteFill,
  },
  notePatternGridVertical: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(99, 102, 241, 0.16)",
  },
  notePatternGridHorizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(99, 102, 241, 0.16)",
  },

  patternOption: {
    flex: 1,
    minWidth: 130,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 9,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },

  patternPreview: {
    height: 76,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 9,
    paddingVertical: 7,
    justifyContent: "space-between",
    overflow: "hidden",
  },

  patternLine: {
    height: 1,
    width: "100%",
    backgroundColor: "#A5B4FC",
  },

  patternDotRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flex: 1,
  },

  patternDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#818CF8",
  },

  patternGrid: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "space-evenly",
  },

  patternGridVertical: {
    width: 1,
    height: "100%",
    backgroundColor: "#C7D2FE",
  },

  patternGridHorizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#C7D2FE",
    top: "25%",
  },

  patternLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 9,
    gap: 4,
  },

  appearanceOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },

  appearanceOptionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    alignItems: "stretch",
  },

  appearanceOption: {
    flex: 1,
    minWidth: 130,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  appearanceSwatches: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },

  appearanceSwatch: {
    width: 35,
    height: 35,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#E2E8F0",
  },

  appearanceSwatchSelected: {
    borderWidth: 3,
    borderColor: "#334155",
    transform: [{ scale: 1.1 }],
  },

  appearanceWideButton: {
    minHeight: 49,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },

  appearanceWideButtonText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },

  appearanceSmallOption: {
    flexGrow: 1,
    flexBasis: "21%",
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },

  appearanceToggleRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginBottom: 8,
    borderRadius: 13,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  appearancePreview: {
    minHeight: 125,
    padding: 17,
    marginTop: 3,
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: "hidden",
  },

  appearancePreviewDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginBottom: 12,
  },

  appearanceApplyButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    marginTop: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
  },

  appearanceApplyText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  sheet: {
    width: "100%",
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: C.line,
    elevation: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
  },

  sheetSection: {
    fontSize: 13,
    fontWeight: "700",
    color: C.sub,
    marginBottom: 8,
    marginLeft: 4,
  },
  menuGroup: { backgroundColor: C.bg, borderRadius: 20, overflow: "hidden" },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuRowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: "700", color: C.ink },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    marginHorizontal: -5,
    rowGap: 18,
  },
  actionCell: {
    width: "25%",
    minHeight: 94,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 5,
    borderRadius: 16,
  },
  actionIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
    borderWidth: 1,
    borderColor: "rgba(128,128,128,0.10)",
  },
  actionLabel: {
    width: "100%",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: C.ink,
    textAlign: "center",
  },

  // Editor dialog
  reminderDialog: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    padding: 22,
    borderWidth: 1,
    borderColor: C.line,
    shadowColor: "#064E3B",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  reminderDialogHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  reminderHeaderIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  reminderSubtitle: {
    color: C.sub,
    fontSize: 13,
    fontWeight: "600",
    marginTop: -8,
  },
  reminderClose: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  reminderHint: {
    marginTop: 14,
    marginBottom: 18,
    color: C.sub,
    fontSize: 12.5,
    lineHeight: 18,
    backgroundColor: C.bg,
    padding: 11,
    borderRadius: 12,
  },
  reminderFieldLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: "900",
    color: C.sub,
    marginBottom: 8,
    marginTop: 4,
  },
  reminderPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    marginBottom: 14,
    backgroundColor: "#FCFFFD",
  },
  reminderPickerIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  reminderPickerCaption: {
    color: C.sub,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 3,
  },
  reminderPickerValue: { color: C.ink, fontSize: 14, fontWeight: "800" },
  reminderButtonRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  reminderCancelButton: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  reminderCancelText: { color: C.sub, fontWeight: "800", fontSize: 14 },
  reminderSaveButton: {
    flex: 1,
    height: 48,
    borderRadius: 15,
    backgroundColor: C.primary,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  reminderSaveText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(18,20,43,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: C.surface,
    borderRadius: 28,
    padding: 22,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: C.ink,
    marginBottom: 14,
  },
  dialogInput: {
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 15,
    color: COLORS.ink,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  tagList: { marginTop: 12, maxHeight: 190 },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  tagName: { flex: 1, fontSize: 14, fontWeight: "700", color: C.ink },
  tagAction: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: C.primarySoft,
  },
  tagActionText: { fontSize: 12, fontWeight: "800", color: C.primary },
  colorLabel: {
    marginTop: 16,
    marginBottom: 9,
    fontSize: 13,
    fontWeight: "700",
    color: C.sub,
  },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: "transparent",
  },
  colorSwatchSelected: { borderColor: C.ink },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 22,
  },
  dialogCancel: {
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 23,
    backgroundColor: C.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogCancelText: { fontSize: 14, fontWeight: "800", color: C.sub },
  dialogSave: {
    height: 46,
    paddingHorizontal: 26,
    borderRadius: 23,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogSaveText: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  viewSwitcher: {
    flexDirection: "row",
    alignSelf: "flex-end",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    padding: 3,
    borderRadius: 12,
    backgroundColor: "#EEF4F0",
    borderWidth: 1,
    borderColor: "#DDE8E0",
  },

  viewSwitcherOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: 9,
  },

  viewSwitcherActive: {
    backgroundColor: "#319B70",
  },

  viewSwitcherText: {
    fontSize: 12,
    fontWeight: "600",
    color: C.primary,
  },

  viewSwitcherActiveText: {
    color: "#FFFFFF",
  },
});
