import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ============================================================
// API
// ============================================================
const API_BASE_URL = "http://192.168.1.5:5001";
const LOCAL_QUICK_NOTES_KEY = "local-quick-notes";

// ============================================================
// THEME
// ============================================================
const COLORS = {
  bg: "#F3F4FA",
  surface: "#FFFFFF",
  ink: "#12142B",
  sub: "#6A6F85",
  mute: "#A0A5B8",
  line: "#E8EAF3",
  chip: "#ECEEF8",
  primary: "#5146F5",
  primarySoft: "#E9E7FF",
  hero: "#17164A",
  heroSoft: "#2A2878",
  today: "#2F7CF6",
  upcoming: "#8B5CF6",
  done: "#14B8A6",
  danger: "#EF4444",
  dangerSoft: "#FEE8E8",
  amber: "#F59E0B",
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
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    source: require("../assets/images/cute1.jpg"),
  },
  {
    id: "cute2",
    label: "Cute 2",
    category: "Cute",
    source: require("../assets/images/cute2.jpg"),
  },
  {
    id: "cute3",
    label: "Cute 3",
    category: "Cute",
    source: require("../assets/images/cute3.jpg"),
  },
  {
    id: "cute4",
    label: "Cute 4",
    category: "Cute",
    source: require("../assets/images/cute4.jpg"),
  },
  {
    id: "cute5",
    label: "Cute 5",
    category: "Cute",
    source: require("../assets/images/cute5.jpg"),
  },
  {
    id: "cute6",
    label: "Cute 6",
    category: "Cute",
    source: require("../assets/images/cute6.jpg"),
  },
  {
    id: "cute7",
    label: "Cute 7",
    category: "Cute",
    source: require("../assets/images/cute7.jpg"),
  },
  {
    id: "cute8",
    label: "Cute 8",
    category: "Cute",
    source: require("../assets/images/cute8.jpg"),
  },
  {
    id: "cute9",
    label: "Cute 9",
    category: "Cute",
    source: require("../assets/images/cute9.jpg"),
  },
  {
    id: "cute10",
    label: "Cute 10",
    category: "Cute",
    source: require("../assets/images/cute10.jpg"),
  },
  {
    id: "cute11",
    label: "Cute 11",
    category: "Cute",
    source: require("../assets/images/cute11.jpg"),
  },
  {
    id: "cute12",
    label: "Cute 12",
    category: "Cute",
    source: require("../assets/images/cute12.jpg"),
  },
  {
    id: "cute13",
    label: "Cute 13",
    category: "Cute",
    source: require("../assets/images/cute13.jpg"),
  },
  {
    id: "cute14",
    label: "Cute 14",
    category: "Cute",
    source: require("../assets/images/cute14.jpg"),
  },
  {
    id: "cute15",
    label: "Cute 15",
    category: "Cute",
    source: require("../assets/images/cute15.jpg"),
  },
  {
    id: "cute16",
    label: "Cute 16",
    category: "Cute",
    source: require("../assets/images/cute16.jpg"),
  },
  {
    id: "cute17",
    label: "Cute 17",
    category: "Cute",
    source: require("../assets/images/cute17.jpg"),
  },
  {
    id: "cute18",
    label: "Cute 18",
    category: "Cute",
    source: require("../assets/images/cute18.jpg"),
  },
  {
    id: "cute19",
    label: "Cute 19",
    category: "Cute",
    source: require("../assets/images/cute19.jpg"),
  },
];
const NOTE_BACKGROUND_CATEGORIES = ["All", "Cute"];

