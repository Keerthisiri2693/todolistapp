import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { updateHomeNoteWidget } from "../../utils/homeNoteWidget";

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import axios from "axios";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import { router, useLocalSearchParams } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { useAppTheme } from "../../context/app-theme-context";
import { NitroDigitalInk } from "../../utils/NitroDigitalInk.web";

const API_BASE_URL = "https://todolistbackend-855c.onrender.com/";

type TodoStatus = "Pending" | "Completed" | "Overdue";

type ReorderChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
};

type DrawingPoint = { x: number; y: number; t?: number };
type DrawingStroke = { points: DrawingPoint[]; color: string; width: number };

type TodoItem = {
  id?: string | number;
  tdlId?: string | number;
  _id?: string | number;
  todoId?: string | number;
  title?: string;
  text?: string;
  date?: string;
  alarm?: string;
  reminderDate?: string | null;
  reminderTime?: string | null;
  recurring?: "none" | "daily" | "weekly" | "monthly";
  status?: string;
  type?: string;
  fileIds?: unknown;
  backgroundImageUrl?: string;
  backgroundImage?: string;
  quickNoteColor?: string;
  quickNotePinned?: boolean;
  notePattern?: "plain" | "lined" | "dotted" | "grid";
  createdAt?: string;
  updatedAt?: string;
};

type ApiResponse = {
  success?: boolean;
  message?: string;
  data?: TodoItem | string;
  todo?: TodoItem;
  task?: TodoItem;
};

const createLocalQuickNoteId = () =>
  `quick-note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const LOCAL_QUICK_NOTES_KEY = "local-quick-notes";

type LocalQuickNote = {
  _id: string;
  id: string;
  title: string;
  description?: string;
  text?: string;
  drawingUri?: string;
  drawingText?: string;
  imageUri?: string;
  videoUri?: string;
  voiceUri?: string;
  backgroundImageUri?: string;
  backgroundImageUrl?: string;
  notePattern?: "plain" | "lined" | "dotted" | "grid";
  serverTodoId?: string;
  isQuickNote: true;
  quickNoteColor: string;
  quickNotePinned: boolean;
  createdAt: string;
  updatedAt: string;
  localOnly: boolean;
};

const COLORS = {
  background: "#F3F7F5",
  surface: "#FFFFFF",
  primary: "#239B83",
  primaryDark: "#176B5D",
  primaryLight: "#E0F4EE",
  text: "#172F2B",
  secondaryText: "#71827D",
  border: "#DCEAE5",
  muted: "#EDF4F1",
  green: "#16866D",
  greenLight: "#E0F5EC",
  orange: "#C9852A",
  orangeLight: "#FFF4E3",
  red: "#D94F5C",
  redLight: "#FFF0F1",
};

const authHeader = (token: string) => ({
  Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
});

const toDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toAlarmLabel = (date: Date) => {
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStatusForDate = (dateText: string, dueDateTime?: Date): TodoStatus => {
  if (!dateText) return "Pending";
  // When the selected due time is available, compare the full timestamp.
  // Otherwise treat the date as due at the end of that day.
  const due =
    dueDateTime && !Number.isNaN(dueDateTime.getTime())
      ? dueDateTime
      : new Date(`${dateText}T23:59:59`);
  if (Number.isNaN(due.getTime())) return "Pending";
  return due.getTime() < Date.now() ? "Overdue" : "Pending";
};

const getFileName = (uri: string, fallback: string) => {
  const lastPart = uri.split("/").pop()?.split("?")[0];
  return lastPart || `${fallback}_${Date.now()}`;
};

const parseDateText = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatLongDate = (dateText: string) => {
  const date = parseDateText(dateText);
  if (!date) return "Choose due date";
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.message ||
      error.message ||
      "Unable to connect to the server."
    );
  }
  return error instanceof Error ? error.message : "Something went wrong.";
};

type VideoPreviewProps = { uri: string };

function VideoPreview({ uri }: VideoPreviewProps) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.pause();
  });

  return (
    <View style={styles.videoPreviewCard}>
      <VideoView
        player={player}
        style={styles.videoPreview}
        nativeControls
        contentFit="contain"
      />
      <Text style={styles.videoPreviewCaption}>Selected video</Text>
    </View>
  );
}

export default function TodolistScreen() {
  const { isDark, colors: appTheme } = useAppTheme();
  const [reorderChecklistVisible, setReorderChecklistVisible] = useState(false);

  const [reorderChecklistItems, setReorderChecklistItems] = useState<
    ReorderChecklistItem[]
  >([]);

  const openChecklistReorder = () => {
    const items = content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .filter((line) => /^[\s]*[☐☑✓]/.test(line))
      .map((line, index) => {
        const trimmedLine = line.trim();
        const checked = /^[☑✓]/.test(trimmedLine);

        return {
          id: `reorder-${Date.now()}-${index}`,
          text: trimmedLine.replace(/^[☐☑✓]\s*/, ""),
          checked,
        };
      });

    setReorderChecklistItems(items);
    setReorderChecklistVisible(true);
  };

  const saveChecklistReorder = (items: ReorderChecklistItem[]) => {
    setReorderChecklistItems(items);

    const reorderedText = items
      .map((item) => `${item.checked ? "☑" : "☐"} ${item.text}`)
      .join("\n");

    setContent(reorderedText);
    setModifiedAt(new Date().toISOString());
  };
  // Adapt the existing StyleSheet palette to the selected app-wide theme.
  // Note-specific colors and inline custom colors remain unchanged.
  const themeStyle = (style: any): any => {
    if (!style || typeof style !== "object" || Array.isArray(style))
      return style;
    const result: Record<string, any> = {};
    const normalize = (value: unknown) =>
      typeof value === "string" ? value.toLowerCase() : value;

    Object.entries(style).forEach(([key, value]) => {
      if (typeof value !== "string" || !/^#[0-9a-f]{3,8}$/i.test(value)) {
        result[key] = value;
        return;
      }
      const hex = normalize(value);
      if (key === "backgroundColor") {
        if (
          [
            "#ffffff",
            "#fff",
            "#fafbfe",
            "#fafcff",
            "#f8fafc",
            "#f9fbfa",
          ].includes(hex as string)
        ) {
          result[key] = appTheme.surface;
        } else if (
          ["#f3f7f5", "#f5f8f7", "#f7faf9", "#f8fbfa", "#f9fbfa"].includes(
            hex as string,
          )
        ) {
          result[key] = appTheme.background;
        } else if (
          [
            "#e0f4ee",
            "#eaf7f2",
            "#e0f5ec",
            "#edf4f1",
            "#eef3ff",
            "#e8f0ed",
          ].includes(hex as string)
        ) {
          result[key] = isDark ? appTheme.surface : appTheme.primaryLight;
        } else {
          result[key] = value;
        }
      } else if (key === "color") {
        if (
          [
            "#172f2b",
            "#17233f",
            "#193d37",
            "#243247",
            "#24443e",
            "#254740",
            "#183a3b",
            "#123d3b",
            "#49596c",
          ].includes(hex as string)
        ) {
          result[key] = appTheme.text;
        } else if (
          [
            "#71827d",
            "#8491a3",
            "#87958f",
            "#8aa19a",
            "#91a09b",
            "#737f8e",
            "#727c96",
          ].includes(hex as string)
        ) {
          result[key] = appTheme.secondaryText;
        } else if (
          [
            "#239b83",
            "#16866d",
            "#138a78",
            "#20a58b",
            "#159f89",
            "#087b72",
            "#39bda0",
          ].includes(hex as string)
        ) {
          result[key] = personalAccentColor;
        } else {
          result[key] = value;
        }
      } else if (key === "borderColor") {
        if (
          [
            "#dceae5",
            "#e5eaf3",
            "#e5eeec",
            "#e9eef4",
            "#d7eee6",
            "#e8eeec",
          ].includes(hex as string)
        ) {
          result[key] = appTheme.border;
        } else {
          result[key] = value;
        }
      } else {
        result[key] = value;
      }
    });
    return result;
  };
  const [strikethrough, setStrikethrough] = useState(false);
  const [listNumber, setListNumber] = useState(1);

  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [attachmentModalVisible, setAttachmentModalVisible] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const [colorPaletteVisible, setColorPaletteVisible] = useState(false);
  const [fontPickerVisible, setFontPickerVisible] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [noteThemePickerVisible, setNoteThemePickerVisible] = useState(false);

  const noteThemes = [
    { label: "Warm", emoji: "☀️", color: "#FFF4CC", pattern: "lined" },
    { label: "Fresh", emoji: "🌿", color: "#DDF7E8", pattern: "dotted" },
    { label: "Ocean", emoji: "🌊", color: "#DDEBFF", pattern: "grid" },
    { label: "Rose", emoji: "🌸", color: "#FFE4EC", pattern: "plain" },
    { label: "Lavender", emoji: "💜", color: "#F0E6FF", pattern: "dotted" },
    { label: "Mint", emoji: "🍃", color: "#E5F7F0", pattern: "lined" },
    { label: "Peach", emoji: "🌅", color: "#FFE8D6", pattern: "grid" },
    { label: "Sky", emoji: "🩵", color: "#E3F4FF", pattern: "plain" },
    { label: "Sand", emoji: "🪵", color: "#F3E9D7", pattern: "lined" },
    { label: "Midnight", emoji: "🌙", color: "#25283D", pattern: "grid" },
    { label: "Minimal", emoji: "🤍", color: "#FFFFFF", pattern: "plain" },
    { label: "Lemon", emoji: "🍋", color: "#FFF9C4", pattern: "dotted" },
    { label: "Lilac", emoji: "🪻", color: "#EDE7F6", pattern: "lined" },
    { label: "Forest", emoji: "🌲", color: "#DCEBDD", pattern: "grid" },
    { label: "Blush", emoji: "🩷", color: "#FCE4EC", pattern: "plain" },
    { label: "Ice", emoji: "🧊", color: "#E0F7FA", pattern: "dotted" },
  ];

  const textColors = [
    "#172F2B", // Default
    "#DC2626", // Red
    "#239B83", // Blue
    "#16A34A", // Green
    "#9333EA", // Purple
    "#EA580C", // Orange
    "#DB2777", // Pink
    "#0891B2", // Cyan
    "#CA8A04", // Yellow
    "#000000", // Black
    "#6B7280", // Gray
    "#FFFFFF", // White
  ];

  const fontFamilies = [
    "System",
    "serif",
    "sans-serif",
    "monospace",
    "sans-serif-light",
    "sans-serif-medium",
    "sans-serif-condensed",
    "casual",
    "cursive",
  ];

  const params = useLocalSearchParams<{
    tdlId?: string;
    id?: string;
    todo?: string;
    isEditMode?: string;
    editTodo?: string;
    quickNote?: string;
    templateTitle?: string | string[];
    templateContent?: string | string[];
    templateBackground?: string | string[];
    templateBackgroundType?: string | string[];
    selectedDate?: string | string[];
  }>();

  // A template selected from Note Templates is still a Todo on this screen.
  // Keep its draft separate from the generic "new Todo" draft.
  const incomingTemplateTitle = Array.isArray(params.templateTitle)
    ? params.templateTitle[0]
    : params.templateTitle;
  const incomingTemplateContent = Array.isArray(params.templateContent)
    ? params.templateContent[0]
    : params.templateContent;
  const hasIncomingTemplate =
    typeof incomingTemplateTitle === "string" &&
    typeof incomingTemplateContent === "string";

  const rawEditTodo = params.editTodo ?? params.todo;

  const passedTodo = useMemo<TodoItem | null>(() => {
    if (!rawEditTodo || Array.isArray(rawEditTodo)) return null;
    try {
      const parsed: unknown = JSON.parse(rawEditTodo);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as TodoItem;
    } catch {
      return null;
    }
  }, [rawEditTodo]);

  const todoId =
    params.tdlId ??
    params.id ??
    (passedTodo?.tdlId != null ? String(passedTodo.tdlId) : undefined) ??
    (passedTodo?.id != null ? String(passedTodo.id) : undefined);

  const isEditing = params.isEditMode === "true" || Boolean(todoId);

  const [token, setToken] = useState("");
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const appliedTemplateKey = useRef<string | null>(null);

  // Apply the selected template to this Todo editor.
  // Do not mark it as a Quick Note: this screen only creates/updates Todos.
  useEffect(() => {
    const templateBackground = Array.isArray(params.templateBackground)
      ? params.templateBackground[0]
      : params.templateBackground;
    const templateBackgroundType = Array.isArray(params.templateBackgroundType)
      ? params.templateBackgroundType[0]
      : params.templateBackgroundType;

    if (!hasIncomingTemplate) return;

    const key = `${incomingTemplateTitle}::${incomingTemplateContent}::${String(templateBackground ?? "")}`;
    if (appliedTemplateKey.current === key) return;
    appliedTemplateKey.current = key;

    setTitle(incomingTemplateTitle);
    setContent(incomingTemplateContent);
    if (
      templateBackgroundType === "image" &&
      typeof templateBackground === "string" &&
      templateBackground.length > 0
    ) {
      setNoteBackgroundImageUri(templateBackground);
    } else if (
      typeof templateBackground === "string" &&
      /^#[0-9A-Fa-f]{6}$/.test(templateBackground)
    ) {
      setQuickNoteColor(templateBackground);
      setNoteBackgroundImageUri(null);
    }
    setModifiedAt(new Date().toISOString());
  }, [
    hasIncomingTemplate,
    incomingTemplateTitle,
    incomingTemplateContent,
    params.templateBackground,
    params.templateBackgroundType,
  ]);
  const contentInputRef = useRef<any>(null);
  // This screen is exclusively for Todos. Quick Notes use their own screen.
  const isQuickNote = false;
  const setIsQuickNote = (_value: boolean) => {};
  const [quickNoteColor, setQuickNoteColor] = useState("#FFF4CC");
  const [defaultNotebookStyle, setDefaultNotebookStyle] = useState<
    "classic" | "minimal" | "journal"
  >("classic");
  const [defaultNoteTextSize, setDefaultNoteTextSize] = useState<
    "small" | "medium" | "large"
  >("medium");
  const [defaultNoteCornerStyle, setDefaultNoteCornerStyle] = useState<
    "square" | "rounded" | "soft"
  >("rounded");
  const [personalAccentColor, setPersonalAccentColor] = useState("#239B83");
  const [noteBackgroundImageUri, setNoteBackgroundImageUri] = useState<
    string | null
  >(null);
  const [quickNotePinned, setQuickNotePinned] = useState(false);
  const quickNoteColors = [
    "#FFF4CC",
    "#DDF7E8",
    "#DDEBFF",
    "#FCE1EE",
    "#EDE2FF",
    "#FFFFFF",
  ];
  const [notePattern, setNotePattern] = useState<
    "plain" | "lined" | "dotted" | "grid"
  >("lined");
  const noteTemplates = [
    {
      id: "meeting",
      title: "Meeting Notes",
      icon: "people-outline" as const,
      color: "#DDF7E8",
      body: "Meeting: \nDate: \nAttendees: \n\nAgenda\n• \n\nAction items\n☐ \n☐ ",
    },
    {
      id: "daily",
      title: "Daily Plan",
      icon: "sunny-outline" as const,
      color: "#FFF4CC",
      body: "Top priorities\n☐ \n☐ \n☐ \n\nNotes\n\nEnd-of-day reflection\n",
    },
    {
      id: "idea",
      title: "Idea Capture",
      icon: "bulb-outline" as const,
      color: "#EDE2FF",
      body: "Idea: \n\nProblem it solves\n\nHow it could work\n\nNext step\n",
    },
    {
      id: "checklist",
      title: "Checklist",
      icon: "checkbox-outline" as const,
      color: "#DDEBFF",
      body: "☐ First task\n☐ Second task\n☐ Third task\n☐ ",
    },
    {
      id: "journal",
      title: "Journal",
      icon: "book-outline" as const,
      color: "#FCE1EE",
      body: "Today I feel…\n\nWhat went well?\n\nWhat I learned\n\nTomorrow I want to…",
    },
  ];
  const applyNoteTemplate = (template: (typeof noteTemplates)[number]) => {
    Alert.alert(
      "Use template?",
      `Replace the current title and content with “${template.title}”?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Apply template",
          onPress: () => {
            setTitle(template.title);
            setContent(template.body);
            setQuickNoteColor(template.color);
            setModifiedAt(new Date().toISOString());
          },
        },
      ],
    );
  };

  const chooseNoteBackgroundFromGallery = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Photo permission required",
          "Allow photo access to choose a note background.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setNoteBackgroundImageUri(result.assets[0].uri);
      setNotePattern("plain");
      setNoteThemePickerVisible(false);
      setModifiedAt(new Date().toISOString());
    } catch (error) {
      console.error("Failed to choose note background", error);
      Alert.alert("Unable to open gallery", "Please try again.");
    }
  };

  const openNoteThemePicker = () => {
    setNoteThemePickerVisible(true);
  };

  const openNoteTemplatePicker = () => {
    router.push("/notestemplate");
  };

  const [todoDate, setTodoDate] = useState(toDateInput(new Date()));
  const [dateText, setDateText] = useState(toDateInput(new Date()));
  const [dueDateTime, setDueDateTime] = useState<Date>(new Date());
  const [alarmDate, setAlarmDate] = useState<Date | null>(null);
  const [recurring, setRecurring] = useState<
    "none" | "daily" | "weekly" | "monthly"
  >("none");

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [drawingUri, setDrawingUri] = useState<string | null>(null);
  const [drawingModalVisible, setDrawingModalVisible] = useState(false);
  const [drawingText, setDrawingText] = useState("");
  const [drawingRecognitionBusy, setDrawingRecognitionBusy] = useState(false);
  const [drawingRecognitionStatus, setDrawingRecognitionStatus] = useState("");
  const [drawingLanguage, setDrawingLanguage] = useState<"en-US" | "ta">("ta");
  const [drawingStrokes, setDrawingStrokes] = useState<DrawingStroke[]>([]);
  const [currentDrawingStroke, setCurrentDrawingStroke] =
    useState<DrawingStroke | null>(null);
  const [drawingColor, setDrawingColor] = useState("#172F2B");
  const [drawingBrushSize, setDrawingBrushSize] = useState(4);
  const [drawingTool, setDrawingTool] = useState<"pen" | "pencil">("pen");
  const [drawingEraser, setDrawingEraser] = useState(false);
  const [drawingCanvasSize, setDrawingCanvasSize] = useState({
    width: 360,
    height: 440,
  });
  const drawingCanvasCaptureRef = useRef<View>(null);
  const drawingUndoStack = useRef<DrawingStroke[][]>([]);
  const drawingRedoStack = useRef<DrawingStroke[][]>([]);
  const drawingStartRef = useRef<DrawingStroke | null>(null);
  const drawingStrokeStartTimeRef = useRef<number>(0);
  const drawingRecognitionTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const drawingRecognitionRequestRef = useRef(0);

  const [voiceUri, setVoiceUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [recordingBusy, setRecordingBusy] = useState(false);

  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);

  const [fontSize, setFontSize] = useState(18);
  const [lineSpacing, setLineSpacing] = useState(28);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [spacingModalVisible, setSpacingModalVisible] = useState(false);
  const [textColor, setTextColor] = useState("#172F2B");
  const [fontFamily, setFontFamily] = useState<
    "System" | "serif" | "monospace"
  >("System");
  const [alignment, setAlignment] = useState<
    "left" | "center" | "right" | "justify"
  >("left");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [createdAt, setCreatedAt] = useState<string>(new Date().toISOString());
  const [modifiedAt, setModifiedAt] = useState<string>(
    new Date().toISOString(),
  );
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState<
    "loading" | "saving" | "saved" | "error"
  >("loading");

  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const draftLoaded = useRef(false);

  const [playerError, setPlayerError] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [recordingSessionActive, setRecordingSessionActive] = useState(false);
  const mounted = useRef(true);
  const savingRef = useRef(false);
  const recordingRef = useRef(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 500);
  const player = useAudioPlayer(voiceUri);
  const playerStatus = useAudioPlayerStatus(player);

  const status = useMemo(
    () => getStatusForDate(dateText, dueDateTime),
    [dateText, dueDateTime],
  );
  const formattedDate = useMemo(() => formatLongDate(dateText), [dateText]);

  const templateDraftKey = hasIncomingTemplate
    ? `template-${encodeURIComponent(incomingTemplateTitle)}`
    : "new";
  const draftKey = `notes-draft:${todoId || templateDraftKey}`;

  const deleteLocalDraft = useCallback(async () => {
    if (loading) return;
    try {
      // Disable autosave before deleting so the current draft is not recreated.
      draftLoaded.current = false;
      setDraftReady(false);
      await AsyncStorage.removeItem(draftKey);
      Alert.alert(
        "Draft deleted",
        "The local draft was deleted. A Todo already saved on the server is not deleted.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/cretenote"),
          },
        ],
      );
    } catch (error) {
      console.error("Unable to delete local note draft:", error);
      Alert.alert(
        "Delete failed",
        "Could not delete the local draft. Please try again.",
      );
    }
  }, [draftKey, loading]);

  const handleContentChange = useCallback(
    (value: string) => {
      undoStack.current.push(content);
      if (undoStack.current.length > 100) undoStack.current.shift();
      redoStack.current = [];
      setContent(value);
      setModifiedAt(new Date().toISOString());
    },
    [content],
  );

  const replaceSelection = useCallback(
    (insert: string, wrap = false) => {
      const start = Math.max(0, Math.min(selection.start, content.length));
      const end = Math.max(start, Math.min(selection.end, content.length));
      const selected = content.slice(start, end);

      const value = wrap
        ? `${content.slice(0, start)}${insert}${selected}${insert}${content.slice(end)}`
        : `${content.slice(0, start)}${insert}${content.slice(end)}`;

      undoStack.current.push(content);
      redoStack.current = [];
      setContent(value);

      const cursor = wrap
        ? start + insert.length + selected.length + insert.length
        : start + insert.length;

      setSelection({ start: cursor, end: cursor });
      setModifiedAt(new Date().toISOString());
    },
    [content, selection],
  );

  const changeIndent = useCallback(
    (direction: "increase" | "decrease") => {
      const textLength = content.length;
      const start = Math.max(0, Math.min(selection.start, textLength));
      const end = Math.max(start, Math.min(selection.end, textLength));

      const firstLineStart =
        start === 0 ? 0 : content.lastIndexOf("\n", start - 1) + 1;

      let affectedEnd = end;
      if (end > start && content[end - 1] === "\n") {
        affectedEnd = end - 1;
      }

      const lineStarts: number[] = [firstLineStart];

      if (start !== end) {
        let searchFrom = firstLineStart;
        while (true) {
          const newlineIndex = content.indexOf("\n", searchFrom);
          if (newlineIndex === -1 || newlineIndex >= affectedEnd) break;

          const nextLineStart = newlineIndex + 1;
          if (nextLineStart > affectedEnd) break;

          lineStarts.push(nextLineStart);
          searchFrom = nextLineStart;
        }
      }

      const edits: Array<{
        position: number;
        removeCount: number;
        insertText: string;
      }> = [];

      for (const position of lineStarts) {
        if (direction === "increase") {
          edits.push({ position, removeCount: 0, insertText: "  " });
        } else {
          const line = content.slice(position);
          const leadingSpaces = line.match(/^ {1,2}/)?.[0].length ?? 0;
          if (leadingSpaces > 0) {
            edits.push({
              position,
              removeCount: leadingSpaces,
              insertText: "",
            });
          }
        }
      }

      if (edits.length === 0) return;

      let updatedContent = content;
      for (const edit of [...edits].sort((a, b) => b.position - a.position)) {
        updatedContent =
          updatedContent.slice(0, edit.position) +
          edit.insertText +
          updatedContent.slice(edit.position + edit.removeCount);
      }

      const adjustPosition = (originalPosition: number) => {
        let adjusted = originalPosition;

        for (const edit of edits) {
          if (edit.insertText.length > 0) {
            if (edit.position <= originalPosition) {
              adjusted += edit.insertText.length;
            }
          } else if (edit.removeCount > 0) {
            if (originalPosition >= edit.position + edit.removeCount) {
              adjusted -= edit.removeCount;
            } else if (originalPosition > edit.position) {
              adjusted = edit.position;
            }
          }
        }

        return Math.max(0, Math.min(adjusted, updatedContent.length));
      };

      undoStack.current.push(content);
      if (undoStack.current.length > 100) undoStack.current.shift();
      redoStack.current = [];

      setContent(updatedContent);
      setSelection({
        start: adjustPosition(start),
        end: adjustPosition(end),
      });
      setModifiedAt(new Date().toISOString());
    },
    [content, selection],
  );

  const undoEdit = useCallback(() => {
    const previous = undoStack.current.pop();
    if (previous === undefined) return;
    redoStack.current.push(content);
    setContent(previous);
    setModifiedAt(new Date().toISOString());
  }, [content]);

  const redoEdit = useCallback(() => {
    const next = redoStack.current.pop();
    if (next === undefined) return;
    undoStack.current.push(content);
    setContent(next);
    setModifiedAt(new Date().toISOString());
  }, [content]);

  const copyContent = useCallback(async () => {
    await Clipboard.setStringAsync(content);
    Alert.alert("Copied", "Note text copied to clipboard.");
  }, [content]);

  const cutSelection = useCallback(async () => {
    const start = Math.max(0, Math.min(selection.start, content.length));
    const end = Math.max(start, Math.min(selection.end, content.length));
    if (start === end) {
      await Clipboard.setStringAsync(content);
      setContent("");
      return;
    }
    await Clipboard.setStringAsync(content.slice(start, end));
    const value = content.slice(0, start) + content.slice(end);
    undoStack.current.push(content);
    redoStack.current = [];
    setContent(value);
    setSelection({ start, end: start });
  }, [content, selection]);

  const pasteContent = useCallback(async () => {
    try {
      const pasted = await Clipboard.getStringAsync();

      if (pasted) {
        replaceSelection(pasted);
      }
    } catch (error) {
      console.warn("Clipboard access failed:", error);

      Alert.alert(
        "Clipboard unavailable",
        "Clipboard access was denied. Please allow clipboard access or paste your text manually.",
      );
    }
  }, [replaceSelection]);

  const insertHyperlink = useCallback(() => {
    setLinkUrl("");
    setLinkModalVisible(true);
  }, []);

  const handleInsertLink = useCallback(() => {
    const url = linkUrl.trim();
    if (!url) {
      Alert.alert("Invalid URL", "Please enter a URL.");
      return;
    }
    const formattedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    replaceSelection(formattedUrl);
    setLinkModalVisible(false);
    setLinkUrl("");
  }, [linkUrl, replaceSelection]);

  const openFirstHyperlink = useCallback(async () => {
    const match = content.match(/https?:\/\/[^\s)]+/i);
    if (!match) {
      Alert.alert(
        "No hyperlink",
        "Add a URL such as https://example.com first.",
      );
      return;
    }
    try {
      await Linking.openURL(match[0]);
    } catch {
      Alert.alert("Unable to open link", match[0]);
    }
  }, [content]);

  useEffect(() => {
    let active = true;
    const restoreDraft = async () => {
      try {
        const raw = await AsyncStorage.getItem(draftKey);
        if (!active) return;

        // Apply the default selected in Settings to a genuinely new note.
        // Existing notes, template backgrounds, and non-empty local drafts keep
        // their own saved appearance.
        let shouldApplyDefaultTheme = !isEditing && !hasIncomingTemplate;
        if (raw && !hasIncomingTemplate) {
          const draft = JSON.parse(raw) as {
            title?: string;
            content?: string;
            modifiedAt?: string;
            createdAt?: string;
            isQuickNote?: boolean;
            quickNoteColor?: string;
            quickNotePinned?: boolean;
            notePattern?: "plain" | "lined" | "dotted" | "grid";
            drawingUri?: string;
            drawingText?: string;
            noteBackgroundImageUri?: string | null;
          };

          const draftHasContent = Boolean(
            (typeof draft.title === "string" && draft.title.trim()) ||
            (typeof draft.content === "string" && draft.content.trim()),
          );
          shouldApplyDefaultTheme = shouldApplyDefaultTheme && !draftHasContent;

          if (!isEditing || (!title && !content)) {
            if (typeof draft.title === "string") setTitle(draft.title);
            if (typeof draft.content === "string") setContent(draft.content);
            if (typeof draft.createdAt === "string")
              setCreatedAt(draft.createdAt);
            if (typeof draft.modifiedAt === "string")
              setModifiedAt(draft.modifiedAt);
            if (typeof draft.quickNoteColor === "string")
              setQuickNoteColor(draft.quickNoteColor);
            if (typeof draft.quickNotePinned === "boolean")
              setQuickNotePinned(draft.quickNotePinned);
            if (
              draft.notePattern === "plain" ||
              draft.notePattern === "lined" ||
              draft.notePattern === "dotted" ||
              draft.notePattern === "grid"
            )
              setNotePattern(draft.notePattern);
            if (typeof draft.drawingUri === "string")
              setDrawingUri(draft.drawingUri);
            if (typeof draft.drawingText === "string")
              setDrawingText(draft.drawingText);
            if (typeof draft.noteBackgroundImageUri === "string")
              setNoteBackgroundImageUri(draft.noteBackgroundImageUri);
          }
        }

        if (shouldApplyDefaultTheme) {
          try {
            const savedDefaultTheme =
              await AsyncStorage.getItem("defaultNoteTheme");
            if (!active) return;
            if (savedDefaultTheme) {
              const defaultTheme = JSON.parse(savedDefaultTheme) as {
                color?: string;
                pattern?: string;
                notebookStyle?: string;
                textSize?: string;
                cornerStyle?: string;
              };
              if (
                typeof defaultTheme.color === "string" &&
                /^#[0-9A-Fa-f]{6}$/.test(defaultTheme.color)
              ) {
                setQuickNoteColor(defaultTheme.color);
                setNoteBackgroundImageUri(null);
              }
              if (
                defaultTheme.pattern === "plain" ||
                defaultTheme.pattern === "lined" ||
                defaultTheme.pattern === "dotted" ||
                defaultTheme.pattern === "grid"
              ) {
                setNotePattern(defaultTheme.pattern);
              }
              if (
                defaultTheme.notebookStyle === "classic" ||
                defaultTheme.notebookStyle === "minimal" ||
                defaultTheme.notebookStyle === "journal"
              ) {
                setDefaultNotebookStyle(defaultTheme.notebookStyle);
              }
              if (
                defaultTheme.textSize === "small" ||
                defaultTheme.textSize === "medium" ||
                defaultTheme.textSize === "large"
              ) {
                setDefaultNoteTextSize(defaultTheme.textSize);
                setFontSize(
                  defaultTheme.textSize === "small"
                    ? 14
                    : defaultTheme.textSize === "large"
                      ? 22
                      : 18,
                );
              }
              if (
                defaultTheme.cornerStyle === "square" ||
                defaultTheme.cornerStyle === "rounded" ||
                defaultTheme.cornerStyle === "soft"
              ) {
                setDefaultNoteCornerStyle(defaultTheme.cornerStyle);
              }
            }
            const savedAccent = await AsyncStorage.getItem("app-accent-color");
            if (savedAccent && /^#[0-9A-Fa-f]{6}$/.test(savedAccent))
              setPersonalAccentColor(savedAccent);
          } catch (themeError) {
            console.warn("Unable to load default note theme:", themeError);
          }
        }

        draftLoaded.current = true;
        setDraftReady(true);
        setDraftStatus("saved");
      } catch (error) {
        console.warn("Unable to restore local note draft:", error);
        if (active) {
          draftLoaded.current = true;
          setDraftReady(true);
          setDraftStatus("error");
        }
      }
    };

    setDraftReady(false);
    draftLoaded.current = false;
    void restoreDraft();

    return () => {
      active = false;
    };
  }, [draftKey, hasIncomingTemplate, isEditing]);

  useEffect(() => {
    if (!draftReady || !draftLoaded.current) return;
    setDraftStatus("saving");

    const timer = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(
          draftKey,
          JSON.stringify({
            title,
            content,
            createdAt,
            modifiedAt,
            isQuickNote,
            quickNoteColor,
            quickNotePinned,
            notePattern,
            drawingUri,
            drawingText,
            noteBackgroundImageUri,
            savedAt: new Date().toISOString(),
          }),
        );
        setDraftStatus("saved");
      } catch (error) {
        console.error("Unable to auto-save note draft:", error);
        setDraftStatus("error");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [
    draftKey,
    draftReady,
    title,
    content,
    createdAt,
    modifiedAt,
    isQuickNote,
    quickNoteColor,
    quickNotePinned,
    notePattern,
    drawingUri,
    drawingText,
    noteBackgroundImageUri,
  ]);

  const isRecording = Boolean(recorderState.isRecording);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      try {
        if (recordingRef.current) {
          void recorder.stop().catch(() => undefined);
        }
      } catch {}
      try {
        void player.pause();
      } catch {}
    };
  }, [player, recorder]);

  useEffect(() => {
    let active = true;
    const loadAuth = async () => {
      try {
        const storedUserId = await AsyncStorage.getItem("userId");
        const storedToken =
          (await AsyncStorage.getItem("login_token")) ||
          (await AsyncStorage.getItem("token"));
        if (!active) return;
        setUserId(storedUserId || "");
        setToken(storedToken || "");
      } catch (error) {
        if (active) {
          Alert.alert("Authentication error", getErrorMessage(error));
        }
      } finally {
        if (active) setInitializing(false);
      }
    };
    void loadAuth();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const requestPermission = async () => {
      try {
        const permissions = await Notifications.getPermissionsAsync();
        if (!permissions.granted) {
          await Notifications.requestPermissionsAsync();
        }
      } catch {}
    };
    void requestPermission();
  }, []);

  useEffect(() => {
    if (!isEditing || !passedTodo) return;
    setTitle(passedTodo.title || "");
    setContent(passedTodo.text || "");
    if (
      typeof passedTodo.backgroundImageUrl === "string" &&
      passedTodo.backgroundImageUrl
    ) {
      setNoteBackgroundImageUri(passedTodo.backgroundImageUrl);
    }
    if (typeof passedTodo.quickNoteColor === "string")
      setQuickNoteColor(passedTodo.quickNoteColor);
    if (passedTodo.notePattern) setNotePattern(passedTodo.notePattern);
    const parsedDate = passedTodo.date ? new Date(passedTodo.date) : new Date();
    const validDate = Number.isNaN(parsedDate.getTime())
      ? new Date()
      : parsedDate;
    const dateValue = toDateInput(validDate);
    setTodoDate(dateValue);
    setDateText(dateValue);
    setDueDateTime(validDate);
    const savedReminder = passedTodo.reminderDate || passedTodo.alarm;
    if (savedReminder) {
      const parsedAlarm = new Date(savedReminder);
      setAlarmDate(Number.isNaN(parsedAlarm.getTime()) ? null : parsedAlarm);
    } else {
      setAlarmDate(null);
    }
    setRecurring(
      passedTodo.recurring === "daily" ||
        passedTodo.recurring === "weekly" ||
        passedTodo.recurring === "monthly"
        ? passedTodo.recurring
        : "none",
    );
  }, [isEditing, passedTodo]);

  useEffect(() => {
    if (!todoId) return;
    let active = true;
    AsyncStorage.getItem(`note-drawing:${todoId}`)
      .then((uri) => {
        if (active && uri) setDrawingUri(uri);
      })
      .catch((error) => console.warn("Unable to restore saved sketch:", error));
    return () => {
      active = false;
    };
  }, [todoId]);

  useEffect(() => {
    if (!isEditing) return;
    let active = true;
    const loadQuickNoteMeta = async () => {
      const ids = [
        todoId,
        passedTodo?.tdlId,
        passedTodo?._id,
        passedTodo?.id,
        passedTodo?.todoId,
      ]
        .filter(
          (value): value is string | number =>
            value !== undefined &&
            value !== null &&
            String(value).trim() !== "",
        )
        .map(String);
      const titleKeys = [passedTodo?.title, title]
        .filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
        .map((value) => value.trim().toLowerCase());
      const keys = [...new Set([...ids, ...titleKeys])].map(
        (value) => `quick-note-meta:${value}`,
      );
      try {
        for (const key of keys) {
          const raw = await AsyncStorage.getItem(key);
          if (!raw) continue;
          const meta = JSON.parse(raw) as {
            isQuickNote?: boolean;
            quickNoteColor?: string;
            quickNotePinned?: boolean;
            backgroundImageUri?: string;
            notePattern?: "plain" | "lined" | "dotted" | "grid";
          };
          if (!active) return;
          if (typeof meta.quickNoteColor === "string")
            setQuickNoteColor(meta.quickNoteColor);
          if (typeof meta.quickNotePinned === "boolean")
            setQuickNotePinned(meta.quickNotePinned);
          if (
            typeof meta.backgroundImageUri === "string" &&
            meta.backgroundImageUri
          )
            setNoteBackgroundImageUri(meta.backgroundImageUri);
          if (
            meta.notePattern === "plain" ||
            meta.notePattern === "lined" ||
            meta.notePattern === "dotted" ||
            meta.notePattern === "grid"
          )
            setNotePattern(meta.notePattern);
          return;
        }
      } catch (error) {
        console.warn("Unable to restore quick-note metadata:", error);
      }
    };
    void loadQuickNoteMeta();
    return () => {
      active = false;
    };
  }, [isEditing, todoId, passedTodo, title]);

  useEffect(() => {
    if (!isEditing || !todoId || !token || passedTodo) return;
    let active = true;

    const loadTodo = async () => {
      try {
        const response = await axios.get<{
          success?: boolean;
          data?: TodoItem[];
        }>(`${API_BASE_URL}/api/todolist`, { headers: authHeader(token) });

        if (!active) return;

        const payload = (response.data?.data ?? []).find(
          (item) => String(item.tdlId ?? item.id ?? "") === String(todoId),
        );

        if (!response.data?.success || !payload) {
          Alert.alert(
            "Unable to load",
            "Todo was not found. Please return to the list and open Edit again.",
          );
          return;
        }

        setTitle(payload.title || "");
        setContent(payload.text || "");
        setNoteBackgroundImageUri(payload.backgroundImageUrl || null);
        if (payload.quickNoteColor) setQuickNoteColor(payload.quickNoteColor);
        if (payload.notePattern) setNotePattern(payload.notePattern);
        const parsedDate = payload.date ? new Date(payload.date) : new Date();
        const validDate = Number.isNaN(parsedDate.getTime())
          ? new Date()
          : parsedDate;
        const dateValue = toDateInput(validDate);
        setTodoDate(dateValue);
        setDateText(dateValue);
        setDueDateTime(validDate);

        const savedReminder = payload.reminderDate || payload.alarm;
        if (savedReminder) {
          const parsedAlarm = new Date(savedReminder);
          setAlarmDate(
            Number.isNaN(parsedAlarm.getTime()) ? null : parsedAlarm,
          );
        } else {
          setAlarmDate(null);
        }
        setRecurring(
          payload.recurring === "daily" ||
            payload.recurring === "weekly" ||
            payload.recurring === "monthly"
            ? payload.recurring
            : "none",
        );

        setImageUri(null);
        setVoiceUri(null);
      } catch (error) {
        if (active) {
          Alert.alert("Load failed", getErrorMessage(error));
        }
      }
    };

    void loadTodo();
    return () => {
      active = false;
    };
  }, [isEditing, todoId, token, passedTodo]);

  const applyDate = useCallback((selectedDate: Date) => {
    const value = toDateInput(selectedDate);
    setTodoDate(value);
    setDateText(value);
    setDueDateTime((previous) => {
      const next = new Date(selectedDate);
      next.setHours(previous.getHours(), previous.getMinutes(), 0, 0);
      return next;
    });
  }, []);

  // When launched from a selected calendar day, link the new note to that date.
  const calendarDateApplied = useRef(false);
  useEffect(() => {
    const rawSelectedDate = Array.isArray(params.selectedDate)
      ? params.selectedDate[0]
      : params.selectedDate;
    if (isEditing || !rawSelectedDate || calendarDateApplied.current) return;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawSelectedDate);
    if (!match) return;
    const linkedDate = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      12,
      0,
      0,
    );
    if (
      linkedDate.getFullYear() !== Number(match[1]) ||
      linkedDate.getMonth() !== Number(match[2]) - 1 ||
      linkedDate.getDate() !== Number(match[3])
    )
      return;
    calendarDateApplied.current = true;
    applyDate(linkedDate);
  }, [params.selectedDate, isEditing, applyDate]);

  const openDatePicker = useCallback(() => {
    const initialDate =
      dueDateTime && !Number.isNaN(dueDateTime.getTime())
        ? dueDateTime
        : parseDateText(dateText) || new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initialDate,
        mode: "date",
        display: "calendar",
        onChange: (event, selectedDate) => {
          if (event.type !== "set" || !selectedDate) return;
          const selected = new Date(selectedDate);
          selected.setHours(
            initialDate.getHours(),
            initialDate.getMinutes(),
            0,
            0,
          );
          const value = toDateInput(selected);
          setTodoDate(value);
          setDateText(value);
          DateTimePickerAndroid.open({
            value: selected,
            mode: "time",
            display: "clock",
            onChange: (timeEvent, selectedTime) => {
              if (timeEvent.type !== "set" || !selectedTime) return;
              const result = new Date(selected);
              result.setHours(
                selectedTime.getHours(),
                selectedTime.getMinutes(),
                0,
                0,
              );
              setDueDateTime(result);
              setTodoDate(toDateInput(result));
              setDateText(toDateInput(result));
            },
          });
        },
      });
    } else {
      Alert.alert(
        "Date picker",
        "Date and time selection is currently configured for Android.",
      );
    }
  }, [dateText, dueDateTime]);

  const setQuickDate = useCallback(
    (offset: number) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + offset);
      applyDate(date);
    },
    [applyDate],
  );

  const openReminderPicker = useCallback(() => {
    const now = new Date();

    const initialDate =
      alarmDate && alarmDate.getTime() > now.getTime()
        ? alarmDate
        : new Date(now.getTime() + 60 * 60 * 1000);

    if (Platform.OS !== "android") {
      Alert.alert(
        "Reminder",
        "Reminder selection is currently configured for Android.",
      );
      return;
    }

    DateTimePickerAndroid.open({
      value: initialDate,
      mode: "date",
      display: "calendar",
      minimumDate: new Date(),

      onChange: (event, selectedDate) => {
        if (event.type !== "set" || !selectedDate) return;

        const chosenDate = new Date(selectedDate);
        chosenDate.setHours(
          initialDate.getHours(),
          initialDate.getMinutes(),
          0,
          0,
        );

        setTimeout(() => {
          DateTimePickerAndroid.open({
            value: chosenDate,
            mode: "time",
            display: "clock",

            onChange: (timeEvent, selectedTime) => {
              if (timeEvent.type !== "set" || !selectedTime) return;

              const result = new Date(chosenDate);
              result.setHours(
                selectedTime.getHours(),
                selectedTime.getMinutes(),
                0,
                0,
              );

              if (result.getTime() <= Date.now()) {
                Alert.alert(
                  "Choose a future time",
                  "The reminder must be scheduled in the future.",
                );
                return;
              }

              // Keep the selected reminder in state.
              // It will be saved to the backend when the Todo is saved.
              setAlarmDate(result);

              Alert.alert(
                "Reminder selected",
                `${result.toLocaleDateString()} at ${result.toLocaleTimeString(
                  [],
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}\n\nSave the Todo to confirm your reminder.`,
              );
            },
          });
        }, 250);
      },
    });
  }, [alarmDate]);

  const pickImage = useCallback(async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission required",
          "Allow photo-library access to attach images or videos.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: false,
        quality: 0.8,
        videoMaxDuration: 300,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];

      if (asset.type === "video") {
        setVideoUri(asset.uri);
      } else if (asset.type === "image") {
        setImageUri(asset.uri);
      }
    } catch (error) {
      Alert.alert("Media error", getErrorMessage(error));
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (recordingBusy || loading || recordingSessionActive) return;
    setRecordingBusy(true);

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Microphone permission",
          "Allow microphone access to record a voice note.",
        );
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      setRecordingSessionActive(true);
      setIsPaused(false);
      setPlayerError("");
    } catch (error) {
      recordingRef.current = false;
      setRecordingSessionActive(false);
      setIsPaused(false);
      Alert.alert("Recording error", getErrorMessage(error));
    } finally {
      if (mounted.current) setRecordingBusy(false);
    }
  }, [loading, recorder, recordingBusy, recordingSessionActive]);

  const pauseVoiceRecording = useCallback(async () => {
    if (!recordingSessionActive || isPaused || recordingBusy) return;
    try {
      await recorder.pause();
      setIsPaused(true);
    } catch (error) {
      Alert.alert("Pause error", getErrorMessage(error));
    }
  }, [recorder, recordingSessionActive, isPaused, recordingBusy]);

  const resumeRecording = useCallback(async () => {
    if (!recordingSessionActive || !isPaused || recordingBusy) return;
    try {
      recorder.record();
      setIsPaused(false);
    } catch (error) {
      Alert.alert("Resume error", getErrorMessage(error));
    }
  }, [recorder, recordingSessionActive, isPaused, recordingBusy]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current || recordingBusy) return;
    setRecordingBusy(true);

    try {
      await recorder.stop();
      recordingRef.current = false;
      setRecordingSessionActive(false);
      setIsPaused(false);

      const uri = recorder.uri;
      if (uri) {
        setVoiceUri(uri);
        setPlayerError("");
      } else {
        Alert.alert(
          "Recording unavailable",
          "The recording did not produce a file. Please try again.",
        );
      }
    } catch (error) {
      Alert.alert("Unable to stop recording", getErrorMessage(error));
    } finally {
      recordingRef.current = false;
      setRecordingSessionActive(false);
      setIsPaused(false);
      try {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });
      } catch {}
      if (mounted.current) setRecordingBusy(false);
    }
  }, [recorder, recordingBusy]);

  const toggleRecording = useCallback(() => {
    if (recordingSessionActive) {
      void stopRecording();
    } else {
      void startRecording();
    }
  }, [recordingSessionActive, startRecording, stopRecording]);

  const togglePlayback = useCallback(async () => {
    if (!voiceUri) return;
    try {
      setPlayerError("");
      if (playerStatus.playing) {
        await player.pause();
      } else {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });
        await player.play();
      }
    } catch (error) {
      const message = getErrorMessage(error);
      setPlayerError(message);
      Alert.alert("Playback error", message);
    }
  }, [player, playerStatus.playing, voiceUri]);

  const beginDrawingStroke = useCallback(
    (x: number, y: number) => {
      drawingUndoStack.current.push(drawingStrokes);
      if (drawingUndoStack.current.length > 100)
        drawingUndoStack.current.shift();
      drawingRedoStack.current = [];
      drawingStrokeStartTimeRef.current = Date.now();
      const stroke: DrawingStroke = {
        points: [{ x, y, t: 0 }],
        color: drawingEraser ? "#FFFFFF" : drawingColor,
        width: drawingEraser
          ? Math.max(14, drawingBrushSize * 3)
          : drawingTool === "pencil"
            ? Math.max(1, drawingBrushSize * 0.6)
            : drawingBrushSize,
      };
      drawingStartRef.current = stroke;
      setCurrentDrawingStroke(stroke);
    },
    [
      drawingBrushSize,
      drawingColor,
      drawingEraser,
      drawingTool,
      drawingStrokes,
    ],
  );

  const moveDrawingStroke = useCallback((x: number, y: number) => {
    const activeStroke = drawingStartRef.current;
    if (!activeStroke) return;
    const nextStroke = {
      ...activeStroke,
      points: [
        ...activeStroke.points,
        { x, y, t: Date.now() - drawingStrokeStartTimeRef.current },
      ],
    };
    drawingStartRef.current = nextStroke;
    setCurrentDrawingStroke(nextStroke);
  }, []);

  const finishDrawingStroke = useCallback(() => {
    const activeStroke = drawingStartRef.current;
    if (activeStroke) {
      setDrawingStrokes((previous) => [...previous, activeStroke]);
      setCurrentDrawingStroke(null);
      drawingStartRef.current = null;
      setModifiedAt(new Date().toISOString());
    }
  }, []);

  const recognizeHandwriting = useCallback(
    async (
      strokesToRecognize?: DrawingStroke[],
      languageOverride?: "en-US" | "ta",
      translateToEnglish = false,
    ) => {
      const selectedLanguage = languageOverride ?? drawingLanguage;

      const shouldTranslateToEnglish =
        translateToEnglish && selectedLanguage === "ta";

      const recognitionLanguage: "en-US" | "ta" = shouldTranslateToEnglish
        ? "ta"
        : selectedLanguage;

      const sourceStrokes = strokesToRecognize ?? [
        ...drawingStrokes,
        ...(currentDrawingStroke ? [currentDrawingStroke] : []),
      ];

      const inkStrokes = sourceStrokes
        .filter(
          (stroke) =>
            stroke.color.toLowerCase() !== "#ffffff" &&
            stroke.points.length > 0,
        )
        .map((stroke) => ({
          points: stroke.points.map((point, index) => ({
            x: point.x,
            y: point.y,
            t: point.t ?? index * 16,
          })),
        }));

      if (inkStrokes.length === 0) {
        setDrawingRecognitionStatus("Write a word on the canvas first.");
        return;
      }

      const requestId = ++drawingRecognitionRequestRef.current;

      setDrawingRecognitionBusy(true);
      setDrawingRecognitionStatus("Recognizing handwriting…");

      try {
        if (!NitroDigitalInk.isAvailable()) {
          throw new Error(
            "Digital Ink Recognition is unavailable in this build.",
          );
        }

        console.log("Selected language:", recognitionLanguage);
        console.log("Translation enabled:", shouldTranslateToEnglish);

        // ML Kit downloads each language's digital-ink model separately.
        // Ensure the selected model exists before calling recognize().
        setDrawingRecognitionStatus(
          recognitionLanguage === "ta"
            ? "Checking Tamil handwriting model…"
            : "Checking English handwriting model…",
        );

        let modelDownloaded =
          await NitroDigitalInk.isModelDownloaded(recognitionLanguage);

        if (!modelDownloaded) {
          setDrawingRecognitionStatus(
            recognitionLanguage === "ta"
              ? "Downloading Tamil handwriting model. Keep the device online…"
              : "Downloading English handwriting model. Keep the device online…",
          );

          await NitroDigitalInk.downloadModel(recognitionLanguage);

          // Confirm the download actually completed before using the model.
          modelDownloaded =
            await NitroDigitalInk.isModelDownloaded(recognitionLanguage);
        }

        if (!modelDownloaded) {
          throw new Error(
            `The ${recognitionLanguage === "ta" ? "Tamil" : "English"} handwriting model is not available yet. Connect to the internet and try again.`,
          );
        }

        setDrawingRecognitionStatus("Recognizing handwriting…");
        const candidates = await NitroDigitalInk.recognize(
          inkStrokes,
          recognitionLanguage,
        );

        console.log("Recognition candidates:", candidates);

        if (requestId !== drawingRecognitionRequestRef.current) return;

        const candidateTexts = (candidates ?? [])
          .map((candidate) => candidate.text?.trim())
          .filter((text): text is string => Boolean(text));

        console.log("Recognition candidates:", candidateTexts);

        // Prefer a compact candidate for short handwritten words.
        // Fall back to the first candidate if none matches.
        const recognizedText =
          candidateTexts.find((text) => /^[a-zA-Z]+$/.test(text)) ??
          candidateTexts[0] ??
          "";

        if (!recognizedText) {
          setDrawingRecognitionStatus(
            "No text recognized. Try writing more clearly.",
          );
          return;
        }

        let finalText = recognizedText;

        if (shouldTranslateToEnglish) {
          setDrawingText(recognizedText);
          setDrawingRecognitionStatus(
            "Tamil recognized. Translating to English…",
          );

          const response = await axios.post<{
            translatedText?: string;
            translation?: string;
          }>(
            `${API_BASE_URL}/api/translate`,
            {
              text: recognizedText,
              sourceLanguage: "ta",
              targetLanguage: "en",
            },
            { timeout: 20000 },
          );

          if (requestId !== drawingRecognitionRequestRef.current) return;

          finalText = (
            response.data?.translatedText ??
            response.data?.translation ??
            ""
          ).trim();

          if (!finalText) {
            throw new Error("Translation service returned no English text.");
          }
        }

        setDrawingText(finalText);

        setContent((previousContent) =>
          previousContent.trim()
            ? `${previousContent}\n${finalText}`
            : finalText,
        );

        setModifiedAt(new Date().toISOString());

        setDrawingRecognitionStatus(
          shouldTranslateToEnglish
            ? `Tamil: ${recognizedText} → English: ${finalText}`
            : "Handwriting converted to editable text.",
        );
      } catch (error) {
        if (requestId !== drawingRecognitionRequestRef.current) return;

        const rawMessage =
          error instanceof Error
            ? error.message
            : String(error ?? "Could not recognize this handwriting.");
        const normalizedMessage = rawMessage.toLowerCase();
        const isMissingModelFiles =
          normalizedMessage.includes("model files") ||
          normalizedMessage.includes("enoent") ||
          normalizedMessage.includes("not found") ||
          normalizedMessage.includes("filenotfoundexception");

        if (isMissingModelFiles) {
          // ML Kit may report a model as downloaded even when its files are
          // incomplete. Remove the cached model and download it again.
          setDrawingRecognitionStatus(
            "The handwriting model is incomplete. Repairing the language model…",
          );

          try {
            await NitroDigitalInk.deleteModel(recognitionLanguage);
            await NitroDigitalInk.downloadModel(recognitionLanguage);

            if (requestId === drawingRecognitionRequestRef.current) {
              setDrawingRecognitionStatus(
                "Model repaired. Tap Convert to text to try recognition again.",
              );
            }
          } catch (modelRepairError) {
            const repairMessage =
              modelRepairError instanceof Error
                ? modelRepairError.message
                : String(modelRepairError ?? "Model download failed.");

            if (requestId === drawingRecognitionRequestRef.current) {
              setDrawingRecognitionStatus(
                `Could not repair the handwriting model. Check your internet connection and Android storage, then retry. ${repairMessage}`,
              );
            }

            console.warn("Digital ink model repair failed:", modelRepairError);
          }
        } else {
          setDrawingRecognitionStatus(rawMessage);
        }

        console.warn("Handwriting recognition failed:", error);
      } finally {
        if (requestId === drawingRecognitionRequestRef.current) {
          setDrawingRecognitionBusy(false);
        }
      }
    },
    [
      drawingStrokes,
      currentDrawingStroke,
      drawingLanguage,
      setContent,
      setModifiedAt,
    ],
  );

  useEffect(() => {
    if (drawingRecognitionTimerRef.current) {
      clearTimeout(drawingRecognitionTimerRef.current);
    }

    if (
      !drawingModalVisible ||
      drawingStrokes.length === 0 ||
      currentDrawingStroke ||
      drawingEraser
    ) {
      return;
    }

    drawingRecognitionTimerRef.current = setTimeout(() => {
      void recognizeHandwriting(drawingStrokes);
    }, 1200);

    return () => {
      if (drawingRecognitionTimerRef.current) {
        clearTimeout(drawingRecognitionTimerRef.current);
      }
    };
  }, [
    drawingModalVisible,
    drawingStrokes,
    currentDrawingStroke,
    drawingEraser,
    recognizeHandwriting,
  ]);

  const undoDrawing = useCallback(() => {
    const previous = drawingUndoStack.current.pop();
    if (!previous) return;
    drawingRedoStack.current.push(drawingStrokes);
    setDrawingStrokes(previous);
    setCurrentDrawingStroke(null);
    drawingStartRef.current = null;
  }, [drawingStrokes]);

  const redoDrawing = useCallback(() => {
    const next = drawingRedoStack.current.pop();
    if (!next) return;
    drawingUndoStack.current.push(drawingStrokes);
    setDrawingStrokes(next);
    setCurrentDrawingStroke(null);
    drawingStartRef.current = null;
  }, [drawingStrokes]);

  const clearDrawingCanvas = useCallback(() => {
    if (drawingStrokes.length === 0 && !currentDrawingStroke) return;
    drawingUndoStack.current.push(drawingStrokes);
    drawingRedoStack.current = [];
    setDrawingStrokes([]);
    setCurrentDrawingStroke(null);
    drawingStartRef.current = null;
  }, [currentDrawingStroke, drawingStrokes]);

  const saveDrawing = useCallback(async () => {
    if (!drawingCanvasCaptureRef.current) {
      Alert.alert(
        "Drawing unavailable",
        "Please reopen the drawing canvas and try again.",
      );
      return;
    }
    if (drawingStrokes.length === 0 && !currentDrawingStroke) {
      Alert.alert("Empty canvas", "Draw something before saving.");
      return;
    }
    try {
      if (currentDrawingStroke) {
        setDrawingStrokes((previous) => [...previous, currentDrawingStroke]);
        setCurrentDrawingStroke(null);
        drawingStartRef.current = null;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      const temporaryUri = await captureRef(drawingCanvasCaptureRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      const baseDirectory = FileSystem.documentDirectory;
      if (!baseDirectory)
        throw new Error("App document storage is unavailable.");
      const destinationUri = `${baseDirectory}todo_sketch_${Date.now()}.png`;
      await FileSystem.copyAsync({ from: temporaryUri, to: destinationUri });
      setDrawingUri(destinationUri);
      setModifiedAt(new Date().toISOString());
      setDrawingModalVisible(false);
      Alert.alert(
        "Drawing saved",
        "Your sketch has been attached to this note.",
      );
    } catch (error) {
      Alert.alert(
        "Unable to save drawing",
        error instanceof Error
          ? error.message
          : "Please check the drawing dependencies and try again.",
      );
    }
  }, [currentDrawingStroke, drawingStrokes]);

  const clearDrawingAttachment = useCallback(() => {
    setDrawingUri(null);
    setModifiedAt(new Date().toISOString());
  }, []);

  const drawingPath = useCallback((stroke: DrawingStroke) => {
    if (stroke.points.length === 0) return "";
    const [first, ...rest] = stroke.points;
    return (
      `M ${first.x} ${first.y} ` +
      rest.map((point) => `L ${point.x} ${point.y}`).join(" ")
    );
  }, []);

  const cancelTodoNotifications = useCallback(
    async (targetTodoId?: string | null) => {
      if (!targetTodoId) return 0;
      const stableId = String(targetTodoId);
      const pending = await Notifications.getAllScheduledNotificationsAsync();
      const matching = pending.filter(
        (notification) =>
          String(notification.content.data?.todoId ?? "") === stableId,
      );
      await Promise.all(
        matching.map((notification) =>
          Notifications.cancelScheduledNotificationAsync(
            notification.identifier,
          ),
        ),
      );
      console.log(
        `[Todo reminders] Cancelled ${matching.length} reminder(s) for ${stableId}`,
      );
      return matching.length;
    },
    [],
  );

  const scheduleLocalNotification = useCallback(
    async (savedTitle: string, savedTodoId?: string | null) => {
      const stableTodoId = savedTodoId
        ? String(savedTodoId)
        : todoId
          ? String(todoId)
          : undefined;

      if (stableTodoId) await cancelTodoNotifications(stableTodoId);

      // No selected reminder means the old notification has been cancelled.
      if (!alarmDate) return;

      if (!stableTodoId) {
        throw new Error(
          "The Todo was saved, but the server did not return its ID. Reopen the Todo and set the reminder again.",
        );
      }

      const firstReminder = new Date(alarmDate);
      if (Number.isNaN(firstReminder.getTime())) {
        throw new Error("The reminder date is invalid.");
      }
      if (firstReminder.getTime() <= Date.now()) {
        throw new Error("Choose a reminder date and time in the future.");
      }

      const CHANNEL_ID = "todo-reminders-v4";
      let permissions = await Notifications.getPermissionsAsync();
      if (!permissions.granted) {
        permissions = await Notifications.requestPermissionsAsync();
      }
      if (!permissions.granted) {
        throw new Error(
          "Notification permission is disabled. Enable notifications for this app in your phone Settings and try again.",
        );
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: "Todo reminders",
          description: "Reminders for your todo tasks",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          enableVibrate: true,
          enableLights: true,
        });
      }

      const repeat = recurring || "none";
      const occurrences: Date[] = [];
      const addIfFuture = (candidate: Date) => {
        if (candidate.getTime() > Date.now()) occurrences.push(candidate);
      };

      if (repeat === "none") {
        addIfFuture(firstReminder);
      } else if (repeat === "daily") {
        for (let i = 0; i < 60; i++) {
          const candidate = new Date(firstReminder);
          candidate.setDate(firstReminder.getDate() + i);
          addIfFuture(candidate);
        }
      } else if (repeat === "weekly") {
        for (let i = 0; i < 52; i++) {
          const candidate = new Date(firstReminder);
          candidate.setDate(firstReminder.getDate() + i * 7);
          addIfFuture(candidate);
        }
      } else if (repeat === "monthly") {
        const desiredDay = firstReminder.getDate();
        for (let i = 0; i < 24; i++) {
          const year = firstReminder.getFullYear();
          const month = firstReminder.getMonth() + i;
          const lastDay = new Date(year, month + 1, 0).getDate();
          const candidate = new Date(firstReminder);
          candidate.setDate(1);
          candidate.setFullYear(year, month, 1);
          candidate.setDate(Math.min(desiredDay, lastDay));
          candidate.setHours(
            firstReminder.getHours(),
            firstReminder.getMinutes(),
            0,
            0,
          );
          addIfFuture(candidate);
        }
      }

      if (occurrences.length === 0) {
        throw new Error(
          "No future reminder times could be scheduled. Choose a future date and time.",
        );
      }

      let scheduledCount = 0;
      try {
        for (const occurrence of occurrences) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Todo reminder",
              body: savedTitle || "You have a task to complete.",
              data: {
                todoId: stableTodoId,
                recurring: repeat,
                scheduledFor: occurrence.toISOString(),
              },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: occurrence,
              ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
            },
          });
          scheduledCount += 1;
        }
      } catch (error) {
        // Avoid leaving only a partial set of recurring reminders behind.
        await cancelTodoNotifications(stableTodoId);
        throw error;
      }

      const pendingNotifications =
        await Notifications.getAllScheduledNotificationsAsync();
      console.log(
        "[Todo reminders] Scheduled count:",
        scheduledCount,
        "Pending:",
        pendingNotifications
          .filter(
            (item) => String(item.content.data?.todoId ?? "") === stableTodoId,
          )
          .map((item) => ({
            id: item.identifier,
            title: item.content.title,
            trigger: item.trigger,
          })),
      );
    },
    [alarmDate, recurring, todoId, cancelTodoNotifications],
  );

  const snoozeReminder = useCallback(
    async (minutes: 5 | 10 | 15, title: string, todoId: string) => {
      try {
        const stableTodoId = String(todoId ?? "").trim();
        if (
          !stableTodoId ||
          stableTodoId === "undefined" ||
          stableTodoId === "null"
        ) {
          Alert.alert(
            "Todo not saved",
            "Save this Todo first, then you can snooze its reminder.",
          );
          return;
        }

        let permissions = await Notifications.getPermissionsAsync();
        if (!permissions.granted) {
          permissions = await Notifications.requestPermissionsAsync();
        }
        if (!permissions.granted) {
          Alert.alert(
            "Notifications disabled",
            "Enable notifications in your phone settings to snooze this reminder.",
          );
          return;
        }

        const CHANNEL_ID = "todo-reminders-v4";
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
            name: "Todo reminders",
            description:
              "Reminders for your todo tasks, including snoozed reminders",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            enableVibrate: true,
            enableLights: true,
          });
        }

        const snoozeDate = new Date(Date.now() + minutes * 60 * 1000);

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: "Todo reminder",
            body: title || "You have a task to complete.",
            data: {
              todoId: stableTodoId,
              type: "snoozed-reminder",
              snoozeMinutes: minutes,
              scheduledFor: snoozeDate.toISOString(),
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: snoozeDate,
            ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
          },
        });

        console.log(
          `[Snooze] Todo ${stableTodoId} snoozed for ${minutes} minutes`,
          notificationId,
        );

        Alert.alert(
          "Reminder snoozed",
          `Your reminder will appear again in ${minutes} minutes.`,
        );
      } catch (error) {
        console.error("Snooze reminder error:", error);

        Alert.alert("Unable to snooze", "Please try again.");
      }
    },
    [],
  );
  const buildFormData = useCallback(
    (updatedAtIso = new Date().toISOString()) => {
      const formData = new FormData();

      // Save the selected Todo due date AND time as a full ISO timestamp.
      // Keep reminder date/time in separate fields.
      formData.append("title", title.trim());
      formData.append("date", dueDateTime.toISOString());
      formData.append("createdAt", createdAt);
      formData.append("updatedAt", updatedAtIso);
      formData.append("text", content.trim());
      // Keep the legacy alarm field for compatibility, and save the reminder
      // date and clock time explicitly for the backend/schema.
      formData.append("alarm", alarmDate?.toISOString() || "");
      formData.append("reminderDate", alarmDate ? alarmDate.toISOString() : "");
      formData.append(
        "reminderTime",
        alarmDate
          ? `${String(alarmDate.getHours()).padStart(2, "0")}:${String(alarmDate.getMinutes()).padStart(2, "0")}`
          : "",
      );
      formData.append("status", status);
      formData.append("noteType", "todo");
      formData.append("recurring", alarmDate ? recurring : "none");
      formData.append("isQuickNote", "false");
      formData.append("quickNoteColor", quickNoteColor);
      formData.append("quickNotePinned", String(quickNotePinned));
      formData.append("notePattern", notePattern);

      if (userId) formData.append("userId", userId);

      if (imageUri) {
        formData.append("file", {
          uri: imageUri,
          name: getFileName(imageUri, "todo_image.jpg"),
          type: "image/jpeg",
        } as unknown as Blob);
      }

      if (videoUri) {
        const videoName = getFileName(videoUri, "todo_video.mp4");
        const videoExtension = videoName.split(".").pop()?.toLowerCase();
        const videoMimeType =
          videoExtension === "mov"
            ? "video/quicktime"
            : videoExtension === "webm"
              ? "video/webm"
              : "video/mp4";

        formData.append("file", {
          uri: videoUri,
          name: videoName,
          type: videoMimeType,
        } as unknown as Blob);
      }

      if (voiceUri) {
        formData.append("file", {
          uri: voiceUri,
          name: getFileName(voiceUri, "todo_voice.m4a"),
          type: "audio/mp4",
        } as unknown as Blob);
      }

      if (noteBackgroundImageUri) {
        const backgroundName = getFileName(
          noteBackgroundImageUri,
          "note_background.jpg",
        );
        const backgroundExtension = backgroundName
          .split(".")
          .pop()
          ?.toLowerCase();
        const backgroundMimeType =
          backgroundExtension === "png"
            ? "image/png"
            : backgroundExtension === "webp"
              ? "image/webp"
              : backgroundExtension === "heic"
                ? "image/heic"
                : "image/jpeg";
        formData.append("backgroundImage", {
          uri: noteBackgroundImageUri,
          name: backgroundName,
          type: backgroundMimeType,
        } as unknown as Blob);
      }

      if (drawingUri) {
        formData.append("file", {
          uri: drawingUri,
          name: getFileName(drawingUri, "todo_sketch.png"),
          type: "image/png",
        } as unknown as Blob);
      }

      return formData;
    },
    [
      alarmDate,
      recurring,
      content,
      createdAt,
      dateText,
      dueDateTime,
      imageUri,
      status,
      title,
      userId,
      voiceUri,
      videoUri,
      drawingUri,
      isQuickNote,
      quickNoteColor,
      quickNotePinned,
      notePattern,
      noteBackgroundImageUri,
    ],
  );

  const pinNoteToHomeScreen = useCallback(async () => {
    const noteId = String(todoId ?? "").trim();
    if (!noteId || noteId.startsWith("quick-note-")) {
      Alert.alert(
        "Save note first",
        "Save this note to the server, then open it in Edit mode and choose Pin shortcut to home screen.",
      );
      return;
    }

    const nativeShortcut = NativeModules.PinnedNoteShortcut as
      | {
          pinShortcut?: (
            title: string,
            noteId: string,
            content: string,
          ) => Promise<boolean>;
        }
      | undefined;

    if (
      Platform.OS !== "android" ||
      typeof nativeShortcut?.pinShortcut !== "function"
    ) {
      Alert.alert(
        "Native shortcut unavailable",
        "Pinned home-screen shortcuts require the Android native module and a rebuilt development/production app. Expo Go is not supported.",
      );
      return;
    }

    try {
      const pinned = await nativeShortcut.pinShortcut(
        title.trim() || "My Note",
        noteId,
        content.trim(),
      );
      if (pinned) {
        Alert.alert(
          "Shortcut requested",
          "If your launcher supports pinned shortcuts, confirm the Android prompt to add this note to your home screen.",
        );
      } else {
        Alert.alert(
          "Shortcut not added",
          "Android could not pin this shortcut. Try again from your device launcher.",
        );
      }
    } catch (error) {
      console.warn("[PinnedNoteShortcut] Failed:", error);
      Alert.alert(
        "Unable to pin shortcut",
        error instanceof Error
          ? error.message
          : "The Android shortcut could not be created.",
      );
    }
  }, [todoId, title, content]);

  const saveTodo = useCallback(async () => {
    if (savingRef.current) return;

    if (!title.trim()) {
      Alert.alert("Title required", "Please enter a Todo title.");
      return;
    }

    if (!token || !userId) {
      Alert.alert("Login required", "Please sign in before saving this Todo.");
      return;
    }

    if (!parseDateText(dateText) || Number.isNaN(dueDateTime.getTime())) {
      Alert.alert(
        "Invalid due date",
        "Please select a valid due date and time.",
      );
      return;
    }

    if (isRecording || recordingRef.current) {
      Alert.alert(
        "Recording in progress",
        "Stop the voice recording before saving.",
      );
      return;
    }

    if (alarmDate && alarmDate.getTime() <= Date.now()) {
      Alert.alert("Invalid reminder", "Choose a reminder time in the future.");
      return;
    }

    savingRef.current = true;
    setLoading(true);

    try {
      const nowIso = new Date().toISOString();
      setModifiedAt(nowIso);

      const formData = buildFormData(nowIso);

      const apiTodoId = todoId ? String(todoId) : undefined;
      const shouldUpdate = Boolean(
        isEditing && apiTodoId && !apiTodoId.startsWith("quick-note-"),
      );

      const url = shouldUpdate
        ? `${API_BASE_URL}/api/updateTodolist/${apiTodoId}`
        : `${API_BASE_URL}/api/createTodolist`;

      const response = shouldUpdate
        ? await axios.put<ApiResponse>(url, formData, {
            headers: { ...authHeader(token) },
            timeout: 20000,
          })
        : await axios.post<ApiResponse>(url, formData, {
            headers: { ...authHeader(token) },
            timeout: 20000,
          });

      if (response.data?.success !== true) {
        throw new Error(
          response.data?.message ||
            "The server did not confirm saving this Todo.",
        );
      }

      // Get the saved Todo returned by the backend.
      const responsePayload =
        response.data.todo ??
        response.data.task ??
        (response.data.data && typeof response.data.data === "object"
          ? (response.data.data as TodoItem)
          : undefined);

      const savedTodoId = String(
        responsePayload?.tdlId ??
          responsePayload?.id ??
          responsePayload?._id ??
          responsePayload?.todoId ??
          apiTodoId ??
          "",
      ).trim();

      // Update the Android home-screen widget.
      // A widget error must not invalidate a successful server save.
      try {
        const widgetUpdated = await updateHomeNoteWidget(
          title.trim() || "My Notes",
          content.trim() || "No content yet.",
        );

        if (!widgetUpdated) {
          console.warn(
            "[HomeNoteWidget] Update returned false. Check native module registration.",
          );
        }
      } catch (widgetError) {
        console.warn("[HomeNoteWidget] Failed to update widget:", widgetError);
      }

      // Persist note appearance metadata.
      const persistedBackground =
        responsePayload?.backgroundImageUrl ||
        responsePayload?.backgroundImage ||
        noteBackgroundImageUri ||
        undefined;

      const appearanceMeta = {
        isQuickNote: false,
        quickNoteColor,
        notePattern,
        backgroundImageUri: persistedBackground,
        noteBackgroundImage: undefined,
        updatedAt: new Date().toISOString(),
      };

      const metaKeys = new Set<string>();

      if (savedTodoId) {
        metaKeys.add(`quick-note-meta:${savedTodoId}`);
      }

      if (title.trim()) {
        metaKeys.add(`quick-note-meta:${title.trim().toLowerCase()}`);
      }

      await Promise.all(
        [...metaKeys].map((key) =>
          AsyncStorage.setItem(key, JSON.stringify(appearanceMeta)),
        ),
      );

      await AsyncStorage.removeItem(draftKey);

      let reminderMessage = "";

      try {
        await scheduleLocalNotification(title.trim(), savedTodoId || null);

        reminderMessage = alarmDate
          ? "\nReminder scheduled successfully."
          : "\nNo reminder is set.";
      } catch (notificationError) {
        console.warn(
          "Todo reminder could not be scheduled:",
          notificationError,
        );

        reminderMessage =
          `\nTodo saved, but the reminder was not scheduled: ` +
          getErrorMessage(notificationError);
      }

      if (!mounted.current) return;

      Alert.alert(
        "Todo saved",
        (isEditing
          ? "Your Todo and its selected theme/template settings were updated."
          : "Your Todo and its selected theme/template settings were saved to the database.") +
          reminderMessage,
        [
          {
            text: "OK",
            onPress: () => router.replace("/viewlist"),
          },
        ],
      );
    } catch (error) {
      console.error("[Todo] Save failed:", error);

      if (mounted.current) {
        Alert.alert("Save failed", getErrorMessage(error));
      }
    } finally {
      savingRef.current = false;

      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [
    alarmDate,
    recurring,
    buildFormData,
    dateText,
    dueDateTime,
    draftKey,
    isEditing,
    isRecording,
    scheduleLocalNotification,
    title,
    content,
    token,
    todoId,
    userId,
    quickNoteColor,
    notePattern,
    noteBackgroundImageUri,
  ]);

  const clearReminder = useCallback(async () => {
    try {
      const stableTodoId = todoId ? String(todoId) : undefined;
      if (stableTodoId) await cancelTodoNotifications(stableTodoId);
      setAlarmDate(null);
      setRecurring("none");
      Alert.alert(
        "Reminder cleared",
        "The reminder has been removed from this Todo.",
      );
    } catch (error) {
      console.error("Unable to clear Todo reminder:", error);
      Alert.alert("Could not clear reminder", getErrorMessage(error));
    }
  }, [todoId, cancelTodoNotifications]);

  const clearImage = useCallback(() => {
    setImageUri(null);
  }, []);

  const clearVoice = useCallback(async () => {
    try {
      await player.pause();
    } catch {}
    setVoiceUri(null);
    setPlayerError("");
  }, [player]);

  const cancel = useCallback(() => {
    if (loading) return;
    router.replace("/viewlist");
  }, [loading]);

  const formatButton = (
    label: "B" | "I" | "U",
    active: boolean,
    onPress: () => void,
    accessibilityLabel: string,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        themeStyle(styles.formatButton),
        active && themeStyle(styles.formatButtonActive),
      ]}
    >
      <Text
        style={[
          themeStyle(styles.formatButtonText),
          label === "B" && themeStyle(styles.boldText),
          label === "I" && themeStyle(styles.italicText),
          label === "U" && themeStyle(styles.underlineText),
          active && themeStyle(styles.formatButtonTextActive),
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  if (initializing) {
    return (
      <SafeAreaView style={themeStyle(styles.loadingScreen)}>
        <ActivityIndicator size="large" color={personalAccentColor} />
        <Text style={themeStyle(styles.loadingText)}>
          Preparing your Todo...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={themeStyle(styles.safeArea)}>
      <KeyboardAvoidingView
        style={themeStyle(uiStyles.flex)}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={themeStyle(uiStyles.screen)}
          contentContainerStyle={themeStyle(uiStyles.scrollContent)}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={
              isDark
                ? [appTheme.surface, appTheme.background, appTheme.surface]
                : ["#C6F3E0", "#E4FBEE", "#A8EEDB"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={themeStyle(uiStyles.header)}
          >
            <View style={themeStyle(uiStyles.headerRow)}>
              <Pressable
                onPress={cancel}
                style={themeStyle(uiStyles.backButton)}
                accessibilityLabel="Go back"
              >
                <Ionicons name="arrow-back" size={25} color={appTheme.text} />
              </Pressable>
              <View style={themeStyle(uiStyles.headerCopy)}>
                <Text style={themeStyle(uiStyles.headerTitle)}>
                  {isEditing ? "Edit Note" : "Create Note"}
                </Text>
                <Text style={themeStyle(uiStyles.headerSubtitle)}>
                  Capture your thoughts
                </Text>
              </View>
              <Pressable
                style={themeStyle(uiStyles.quickSave)}
                onPress={() => void saveTodo()}
                disabled={loading}
              >
                <Ionicons
                  name="cloud-upload-outline"
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={themeStyle(uiStyles.quickSaveText)}>
                  {loading ? "Saving…" : "Quick Save"}
                </Text>
              </Pressable>

              <Pressable
                style={themeStyle(uiStyles.moreButton)}
                onPress={() =>
                  Alert.alert(
                    "Note options",
                    "Choose an action",
                    [
                      {
                        text: "Edit Note",
                        onPress: () => contentInputRef.current?.focus(),
                      },
                      {
                        text: quickNotePinned ? "Unpin note" : "Pin note",
                        onPress: () => setQuickNotePinned((v) => !v),
                      },
                      {
                        text: "Delete Local Draft",
                        style: "destructive",
                        onPress: () => {
                          Alert.alert(
                            "Delete local draft?",
                            "This removes the autosaved draft on this device. A Todo already saved to the server will remain unchanged.",
                            [
                              {
                                text: "Cancel",
                                style: "cancel",
                              },
                              {
                                text: "Close",
                                style: "cancel",
                              },
                              {
                                text: "Delete Draft",
                                style: "destructive",
                                onPress: () => void deleteLocalDraft(),
                              },
                            ],
                            { cancelable: true },
                          );
                        },
                      },
                      {
                        text: "Open Todo List",
                        onPress: () => router.push("/viewlist"),
                      },
                      {
                        text: "Close",
                        style: "cancel",
                      },
                    ],
                    { cancelable: true },
                  )
                }
              >
                <Ionicons
                  name="ellipsis-vertical"
                  size={21}
                  color={appTheme.text}
                />
              </Pressable>
            </View>
            <View style={themeStyle(uiStyles.headerArt)}>
              <Ionicons name="leaf" size={29} color="#39BDA0" />
              <Ionicons name="document-text" size={51} color="#159F89" />
              <Ionicons name="pencil" size={29} color="#087B72" />
            </View>
          </LinearGradient>

          <View style={themeStyle(uiStyles.titleField)}>
            <View style={themeStyle(uiStyles.titleIcon)}>
              <Ionicons
                name="pencil-outline"
                size={25}
                color={appTheme.secondaryText}
              />
            </View>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Note title..."
              placeholderTextColor={appTheme.secondaryText}
              maxLength={100}
              style={themeStyle(uiStyles.titleInput)}
              returnKeyType="next"
            />
            <Text style={themeStyle(uiStyles.counter)}>{title.length}/100</Text>
          </View>

          <View style={themeStyle(styles.editorToolbar)}>
            {/* Row 1: Text styling */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={themeStyle(styles.toolbarRow)}
            >
              <Text style={themeStyle(styles.toolbarLabel)}>STYLE</Text>
              {formatButton("B", bold, () => setBold((v) => !v), "Bold")}
              {formatButton("I", italic, () => setItalic((v) => !v), "Italic")}
              {formatButton(
                "U",
                underline,
                () => setUnderline((v) => !v),
                "Underline",
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Toggle strikethrough"
                accessibilityState={{ selected: strikethrough }}
                style={[
                  themeStyle(styles.toolButton),
                  strikethrough && themeStyle(styles.toolButtonActive),
                ]}
                onPress={() => setStrikethrough((value) => !value)}
              >
                <Text
                  style={[
                    themeStyle(styles.toolText),
                    { textDecorationLine: "line-through" },
                  ]}
                >
                  S
                </Text>
              </Pressable>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={() => setColorPaletteVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Open text color palette"
              >
                <Ionicons
                  name="color-palette-outline"
                  size={19}
                  color={textColor}
                />
              </Pressable>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={() => setFontPickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose font family"
              >
                <Ionicons
                  name="text-outline"
                  size={19}
                  color={appTheme.secondaryText}
                />
              </Pressable>
            </ScrollView>

            <View style={themeStyle(styles.toolbarSeparator)} />

            {/* Row 2: Paragraph and lists */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={themeStyle(styles.toolbarRow)}
            >
              <Text style={themeStyle(styles.toolbarLabel)}>PARAGRAPH</Text>
              {(
                [
                  ["left", "Align left", "menu-outline"],
                  ["center", "Align center", "reorder-three-outline"],
                  ["right", "Align right", "menu-outline"],
                  ["justify", "Justify text", "list-outline"],
                ] as const
              ).map(([value, label, iconName]) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: alignment === value }}
                  style={[
                    themeStyle(styles.toolButton),
                    alignment === value && themeStyle(styles.toolButtonActive),
                  ]}
                  onPress={() => setAlignment(value)}
                >
                  <Ionicons
                    name={iconName}
                    size={19}
                    color={
                      alignment === value
                        ? personalAccentColor
                        : appTheme.secondaryText
                    }
                    style={
                      value === "right"
                        ? { transform: [{ scaleX: -1 }] }
                        : undefined
                    }
                  />
                </Pressable>
              ))}

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={() => replaceSelection("• ")}
                accessibilityRole="button"
                accessibilityLabel="Insert bullet list"
              >
                <Text style={themeStyle(styles.toolText)}>• List</Text>
              </Pressable>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={() => {
                  replaceSelection(`${listNumber}. `);
                  setListNumber((prev) => prev + 1);
                }}
                accessibilityRole="button"
                accessibilityLabel="Insert numbered list"
              >
                <Text style={themeStyle(styles.toolText)}>1. List</Text>
              </Pressable>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={() => {
                  const checklist = Array.from({ length: 5 }, () => "☐ ").join(
                    "\n",
                  );

                  replaceSelection(checklist);
                }}
                accessibilityRole="button"
                accessibilityLabel="Insert five checklist items"
              >
                <Text style={themeStyle(styles.toolText)}>☐ Checklist</Text>
              </Pressable>
              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={() => {
                  const checklist = Array.from({ length: 5 }, () => "☑ ").join(
                    "\n",
                  );

                  replaceSelection(checklist);
                }}
                accessibilityRole="button"
                accessibilityLabel="Insert five checked checklist items"
              >
                <Text style={themeStyle(styles.toolText)}>☑ Checked</Text>
              </Pressable>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={openChecklistReorder}
                accessibilityRole="button"
                accessibilityLabel="Reorder checklist items"
              >
                <Ionicons
                  name="reorder-three-outline"
                  size={19}
                  color={appTheme.secondaryText}
                />
                <Text style={themeStyle(styles.toolText)}>Reorder</Text>
              </Pressable>

              {reorderChecklistVisible && (
                <View
                  style={{
                    marginVertical: 12,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: appTheme.primary,
                    backgroundColor: appTheme.surface,
                  }}
                >
                  <Text
                    style={{
                      color: appTheme.text,
                      fontSize: 17,
                      fontWeight: "700",
                      marginBottom: 10,
                    }}
                  >
                    Reorder Checklist Items
                  </Text>

                  {reorderChecklistItems.length === 0 ? (
                    <Text style={{ color: appTheme.secondaryText }}>
                      No checkbox items found in your note.
                    </Text>
                  ) : (
                    <DraggableFlatList
                      data={reorderChecklistItems}
                      keyExtractor={(item) => item.id}
                      activationDistance={8}
                      scrollEnabled={false}
                      onDragEnd={({ data }) => {
                        saveChecklistReorder(data);
                      }}
                      renderItem={({ item, drag, isActive }) => (
                        <ScaleDecorator>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              padding: 8,
                              marginBottom: 6,
                              borderRadius: 8,
                              backgroundColor: isActive
                                ? `${appTheme.primary}20`
                                : appTheme.surface,
                            }}
                          >
                            <Pressable
                              onPress={() => {
                                const updated = reorderChecklistItems.map(
                                  (entry) =>
                                    entry.id === item.id
                                      ? {
                                          ...entry,
                                          checked: !entry.checked,
                                        }
                                      : entry,
                                );

                                saveChecklistReorder(updated);
                              }}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: item.checked }}
                            >
                              <Ionicons
                                name={
                                  item.checked ? "checkbox" : "square-outline"
                                }
                                size={23}
                                color={appTheme.primary}
                              />
                            </Pressable>

                            <Text
                              style={{
                                flex: 1,
                                marginHorizontal: 10,
                                color: appTheme.text,
                                textDecorationLine: item.checked
                                  ? "line-through"
                                  : "none",
                              }}
                            >
                              {item.text || "Untitled item"}
                            </Text>

                            <Pressable
                              onLongPress={drag}
                              delayLongPress={150}
                              disabled={isActive}
                              accessibilityRole="button"
                              accessibilityLabel={`Move ${item.text}`}
                              hitSlop={8}
                              style={{ padding: 6 }}
                            >
                              <Ionicons
                                name="reorder-three-outline"
                                size={25}
                                color={appTheme.secondaryText}
                              />
                            </Pressable>
                          </View>
                        </ScaleDecorator>
                      )}
                    />
                  )}

                  <Pressable
                    onPress={() => setReorderChecklistVisible(false)}
                    style={{
                      alignSelf: "flex-end",
                      marginTop: 10,
                      paddingHorizontal: 16,
                      paddingVertical: 9,
                      borderRadius: 8,
                      backgroundColor: appTheme.primary,
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>
                      Done
                    </Text>
                  </Pressable>
                </View>
              )}

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={() => changeIndent("decrease")}
                accessibilityRole="button"
                accessibilityLabel="Decrease indent"
              >
                <Ionicons
                  name="return-up-back-outline"
                  size={18}
                  color={appTheme.secondaryText}
                />
              </Pressable>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={() => changeIndent("increase")}
                accessibilityRole="button"
                accessibilityLabel="Increase indent"
              >
                <Ionicons
                  name="return-down-forward-outline"
                  size={18}
                  color={appTheme.secondaryText}
                />
              </Pressable>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={() => setSpacingModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Adjust text spacing"
              >
                <Ionicons
                  name="menu-outline"
                  size={18}
                  color={appTheme.secondaryText}
                />
                <Text style={themeStyle(styles.spacingButtonLabel)}>
                  Spacing
                </Text>
              </Pressable>
            </ScrollView>

            <View style={themeStyle(styles.toolbarSeparator)} />

            {/* Row 3: Editing tools */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={themeStyle(styles.toolbarRow)}
            >
              <Text style={themeStyle(styles.toolbarLabel)}>EDIT</Text>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={undoEdit}
                accessibilityRole="button"
                accessibilityLabel="Undo"
              >
                <Ionicons
                  name="arrow-undo-outline"
                  size={18}
                  color={appTheme.secondaryText}
                />
              </Pressable>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={redoEdit}
                accessibilityRole="button"
                accessibilityLabel="Redo"
              >
                <Ionicons
                  name="arrow-redo-outline"
                  size={18}
                  color={appTheme.secondaryText}
                />
              </Pressable>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={() => void copyContent()}
                accessibilityRole="button"
                accessibilityLabel="Copy"
              >
                <Ionicons
                  name="copy-outline"
                  size={18}
                  color={appTheme.secondaryText}
                />
              </Pressable>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={() => void pasteContent()}
                accessibilityRole="button"
                accessibilityLabel="Paste"
              >
                <Ionicons
                  name="clipboard-outline"
                  size={18}
                  color={appTheme.secondaryText}
                />
              </Pressable>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={() => void cutSelection()}
                accessibilityRole="button"
                accessibilityLabel="Cut"
              >
                <Ionicons
                  name="cut-outline"
                  size={18}
                  color={appTheme.secondaryText}
                />
              </Pressable>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={() =>
                  setSelection({
                    start: 0,
                    end: content.length,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="Select all"
              >
                <Ionicons
                  name="scan-outline"
                  size={18}
                  color={appTheme.secondaryText}
                />
              </Pressable>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={insertHyperlink}
                accessibilityRole="button"
                accessibilityLabel="Insert hyperlink"
              >
                <Ionicons
                  name="link-outline"
                  size={18}
                  color={appTheme.secondaryText}
                />
              </Pressable>

              <Pressable
                style={themeStyle(styles.toolButton)}
                onPress={() => void openFirstHyperlink()}
                accessibilityRole="button"
                accessibilityLabel="Open URL"
              >
                <Ionicons
                  name="open-outline"
                  size={18}
                  color={appTheme.secondaryText}
                />
              </Pressable>

              <View style={themeStyle(styles.fontSizeControl)}>
                <Pressable
                  onPress={() => setFontSize((v) => Math.max(12, v - 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease font size"
                  hitSlop={6}
                >
                  <Ionicons
                    name="remove"
                    size={17}
                    color={appTheme.secondaryText}
                  />
                </Pressable>

                <Text style={themeStyle(styles.fontSizeText)}>A</Text>

                <Pressable
                  onPress={() => setFontSize((v) => Math.min(24, v + 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Increase font size"
                  hitSlop={6}
                >
                  <Ionicons
                    name="add"
                    size={17}
                    color={appTheme.secondaryText}
                  />
                </Pressable>
              </View>

              <Text
                style={[
                  themeStyle(styles.characterCount),
                  content.length === 0 &&
                    themeStyle(styles.characterCountEmpty),
                  content.length > 500 &&
                    themeStyle(styles.characterCountWarning),
                  content.length > 1000 &&
                    themeStyle(styles.characterCountLimit),
                ]}
              >
                {content.length} characters
              </Text>
            </ScrollView>
          </View>

          <View
            style={[
              themeStyle(uiStyles.contentField),
              {
                backgroundColor: quickNoteColor,
                borderColor: `${personalAccentColor}55`,
                borderRadius:
                  defaultNoteCornerStyle === "square"
                    ? 4
                    : defaultNoteCornerStyle === "soft"
                      ? 24
                      : 14,
              },
            ]}
          >
            {noteBackgroundImageUri && (
              <Image
                pointerEvents="none"
                source={{ uri: noteBackgroundImageUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            )}
            {noteBackgroundImageUri && (
              <View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: "rgba(255,255,255,0.35)" },
                ]}
              />
            )}
            {!noteBackgroundImageUri && notePattern === "lined" && (
              <View
                pointerEvents="none"
                style={themeStyle(uiStyles.editorPatternOverlay)}
              >
                {Array.from({ length: 10 }, (_, i) => (
                  <View key={i} style={themeStyle(uiStyles.editorLine)} />
                ))}
              </View>
            )}
            {!noteBackgroundImageUri && notePattern === "grid" && (
              <View
                pointerEvents="none"
                style={themeStyle(uiStyles.editorGridOverlay)}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <View
                    key={`v${i}`}
                    style={[
                      themeStyle(uiStyles.editorGridLine),
                      { left: `${(i + 1) * 8}%`, top: 0, bottom: 0, width: 1 },
                    ]}
                  />
                ))}
                {Array.from({ length: 10 }, (_, i) => (
                  <View
                    key={`h${i}`}
                    style={[
                      themeStyle(uiStyles.editorGridLine),
                      { top: (i + 1) * 18, left: 0, right: 0, height: 1 },
                    ]}
                  />
                ))}
              </View>
            )}
            {!noteBackgroundImageUri && notePattern === "dotted" && (
              <View
                pointerEvents="none"
                style={themeStyle(uiStyles.editorPatternOverlay)}
              >
                {Array.from({ length: 8 }, (_, i) => (
                  <View key={i} style={themeStyle(uiStyles.dotRow)}>
                    <Text style={themeStyle(uiStyles.dotRowText)}>
                      {"·     ·     ·     ·     ·     ·     ·     ·     ·"}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Ionicons name="document-text-outline" size={27} color="#536176" />
            <TextInput
              ref={contentInputRef}
              value={content}
              onChangeText={handleContentChange}
              onSelectionChange={(event) =>
                setSelection(event.nativeEvent.selection)
              }
              placeholder="Write your note here..."
              placeholderTextColor="#A0A8B4"
              multiline
              maxLength={2000}
              textAlignVertical="top"
              style={[
                themeStyle(uiStyles.contentInput),
                {
                  fontSize:
                    defaultNoteTextSize === "small"
                      ? 14
                      : defaultNoteTextSize === "large"
                        ? 19
                        : 16,
                },
                defaultNotebookStyle === "journal" && { fontStyle: "italic" },
                {
                  color: textColor,
                  fontSize,
                  fontWeight: bold ? "700" : "400",
                  fontStyle: italic ? "italic" : "normal",
                  textDecorationLine: underline
                    ? "underline"
                    : strikethrough
                      ? "line-through"
                      : "none",
                  fontFamily: fontFamily === "System" ? undefined : fontFamily,
                  textAlign: alignment,
                  lineHeight: lineSpacing,
                  letterSpacing,
                },
              ]}
            />
            <Text style={themeStyle(uiStyles.contentCounter)}>
              {content.length}/2000
            </Text>
          </View>

          <View style={themeStyle(uiStyles.fontSizePanel)}>
            {/* Header */}
            <View style={themeStyle(uiStyles.fontSizeHeader)}>
              <View style={themeStyle(uiStyles.fontSizeIconBox)}>
                <Ionicons name="text-outline" size={25} color="#138A78" />
              </View>

              <View style={themeStyle(uiStyles.fontSizeCopy)}>
                <Text style={themeStyle(uiStyles.fontSizeTitle)}>
                  Reading & Typography
                </Text>
                <Text style={themeStyle(uiStyles.fontSizeSubtitle)}>
                  Make your notes easier to read
                </Text>
              </View>

              <View style={themeStyle(uiStyles.fontSizeBadge)}>
                <Ionicons name="eye-outline" size={17} color="#138A78" />
              </View>
            </View>

            {/* Font preview */}
            <View style={themeStyle(uiStyles.fontSizePreview)}>
              <View style={themeStyle(uiStyles.fontSizePreviewHeader)}>
                <Text style={themeStyle(uiStyles.fontSizePreviewLabel)}>
                  LIVE PREVIEW
                </Text>
                <Text style={themeStyle(uiStyles.fontSizeValue)}>
                  {fontSize} px
                </Text>
              </View>

              <Text
                style={[themeStyle(uiStyles.fontSizePreviewText), { fontSize }]}
                numberOfLines={2}
              >
                Your notes, your reading comfort.
              </Text>
            </View>

            {/* Font size controls */}
            <View style={themeStyle(uiStyles.fontSizeControlRow)}>
              <View style={themeStyle(uiStyles.fontSizeControlCopy)}>
                <Text style={themeStyle(uiStyles.fontSizeControlTitle)}>
                  Text size
                </Text>
                <Text style={themeStyle(uiStyles.fontSizeControlSubtitle)}>
                  Choose a comfortable size
                </Text>
              </View>

              <View style={themeStyle(uiStyles.fontSizeControls)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decrease font size"
                  accessibilityState={{ disabled: fontSize <= 12 }}
                  disabled={fontSize <= 12}
                  onPress={() => setFontSize((size) => Math.max(12, size - 2))}
                  style={({ pressed }) => [
                    themeStyle(uiStyles.fontSizeButton),
                    fontSize <= 12 && themeStyle(uiStyles.disabledControl),
                    pressed &&
                      fontSize > 12 &&
                      themeStyle(uiStyles.fontSizeButtonPressed),
                  ]}
                >
                  <Ionicons
                    name="remove"
                    size={22}
                    color={fontSize <= 12 ? "#AAB9B5" : "#176B5D"}
                  />
                </Pressable>

                <Text style={themeStyle(uiStyles.fontSizeControlValue)}>
                  {fontSize}
                </Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Increase font size"
                  accessibilityState={{ disabled: fontSize >= 32 }}
                  disabled={fontSize >= 32}
                  onPress={() => setFontSize((size) => Math.min(32, size + 2))}
                  style={({ pressed }) => [
                    themeStyle(uiStyles.fontSizeButton),
                    fontSize >= 32 && themeStyle(uiStyles.disabledControl),
                    pressed &&
                      fontSize < 32 &&
                      themeStyle(uiStyles.fontSizeButtonPressed),
                  ]}
                >
                  <Ionicons
                    name="add"
                    size={22}
                    color={fontSize >= 32 ? "#AAB9B5" : "#176B5D"}
                  />
                </Pressable>
              </View>
            </View>

            {/* Size range */}
            <View style={themeStyle(uiStyles.fontSizeRangeRow)}>
              <Text style={themeStyle(uiStyles.fontSizeRangeLabel)}>Small</Text>

              <View style={themeStyle(uiStyles.fontSizeRangeTrack)}>
                <View
                  style={[
                    themeStyle(uiStyles.fontSizeRangeFill),
                    { width: `${((fontSize - 12) / 20) * 100}%` },
                  ]}
                />
              </View>

              <Text style={themeStyle(uiStyles.fontSizeRangeLabel)}>Large</Text>
            </View>
          </View>

          <View style={themeStyle(uiStyles.contentMetrics)}>
            <View style={themeStyle(uiStyles.metricPill)}>
              <Ionicons
                name="document-text-outline"
                size={15}
                color="#16866D"
              />
              <Text style={themeStyle(uiStyles.metricText)}>
                {content.trim() ? content.trim().split(/\s+/).length : 0} words
              </Text>
            </View>
            <View style={themeStyle(uiStyles.metricPill)}>
              <Ionicons name="time-outline" size={15} color="#16866D" />
              <Text style={themeStyle(uiStyles.metricText)}>
                {Math.max(
                  1,
                  Math.ceil(
                    (content.trim() ? content.trim().split(/\s+/).length : 0) /
                      200,
                  ),
                )}{" "}
                min read
              </Text>
            </View>
            <View style={themeStyle(uiStyles.metricPill)}>
              <Ionicons name="text-outline" size={15} color="#16866D" />
              <Text style={themeStyle(uiStyles.metricText)}>
                {content.length} characters
              </Text>
            </View>
          </View>

          <View style={themeStyle(uiStyles.featureSection)}>
            <View style={themeStyle(uiStyles.featureHeadingRow)}>
              <View>
                <Text style={themeStyle(uiStyles.featureTitle)}>
                  Paper style
                </Text>
                <Text style={themeStyle(uiStyles.featureSubtitle)}>
                  Choose a background pattern for your note
                </Text>
              </View>
              <Ionicons
                name="color-palette-outline"
                size={22}
                color="#138A78"
              />
            </View>
            <View style={themeStyle(uiStyles.patternRow)}>
              {(["plain", "lined", "dotted", "grid"] as const).map(
                (pattern) => (
                  <Pressable
                    key={pattern}
                    onPress={() => setNotePattern(pattern)}
                    style={[
                      themeStyle(uiStyles.patternOption),
                      notePattern === pattern &&
                        themeStyle(uiStyles.patternOptionActive),
                    ]}
                  >
                    <View
                      style={[
                        themeStyle(uiStyles.patternPreview),
                        { backgroundColor: quickNoteColor },
                        notePattern === pattern &&
                          themeStyle(uiStyles.patternPreviewActive),
                      ]}
                    >
                      {pattern === "lined" &&
                        Array.from({ length: 4 }, (_, i) => (
                          <View
                            key={i}
                            style={themeStyle(uiStyles.previewLine)}
                          />
                        ))}
                      {pattern === "grid" && (
                        <>
                          <View
                            style={themeStyle(uiStyles.previewGridVertical)}
                          />
                          <View
                            style={themeStyle(uiStyles.previewGridHorizontal)}
                          />
                        </>
                      )}
                      {pattern === "dotted" && (
                        <Text style={themeStyle(uiStyles.previewDots)}>
                          · · ·{`\n`}· · ·{`\n`}· · ·
                        </Text>
                      )}
                      {pattern === "plain" && (
                        <Ionicons
                          name="remove-outline"
                          size={21}
                          color="#82928D"
                        />
                      )}
                    </View>
                    <Text
                      style={[
                        themeStyle(uiStyles.patternLabel),
                        notePattern === pattern &&
                          themeStyle(uiStyles.patternLabelActive),
                      ]}
                    >
                      {pattern[0].toUpperCase() + pattern.slice(1)}
                    </Text>
                    {notePattern === pattern && (
                      <Ionicons
                        name="checkmark-circle"
                        size={15}
                        color="#118A75"
                      />
                    )}
                  </Pressable>
                ),
              )}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open attachment options"
            onPress={() => setAttachmentModalVisible(true)}
            style={({ pressed }) => [
              themeStyle(uiStyles.attachmentLauncher),
              pressed && themeStyle(uiStyles.attachmentLauncherPressed),
            ]}
          >
            <View style={themeStyle(uiStyles.attachmentLauncherIcon)}>
              <Ionicons name="attach-outline" size={24} color="#07876E" />
            </View>
            <View style={themeStyle(uiStyles.attachmentLauncherCopy)}>
              <Text style={themeStyle(uiStyles.attachmentLauncherTitle)}>
                Add attachment
              </Text>
              <Text style={themeStyle(uiStyles.attachmentLauncherSubtitle)}>
                Image, video, voice, handwriting or file
              </Text>
            </View>
            <View style={themeStyle(uiStyles.attachmentLauncherAction)}>
              <Ionicons name="add" size={23} color="#FFFFFF" />
            </View>
          </Pressable>

          {imageUri || videoUri || voiceUri || drawingUri ? (
            <View style={themeStyle(uiStyles.attachmentTray)}>
              {imageUri ? (
                <View style={themeStyle(uiStyles.attachmentPreview)}>
                  <Image
                    source={{ uri: imageUri }}
                    style={themeStyle(uiStyles.previewImage)}
                  />
                  <Pressable
                    style={themeStyle(uiStyles.removeAttachment)}
                    onPress={() => setImageUri(null)}
                  >
                    <Ionicons name="close" size={17} color="#243B43" />
                  </Pressable>
                </View>
              ) : null}
              {videoUri ? (
                <View
                  style={[
                    themeStyle(uiStyles.attachmentPreview),
                    themeStyle(uiStyles.filePreview),
                    { backgroundColor: "#F0EAFE" },
                  ]}
                >
                  <Ionicons name="play-circle" size={35} color="#7850CB" />
                  <Text style={themeStyle(uiStyles.previewLabel)}>
                    Video attached
                  </Text>
                  <Pressable
                    style={themeStyle(uiStyles.removeAttachment)}
                    onPress={() => setVideoUri(null)}
                  >
                    <Ionicons name="close" size={17} color="#243B43" />
                  </Pressable>
                </View>
              ) : null}
              {voiceUri ? (
                <View
                  style={[
                    themeStyle(uiStyles.attachmentPreview),
                    themeStyle(uiStyles.filePreview),
                    { backgroundColor: "#FDE9F2" },
                  ]}
                >
                  <Pressable
                    onPress={() => {
                      void togglePlayback();
                    }}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={
                      playerStatus.playing
                        ? "Pause voice note"
                        : "Play voice note"
                    }
                  >
                    <Ionicons
                      name={
                        playerStatus.playing ? "pause-circle" : "play-circle"
                      }
                      size={32}
                      color="#D92B70"
                    />
                  </Pressable>

                  <Text style={themeStyle(uiStyles.previewLabel)}>
                    {playerStatus.playing ? "Playing voice note" : "Voice note"}
                  </Text>

                  <Pressable
                    style={themeStyle(uiStyles.removeAttachment)}
                    onPress={() => setVoiceUri(null)}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={17} color="#243B43" />
                  </Pressable>
                </View>
              ) : null}
              {drawingUri ? (
                <View style={themeStyle(uiStyles.attachmentPreview)}>
                  <Image
                    source={{ uri: drawingUri }}
                    style={themeStyle(uiStyles.previewImage)}
                  />
                  <Pressable
                    style={themeStyle(uiStyles.removeAttachment)}
                    onPress={() => setDrawingUri(null)}
                  >
                    <Ionicons name="close" size={17} color="#243B43" />
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                style={[
                  themeStyle(uiStyles.attachmentPreview),
                  themeStyle(uiStyles.addMore),
                ]}
                onPress={() => void pickImage()}
              >
                <Ionicons name="add" size={34} color="#64748B" />
                <Text style={themeStyle(uiStyles.previewLabel)}>Add More</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={themeStyle(uiStyles.settingsGrid)}>
            <SettingTile
              icon="calendar-outline"
              title="Due Date & Time"
              subtitle={`${formattedDate || "Choose date"} · ${dueDateTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              tint="#18A98B"
              bg="#E9F9F3"
              onPress={openDatePicker}
            />
            <SettingTile
              icon="notifications-outline"
              title="Reminder"
              subtitle={alarmDate ? toAlarmLabel(alarmDate) : "Set time"}
              tint="#FF923F"
              bg="#FFF5E9"
              onPress={openReminderPicker}
            />
            <SettingTile
              icon="color-palette-outline"
              title="Note Theme"
              subtitle={`${({ "#FFF4CC": "Warm", "#DDF7E8": "Fresh", "#DDEBFF": "Ocean", "#FCE1EE": "Blush", "#EDE2FF": "Lavender", "#FFFFFF": "Classic" } as Record<string, string>)[quickNoteColor] || "Custom"} · ${notePattern.charAt(0).toUpperCase()}${notePattern.slice(1)}`}
              tint="#1686E8"
              bg="#E8F4FF"
              onPress={openNoteThemePicker}
            />
            <SettingTile
              icon="albums-outline"
              title="Template"
              subtitle="Daily plan, checklist or journal"
              tint="#0D8B78"
              bg="#E5F8F2"
              onPress={openNoteTemplatePicker}
            />
            <SettingTile
              icon="create-outline"
              title="Handwriting & Drawing"
              subtitle={
                drawingUri
                  ? "Drawing attached · Tap to edit"
                  : "Write, sketch or convert to text"
              }
              tint="#8B5CF6"
              bg="#F1EBFF"
              onPress={() => setDrawingModalVisible(true)}
            />
            <View
              style={[
                uiStyles.recurringCard,
                {
                  backgroundColor: appTheme.surface,
                  borderColor: appTheme.border,
                },
              ]}
            >
              <View style={uiStyles.recurringHeader}>
                <View
                  style={[
                    uiStyles.recurringIcon,
                    { backgroundColor: "#FFF1E5" },
                  ]}
                >
                  <Ionicons name="repeat-outline" size={21} color="#E87924" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[uiStyles.recurringTitle, { color: appTheme.text }]}
                  >
                    Repeat reminder
                  </Text>
                  <Text
                    style={[
                      uiStyles.recurringSubtitle,
                      { color: appTheme.secondaryText },
                    ]}
                  >
                    {alarmDate
                      ? "Choose how often to remind you"
                      : "Set a reminder first to enable repeating"}
                  </Text>
                </View>
              </View>
              <View style={uiStyles.recurringOptions}>
                {(
                  [
                    { label: "No repeat", value: "none" },
                    { label: "Daily", value: "daily" },
                    { label: "Weekly", value: "weekly" },
                    { label: "Monthly", value: "monthly" },
                  ] as const
                ).map((option) => {
                  const selected = recurring === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected,
                        disabled: !alarmDate && option.value !== "none",
                      }}
                      disabled={!alarmDate && option.value !== "none"}
                      onPress={() => setRecurring(option.value)}
                      style={[
                        uiStyles.recurringOption,
                        {
                          borderColor: selected
                            ? personalAccentColor
                            : appTheme.border,
                          backgroundColor: selected
                            ? `${personalAccentColor}18`
                            : appTheme.background,
                        },
                        !alarmDate &&
                          option.value !== "none" && { opacity: 0.45 },
                      ]}
                    >
                      <Text
                        style={[
                          uiStyles.recurringOptionText,
                          {
                            color: selected
                              ? personalAccentColor
                              : appTheme.text,
                            fontWeight: selected ? "700" : "500",
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {!alarmDate && recurring !== "none" ? (
                <Text style={uiStyles.recurringWarning}>
                  Choose a reminder date and time before enabling repeat.
                </Text>
              ) : null}
            </View>
            <View style={themeStyle(uiStyles.noteColorTile)}>
              <View style={themeStyle(uiStyles.noteColorIcon)}>
                <Ionicons
                  name="color-palette-outline"
                  size={26}
                  color="#1686E8"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={themeStyle(uiStyles.settingTitle)}>
                  Note Color
                </Text>
                <View style={themeStyle(uiStyles.colorDots)}>
                  {quickNoteColors.map((color) => (
                    <Pressable
                      key={color}
                      accessibilityRole="button"
                      accessibilityLabel={`Choose note color ${color}`}
                      accessibilityState={{
                        selected: quickNoteColor === color,
                      }}
                      onPress={() => setQuickNoteColor(color)}
                      style={[
                        themeStyle(uiStyles.colorDot),
                        { backgroundColor: color },
                        quickNoteColor === color &&
                          themeStyle(uiStyles.selectedColorDot),
                      ]}
                    />
                  ))}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={21} color="#6394B1" />
            </View>
          </View>

          <Pressable
            onPress={() => void saveTodo()}
            disabled={loading || recordingBusy || isRecording}
            style={themeStyle(uiStyles.saveButton)}
          >
            <LinearGradient
              colors={["#078E89", "#13B9A0", "#23D5A5"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={themeStyle(uiStyles.saveGradient)}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons name="save-outline" size={30} color="#FFFFFF" />
              )}
              <Text style={themeStyle(uiStyles.saveText)}>
                {loading
                  ? "Saving Note..."
                  : isEditing
                    ? "Update Note"
                    : "Save Note"}
              </Text>
            </LinearGradient>
          </Pressable>

          <View style={themeStyle(uiStyles.draftStatusRow)}>
            <Ionicons
              name={
                draftStatus === "saved"
                  ? "checkmark-circle-outline"
                  : "cloud-upload-outline"
              }
              size={14}
              color={appTheme.secondaryText}
            />
            <Text style={themeStyle(uiStyles.draftStatusText)}>
              {draftStatus === "saved"
                ? "Draft saved on this device"
                : "Your changes are saved as a draft"}
            </Text>
          </View>

          {/* Attachment options bottom-sheet modal */}
          <Modal
            visible={attachmentModalVisible}
            transparent
            animationType="slide"
            statusBarTranslucent
            onRequestClose={() => setAttachmentModalVisible(false)}
          >
            <View style={themeStyle(uiStyles.attachmentModalOverlay)}>
              <Pressable
                style={themeStyle(uiStyles.attachmentModalBackdrop)}
                onPress={() => setAttachmentModalVisible(false)}
                accessibilityLabel="Close attachment options"
              />
              <View style={themeStyle(uiStyles.attachmentModalSheet)}>
                <View style={themeStyle(uiStyles.attachmentModalHandle)} />
                <View style={themeStyle(uiStyles.attachmentModalHeader)}>
                  <View style={{ flex: 1 }}>
                    <Text style={themeStyle(uiStyles.attachmentModalTitle)}>
                      Add to your note
                    </Text>
                    <Text style={themeStyle(uiStyles.attachmentModalSubtitle)}>
                      Choose what you want to attach
                    </Text>
                  </View>
                  <Pressable
                    style={themeStyle(uiStyles.attachmentModalClose)}
                    onPress={() => setAttachmentModalVisible(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={21} color="#52645F" />
                  </Pressable>
                </View>
                <View style={themeStyle(uiStyles.attachmentModalGrid)}>
                  <AttachmentTile
                    label="Add Image"
                    icon="image-outline"
                    tint="#07876E"
                    bg="#E5F8F2"
                    onPress={() => {
                      setAttachmentModalVisible(false);
                      void pickImage();
                    }}
                  />
                  <AttachmentTile
                    label="Add Video"
                    icon="videocam-outline"
                    tint="#8652EB"
                    bg="#F0EAFE"
                    onPress={() => {
                      setAttachmentModalVisible(false);
                      void pickImage();
                    }}
                  />
                  {/* Voice recording controls remain in this modal while recording. */}
                  {!recordingSessionActive && !voiceUri && (
                    <AttachmentTile
                      label="Record Voice"
                      icon="mic-outline"
                      tint="#F12870"
                      bg="#FDE9F2"
                      onPress={() => {
                        void startRecording();
                      }}
                    />
                  )}

                  {recordingSessionActive && (
                    <>
                      <AttachmentTile
                        label={
                          isPaused ? "Resume Recording" : "Pause Recording"
                        }
                        icon={
                          isPaused
                            ? "play-circle-outline"
                            : "pause-circle-outline"
                        }
                        tint="#0D9488"
                        bg="#DDF7F0"
                        onPress={() => {
                          if (isPaused) void resumeRecording();
                          else void pauseVoiceRecording();
                        }}
                      />
                      <AttachmentTile
                        label="Stop Recording"
                        icon="stop-circle-outline"
                        tint="#D92B70"
                        bg="#FDE9F2"
                        onPress={() => {
                          void stopRecording();
                        }}
                      />
                    </>
                  )}

                  {voiceUri && !recordingSessionActive && (
                    <AttachmentTile
                      label={
                        playerStatus.playing ? "Pause Audio" : "Play Audio"
                      }
                      icon={
                        playerStatus.playing
                          ? "pause-circle-outline"
                          : "play-circle-outline"
                      }
                      tint="#0D9488"
                      bg="#DDF7F0"
                      onPress={() => {
                        void togglePlayback();
                      }}
                    />
                  )}

                  <AttachmentTile
                    label="Handwriting"
                    icon="create-outline"
                    tint="#187BE8"
                    bg="#E6F3FF"
                    onPress={() => {
                      setAttachmentModalVisible(false);
                      setDrawingModalVisible(true);
                    }}
                  />
                  <AttachmentTile
                    label="Add File"
                    icon="document-text-outline"
                    tint="#F57917"
                    bg="#FFF0E5"
                    onPress={() => {
                      setAttachmentModalVisible(false);
                      Alert.alert(
                        "Add File",
                        "Image and video attachments are available above. To attach documents, install expo-document-picker in your Expo project.",
                      );
                    }}
                  />
                </View>
              </View>
            </View>
          </Modal>

          {/* Keep the existing color, font, spacing, link and handwriting modals below. */}
          {/* Modals */}
          <Modal
            visible={colorPaletteVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setColorPaletteVisible(false)}
          >
            <Pressable
              style={themeStyle(styles.colorModalOverlay)}
              onPress={() => setColorPaletteVisible(false)}
            >
              <Pressable
                style={themeStyle(styles.colorPaletteCard)}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={themeStyle(styles.colorPaletteHeader)}>
                  <Text style={themeStyle(styles.colorPaletteTitle)}>
                    Text Color
                  </Text>
                  <Pressable onPress={() => setColorPaletteVisible(false)}>
                    <Ionicons name="close" size={23} color={appTheme.text} />
                  </Pressable>
                </View>

                <View style={themeStyle(styles.colorGrid)}>
                  {textColors.map((color) => (
                    <Pressable
                      key={color}
                      accessibilityRole="button"
                      accessibilityLabel={`Select color ${color}`}
                      accessibilityState={{ selected: textColor === color }}
                      onPress={() => {
                        setTextColor(color);
                        setColorPaletteVisible(false);
                      }}
                      style={[
                        themeStyle(styles.colorSwatch),
                        { backgroundColor: color },
                        textColor === color &&
                          themeStyle(styles.selectedColorSwatch),
                        color === "#FFFFFF" &&
                          themeStyle(styles.whiteColorSwatch),
                      ]}
                    >
                      {textColor === color && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={color === "#FFFFFF" ? "#172F2B" : "#FFFFFF"}
                        />
                      )}
                    </Pressable>
                  ))}
                </View>

                <Text style={themeStyle(styles.selectedColorLabel)}>
                  Selected: {textColor.toUpperCase()}
                </Text>
              </Pressable>
            </Pressable>
          </Modal>

          <Modal
            visible={fontPickerVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setFontPickerVisible(false)}
          >
            <Pressable
              style={themeStyle(styles.fontModalOverlay)}
              onPress={() => setFontPickerVisible(false)}
            >
              <Pressable
                style={themeStyle(styles.fontModalCard)}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={themeStyle(styles.fontModalHeader)}>
                  <Text style={themeStyle(styles.fontModalTitle)}>
                    Choose Font
                  </Text>
                  <Pressable onPress={() => setFontPickerVisible(false)}>
                    <Ionicons name="close" size={23} color={appTheme.text} />
                  </Pressable>
                </View>

                {fontFamilies.map((font) => (
                  <Pressable
                    key={font}
                    style={[
                      themeStyle(styles.fontOption),
                      fontFamily === font &&
                        themeStyle(styles.fontOptionActive),
                    ]}
                    onPress={() => {
                      setFontFamily(font as any);
                      setFontPickerVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        themeStyle(styles.fontOptionText),
                        { fontFamily: font === "System" ? undefined : font },
                        fontFamily === font &&
                          themeStyle(styles.fontOptionTextActive),
                      ]}
                    >
                      {font === "System" ? "Default System Font" : font}
                    </Text>

                    {fontFamily === font && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#239B83"
                      />
                    )}
                  </Pressable>
                ))}
              </Pressable>
            </Pressable>
          </Modal>

          <Modal
            visible={spacingModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setSpacingModalVisible(false)}
          >
            <Pressable
              style={themeStyle(styles.fontModalOverlay)}
              onPress={() => setSpacingModalVisible(false)}
            >
              <Pressable
                style={themeStyle(styles.fontModalCard)}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={themeStyle(styles.fontModalHeader)}>
                  <Text style={themeStyle(styles.fontModalTitle)}>
                    Text Spacing
                  </Text>
                  <Pressable
                    onPress={() => setSpacingModalVisible(false)}
                    accessibilityLabel="Close text spacing"
                  >
                    <Ionicons name="close" size={23} color={appTheme.text} />
                  </Pressable>
                </View>

                <Text style={themeStyle(styles.spacingSettingLabel)}>
                  Line spacing
                </Text>
                <Text style={themeStyle(styles.spacingSettingHint)}>
                  Controls the vertical distance between lines.
                </Text>
                <View style={themeStyle(styles.spacingControlRow)}>
                  <Pressable
                    style={themeStyle(styles.spacingStepButton)}
                    onPress={() =>
                      setLineSpacing((value) => Math.max(16, value - 2))
                    }
                    accessibilityLabel="Decrease line spacing"
                  >
                    <Ionicons name="remove" size={20} color={appTheme.text} />
                  </Pressable>
                  <Text style={themeStyle(styles.spacingValue)}>
                    {lineSpacing} px
                  </Text>
                  <Pressable
                    style={themeStyle(styles.spacingStepButton)}
                    onPress={() =>
                      setLineSpacing((value) => Math.min(40, value + 2))
                    }
                    accessibilityLabel="Increase line spacing"
                  >
                    <Ionicons name="add" size={20} color={appTheme.text} />
                  </Pressable>
                </View>

                <View style={themeStyle(styles.spacingDivider)} />

                <Text style={themeStyle(styles.spacingSettingLabel)}>
                  Letter spacing
                </Text>
                <Text style={themeStyle(styles.spacingSettingHint)}>
                  Controls the horizontal distance between characters.
                </Text>
                <View style={themeStyle(styles.spacingControlRow)}>
                  <Pressable
                    style={themeStyle(styles.spacingStepButton)}
                    onPress={() =>
                      setLetterSpacing((value) =>
                        Math.max(-1, Math.round((value - 0.25) * 100) / 100),
                      )
                    }
                    accessibilityLabel="Decrease letter spacing"
                  >
                    <Ionicons name="remove" size={20} color={appTheme.text} />
                  </Pressable>
                  <Text style={themeStyle(styles.spacingValue)}>
                    {letterSpacing.toFixed(2)} px
                  </Text>
                  <Pressable
                    style={themeStyle(styles.spacingStepButton)}
                    onPress={() =>
                      setLetterSpacing((value) =>
                        Math.min(3, Math.round((value + 0.25) * 100) / 100),
                      )
                    }
                    accessibilityLabel="Increase letter spacing"
                  >
                    <Ionicons name="add" size={20} color={appTheme.text} />
                  </Pressable>
                </View>

                <View style={themeStyle(styles.spacingActionRow)}>
                  <Pressable
                    style={themeStyle(styles.spacingResetButton)}
                    onPress={() => {
                      setLineSpacing(24);
                      setLetterSpacing(0);
                    }}
                  >
                    <Text style={themeStyle(styles.spacingResetText)}>
                      Reset
                    </Text>
                  </Pressable>
                  <Pressable
                    style={themeStyle(styles.spacingDoneButton)}
                    onPress={() => setSpacingModalVisible(false)}
                  >
                    <Text style={themeStyle(styles.spacingDoneText)}>Done</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>

          <Modal
            visible={drawingModalVisible}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={() => setDrawingModalVisible(false)}
          >
            <SafeAreaView
              style={[themeStyle(styles.drawingScreen), { flex: 1 }]}
            >
              {/* Header */}
              <View style={themeStyle(styles.drawingHeader)}>
                <Pressable
                  style={themeStyle(styles.drawingHeaderButton)}
                  onPress={() => setDrawingModalVisible(false)}
                  accessibilityLabel="Close drawing"
                >
                  <Ionicons name="close" size={24} color={appTheme.text} />
                </Pressable>

                <View
                  style={[themeStyle(styles.drawingHeaderText), { flex: 1 }]}
                >
                  <Text style={themeStyle(styles.drawingTitle)}>
                    Handwriting & Drawing
                  </Text>
                  <Text style={themeStyle(styles.drawingSubtitle)}>
                    Draw, write, and convert handwriting to text
                  </Text>
                </View>

                <Pressable
                  style={themeStyle(styles.drawingSaveButton)}
                  onPress={() => void saveDrawing()}
                  accessibilityLabel="Save drawing"
                >
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  <Text style={themeStyle(styles.drawingSaveButtonText)}>
                    Save
                  </Text>
                </Pressable>
              </View>

              {/* Drawing toolbar */}
              <View style={themeStyle(styles.drawingToolbar)}>
                <Pressable
                  style={themeStyle(styles.drawingToolButton)}
                  onPress={undoDrawing}
                  accessibilityLabel="Undo"
                >
                  <Ionicons
                    name="arrow-undo-outline"
                    size={20}
                    color={appTheme.text}
                  />
                </Pressable>

                <Pressable
                  style={themeStyle(styles.drawingToolButton)}
                  onPress={redoDrawing}
                  accessibilityLabel="Redo"
                >
                  <Ionicons
                    name="arrow-redo-outline"
                    size={20}
                    color={appTheme.text}
                  />
                </Pressable>

                <Pressable
                  style={[
                    themeStyle(styles.drawingToolButton),
                    drawingTool === "pen" &&
                      !drawingEraser &&
                      themeStyle(styles.drawingToolButtonActive),
                  ]}
                  onPress={() => {
                    setDrawingTool("pen");
                    setDrawingEraser(false);
                  }}
                  accessibilityLabel="Pen tool"
                >
                  <Ionicons
                    name="create-outline"
                    size={20}
                    color={appTheme.text}
                  />
                </Pressable>

                <Pressable
                  style={[
                    themeStyle(styles.drawingToolButton),
                    drawingTool === "pencil" &&
                      !drawingEraser &&
                      themeStyle(styles.drawingToolButtonActive),
                  ]}
                  onPress={() => {
                    setDrawingTool("pencil");
                    setDrawingEraser(false);
                  }}
                  accessibilityLabel="Pencil tool"
                >
                  <Ionicons
                    name="pencil-outline"
                    size={20}
                    color={appTheme.text}
                  />
                </Pressable>

                <Pressable
                  style={[
                    themeStyle(styles.drawingToolButton),
                    drawingEraser && themeStyle(styles.drawingToolButtonActive),
                  ]}
                  onPress={() => setDrawingEraser((value) => !value)}
                  accessibilityLabel="Eraser"
                >
                  <Ionicons
                    name="backspace-outline"
                    size={20}
                    color={appTheme.text}
                  />
                </Pressable>

                <Pressable
                  style={themeStyle(styles.drawingToolButton)}
                  onPress={clearDrawingCanvas}
                  accessibilityLabel="Clear canvas"
                >
                  <Ionicons name="trash-outline" size={20} color="#DC2626" />
                </Pressable>
              </View>

              {/* Brush sizes */}
              <View style={themeStyle(styles.drawingBrushControl)}>
                <Text style={themeStyle(styles.drawingBrushLabel)}>
                  Brush size
                </Text>

                {[2, 4, 7, 11].map((size) => (
                  <Pressable
                    key={size}
                    style={[
                      themeStyle(styles.brushSizeOption),
                      drawingBrushSize === size &&
                        themeStyle(styles.brushSizeOptionActive),
                    ]}
                    onPress={() => {
                      setDrawingBrushSize(size);
                      setDrawingEraser(false);
                    }}
                    accessibilityLabel={`Brush size ${size}`}
                  >
                    <View
                      style={[
                        themeStyle(styles.brushDot),
                        { width: size + 3, height: size + 3 },
                      ]}
                    />
                  </Pressable>
                ))}
              </View>

              {/* Drawing colors */}
              <View style={themeStyle(styles.drawingColorRow)}>
                {[
                  "#172F2B",
                  "#DC2626",
                  "#239B83",
                  "#16A34A",
                  "#9333EA",
                  "#EA580C",
                  "#DB2777",
                  "#0891B2",
                  "#FFFFFF",
                ].map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => {
                      setDrawingColor(color);
                      setDrawingEraser(false);
                    }}
                    style={[
                      themeStyle(styles.drawingColorSwatch),
                      { backgroundColor: color },
                      drawingColor === color &&
                        !drawingEraser &&
                        themeStyle(styles.drawingColorSwatchSelected),
                    ]}
                    accessibilityLabel={`Select color ${color}`}
                  >
                    {drawingColor === color && !drawingEraser && (
                      <Ionicons
                        name="checkmark"
                        size={15}
                        color={color === "#FFFFFF" ? appTheme.text : "#FFFFFF"}
                      />
                    )}
                  </Pressable>
                ))}
              </View>

              {/* Convert handwriting to text */}
              <View style={themeStyle(styles.handwritingRecognitionBar)}>
                <Pressable
                  style={[
                    themeStyle(styles.handwritingConvertButton),
                    {
                      opacity:
                        drawingRecognitionBusy ||
                        (drawingStrokes.length === 0 && !currentDrawingStroke)
                          ? 0.55
                          : 1,
                    },
                  ]}
                  disabled={
                    drawingRecognitionBusy ||
                    (drawingStrokes.length === 0 && !currentDrawingStroke)
                  }
                  onPress={() => {
                    void recognizeHandwriting(undefined, "en-US", false);
                  }}
                >
                  {drawingRecognitionBusy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="text-outline" size={16} color="#FFFFFF" />
                  )}

                  <Text style={themeStyle(styles.handwritingConvertButtonText)}>
                    {drawingRecognitionBusy
                      ? "Converting..."
                      : "Convert to text"}
                  </Text>
                </Pressable>
              </View>

              {!!drawingRecognitionStatus && (
                <Text style={themeStyle(styles.handwritingRecognitionStatus)}>
                  {drawingRecognitionStatus}
                </Text>
              )}

              {/* Editable recognized text */}
              <TextInput
                value={drawingText}
                onChangeText={setDrawingText}
                placeholder="Write or correct your recognized text..."
                placeholderTextColor="#8792A7"
                multiline
                textAlignVertical="top"
                style={themeStyle(styles.handwritingTextInput)}
              />

              {/* Drawing canvas */}
              <View
                style={[
                  themeStyle(styles.drawingCanvasOuter),
                  { flex: 1, minHeight: 220 },
                ]}
              >
                <View
                  ref={drawingCanvasCaptureRef}
                  collapsable={false}
                  style={[
                    themeStyle(styles.drawingCanvas),
                    { flex: 1, minHeight: 220 },
                  ]}
                  onLayout={(event) => {
                    const { width, height } = event.nativeEvent.layout;

                    setDrawingCanvasSize((previous) =>
                      previous.width === width && previous.height === height
                        ? previous
                        : { width, height },
                    );
                  }}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderTerminationRequest={() => false}
                  onResponderGrant={(event) => {
                    beginDrawingStroke(
                      event.nativeEvent.locationX,
                      event.nativeEvent.locationY,
                    );
                  }}
                  onResponderMove={(event) => {
                    moveDrawingStroke(
                      event.nativeEvent.locationX,
                      event.nativeEvent.locationY,
                    );
                  }}
                  onResponderRelease={finishDrawingStroke}
                  onResponderTerminate={finishDrawingStroke}
                >
                  <Svg
                    pointerEvents="none"
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${Math.max(drawingCanvasSize.width, 1)} ${Math.max(
                      drawingCanvasSize.height,
                      1,
                    )}`}
                  >
                    {[
                      ...drawingStrokes,
                      ...(currentDrawingStroke ? [currentDrawingStroke] : []),
                    ].map((stroke, index) => (
                      <Path
                        key={`stroke-${index}`}
                        d={drawingPath(stroke)}
                        stroke={stroke.color}
                        strokeWidth={stroke.width}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    ))}
                  </Svg>
                </View>
              </View>
            </SafeAreaView>
          </Modal>

          <Modal
            visible={linkModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setLinkModalVisible(false)}
          >
            <Pressable
              style={themeStyle(styles.fontModalOverlay)}
              onPress={() => setLinkModalVisible(false)}
            >
              <Pressable
                style={themeStyle(styles.fontModalCard)}
                onPress={(e) => e.stopPropagation()}
              >
                <Text style={themeStyle(styles.fontModalTitle)}>
                  Insert hyperlink
                </Text>

                <TextInput
                  value={linkUrl}
                  onChangeText={setLinkUrl}
                  placeholder="https://example.com"
                  placeholderTextColor={appTheme.secondaryText}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={themeStyle(styles.hyperlinkInput)}
                />

                <View style={themeStyle(styles.fontModalActions)}>
                  <Pressable
                    style={themeStyle(styles.toolButton)}
                    onPress={() => setLinkModalVisible(false)}
                  >
                    <Text style={themeStyle(styles.toolText)}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    style={themeStyle(styles.toolButton)}
                    onPress={handleInsertLink}
                  >
                    <Text style={themeStyle(styles.toolText)}>Insert link</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>

          <Modal
            visible={noteThemePickerVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setNoteThemePickerVisible(false)}
          >
            <View style={themeStyle(uiStyles.themeModalOverlay)}>
              <View style={themeStyle(uiStyles.themeModalCard)}>
                <View style={themeStyle(uiStyles.themeModalHeader)}>
                  <View>
                    <Text style={themeStyle(uiStyles.themeModalTitle)}>
                      Note themes
                    </Text>
                    <Text style={themeStyle(uiStyles.themeModalSubtitle)}>
                      Choose your favorite paper style
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => setNoteThemePickerVisible(false)}
                    style={themeStyle(uiStyles.themeCloseButton)}
                  >
                    <Ionicons name="close" size={23} color="#334155" />
                  </Pressable>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={themeStyle(uiStyles.themeGrid)}
                >
                  {noteThemes.map((theme) => {
                    const selected =
                      quickNoteColor === theme.color &&
                      notePattern === theme.pattern;

                    return (
                      <Pressable
                        key={theme.label}
                        style={[
                          themeStyle(uiStyles.themeCard),
                          selected && themeStyle(uiStyles.themeCardSelected),
                        ]}
                        onPress={() => {
                          setQuickNoteColor(theme.color);
                          setNoteBackgroundImageUri(null);
                          setNotePattern(theme.pattern);
                          setNoteThemePickerVisible(false);
                        }}
                      >
                        <View
                          style={[
                            themeStyle(uiStyles.themePreview),
                            { backgroundColor: theme.color },
                          ]}
                        >
                          {theme.pattern === "lined" && (
                            <View style={themeStyle(uiStyles.themeLines)}>
                              {[1, 2, 3, 4].map((line) => (
                                <View
                                  key={line}
                                  style={themeStyle(uiStyles.themeLine)}
                                />
                              ))}
                            </View>
                          )}

                          {theme.pattern === "grid" && (
                            <View style={themeStyle(uiStyles.themeGridPattern)}>
                              {[1, 2, 3, 4, 5, 6].map((line) => (
                                <View
                                  key={line}
                                  style={themeStyle(uiStyles.themeGridLine)}
                                />
                              ))}
                            </View>
                          )}

                          {theme.pattern === "dotted" && (
                            <View style={themeStyle(uiStyles.themeDots)}>
                              {Array.from({ length: 20 }, (_, index) => (
                                <View
                                  key={index}
                                  style={themeStyle(uiStyles.themeDot)}
                                />
                              ))}
                            </View>
                          )}

                          {selected && (
                            <View
                              style={themeStyle(uiStyles.themeSelectedBadge)}
                            >
                              <Ionicons
                                name="checkmark"
                                size={16}
                                color="#FFFFFF"
                              />
                            </View>
                          )}
                        </View>

                        <Text style={themeStyle(uiStyles.themeCardName)}>
                          {theme.emoji} {theme.label}
                        </Text>

                        <Text style={themeStyle(uiStyles.themeCardPattern)}>
                          {theme.pattern.charAt(0).toUpperCase() +
                            theme.pattern.slice(1)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FormatTool({
  label,
  icon,
  active = false,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={uiStyles.formatTool}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[uiStyles.formatIcon, active && uiStyles.formatIconActive]}>
        <Ionicons
          name={icon}
          size={23}
          color={active ? "#FFFFFF" : "#4A596D"}
        />
      </View>
      <Text style={uiStyles.formatLabel}>{label}</Text>
    </Pressable>
  );
}

function AttachmentTile({
  label,
  icon,
  tint,
  bg,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  tint: string;
  bg: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        uiStyles.attachmentTile,
        { borderColor: `${tint}28`, backgroundColor: pressed ? bg : "#FFFFFF" },
        pressed && uiStyles.attachmentTilePressed,
      ]}
    >
      <View
        style={[
          uiStyles.attachmentIconWrap,
          { backgroundColor: bg, borderColor: `${tint}20` },
        ]}
      >
        <Ionicons name={icon} size={24} color={tint} />
      </View>
      <Text numberOfLines={2} style={uiStyles.attachmentTileLabel}>
        {label}
      </Text>
      <View style={uiStyles.attachmentTileHint}>
        <Text style={[uiStyles.attachmentTileHintText, { color: tint }]}>
          Add
        </Text>
        <Ionicons name="arrow-forward" size={12} color={tint} />
      </View>
    </Pressable>
  );
}

function SettingTile({
  icon,
  title,
  subtitle,
  tint,
  bg,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  tint: string;
  bg: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [
        uiStyles.settingTile,
        {
          backgroundColor: "#FFFFFF",
          borderColor: pressed ? `${tint}70` : "#E5EEEC",
        },
        pressed && uiStyles.settingTilePressed,
      ]}
    >
      <View style={uiStyles.settingTileTop}>
        <View style={[uiStyles.settingIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={22} color={tint} />
        </View>
        <View style={[uiStyles.settingArrow, { backgroundColor: `${tint}12` }]}>
          <Ionicons name="chevron-forward" size={15} color={tint} />
        </View>
      </View>
      <View style={uiStyles.settingTextBlock}>
        <Text numberOfLines={1} style={uiStyles.settingTitle}>
          {title}
        </Text>
        <Text numberOfLines={2} style={uiStyles.settingSubtitle}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const uiStyles = StyleSheet.create({
  recurringCard: {
    width: "100%",
    marginTop: 2,
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    gap: 13,
  },
  recurringHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  recurringIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  recurringTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  recurringSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  recurringOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recurringOption: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: 1,
    minWidth: "22%",
    alignItems: "center",
  },
  recurringOptionText: {
    fontSize: 12,
  },
  recurringWarning: {
    color: "#C2410C",
    fontSize: 12,
  },

  // Settings grid
  settingsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    width: "100%",
    alignItems: "stretch",
  },

  // SettingTile card styles
  settingTile: {
    width: "48%",
    minHeight: 118,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E9EEF4",
    justifyContent: "space-between",
    shadowColor: "#172B4D",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  settingIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  settingTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#243247",
    letterSpacing: 0.1,
  },

  settingSubtitle: {
    fontSize: 12,
    color: "#8491A3",
    marginTop: 5,
    lineHeight: 17,
  },

  settingTileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  themeModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },

  themeModalCard: {
    height: "78%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 22,
    paddingHorizontal: 18,
    paddingBottom: 20,
  },

  themeModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  themeModalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#182230",
  },

  themeModalSubtitle: {
    fontSize: 13,
    color: "#7B8794",
    marginTop: 5,
  },

  themeCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingBottom: 24,
  },

  themeCard: {
    width: "48%",
    marginBottom: 16,
    padding: 7,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: "#E8EDF3",
    backgroundColor: "#FFFFFF",
  },

  themeCardSelected: {
    borderColor: "#1686E8",
    backgroundColor: "#F0F8FF",
  },

  themePreview: {
    height: 100,
    borderRadius: 11,
    overflow: "hidden",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  themeCardName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#243247",
    marginTop: 10,
  },

  themeCardPattern: {
    fontSize: 11,
    color: "#8491A3",
    marginTop: 3,
    marginBottom: 3,
  },

  themeSelectedBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#1686E8",
    alignItems: "center",
    justifyContent: "center",
  },

  themeLines: {
    gap: 17,
  },

  themeLine: {
    height: 1,
    backgroundColor: "rgba(90, 110, 130, 0.25)",
  },

  themeGridPattern: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 15,
  },

  themeGridLine: {
    width: 22,
    height: 22,
    borderWidth: 0.7,
    borderColor: "rgba(90, 110, 130, 0.2)",
  },

  themeDots: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 5,
  },

  themeDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(90, 110, 130, 0.35)",
  },
  // Note color selector card
  noteColorTile: {
    width: "100%",
    minHeight: 94,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 15,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E9EEF4",
    shadowColor: "#172B4D",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  noteColorIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#E8F4FF",
    alignItems: "center",
    justifyContent: "center",
  },

  colorDots: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 10,
  },

  colorDot: {
    width: 25,
    height: 25,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "rgba(30, 41, 59, 0.08)",
  },

  selectedColorDot: {
    borderColor: "#1686E8",
    borderWidth: 3,
    transform: [{ scale: 1.12 }],
  },

  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: "#F2FAF9" },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 36,
    flexGrow: 1,
    gap: 16,
    alignItems: "stretch",
  },
  featureSection: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5EFEC",
    backgroundColor: "#FBFEFD",
    padding: 13,
    gap: 12,
  },
  featureHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  featureTitle: { color: "#173B38", fontSize: 16, fontWeight: "800" },
  featureSubtitle: {
    color: "#647873",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },

  templateSection: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E7F0EE",
    gap: 18,
    shadowColor: "#183F39",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.055,
    shadowRadius: 12,
    elevation: 3,
  },

  templateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  templateHeaderIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: "#E5F6F1",
    alignItems: "center",
    justifyContent: "center",
  },

  templateHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },

  templateHeading: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: "800",
    color: "#173C38",
    letterSpacing: -0.45,
  },

  templateSubheading: {
    fontSize: 15,
    lineHeight: 21,
    color: "#758783",
    marginTop: 4,
  },

  templateCount: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    paddingHorizontal: 8,
    backgroundColor: "#EFF8F5",
    alignItems: "center",
    justifyContent: "center",
  },

  templateCountText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#138A78",
  },

  templateRow: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    paddingRight: 16,
    gap: 12,
  },

  templateCard: {
    width: 176,
    minHeight: 154,
    borderRadius: 23,
    padding: 16,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(32, 83, 72, 0.09)",
    shadowColor: "#244B45",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },

  templateCardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.97 }],
  },

  templateCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  templateIconContainer: {
    width: 49,
    height: 49,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.78)",
    alignItems: "center",
    justifyContent: "center",
  },

  templateArrow: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },

  templateCardBottom: {
    marginTop: 20,
    gap: 10,
  },

  templateTitle: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "800",
    color: "#203F3A",
    letterSpacing: -0.3,
  },

  templateUseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(32, 83, 72, 0.12)",
  },

  templateHint: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    color: "#426E65",
  },

  templateFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
  },

  templateFooterText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#82918F",
  },

  cardPressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  patternRow: { flexDirection: "row", gap: 7, width: "100%" },
  patternOption: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 5,
    padding: 5,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "transparent",
  },
  patternOptionActive: { borderColor: "#159F89", backgroundColor: "#EAF8F3" },
  patternPreview: {
    width: "100%",
    height: 62,
    borderRadius: 9,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D9E5E1",
    padding: 3,
  },
  patternPreviewActive: { borderColor: "#159F89" },
  previewLine: {
    height: 1,
    width: "100%",
    backgroundColor: "#9CBDB5",
    marginVertical: 4,
  },
  previewGridVertical: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#A9C8C0",
  },
  previewGridHorizontal: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#A9C8C0",
  },
  previewDots: {
    color: "#7C9C93",
    fontSize: 12,
    lineHeight: 14,
    textAlign: "center",
  },
  patternLabel: { color: "#697D77", fontSize: 12, fontWeight: "600" },
  patternLabelActive: { color: "#118A75", fontWeight: "800" },
  editorPatternOverlay: {
    position: "absolute",
    top: 40,
    left: 14,
    right: 14,
    bottom: 28,
    justifyContent: "space-between",
  },
  editorLine: { height: 1, backgroundColor: "#7BA79A35" },
  editorGridOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  editorGridLine: { position: "absolute", backgroundColor: "#7BA79A30" },
  dotRow: { height: 20, justifyContent: "center" },
  dotRowText: { color: "#7BA79A55", fontSize: 20, lineHeight: 20 },
  header: {
    minHeight: 176,
    paddingTop: Platform.OS === "ios" ? 16 : 12,
    paddingHorizontal: 14,
    paddingBottom: 56,
    borderRadius: 26,
    overflow: "hidden",
    width: "100%",
    alignSelf: "stretch",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
    minWidth: 0,
  },
  backButton: {
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, minWidth: 0, marginLeft: 1 },
  headerTitle: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "800",
    color: "#103333",
    flexShrink: 1,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: "#42666A",
    flexShrink: 1,
  },
  quickSave: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#149F8A",
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 11,
    flexShrink: 0,
  },
  quickSaveText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    flexShrink: 1,
  },
  moreButton: {
    width: 35,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerArt: {
    position: "absolute",
    right: 18,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    opacity: 0.55,
  },
  editorPanel: {
    width: "100%",
    alignSelf: "stretch",
    padding: 13,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    gap: 14,
    shadowColor: "#8CA7A8",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  titleField: {
    minHeight: 64,
    borderRadius: 18,
    backgroundColor: "#F3F6F8",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 9,
    width: "100%",
    alignSelf: "stretch",
  },
  titleIcon: {
    width: 43,
    height: 43,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  titleInput: {
    flex: 1,
    minWidth: 0,
    color: "#193640",
    fontSize: 20,
    paddingVertical: 8,
  },
  counter: { color: "#6D7A8B", fontSize: 13 },
  contentField: {
    minHeight: 230,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#ECF1F4",
    padding: 14,
    paddingBottom: 38,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    width: "100%",
    alignSelf: "stretch",
    position: "relative",
    overflow: "hidden",
  },
  contentInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 190,
    padding: 0,
    fontSize: 18,
    lineHeight: 28,
    textAlignVertical: "top",
  },
  contentCounter: {
    position: "absolute",
    bottom: 10,
    right: 14,
    fontSize: 11,
    lineHeight: 15,
    color: "#6D7A8B",
    backgroundColor: "#FFFFFF",
    paddingLeft: 4,
  },
  fontSizePanel: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5EFEC",
    gap: 18,
    shadowColor: "#173F38",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  fontSizeHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  fontSizeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#E7F7F2",
    alignItems: "center",
    justifyContent: "center",
  },
  fontSizeCopy: { flex: 1, minWidth: 0, gap: 4 },
  fontSizeTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    color: "#193D37",
    letterSpacing: -0.3,
  },
  fontSizeSubtitle: { fontSize: 13, lineHeight: 18, color: "#7A8C87" },
  fontSizeBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#F0F8F5",
    alignItems: "center",
    justifyContent: "center",
  },
  fontSizePreview: {
    backgroundColor: "#F5FAF8",
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: "#E7F0EC",
    gap: 12,
  },
  fontSizePreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  fontSizePreviewLabel: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#83958F",
  },
  fontSizePreviewText: { color: "#254740", lineHeight: 27, fontWeight: "500" },
  fontSizeValue: {
    minWidth: 32,
    textAlign: "center",
    color: "#138A78",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
  },
  fontSizeControlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  fontSizeControlCopy: { flex: 1, minWidth: 0, gap: 4 },
  fontSizeControlTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
    color: "#24443E",
  },
  fontSizeControlSubtitle: { fontSize: 12, lineHeight: 17, color: "#87958F" },
  fontSizeControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  fontSizeButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#EAF7F2",
    borderWidth: 1,
    borderColor: "#D7EEE6",
    alignItems: "center",
    justifyContent: "center",
  },
  fontSizeButtonPressed: {
    backgroundColor: "#D7F0E7",
    transform: [{ scale: 0.96 }],
  },
  disabledControl: {
    backgroundColor: "#F1F4F3",
    borderColor: "#E8EEEC",
    opacity: 0.65,
  },
  fontSizeControlValue: {
    minWidth: 30,
    textAlign: "center",
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "800",
    color: "#193D37",
    fontVariant: ["tabular-nums"],
  },
  fontSizeRangeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  fontSizeRangeLabel: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    color: "#91A09B",
  },
  fontSizeRangeTrack: {
    flex: 1,
    height: 6,
    borderRadius: 99,
    backgroundColor: "#E8F0ED",
    overflow: "hidden",
  },
  fontSizeRangeFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#20A58B",
  },
  contentMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
    marginTop: -4,
  },
  metricPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: "#F0F8F4",
    borderWidth: 1,
    borderColor: "#E0EEE7",
  },
  metricText: { color: "#526B63", fontSize: 12, fontWeight: "600" },
  formatToolbar: {
    minHeight: 79,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#EAF0F3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 3,
    paddingVertical: 7,
  },
  formatTool: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  formatIcon: {
    width: 35,
    height: 40,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  formatIconActive: { backgroundColor: "#159F89" },
  formatLabel: { color: "#697787", fontSize: 11, marginTop: 3 },
  attachmentActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    width: "100%",
    alignItems: "stretch",
  },
  attachmentLauncher: {
    width: "100%",
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#DCEDE7",
    backgroundColor: "#FFFFFF",
    shadowColor: "#174C40",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.055,
    shadowRadius: 12,
    elevation: 2,
  },
  attachmentLauncherPressed: {
    backgroundColor: "#F5FBF8",
    transform: [{ scale: 0.99 }],
  },
  attachmentLauncherIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5F8F2",
    borderWidth: 1,
    borderColor: "#D1F0E4",
  },
  attachmentLauncherCopy: { flex: 1, minWidth: 0, gap: 4 },
  attachmentLauncherTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: "#193D37",
  },
  attachmentLauncherSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: "#7A8B85",
  },
  attachmentLauncherAction: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#07876E",
  },
  attachmentModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(14, 35, 31, 0.38)",
  },
  attachmentModalBackdrop: { ...StyleSheet.absoluteFill },
  attachmentModalSheet: {
    width: "100%",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 30 : 22,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: "#F8FBFA",
    borderWidth: 1,
    borderColor: "#E4EEEA",
  },
  attachmentModalHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 99,
    backgroundColor: "#CFDCD6",
    marginBottom: 18,
  },
  attachmentModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  attachmentModalTitle: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
    color: "#173D35",
    letterSpacing: -0.4,
  },
  attachmentModalSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: "#71827C",
    marginTop: 3,
  },
  attachmentModalClose: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EDF3F0",
    borderWidth: 1,
    borderColor: "#E1EAE5",
  },
  attachmentModalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    width: "100%",
    alignItems: "stretch",
  },
  attachmentTile: {
    flexGrow: 1,
    flexBasis: "29%",
    minWidth: 88,
    minHeight: 124,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
    shadowColor: "#183B34",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.045,
    shadowRadius: 7,
    elevation: 1,
  },
  attachmentTilePressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
    shadowOpacity: 0.015,
    elevation: 0,
  },
  attachmentIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentTileLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    textAlign: "center",
    color: "#203D38",
    minHeight: 30,
  },
  attachmentTileHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: "auto",
  },
  attachmentTileHintText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.25,
  },
  attachmentTray: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#EAF0F3",
    padding: 8,
  },
  attachmentPreview: {
    width: 76,
    height: 82,
    borderRadius: 13,
    overflow: "hidden",
    backgroundColor: "#F3F6F8",
  },
  previewImage: { width: "100%", height: "100%" },
  filePreview: { alignItems: "center", justifyContent: "center", padding: 4 },
  previewLabel: {
    fontSize: 11,
    color: "#526171",
    textAlign: "center",
    marginTop: 3,
  },
  removeAttachment: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 21,
    height: 21,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  addMore: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F3F5",
  },

  settingTilePressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  settingTileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingIcon: {
    width: 45,
    height: 45,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  settingArrow: {
    width: 27,
    height: 27,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  settingTextBlock: { gap: 4, minWidth: 0 },

  saveButton: {
    borderRadius: 25,
    overflow: "hidden",
    marginTop: 1,
    shadowColor: "#11B79B",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  saveGradient: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 13,
  },
  saveText: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  draftStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  draftStatusText: { color: "#71827D", fontSize: 12 },
});