// ============================================================
// SCREEN
// ============================================================
export default function ViewTodolistScreen() {
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
  const [gridLayout, setGridLayout] = useState(false);
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
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [selectedSketchUri, setSelectedSketchUri] = useState<string | null>(
    null,
  );

  const [appearanceVisible, setAppearanceVisible] = useState(false);
  const [backgroundGalleryVisible, setBackgroundGalleryVisible] =
    useState(false);
  const [backgroundCategory, setBackgroundCategory] = useState("All");
  const [appTheme, setAppTheme] = useState<"light" | "dark">("light");
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
    ],
  );

  const updateAppearance = useCallback(
    (patch: Record<string, any>) => {
      if (patch.appTheme !== undefined) setAppTheme(patch.appTheme);
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
    [saveAppearance],
  );

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem("notes:appearance-settings");
        if (!raw) return;
        const a = JSON.parse(raw);
        if (a.appTheme) setAppTheme(a.appTheme);
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
      } catch (error) {
        console.warn("Could not load appearance settings", error);
      }
    })();
  }, []);

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

  const loadTodos = useCallback(
    async (showLoader = true) => {
      try {
        if (showLoader) setLoading(true);

        // Always read local Quick Notes first so they remain visible even offline.
        let localNotes: any[] = [];
        try {
          const rawLocal = await AsyncStorage.getItem(LOCAL_QUICK_NOTES_KEY);
          const parsedLocal = rawLocal ? JSON.parse(rawLocal) : [];
          if (Array.isArray(parsedLocal)) {
            localNotes = parsedLocal
              .filter((note: any) => note?.isQuickNote === true)
              .map((note: any) => ({
                ...note,
                _id: String(note._id || note.id),
                id: String(note.id || note._id),
                tdlId: String(note._id || note.id),
                title: String(note.title || "Quick note"),
                text: String(note.text ?? note.description ?? ""),
                type: ["quick-note"],
                isQuickNote: true,
                quickNoteColor: note.quickNoteColor || "#FFF4CC",
                quickNotePinned: note.quickNotePinned === true,
                createdAt:
                  note.createdAt || note.updatedAt || new Date().toISOString(),
                updatedAt:
                  note.updatedAt || note.createdAt || new Date().toISOString(),
                localOnly: note.localOnly !== false,
              }));
          }
        } catch (localError) {
          console.warn("[QuickNote] Could not read local notes:", localError);
        }

        let serverTodos: any[] = [];
        let currentToken = token;
        if (!currentToken) {
          currentToken = (await AsyncStorage.getItem("login_token")) || "";
          if (currentToken) setToken(currentToken);
        }

        if (currentToken) {
          try {
            const response = await axios.get(`${API_BASE_URL}/api/todolist`, {
              headers: { Authorization: getAuthorizationHeader(currentToken) },
              timeout: 12000,
            });
            if (
              response.data?.success === true &&
              Array.isArray(response.data?.data)
            ) {
              serverTodos = response.data.data;
            }
          } catch (apiError: any) {
            console.warn(
              "[QuickNote] Server list unavailable; showing local notes too.",
              apiError?.response?.data || apiError?.message || apiError,
            );
          }
        }

        // Keep the local copy first, but don't duplicate it if its server ID is
        // already present in the API list.
        const localServerIds = new Set(
          localNotes
            .map((note: any) => String(note.serverTodoId || ""))
            .filter(Boolean),
        );
        const localIds = new Set(
          localNotes.map((note: any) => String(note._id)),
        );
        const remainingServerTodos = serverTodos.filter((serverTodo: any) => {
          const serverId = String(
            serverTodo.tdlId ||
              serverTodo._id ||
              serverTodo.id ||
              serverTodo.todoId ||
              "",
          );
          return !localServerIds.has(serverId) && !localIds.has(serverId);
        });

        const combined = [...localNotes, ...remainingServerTodos];
        setTodos(combined as Todo[]);
        console.log("[QuickNote] List populated", {
          localQuickNotes: localNotes.length,
          serverTodos: serverTodos.length,
          displayedTodos: combined.length,
        });
      } catch (error: any) {
        console.error(
          "❌ LOAD TODOS ERROR:",
          error?.response?.data || error?.message || error,
        );
        setTodos([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  const getTodoKey = useCallback(
    (todo: Todo) =>
      String(
        todo.tdlId ||
          todo._id ||
          (todo as any).id ||
          (todo as any).todoId ||
          "",
      ),
    [],
  );

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

  const getQuickNoteMeta = useCallback(
    (todo: Todo): QuickNoteMeta => {
      const id = getTodoKey(todo);
      const titleKey = String(todo.title || "")
        .trim()
        .toLowerCase();
      const todoData = todo as any;

      const metadata =
        quickNoteMeta[id] ||
        quickNoteMeta[String(todoData.tdlId || "")] ||
        quickNoteMeta[String(todoData._id || "")] ||
        quickNoteMeta[String(todoData.id || "")] ||
        quickNoteMeta[String(todoData.todoId || "")] ||
        quickNoteMeta[titleKey] ||
        {};

      const normalize = (value: unknown) =>
        String(value ?? "")
          .trim()
          .toLowerCase()
          .replace(/[\s_-]/g, "");

      const noteType = normalize(todoData.noteType ?? todoData.note_type);
      const rawTypes = Array.isArray(todoData.type)
        ? todoData.type
        : [todoData.type];
      const normalizedTypes = rawTypes.map(normalize);

      // If the backend explicitly marks the record as a quick note,
      // use that value as the source of truth. This includes noteType: "quick".
      const hasExplicitNoteType = Boolean(noteType);
      const isQuickNote = hasExplicitNoteType
        ? ["quick", "quicknote"].includes(noteType)
        : metadata.isQuickNote === true ||
          String(metadata.isQuickNote).toLowerCase() === "true" ||
          todoData.isQuickNote === true ||
          String(todoData.isQuickNote).toLowerCase() === "true" ||
          todoData.isQuickNotes === true ||
          todoData.quickNote === true ||
          String(todoData.quickNote).toLowerCase() === "true" ||
          todoData.localOnly === true ||
          normalizedTypes.some((value: string) =>
            ["quick", "quicknote"].includes(value),
          );

      return {
        ...metadata,
        isQuickNote,
        quickNotePinned:
          metadata.quickNotePinned === true ||
          todoData.quickNotePinned === true,
        quickNoteColor: metadata.quickNoteColor || todoData.quickNoteColor,
      };
    },
    [getTodoKey, quickNoteMeta],
  );

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
        if (raw) setPinnedIds(JSON.parse(raw));
      })
      .catch(() => undefined);
    void loadQuickNoteMetadata();
  }, [loadQuickNoteMetadata]);

  // Refresh server todos and local Quick Note metadata whenever this screen
  // becomes active again (for example, after saving a note in /opentodolist).
  // This is logic-only; it does not change the screen UI.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const refresh = async () => {
        await loadAuth();
        if (!active) return;
        await loadTodos(false);
        if (!active) return;
        await loadQuickNoteMetadata();
      };
      void refresh();
      return () => {
        active = false;
      };
    }, [loadAuth, loadTodos, loadQuickNoteMetadata]),
  );

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

  const copyNote = useCallback(async (todo: Todo) => {
    await Clipboard.setStringAsync(
      `${todo.title || ""}\n\n${todo.text || ""}`.trim(),
    );
    Alert.alert("Copied", "Note title and text copied.");
  }, []);

  const duplicateTodo = useCallback(
    async (todo: Todo) => {
      try {
        const currentToken =
          token || (await AsyncStorage.getItem("login_token")) || "";
        if (!currentToken) {
          Alert.alert("Login required", "Please sign in again.");
          return;
        }
        const form = new FormData();
        form.append("title", `${todo.title || "Untitled note"} (Copy)`);
        form.append("text", todo.text || "");
        form.append("date", todo.date || new Date().toISOString().slice(0, 10));
        form.append("status", todo.status || "Today");
        const user = await AsyncStorage.getItem("userId");
        if (user) form.append("userId", user);
        const response = await axios.post(
          `${API_BASE_URL}/api/createTodolist`,
          form,
          {
            headers: {
              Authorization: getAuthorizationHeader(currentToken),
              "Content-Type": "multipart/form-data",
            },
          },
        );
        if (response.data?.success !== true)
          throw new Error(response.data?.message || "Duplicate failed.");
        await loadTodos(false);
        Alert.alert("Duplicated", "A copy of the note was created.");
      } catch (error: any) {
        Alert.alert(
          "Duplicate failed",
          error?.response?.data?.message ||
            error?.message ||
            "Unable to duplicate note.",
        );
      }
    },
    [token, loadTodos],
  );

  const editTodo = (todo: Todo) => {
    router.push({
      pathname: "/opentodolist",
      params: { isEditMode: "true", editTodo: JSON.stringify(todo) },
    });
  };

  const addTodo = () => {
    Alert.alert("Create new", "What would you like to create?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Quick Note",
        onPress: () =>
          router.push({
            pathname: "/opentodolist",
            params: { quickNote: "true" },
          }),
      },
      {
        text: "Todo Task",
        onPress: () =>
          router.push({
            pathname: "/opentodolist",
            params: { quickNote: "false" },
          }),
      },
    ]);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadTodos(false), loadQuickNoteMetadata()]);
  }, [loadTodos, loadQuickNoteMetadata]);

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

    if (filter !== "All") {
      result = result.filter((todo) => todo.status === filter);
    }

    result = result.filter((todo) => {
      const key = getTodoKey(todo);
      const meta = organizationMeta[key] || {};
      const quickMeta = getQuickNoteMeta(todo);

      // Quick Notes: don't apply folder filtering to these notes
      if (collectionFilter === "quickNotes") {
        if (quickMeta.isQuickNote !== true) return false;
        if (meta.trashed || meta.archived) return false;

        if (
          categoryFilter !== "all" &&
          !(meta.categoryIds || []).includes(categoryFilter)
        ) {
          return false;
        }

        return true;
      }

      // Favorites
      if (collectionFilter === "favorites" && !meta.favorite) {
        return false;
      }

      // Archived
      if (collectionFilter === "archived" && !meta.archived) {
        return false;
      }

      // Trash
      if (collectionFilter === "trash" && !meta.trashed) {
        return false;
      }

      // Hide trashed notes outside Trash
      if (collectionFilter !== "trash" && meta.trashed) {
        return false;
      }

      // Hide archived notes outside Archived and Trash
      if (
        collectionFilter !== "archived" &&
        collectionFilter !== "trash" &&
        meta.archived
      ) {
        return false;
      }

      // Folder filtering
      const specialCollections = [
        "all",
        "quickNotes",
        "favorites",
        "archived",
        "trash",
      ];

      if (
        !specialCollections.includes(collectionFilter) &&
        meta.folderId !== collectionFilter
      ) {
        return false;
      }

      // Category filtering
      if (
        categoryFilter !== "all" &&
        !(meta.categoryIds || []).includes(categoryFilter)
      ) {
        return false;
      }

      return true;
    });

    // Sort pinned notes first, then Quick Notes, then the selected sort order
    result.sort((a, b) => {
      const aKey = getTodoKey(a);
      const bKey = getTodoKey(b);

      const aMeta = getQuickNoteMeta(a);
      const bMeta = getQuickNoteMeta(b);

      const aPinned =
        pinnedIds.includes(aKey) || aMeta.quickNotePinned === true;
      const bPinned =
        pinnedIds.includes(bKey) || bMeta.quickNotePinned === true;

      if (aPinned !== bPinned) {
        return aPinned ? -1 : 1;
      }

      const aQuick = aMeta.isQuickNote === true;
      const bQuick = bMeta.isQuickNote === true;

      if (aQuick !== bQuick) {
        return aQuick ? -1 : 1;
      }

      if (sortBy === "title") {
        return String(a.title || "").localeCompare(String(b.title || ""));
      }

      if (sortBy === "modified") {
        return (
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime()
        );
      }

      if (sortBy === "priority") {
        const rank: Record<string, number> = {
          High: 3,
          Medium: 2,
          Low: 1,
        };

        return (
          (rank[organizationMeta[getTodoKey(b)]?.priority || ""] || 0) -
          (rank[organizationMeta[getTodoKey(a)]?.priority || ""] || 0)
        );
      }

      const aTime = a.date
        ? new Date(a.date).getTime()
        : Number.MAX_SAFE_INTEGER;

      const bTime = b.date
        ? new Date(b.date).getTime()
        : Number.MAX_SAFE_INTEGER;

      return aTime - bTime;
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
    getQuickNoteMeta,
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

    if (collectionFilter === "quickNotes") return "Quick Notes";
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

    const list: SheetAction[] = [
      {
        key: "edit",
        label: "Edit",
        icon: "create",
        color: C.primary,
        bg: C.primarySoft,
        onPress: () => editTodo(todo),
      },
      {
        key: "fav",
        label: meta.favorite ? "Unfavorite" : "Favorite",
        icon: meta.favorite ? "star" : "star-outline",
        color: C.amber,
        bg: "#FEF3C7",
        onPress: () => void updateNoteMeta(todo, { favorite: !meta.favorite }),
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
        key: "note-color",
        label: "Note appearance",
        icon: "color-fill-outline",
        color: accentColor,
        bg: "#EEF2FF",
        onPress: () => {
          setActionTodo(todo);
          setAppearanceVisible(true);
        },
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
    list.push(
      {
        key: "details",
        label: "Details",
        icon: "eye-outline",
        color: C.sub,
        bg: C.chip,
        onPress: () => showDetails(todo),
      },
      {
        key: "duplicate",
        label: "Duplicate",
        icon: "copy-outline",
        color: C.sub,
        bg: C.chip,
        onPress: () => void duplicateTodo(todo),
      },
      {
        key: "copy",
        label: "Copy text",
        icon: "clipboard-outline",
        color: C.sub,
        bg: C.chip,
        onPress: () => void copyNote(todo),
      },
      {
        key: "trash",
        label: "Trash",
        icon: "trash-outline",
        color: C.danger,
        bg: C.dangerSoft,
        onPress: () => moveToTrash(todo),
      },
    );
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

    const selectedBackground = NOTE_BACKGROUND_IMAGES.find(
      (image) => image.id === organization.noteBackgroundImage,
    )?.source;
    const CardContainer: any = selectedBackground ? ImageBackground : View;
    const cardContainerProps = selectedBackground
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
          resizeMode: "cover" as const,
        }
      : {};

    return (
      <CardContainer
        {...cardContainerProps}
        style={[
          styles.card,
          {
            backgroundColor: selectedBackground
              ? "rgba(255,255,255,0.48)"
              : organization.noteColor ||
                (isQuickNote
                  ? noteMeta.quickNoteColor || defaultNoteColor
                  : defaultNoteColor),
            borderColor:
              organization.noteColor ||
              (isQuickNote
                ? noteMeta.quickNoteColor || defaultNoteColor
                : defaultNoteColor),
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
        {(organization.notePattern || "plain") !== "plain" && (
          <View pointerEvents="none" style={styles.notePatternOverlay}>
            {organization.notePattern === "lined" &&
              Array.from({ length: 12 }).map((_, i) => (
                <View
                  key={`line-${i}`}
                  style={[styles.notePatternLine, { top: 18 + i * 18 }]}
                />
              ))}
            {organization.notePattern === "dotted" &&
              Array.from({ length: 10 }).map((_, i) => (
                <View
                  key={`dot-row-${i}`}
                  style={[styles.notePatternDotRow, { top: 12 + i * 18 }]}
                >
                  {Array.from({ length: 9 }).map((__, j) => (
                    <View key={`dot-${j}`} style={styles.notePatternDot} />
                  ))}
                </View>
              ))}
            {organization.notePattern === "grid" && (
              <View style={styles.notePatternGrid}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <View
                    key={`grid-v-${i}`}
                    style={[
                      styles.notePatternGridVertical,
                      { left: `${(i + 1) * 7.5}%` },
                    ]}
                  />
                ))}
                {Array.from({ length: 10 }).map((_, i) => (
                  <View
                    key={`grid-h-${i}`}
                    style={[
                      styles.notePatternGridHorizontal,
                      { top: 12 + i * 18 },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Title row */}
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
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
              {item.title || "Untitled note"}
            </Text>
          </View>
          {isPinned && (
            <Ionicons
              name="bookmark"
              size={15}
              color="#D97706"
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
        {!!item.text && (
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
        )}

        {renderMedia(item)}

        {/* Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.footerItem}>
            <Ionicons name="calendar-outline" size={14} color={C.mute} />
            <Text style={styles.footerText}>{formatTodoDate(item.date)}</Text>
          </View>
          {item.alarm ? (
            <View style={[styles.footerItem, { flexShrink: 1 }]}>
              <Ionicons name="alarm-outline" size={14} color="#D97706" />
              <Text
                numberOfLines={1}
                style={[styles.footerText, { color: "#B45309" }]}
              >
                {formatAlarm(item.alarm)}
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
          label: "Quick notes",
          icon: "flash-outline",
          active: collectionFilter === "quickNotes",
          action: () => {
            setCollectionFilter("quickNotes");
            setFilter("All");
            setCategoryFilter("all");
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
      title: "Personalize",
      items: [
        {
          label: "Theme & note appearance",
          icon: "color-palette-outline",
          action: () => setAppearanceVisible(true),
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
      style={[
        styles.safeArea,
        appTheme === "dark" && { backgroundColor: "#0F172A" },
      ]}
    >
      <StatusBar
        barStyle={appTheme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={appTheme === "dark" ? "#0F172A" : C.bg}
      />

      <View
        style={[
          styles.container,
          appTheme === "dark" && { backgroundColor: "#0F172A" },
        ]}
      >
        {/* HEADER */}
        <View
          style={[
            styles.header,
            appTheme === "dark" && { backgroundColor: "#0F172A" },
          ]}
        >
          <Pressable
            style={[
              styles.roundBtn,
              appTheme === "dark" && { backgroundColor: "#1E293B" },
            ]}
            onPress={() => router.back()}
            hitSlop={8}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={appTheme === "dark" ? "#F8FAFC" : C.ink}
            />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text
              style={[
                styles.headerTitle,
                appTheme === "dark" && { color: "#F8FAFC" },
              ]}
            >
              My Notes
            </Text>
            <Text
              style={[
                styles.headerSubtitle,
                appTheme === "dark" && { color: "#CBD5E1" },
              ]}
            >
              {counts.today > 0
                ? `${counts.today} due today`
                : "Nothing due today"}
            </Text>
          </View>
          <Pressable
            style={[
              styles.roundBtn,
              appTheme === "dark" && { backgroundColor: "#1E293B" },
            ]}
            onPress={() => setMenuVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open notes menu"
            hitSlop={8}
          >
            <Ionicons
              name="options-outline"
              size={21}
              color={appTheme === "dark" ? "#F8FAFC" : C.ink}
            />
          </Pressable>
        </View>

        <FlatList
          data={regularTodos}
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
            regularTodos.length === 0 &&
              quickNoteTodos.length === 0 &&
              styles.emptyListContent,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={C.primary}
              colors={[C.primary]}
            />
          }
          ListHeaderComponent={
            <View>
              {/* HERO OVERVIEW */}
              {showHero && (
                <View style={styles.hero}>
                  <View style={styles.heroBlobA} />
                  <View style={styles.heroBlobB} />
                  <View style={styles.heroTop}>
                    <View>
                      <Text style={styles.heroLabel}>Your workspace</Text>
                      <View style={styles.heroNumberRow}>
                        <Text style={styles.heroNumber}>{counts.all}</Text>
                        <Text style={styles.heroUnit}>
                          {counts.all === 1 ? "active item" : "active items"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.ring}>
                      <Text style={styles.ringText}>{progress}%</Text>
                    </View>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${progress}%` as any },
                      ]}
                    />
                  </View>
                  <View style={styles.heroStats}>
                    {[
                      { label: "Today", value: counts.today, color: "#7FB0FF" },
                      {
                        label: "Upcoming",
                        value: counts.upcoming,
                        color: "#C4A8FF",
                      },
                      {
                        label: "Done",
                        value: counts.completed,
                        color: "#6EE7D6",
                      },
                    ].map((s) => (
                      <View key={s.label} style={styles.heroStat}>
                        <View
                          style={[
                            styles.heroStatDot,
                            { backgroundColor: s.color },
                          ]}
                        />
                        <Text style={styles.heroStatValue}>{s.value}</Text>
                        <Text style={styles.heroStatLabel}>{s.label}</Text>
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

              {showQuickNotes && (
                <View style={{ marginTop: 6 }}>
                  {sectionHeader(
                    "flash",
                    C.amber,
                    "Quick notes",
                    quickNoteTodos.length,
                  )}

                  {quickNoteTodos.length > 0 ? (
                    quickNoteTodos.map((item, index) => (
                      <View
                        key={String(
                          item.tdlId ||
                            item._id ||
                            item.id ||
                            `quick-note-${index}`,
                        )}
                      >
                        {renderTodo({ item })}
                      </View>
                    ))
                  ) : (
                    <View
                      style={{
                        paddingVertical: 20,
                        paddingHorizontal: 16,
                        alignItems: "center",
                        borderRadius: 12,
                        marginTop: 8,
                        backgroundColor: C.card,
                      }}
                    >
                      <Ionicons
                        name="flash-outline"
                        size={28}
                        color={C.amber}
                      />

                      <Text
                        style={{
                          marginTop: 8,
                          fontSize: 14,
                          fontWeight: "600",
                          color: C.text,
                        }}
                      >
                        No quick notes found
                      </Text>

                      <Text
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: C.secondaryText,
                          textAlign: "center",
                        }}
                      >
                        Create a quick note or check whether its metadata was
                        saved.
                      </Text>
                    </View>
                  )}
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
                  {actionTodo?.title?.trim() || "Untitled note"}
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
                buildSheetActions(actionTodo).map((action) => (
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

      {/* THEME, NOTE APPEARANCE & HOME PERSONALIZATION */}
      <Modal
        transparent
        visible={appearanceVisible}
        animationType="slide"
        onRequestClose={() => setAppearanceVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <View
            style={[
              styles.appearanceSheet,
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
                  Personalize your notes
                </Text>
                <Text
                  style={[
                    styles.sheetSub,
                    appTheme === "dark" && { color: "#CBD5E1" },
                  ]}
                >
                  Theme, colors, notebook and home layout
                </Text>
              </View>
              <Pressable
                onPress={() => setAppearanceVisible(false)}
                style={styles.detailsCloseButton}
              >
                <Ionicons name="close" size={21} color="#475569" />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: "82%" }}
            >
              <Text
                style={[
                  styles.appearanceSectionTitle,
                  appTheme === "dark" && { color: "#CBD5E1" },
                ]}
              >
                App theme
              </Text>
              <View style={styles.appearanceOptionRow}>
                {[
                  {
                    label: "Light mode",
                    value: "light",
                    icon: "sunny-outline",
                  },
                  { label: "Dark mode", value: "dark", icon: "moon-outline" },
                ].map((x: any) => (
                  <Pressable
                    key={x.value}
                    onPress={() => updateAppearance({ appTheme: x.value })}
                    style={[
                      styles.appearanceOption,
                      appTheme === x.value && {
                        borderColor: accentColor,
                        backgroundColor:
                          x.value === "dark" ? "#24314A" : "#EEF2FF",
                      },
                    ]}
                  >
                    <Ionicons name={x.icon} size={20} color={accentColor} />
                    <Text style={styles.appearanceOptionText}>{x.label}</Text>
                    {appTheme === x.value && (
                      <Ionicons
                        name="checkmark-circle"
                        size={17}
                        color={accentColor}
                      />
                    )}
                  </Pressable>
                ))}
              </View>
              <Text
                style={[
                  styles.appearanceSectionTitle,
                  appTheme === "dark" && { color: "#CBD5E1" },
                ]}
              >
                App accent color
              </Text>
              <View style={styles.appearanceSwatches}>
                {[
                  "#5146F5",
                  "#2563EB",
                  "#0891B2",
                  "#059669",
                  "#EA580C",
                  "#DB2777",
                  "#7C3AED",
                  "#334155",
                ].map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => updateAppearance({ accentColor: color })}
                    style={[
                      styles.appearanceSwatch,
                      { backgroundColor: color },
                      accentColor === color && styles.appearanceSwatchSelected,
                    ]}
                  />
                ))}
              </View>
              <Text
                style={[
                  styles.appearanceSectionTitle,
                  appTheme === "dark" && { color: "#CBD5E1" },
                ]}
              >
                Default note background / custom note colors
              </Text>
              <View style={styles.appearanceSwatches}>
                {appearanceColors.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() =>
                      updateAppearance({ defaultNoteColor: color })
                    }
                    style={[
                      styles.appearanceSwatch,
                      {
                        backgroundColor: color,
                        borderColor:
                          defaultNoteColor === color ? accentColor : "#CBD5E1",
                      },
                      defaultNoteColor === color &&
                        styles.appearanceSwatchSelected,
                    ]}
                  />
                ))}
              </View>
              {actionTodo && (
                <Pressable
                  style={[
                    styles.appearanceWideButton,
                    { borderColor: accentColor },
                  ]}
                  onPress={async () => {
                    const id = getTodoKey(actionTodo);
                    if (id) {
                      await updateNoteMeta(actionTodo, {
                        noteColor: defaultNoteColor,
                        notePattern,
                      });
                    }
                    setAppearanceVisible(false);
                    setActionTodo(null);
                  }}
                >
                  <Ionicons
                    name="color-fill-outline"
                    size={18}
                    color={accentColor}
                  />
                  <Text
                    style={[
                      styles.appearanceWideButtonText,
                      { color: accentColor },
                    ]}
                  >
                    Apply selected color to “{actionTodo.title || "this note"}”
                  </Text>
                </Pressable>
              )}
              {actionTodo && (
                <Pressable
                  style={[
                    styles.appearanceWideButton,
                    { borderColor: accentColor },
                  ]}
                  onPress={() => {
                    setBackgroundCategory("All");
                    setBackgroundGalleryVisible(true);
                  }}
                >
                  <Ionicons
                    name="images-outline"
                    size={18}
                    color={accentColor}
                  />
                  <Text
                    style={[
                      styles.appearanceWideButtonText,
                      { color: accentColor },
                    ]}
                  >
                    Choose image background
                  </Text>
                </Pressable>
              )}

              <Pressable
                style={[
                  styles.appearanceApplyButton,
                  { backgroundColor: accentColor },
                ]}
                onPress={() => setAppearanceVisible(false)}
              >
                <Text style={styles.appearanceApplyText}>Done</Text>
              </Pressable>
              <View style={{ height: 18 }} />
            </ScrollView>
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

      <Modal
        visible={detailsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailsVisible(false)}
      >
        <View style={styles.detailsOverlay}>
          <View style={styles.detailsCard}>
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
              >
                <Ionicons name="close" size={22} color="#475569" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.detailsScroll}
              showsVerticalScrollIndicator={false}
            >
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
                    <Ionicons name="brush-outline" size={32} color="#94A3B8" />
                    <Text style={styles.noSketchText}>
                      No saved sketch found
                    </Text>
                  </View>
                )}
              </View>

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
                    <Ionicons name={item.icon} size={18} color="#6366F1" />
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
  listContent: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 130 },
  emptyListContent: { flexGrow: 1 },
  gridRow: { gap: 10 },
  gridCell: { flex: 1, maxWidth: "50%" },

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

  heroLabel: {
    color: "#C7D2FE",
  },

  heroNumber: {
    color: "#FFFFFF",
  },

  heroUnit: {
    color: "#C7D2FE",
  },

  ring: {
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  ringText: {
    color: "#FFFFFF",
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

  detailsSketchImage: {
    width: "100%",
    height: 260,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
  },

  noSketchContainer: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  noSketchText: {
    fontSize: 13,
    color: "#94A3B8",
  },

  detailsSketchFallback: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 21,
    paddingVertical: 12,
  },

  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  heroNumberRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 2,
    gap: 8,
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

  detailsOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  detailsCard: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "85%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 22,
    overflow: "hidden",
  },

  detailsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 22,
  },

  detailsTitleContainer: {
    flex: 1,
    paddingRight: 12,
  },

  detailsEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#6366F1",
    marginBottom: 7,
  },

  detailsTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 29,
  },

  detailsCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  detailsScroll: {
    flexGrow: 0,
  },

  detailsSectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#334155",
    marginBottom: 12,
    marginTop: 5,
  },

  detailsContentBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 15,
    marginBottom: 22,
  },

  detailsContent: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 23,
  },

  detailsInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  detailsInfoIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  detailsInfoText: {
    flex: 1,
  },

  detailsInfoLabel: {
    fontSize: 12,
    color: "#94A3B8",
    marginBottom: 4,
  },

  detailsInfoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
  },

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
    paddingVertical: 15,
    paddingLeft: 20,
    paddingRight: 14,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: C.line,
    ...shadow,
  },
  cardDone: { opacity: 0.7 },
  cardAccent: {
    position: "absolute",
    left: 0,
    top: 16,
    bottom: 16,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  cardTitle: {
    fontSize: 16.5,
    lineHeight: 23,
    fontWeight: "800",
    letterSpacing: -0.3,
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
  cardText: { marginTop: 10, fontSize: 14, lineHeight: 21, color: "#4B5068" },
  cardTextDone: { color: C.mute, textDecorationLine: "line-through" },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 12,
  },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerText: { fontSize: 12, fontWeight: "600", color: C.sub },
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
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
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
    ...StyleSheet.absoluteFillObject,
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
});