const styles = StyleSheet.create({
  videoPreviewCard: {
    width: 220,
    marginTop: 12,
    padding: 8,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCEAE5",
    overflow: "hidden",
  },
  videoPreview: {
    width: "100%",
    height: 150,
    borderRadius: 10,
    backgroundColor: "#111827",
  },
  videoPreviewCaption: {
    marginTop: 7,
    color: "#727C96",
    fontSize: 12,
    fontWeight: "600",
  },
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: COLORS.secondaryText,
    fontSize: 14,
    fontWeight: "500",
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 42,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 9,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCEAE5",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  headerSubtitle: {
    marginTop: 3,
    color: COLORS.secondaryText,
    fontSize: 12,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    minHeight: 158,
    borderRadius: 28,
    padding: 23,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 26,
    overflow: "hidden",
    elevation: 5,
    shadowColor: "#176B5D",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  heroCopy: {
    flex: 1,
    paddingRight: 10,
  },
  heroEyebrow: {
    color: "#DDF8EF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.7,
  },
  heroTitle: {
    marginTop: 8,
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  heroSubtitle: {
    marginTop: 7,
    color: "#E7FBF3",
    fontSize: 12,
    lineHeight: 19,
    maxWidth: 235,
  },
  heroIllustration: {
    width: 68,
    height: 68,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCheck: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  requiredText: {
    color: COLORS.red,
    fontSize: 11,
    fontWeight: "600",
  },
  optionalText: {
    color: COLORS.secondaryText,
    fontSize: 11,
    fontWeight: "500",
  },
  colorModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  colorPaletteCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    elevation: 10,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  spacingButtonLabel: {
    fontSize: 11,
    color: COLORS.secondaryText,
    marginLeft: 4,
  },
  colorPaletteHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },
  colorPaletteTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#172F2B",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 14,
  },
  colorSwatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedColorSwatch: {
    borderColor: "#64748B",
    transform: [{ scale: 1.12 }],
  },
  whiteColorSwatch: {
    borderColor: "#D1D5DB",
  },
  selectedColorLabel: {
    marginTop: 20,
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  editorToolbar: {
    backgroundColor: "#F4F9F6",
    borderWidth: 1,
    borderColor: "#DCEAE5",
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 9,
    marginBottom: 15,
    gap: 5,
    width: "100%",
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 42,
    paddingHorizontal: 2,
  },
  toolbarLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#8AA19A",
    marginRight: 3,
  },
  toolbarSeparator: {
    height: 1,
    backgroundColor: "#E0EBE6",
    marginHorizontal: 2,
  },
  spacingSettingLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#172F2B",
    marginTop: 12,
  },
  spacingSettingHint: {
    fontSize: 12,
    color: "#71827D",
    marginTop: 3,
  },
  spacingControlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    marginTop: 12,
    marginBottom: 8,
  },
  spacingStepButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  spacingValue: {
    minWidth: 76,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: "#172F2B",
    fontVariant: ["tabular-nums"],
  },
  spacingDivider: {
    height: 1,
    backgroundColor: "#E5EAF2",
    marginTop: 12,
  },
  spacingActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20,
  },
  spacingResetButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  spacingResetText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },
  spacingDoneButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#239B83",
  },
  spacingDoneText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  toolButton: {
    height: 36,
    minWidth: 36,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCEAE5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  toolButtonActive: {
    backgroundColor: "#DDF4EB",
    borderColor: "#A8DCCD",
  },
  toolText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#536A63",
  },
  fontSizeControl: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCEAE5",
  },
  fontSizeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#536A63",
  },
  characterCount: {
    fontSize: 11,
    color: "#8AA19A",
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#DCEAE5",
    padding: 20,
    marginBottom: 22,
    shadowColor: "#176B5D",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.055,
    shadowRadius: 14,
    elevation: 2,
  },
  fieldLabel: {
    color: COLORS.secondaryText,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  titleInput: {
    minHeight: 43,
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "600",
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  fieldDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 17,
  },
  formatButton: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.muted,
    flexShrink: 0,
  },
  formatButtonActive: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: "#A8DCCD",
  },
  quickNotePanel: {
    marginBottom: 16,
    padding: 15,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickNoteTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  quickNoteTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
  },
  quickNoteHeading: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  quickNoteCaption: {
    color: COLORS.secondaryText,
    fontSize: 11,
    marginTop: 2,
  },
  quickModeButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  quickModeButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  quickModeButtonText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "700",
  },
  quickModeButtonTextActive: {
    color: "#FFFFFF",
  },
  quickNoteOptionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 15,
  },
  quickNoteOptionLabel: {
    color: COLORS.secondaryText,
    fontSize: 12,
    fontWeight: "600",
  },
  quickNoteColors: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quickNoteColorSwatch: {
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D7DCE6",
  },
  quickNoteColorSwatchSelected: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  pinQuickNoteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 13,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  pinQuickNoteButtonActive: {
    opacity: 1,
  },
  pinQuickNoteText: {
    color: COLORS.secondaryText,
    fontSize: 12,
    fontWeight: "600",
  },
  descriptionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  autoSaveStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  autoSaveStatusText: {
    fontSize: 11,
    color: COLORS.secondaryText,
  },
  autoSaveStatusSaved: {
    color: COLORS.green,
  },
  autoSaveStatusError: {
    color: COLORS.red,
  },
  descriptionInput: {
    minHeight: 150,
    color: COLORS.text,
    lineHeight: 24,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E4E8F4",
    backgroundColor: "#FCFDFF",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  scheduleLabelWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fieldIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  reminderIconBackground: {
    backgroundColor: COLORS.orangeLight,
  },
  scheduleTextWrap: {
    flex: 1,
  },
  dateValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  reminderValue: {
    color: COLORS.secondaryText,
    fontSize: 12,
    fontWeight: "500",
  },
  smallOutlineButton: {
    minWidth: 69,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#DCDDFE",
    backgroundColor: "#FAFAFF",
  },
  smallOutlineButtonText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  dateInput: {
    color: COLORS.text,
    fontSize: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
    backgroundColor: "#FBFCFF",
  },
  quickDateRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  quickDateButton: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.muted,
  },
  quickDateButtonActive: {
    backgroundColor: COLORS.primaryLight,
  },
  quickDateText: {
    color: COLORS.secondaryText,
    fontSize: 11,
    fontWeight: "700",
  },
  characterCountEmpty: {
    color: "#64748B",
  },
  characterCountWarning: {
    color: "#D97706",
    backgroundColor: "#FEF3C7",
  },
  characterCountLimit: {
    color: "#DC2626",
    backgroundColor: "#FEE2E2",
  },
  quickDateTextActive: {
    color: COLORS.primary,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },
  pendingPill: {
    backgroundColor: COLORS.greenLight,
  },
  overduePill: {
    backgroundColor: COLORS.redLight,
  },
  pendingDot: {
    backgroundColor: COLORS.green,
  },
  overdueDot: {
    backgroundColor: COLORS.red,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },
  pendingText: {
    color: COLORS.green,
  },
  overdueText: {
    color: COLORS.red,
  },
  removeReminder: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 12,
    paddingVertical: 4,
  },
  removeReminderText: {
    color: COLORS.red,
    fontSize: 12,
    fontWeight: "600",
  },
  attachmentGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  attachmentAction: {
    flex: 1,
    minHeight: 130,
    paddingHorizontal: 7,
    paddingVertical: 15,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingAction: {
    borderColor: "#FFCACA",
    backgroundColor: "#FFF9F9",
  },
  attachmentIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  imageIconBackground: {
    backgroundColor: "#EAF1FF",
  },
  voiceIconBackground: {
    backgroundColor: "#F3E9FF",
  },
  recordingIconBackground: {
    backgroundColor: "#FFE6E6",
  },
  reminderAttachmentBackground: {
    backgroundColor: COLORS.orangeLight,
  },
  attachmentTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  attachmentSubtitle: {
    color: COLORS.secondaryText,
    fontSize: 10,
    marginTop: 5,
    textAlign: "center",
  },
  previewCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 13,
    marginBottom: 14,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  previewTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previewTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: COLORS.redLight,
    alignItems: "center",
    justifyContent: "center",
  },
  voicePreviewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.surface,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 13,
    marginBottom: 14,
  },
  voicePreviewIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  hyperlinkInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 15,
    marginTop: 16,
    marginBottom: 16,
  },
  fontModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text,
  },
  fontModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
  },
  voicePreviewInfo: {
    flex: 1,
  },
  voicePreviewTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  voicePreviewSubtitle: {
    color: COLORS.secondaryText,
    fontSize: 10,
    marginTop: 4,
  },
  errorHint: {
    color: COLORS.red,
    fontSize: 10,
    marginTop: 4,
  },
  playButton: {
    width: 39,
    height: 39,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#DDF4EB",
    borderRadius: 17,
    padding: 15,
    marginTop: 5,
    marginBottom: 24,
  },
  tipIcon: {
    width: 35,
    height: 35,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  tipTextWrap: {
    flex: 1,
  },
  tipTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
  },
  tipText: {
    color: COLORS.secondaryText,
    fontSize: 11,
    lineHeight: 17,
  },
  footer: {
    flexDirection: "row",
    gap: 11,
    marginBottom: 15,
  },
  cancelButton: {
    minHeight: 53,
    minWidth: 105,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    color: COLORS.secondaryText,
    fontSize: 14,
    fontWeight: "700",
  },
  saveButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 15,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.55,
  },
  footerNote: {
    color: "#9AA2B5",
    textAlign: "center",
    fontSize: 11,
    marginBottom: 5,
  },
  formatButtonText: {
    color: COLORS.secondaryText,
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 0,
  },
  boldText: {
    fontWeight: "900",
  },
  italicText: {
    fontStyle: "italic",
  },
  underlineText: {
    textDecorationLine: "underline",
  },
  formatButtonTextActive: {
    color: COLORS.primary,
  },
  noteMetaCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCEAE5",
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginTop: 16,
    marginBottom: 16,
    gap: 2,
    shadowColor: "#172F2B",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.035,
    shadowRadius: 8,
    elevation: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  metaIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#E0F4EE",
    alignItems: "center",
    justifyContent: "center",
  },
  metaTextWrap: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8992A8",
    marginBottom: 3,
  },
  noteMetaText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#27314D",
    fontWeight: "500",
  },
  autoSaveText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#15966A",
    fontWeight: "600",
  },
  metaDivider: {
    height: 1,
    backgroundColor: "#EDF4F1",
    marginLeft: 50,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#15966A",
    marginRight: 3,
  },
  fontModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 22,
  },
  fontModalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    elevation: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  fontModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  fontOption: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  fontOptionActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
  },
  fontOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#475569",
    marginRight: 12,
  },
  fontOptionTextActive: {
    color: "#176B5D",
    fontWeight: "700",
  },
  drawingIconBackground: {
    backgroundColor: "#E5F8EF",
  },
  drawingPreview: {
    width: "100%",
    height: 220,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editDrawingButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
  },
  editDrawingButtonText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  drawingScreen: {
    flex: 1,
    backgroundColor: "#F3F6FC",
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  drawingScrollView: {
    flex: 1,
    width: "100%",
  },
  drawingScrollContent: {
    paddingBottom: 28,
    flexGrow: 1,
  },
  drawingHeader: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E4EAF4",
    marginBottom: 10,
  },
  drawingHeaderButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F2",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#176B5D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  drawingHeaderText: {
    flex: 1,
    gap: 3,
  },
  drawingTitle: {
    color: "#17233F",
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  drawingSubtitle: {
    color: "#75819A",
    fontSize: 11,
    lineHeight: 15,
  },
  drawingSaveButton: {
    minHeight: 42,
    paddingHorizontal: 15,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 7,
    elevation: 3,
  },
  drawingSaveButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  drawingToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 9,
    flexWrap: "wrap",
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E4EAF4",
    marginBottom: 8,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
    elevation: 1,
  },
  drawingToolButton: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: "#F7F9FD",
    borderWidth: 1,
    borderColor: "#E7ECF5",
    alignItems: "center",
    justifyContent: "center",
  },
  drawingToolButtonActive: {
    backgroundColor: "#E0F4EE",
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  drawingBrushControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: "auto",
    paddingLeft: 5,
  },
  drawingBrushLabel: {
    color: "#7A859B",
    fontSize: 10,
    fontWeight: "800",
    marginRight: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  brushSizeOption: {
    width: 28,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  brushSizeOptionActive: {
    backgroundColor: "#E0F4EE",
    borderColor: COLORS.primary,
  },
  brushDot: {
    borderRadius: 20,
    backgroundColor: "#172F2B",
  },
  drawingColorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexWrap: "wrap",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E4EAF4",
    marginBottom: 9,
  },
  drawingColorSwatch: {
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  drawingColorSwatchSelected: {
    borderColor: COLORS.primary,
    transform: [{ scale: 1.12 }],
  },
  drawingWhiteSwatch: {
    borderColor: "#CBD5E1",
  },
  drawingColorHint: {
    color: "#7A859B",
    fontSize: 10,
    fontWeight: "700",
    marginLeft: "auto",
  },
  handwritingRecognitionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginBottom: 5,
  },
  handwritingLanguageChoices: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  handwritingLanguageButton: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D6DDEB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  handwritingLanguageButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: "#E0F4EE",
  },
  handwritingLanguageText: {
    color: "#71809A",
    fontSize: 12,
    fontWeight: "700",
  },
  handwritingLanguageTextActive: {
    color: COLORS.primary,
  },
  handwritingConvertButton: {
    minHeight: 39,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 15,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 2,
  },
  handwritingConvertButtonDisabled: {
    opacity: 0.6,
  },
  handwritingConvertButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  handwritingRecognitionStatus: {
    color: "#71809A",
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 6,
    paddingHorizontal: 3,
  },
  handwritingTextPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E2E8F2",
    padding: 12,
    marginBottom: 8,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
    elevation: 1,
  },
  handwritingTextLabel: {
    color: "#172F2B",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
  },

  fontSizePanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5EFEC",
    gap: 20,
    shadowColor: "#173F38",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },

  fontSizeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },

  fontSizeIconBox: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: "#E7F7F2",
    alignItems: "center",
    justifyContent: "center",
  },

  fontSizeCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },

  fontSizeTitle: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: "800",
    color: "#193D37",
    letterSpacing: -0.4,
  },

  fontSizeSubtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: "#7A8C87",
  },

  fontSizeBadge: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: "#F0F8F5",
    alignItems: "center",
    justifyContent: "center",
  },

  fontSizePreview: {
    backgroundColor: "#F5FAF8",
    borderRadius: 18,
    paddingVertical: 17,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E7F0EC",
    gap: 13,
  },

  fontSizePreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  fontSizePreviewLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: "#83958F",
  },

  fontSizeValue: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
    color: "#138A78",
  },

  fontSizePreviewText: {
    color: "#254740",
    lineHeight: 1.5 * 18,
    fontWeight: "500",
  },

  fontSizeControlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  fontSizeControlCopy: {
    flex: 1,
    gap: 5,
  },

  fontSizeControlTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    color: "#24443E",
  },

  fontSizeControlSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#87958F",
  },

  fontSizeControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  fontSizeButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#EAF7F2",
    borderWidth: 1,
    borderColor: "#D7EEE6",
    alignItems: "center",
    justifyContent: "center",
  },

  fontSizeButtonPressed: {
    backgroundColor: "#D7F0E7",
    transform: [{ scale: 0.94 }],
  },

  disabledControl: {
    backgroundColor: "#F1F4F3",
    borderColor: "#E8EEEC",
    opacity: 0.8,
  },

  fontSizeControlValue: {
    minWidth: 34,
    textAlign: "center",
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "800",
    color: "#193D37",
    fontVariant: ["tabular-nums"],
  },

  fontSizeRangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  fontSizeRangeLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: "#91A09B",
  },

  fontSizeRangeTrack: {
    flex: 1,
    height: 6,
    borderRadius: 99,
    backgroundColor: "#E8F0ED",
    overflow: "hidden",
  },

  fontSizeRangeFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#20A58B",
  },

  handwritingTextInput: {
    minHeight: 56,
    maxHeight: 96,
    color: "#17233F",
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5EAF3",
    backgroundColor: "#FAFBFE",
  },
  handwritingTextHint: {
    color: "#8AA19A",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 7,
  },
  handwritingLivePreview: {
    backgroundColor: "#EEF3FF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCEAE5",
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
    maxHeight: 78,
  },
  handwritingLivePreviewLabel: {
    color: "#71827D",
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  handwritingLivePreviewText: {
    color: "#172F2B",
    fontSize: 14,
    lineHeight: 20,
    minHeight: 20,
  },
  drawingCanvasOuter: {
    flex: 1,
    minHeight: 220,
    paddingBottom: 5,
  },
  drawingCanvas: {
    flex: 1,
    minHeight: 220,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DCEAE5",
    overflow: "hidden",
    shadowColor: "#176B5D",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.055,
    shadowRadius: 8,
    elevation: 2,
  },
  drawingFooterHint: {
    color: "#8AA19A",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
    paddingTop: 7,
    paddingBottom: 10,
  },
});
