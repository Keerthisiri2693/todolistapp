import {
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
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import { NitroDigitalInk } from "@nitro-mlkit/digital-ink";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import Svg, { Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

import * as Clipboard from "expo-clipboard";

import * as ImagePicker from "expo-image-picker";
import { VideoView, useVideoPlayer } from "expo-video";

import * as Notifications from "expo-notifications";

import {
    AudioModule,
    RecordingPresets,
    setAudioModeAsync,
    useAudioPlayer,
    useAudioPlayerStatus,
    useAudioRecorder,
    useAudioRecorderState,
} from "expo-audio";

import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";

import axios from "axios";

import { router, useLocalSearchParams } from "expo-router";

const API_BASE_URL = "http://192.168.1.2:5003";

type TodoStatus = "Pending" | "Completed" | "Overdue";

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

  status?: string;

  type?: string;

  fileIds?: unknown;
  createdAt?: string;
  updatedAt?: string;
};

type ApiResponse = {
  success?: boolean;

  message?: string;

  data?: TodoItem;

  todo?: TodoItem;
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
  serverTodoId?: string;
  isQuickNote: true;
  quickNoteColor: string;
  quickNotePattern?: string;
  templateTitle?: string;
  templateCategory?: string;
  templateEmoji?: string;
  templateAccent?: string;
  quickNotePinned: boolean;
  createdAt: string;
  updatedAt: string;
  localOnly: boolean;
};

const COLORS = {
  background: "#F4F7FC",

  surface: "#FFFFFF",

  primary: "#5B5FEF",

  primaryDark: "#484BD2",

  primaryLight: "#EEEEFF",

  text: "#19213D",

  secondaryText: "#727C96",

  border: "#E7EAF3",

  muted: "#F1F3F9",

  green: "#15966A",

  greenLight: "#E5F8EF",

  orange: "#E58B27",

  orangeLight: "#FFF3E2",

  red: "#DC4C55",

  redLight: "#FFF0F0",
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

const getStatusForDate = (dateText: string): TodoStatus => {
  if (!dateText) return "Pending";

  const due = new Date(`${dateText}T23:59:59`);

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
  const [strikethrough, setStrikethrough] = useState(false);

  const [listNumber, setListNumber] = useState(1);

  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const [colorPaletteVisible, setColorPaletteVisible] = useState(false);

  const [fontPickerVisible, setFontPickerVisible] = useState(false);

  const [videoUri, setVideoUri] = useState<string | null>(null);

  const textColors = [
    "#19213D", // Default
    "#DC2626", // Red
    "#2563EB", // Blue
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
  }>();

  // Support both ID-based editing and the editTodo JSON passed from the list screen.

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
  const contentInputRef = useRef<any>(null);
  const isSimpleQuickNoteScreen = params.quickNote === "true";
  const [isQuickNote, setIsQuickNote] = useState(params.quickNote === "true");
  const [quickNoteColor, setQuickNoteColor] = useState("#FFF4CC");
  const [quickNotePattern, setQuickNotePattern] = useState("none");
  const [quickNoteTemplateTitle, setQuickNoteTemplateTitle] = useState("");
  const [quickNoteTemplateCategory, setQuickNoteTemplateCategory] =
    useState("");
  const [quickNoteTemplateEmoji, setQuickNoteTemplateEmoji] = useState("");
  const [quickNoteTemplateAccent, setQuickNoteTemplateAccent] =
    useState("#5B5FEF");
  const [quickNoteBackgroundCategory, setQuickNoteBackgroundCategory] =
    useState("Hot");
  const [quickNotePinned, setQuickNotePinned] = useState(false);
  const quickNoteColors = [
    "#FFF4CC",
    "#DDF7E8",
    "#DDEBFF",
    "#FCE1EE",
    "#EDE2FF",
    "#FFFFFF",
    "#FFE8CC",
    "#DDF5F4",
  ];
  const quickNotePatterns = [
    { id: "none", label: "None", glyph: "" },
    { id: "dots", label: "Dots", glyph: "·  ·  ·  ·  ·  ·  ·  ·" },
    { id: "lines", label: "Lines", glyph: "━━━━━━━━━━━━━━━━━━" },
    { id: "grid", label: "Grid", glyph: "┼  ┼  ┼  ┼  ┼  ┼  ┼" },
    { id: "stars", label: "Stars", glyph: "✦  ✧  ✦  ✧  ✦  ✧" },
    { id: "hearts", label: "Hearts", glyph: "♡  ♡  ♡  ♡  ♡  ♡" },
  ];
  const quickNoteBackgroundPresets = [
    { color: "#FFF0B8", pattern: "none", category: "Hot", label: "Butter" },
    { color: "#FFE2C5", pattern: "grid", category: "Hot", label: "Peach grid" },
    { color: "#CFE2B8", pattern: "grid", category: "Hot", label: "Sage grid" },
    { color: "#DDF5F4", pattern: "flowers", category: "Hot", label: "Floral" },
    { color: "#FFBFD4", pattern: "none", category: "Hot", label: "Blush" },
    { color: "#D9F4F0", pattern: "none", category: "Hot", label: "Mint" },
    { color: "#DDEBFF", pattern: "none", category: "Hot", label: "Sky" },
    { color: "#DDF7E8", pattern: "dots", category: "Hot", label: "Green dots" },
    {
      color: "#E8DEFF",
      pattern: "stars",
      category: "Special",
      label: "Lavender stars",
    },
    {
      color: "#FCE1EE",
      pattern: "hearts",
      category: "Special",
      label: "Pink hearts",
    },
    {
      color: "#FFE8D9",
      pattern: "flowers",
      category: "Special",
      label: "Peach flowers",
    },
    {
      color: "#DDFBFF",
      pattern: "hearts",
      category: "Special",
      label: "Aqua hearts",
    },
    {
      color: "#FFF3D8",
      pattern: "lines",
      category: "School",
      label: "Notebook",
    },
    {
      color: "#D7E9FF",
      pattern: "lines",
      category: "School",
      label: "Blue ruled",
    },
    {
      color: "#F6F1E8",
      pattern: "grid",
      category: "School",
      label: "Graph paper",
    },
    {
      color: "#C8F4DF",
      pattern: "grid",
      category: "School",
      label: "Mint grid",
    },
    {
      color: "#FFDCCB",
      pattern: "dots",
      category: "Shopping",
      label: "Peach dots",
    },
    {
      color: "#E9E3FF",
      pattern: "stars",
      category: "Festival",
      label: "Party stars",
    },
    {
      color: "#FFE2A8",
      pattern: "dots",
      category: "Festival",
      label: "Golden dots",
    },
    {
      color: "#F7E8FF",
      pattern: "grid",
      category: "Grid",
      label: "Lilac grid",
    },
    {
      color: "#FFFFFF",
      pattern: "none",
      category: "Color",
      label: "Clean white",
    },
    {
      color: "#DDF5F4",
      pattern: "none",
      category: "Color",
      label: "Sea glass",
    },
    { color: "#FCE1EE", pattern: "none", category: "Color", label: "Rose" },
    { color: "#EDE2FF", pattern: "none", category: "Color", label: "Lilac" },
    {
      color: "#DDEBFF",
      pattern: "grid",
      category: "Gradient",
      label: "Blue grid",
    },
    {
      color: "#FCE1EE",
      pattern: "lines",
      category: "Gradient",
      label: "Rose lines",
    },
  ];

  const [todoDate, setTodoDate] = useState(toDateInput(new Date()));

  const [dateText, setDateText] = useState(toDateInput(new Date()));

  const [alarmDate, setAlarmDate] = useState<Date | null>(null);

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
  const [drawingColor, setDrawingColor] = useState("#19213D");
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

  const [fontSize, setFontSize] = useState(16);
  const [lineSpacing, setLineSpacing] = useState(24);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [spacingModalVisible, setSpacingModalVisible] = useState(false);
  const [textColor, setTextColor] = useState("#19213D");
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

  const mounted = useRef(true);

  const savingRef = useRef(false);

  const recordingRef = useRef(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const recorderState = useAudioRecorderState(recorder, 500);

  const player = useAudioPlayer(voiceUri);

  const playerStatus = useAudioPlayerStatus(player);

  const status = useMemo(
    () => getStatusForDate(dateText),

    [dateText],
  );

  const formattedDate = useMemo(
    () => formatLongDate(dateText),

    [dateText],
  );

  const draftKey = `notes-draft:${todoId || "new"}`;

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

  /**
   * Indent or outdent the current line, or every line intersecting
   * the current selection. Indentation is represented by two spaces.
   */
  const changeIndent = useCallback(
    (direction: "increase" | "decrease") => {
      const textLength = content.length;
      const start = Math.max(0, Math.min(selection.start, textLength));
      const end = Math.max(start, Math.min(selection.end, textLength));

      const firstLineStart =
        start === 0 ? 0 : content.lastIndexOf("\\n", start - 1) + 1;

      // If a selection ends immediately after a newline, don't include the
      // following line unless the selection extends into that line.
      let affectedEnd = end;
      if (end > start && content[end - 1] === "\\n") {
        affectedEnd = end - 1;
      }

      const lineStarts: number[] = [firstLineStart];

      if (start !== end) {
        let searchFrom = firstLineStart;
        while (true) {
          const newlineIndex = content.indexOf("\\n", searchFrom);
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

      // Apply from the end so the original line offsets remain valid.
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
    const pasted = await Clipboard.getStringAsync();
    if (pasted) replaceSelection(pasted);
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

  // Restore the local draft first, then enable debounced auto-save.
  // Drafts are stored per Todo ID so editing one note cannot overwrite another.
  useEffect(() => {
    let active = true;

    const restoreDraft = async () => {
      try {
        const raw = await AsyncStorage.getItem(draftKey);

        if (!active) return;

        if (raw) {
          const draft = JSON.parse(raw) as {
            title?: string;
            content?: string;
            modifiedAt?: string;
            createdAt?: string;
            isQuickNote?: boolean;
            quickNoteColor?: string;
            quickNotePattern?: string;
            quickNotePinned?: boolean;
            drawingUri?: string;
            drawingText?: string;
          };

          // For a new note, restore the draft. For an existing note, only
          // restore it when the form has not already been populated.
          if (!isEditing || (!title && !content)) {
            if (typeof draft.title === "string") setTitle(draft.title);
            if (typeof draft.content === "string") setContent(draft.content);
            if (typeof draft.createdAt === "string")
              setCreatedAt(draft.createdAt);
            if (typeof draft.modifiedAt === "string")
              setModifiedAt(draft.modifiedAt);
            if (typeof draft.isQuickNote === "boolean")
              setIsQuickNote(draft.isQuickNote);
            if (typeof draft.quickNoteColor === "string")
              setQuickNoteColor(draft.quickNoteColor);
            if (typeof draft.quickNotePattern === "string")
              setQuickNotePattern(draft.quickNotePattern);
            if (typeof draft.quickNotePinned === "boolean")
              setQuickNotePinned(draft.quickNotePinned);
            if (typeof draft.drawingUri === "string")
              setDrawingUri(draft.drawingUri);
            if (typeof draft.drawingText === "string")
              setDrawingText(draft.drawingText);
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
  }, [draftKey]);

  // Save title and content locally 500 ms after the user stops typing.
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
            quickNotePattern,
            quickNotePinned,
            drawingUri,
            drawingText,
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
    quickNotePattern,
    quickNotePinned,
    drawingUri,
    drawingText,
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
      } catch {
        // The recorder may already have stopped.
      }

      try {
        void player.pause();
      } catch {
        // The player may already be released.
      }
    };
  }, [player, recorder]);

  // Load the authentication details.

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
          Alert.alert(
            "Authentication error",

            getErrorMessage(error),
          );
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

  // Request notification permission.

  useEffect(() => {
    const requestPermission = async () => {
      try {
        const permissions = await Notifications.getPermissionsAsync();

        if (!permissions.granted) {
          await Notifications.requestPermissionsAsync();
        }
      } catch {
        // Notifications may be unavailable in some Expo environments.
      }
    };

    void requestPermission();
  }, []);

  // Prefill the form immediately from the Todo passed by ViewTodolistScreen.

  // If an ID is available, the API request below refreshes it with server data.

  useEffect(() => {
    if (!isEditing || !passedTodo) return;

    setTitle(passedTodo.title || "");

    setContent(passedTodo.text || "");

    const parsedDate = passedTodo.date ? new Date(passedTodo.date) : new Date();

    const validDate = Number.isNaN(parsedDate.getTime())
      ? new Date()
      : parsedDate;

    const dateValue = toDateInput(validDate);

    setTodoDate(dateValue);

    setDateText(dateValue);

    if (passedTodo.alarm) {
      const parsedAlarm = new Date(passedTodo.alarm);

      setAlarmDate(Number.isNaN(parsedAlarm.getTime()) ? null : parsedAlarm);
    } else {
      setAlarmDate(null);
    }
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
    if (params.quickNote !== "true" || isEditing) return;
    setTitle(
      (current) =>
        current ||
        (typeof params.templateTitle === "string"
          ? params.templateTitle
          : "Quick note"),
    );
    if (
      typeof params.templateContent === "string" &&
      params.templateContent.length > 0
    ) {
      setContent((current) => current || params.templateContent!);
    }
    if (
      typeof params.templateColor === "string" &&
      /^#[0-9A-Fa-f]{6}$/.test(params.templateColor)
    ) {
      setQuickNoteColor(params.templateColor);
    }
    if (typeof params.templateTitle === "string")
      setQuickNoteTemplateTitle(params.templateTitle);
    if (typeof params.templateCategory === "string")
      setQuickNoteTemplateCategory(params.templateCategory);
    if (typeof params.templateEmoji === "string")
      setQuickNoteTemplateEmoji(params.templateEmoji);
    if (
      typeof params.templateAccent === "string" &&
      /^#[0-9A-Fa-f]{6}$/.test(params.templateAccent)
    )
      setQuickNoteTemplateAccent(params.templateAccent);
  }, [
    params.quickNote,
    params.templateTitle,
    params.templateContent,
    params.templateColor,
    params.templateCategory,
    params.templateEmoji,
    params.templateAccent,
    isEditing,
  ]);

  // Restore Quick Note settings when an existing note is opened for editing.
  // Metadata is stored by ID and by normalized title for compatibility with older notes.
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
            quickNotePattern?: string;
            quickNotePinned?: boolean;
            templateTitle?: string;
            templateCategory?: string;
            templateEmoji?: string;
            templateAccent?: string;
          };
          if (!active) return;
          if (typeof meta.isQuickNote === "boolean")
            setIsQuickNote(meta.isQuickNote);
          if (typeof meta.quickNoteColor === "string")
            setQuickNoteColor(meta.quickNoteColor);
          if (typeof meta.quickNotePattern === "string")
            setQuickNotePattern(meta.quickNotePattern);
          if (typeof meta.quickNotePinned === "boolean")
            setQuickNotePinned(meta.quickNotePinned);
          if (typeof meta.templateTitle === "string")
            setQuickNoteTemplateTitle(meta.templateTitle);
          if (typeof meta.templateCategory === "string")
            setQuickNoteTemplateCategory(meta.templateCategory);
          if (typeof meta.templateEmoji === "string")
            setQuickNoteTemplateEmoji(meta.templateEmoji);
          if (typeof meta.templateAccent === "string")
            setQuickNoteTemplateAccent(meta.templateAccent);
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

  // Load existing Todo data when an ID and authentication token are available.

  useEffect(() => {
    // ViewTodolistScreen already passes the selected Todo in editTodo.

    // Use that data directly instead of calling a possibly unavailable GET-by-ID route.

    if (!isEditing || !todoId || !token || passedTodo) return;

    let active = true;

    const loadTodo = async () => {
      try {
        // Backend exposes GET /api/todolist (all todos), not

        // GET /api/getTodolist/:id. Find this todo from the supported route.

        const response = await axios.get<{
          success?: boolean;

          data?: TodoItem[];
        }>(
          `${API_BASE_URL}/api/todolist`,

          { headers: authHeader(token) },
        );

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

        const parsedDate = payload.date ? new Date(payload.date) : new Date();

        const validDate = Number.isNaN(parsedDate.getTime())
          ? new Date()
          : parsedDate;

        const dateValue = toDateInput(validDate);

        setTodoDate(dateValue);

        setDateText(dateValue);

        if (payload.alarm) {
          const parsedAlarm = new Date(payload.alarm);

          setAlarmDate(
            Number.isNaN(parsedAlarm.getTime()) ? null : parsedAlarm,
          );
        } else {
          setAlarmDate(null);
        }

        /*

         * Existing attachments are stored by the backend as file IDs.

         * This screen does not guess download URLs from those IDs.

         * Newly selected attachments are previewed below.

         */

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
  }, []);

  const openDatePicker = useCallback(() => {
    const initialDate = parseDateText(dateText) || new Date();

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initialDate,

        mode: "date",

        display: "calendar",

        onChange: (event, selectedDate) => {
          if (event.type === "set" && selectedDate) {
            applyDate(selectedDate);
          }
        },
      });
    } else {
      Alert.alert(
        "Date picker",

        "Use the date field to enter a date in YYYY-MM-DD format.",
      );
    }
  }, [applyDate, dateText]);

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
    const initialDate =
      alarmDate && alarmDate.getTime() > Date.now()
        ? alarmDate
        : new Date(Date.now() + 60 * 60 * 1000);

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initialDate,

        mode: "date",

        display: "calendar",

        minimumDate: new Date(),

        onChange: (event, selectedDate) => {
          if (event.type !== "set" || !selectedDate) return;

          const chosenDate = new Date(selectedDate);

          const existingTime = alarmDate || initialDate;

          chosenDate.setHours(
            existingTime.getHours(),

            existingTime.getMinutes(),

            0,

            0,
          );

          setTimeout(() => {
            DateTimePickerAndroid.open({
              value: chosenDate,

              mode: "time",

              display: "clock",

              onChange: (timeEvent, selectedTime) => {
                if (timeEvent.type !== "set" || !selectedTime) {
                  return;
                }

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

                setAlarmDate(result);
              },
            });
          }, 250);
        },
      });
    } else {
      Alert.alert(
        "Reminder",

        "Reminder selection is currently configured for Android.",
      );
    }
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

      // Keep existing attachments so one note can contain both an image and a video.
      // Pick one media item, reopen the picker, and select the other media type.
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
    if (recordingBusy || loading) return;

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
    } catch (error) {
      recordingRef.current = false;

      Alert.alert(
        "Recording error",

        getErrorMessage(error),
      );
    } finally {
      if (mounted.current) setRecordingBusy(false);
    }
  }, [loading, recorder, recordingBusy]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    setRecordingBusy(true);

    try {
      await recorder.stop();

      recordingRef.current = false;

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
      Alert.alert(
        "Unable to stop recording",

        getErrorMessage(error),
      );
    } finally {
      recordingRef.current = false;

      try {
        await setAudioModeAsync({
          allowsRecording: false,

          playsInSilentMode: true,
        });
      } catch {
        // Restore audio mode on a best-effort basis.
      }

      if (mounted.current) setRecordingBusy(false);
    }
  }, [recorder]);

  const toggleRecording = useCallback(() => {
    if (isRecording || recordingRef.current) {
      void stopRecording();
    } else {
      void startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

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
      // Selecting English means translate Tamil handwriting, not recognize it as English.
      const shouldTranslateToEnglish =
        translateToEnglish ||
        (!languageOverride && drawingLanguage === "en-US");
      const recognitionLanguage: "en-US" | "ta" = shouldTranslateToEnglish
        ? "ta"
        : (languageOverride ?? drawingLanguage);
      const sourceStrokes = strokesToRecognize ?? [
        ...drawingStrokes,
        ...(currentDrawingStroke ? [currentDrawingStroke] : []),
      ];
      // White strokes are eraser marks; don't send them to the recognizer.
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

      if (!inkStrokes.length) {
        setDrawingRecognitionStatus("Write a word on the canvas first.");
        return;
      }

      const requestId = ++drawingRecognitionRequestRef.current;
      setDrawingRecognitionBusy(true);
      setDrawingRecognitionStatus("Recognizing handwriting…");
      try {
        if (!NitroDigitalInk.isAvailable()) {
          throw new Error(
            "Digital Ink Recognition is unavailable in this build. Install the native package and rebuild the app; Expo Go is not supported.",
          );
        }
        const candidates = await NitroDigitalInk.recognize(
          inkStrokes,
          recognitionLanguage,
        );
        if (requestId !== drawingRecognitionRequestRef.current) return;
        const recognizedText = candidates?.[0]?.text?.trim();
        if (recognizedText) {
          // English mode means translation, not English handwriting recognition.
          // First recognize the handwriting in Tamil, then translate the recognized Tamil text.
          if (shouldTranslateToEnglish) {
            setDrawingText(recognizedText);
            setDrawingRecognitionStatus(
              "தமிழ் எழுத்து கண்டறியப்பட்டது. English-க்கு மொழிபெயர்க்கிறது…",
            );
            const translationResponse = await axios.post<{
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
            const translatedText = (
              translationResponse.data?.translatedText ??
              translationResponse.data?.translation ??
              ""
            ).trim();
            if (!translatedText) {
              throw new Error(
                "Tamil handwriting was recognized, but the translation service returned no English text.",
              );
            }
            setDrawingText(translatedText);
            setDrawingRecognitionStatus(
              `தமிழ்: ${recognizedText}  →  English: ${translatedText}`,
            );
          } else {
            setDrawingText(recognizedText);
            setDrawingRecognitionStatus(
              "Handwriting converted to editable text. You can correct it below.",
            );
          }
          setModifiedAt(new Date().toISOString());
        } else {
          setDrawingRecognitionStatus(
            "No text recognized. Try writing more clearly or switch language.",
          );
        }
      } catch (error) {
        if (requestId !== drawingRecognitionRequestRef.current) return;
        const message =
          error instanceof Error
            ? error.message
            : "Could not recognize this handwriting.";
        setDrawingRecognitionStatus(message);
        console.warn("Handwriting recognition failed:", error);
      } finally {
        if (requestId === drawingRecognitionRequestRef.current)
          setDrawingRecognitionBusy(false);
      }
    },
    [drawingStrokes, currentDrawingStroke, drawingLanguage],
  );

  // Convert handwriting automatically after a short pause in drawing. A manual
  // Convert button is also provided so users can retry or change language.
  useEffect(() => {
    if (drawingRecognitionTimerRef.current)
      clearTimeout(drawingRecognitionTimerRef.current);
    if (
      !drawingModalVisible ||
      drawingStrokes.length === 0 ||
      currentDrawingStroke ||
      drawingEraser
    )
      return;
    drawingRecognitionTimerRef.current = setTimeout(() => {
      void recognizeHandwriting(drawingStrokes);
    }, 1200);
    return () => {
      if (drawingRecognitionTimerRef.current)
        clearTimeout(drawingRecognitionTimerRef.current);
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
      // Include an in-progress stroke in the saved canvas.
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

  const scheduleLocalNotification = useCallback(
    async (savedTitle: string) => {
      if (!alarmDate) return;

      if (alarmDate.getTime() <= Date.now()) {
        Alert.alert(
          "Reminder skipped",

          "The selected reminder time is no longer in the future.",
        );

        return;
      }

      const permissions = await Notifications.getPermissionsAsync();

      if (!permissions.granted) {
        const requested = await Notifications.requestPermissionsAsync();

        if (!requested.granted) return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Todo reminder",

          body: savedTitle || "You have a task to complete.",

          sound: true,

          data: {
            todoId: todoId ? String(todoId) : undefined,
          },
        },

        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,

          date: alarmDate,
        },
      });
    },

    [alarmDate, todoId],
  );

  const buildFormData = useCallback(() => {
    const formData = new FormData();

    formData.append("title", title.trim());

    formData.append("date", dateText);

    const editableHandwriting = drawingText.trim();
    const savedText = editableHandwriting
      ? `${content.trim()}${content.trim() ? "\n\n" : ""}Handwriting transcription:\n${editableHandwriting}`
      : content;
    formData.append("text", savedText);

    formData.append("alarm", alarmDate?.toISOString() || "");

    formData.append("status", status);

    if (userId) formData.append("userId", userId);

    if (imageUri) {
      formData.append(
        "file",

        {
          uri: imageUri,

          name: getFileName(imageUri, "todo_image.jpg"),

          type: "image/jpeg",
        } as unknown as Blob,
      );
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
      formData.append(
        "file",

        {
          uri: voiceUri,

          name: getFileName(voiceUri, "todo_voice.m4a"),

          type: "audio/mp4",
        } as unknown as Blob,
      );
    }

    if (drawingUri) {
      formData.append("file", {
        uri: drawingUri,
        name: getFileName(drawingUri, "todo_sketch.png"),
        type: "image/png",
      } as unknown as Blob);
    }

    return formData;
  }, [
    alarmDate,

    content,

    dateText,

    imageUri,

    status,

    title,

    userId,

    voiceUri,
    videoUri,
    drawingUri,
    drawingText,
  ]);

  const saveTodo = useCallback(async () => {
    console.log("[QuickNote] Save button pressed", {
      isEditing,
      isQuickNote,
      title: title.trim(),
      todoId: todoId ?? null,
      quickNoteColor,
      quickNotePattern,
      quickNotePinned,
    });

    if (savingRef.current) return;
    if (!title.trim()) {
      Alert.alert("Title required", "Please enter a note title.");
      return;
    }
    if (!isQuickNote && (!token || !userId)) {
      Alert.alert("Login required", "Please sign in to save a Todo.");
      return;
    }
    if (!isQuickNote && !parseDateText(dateText)) {
      Alert.alert(
        "Invalid date",
        "Enter a valid date using YYYY-MM-DD format.",
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

    let localQuickNoteId: string | null = null;
    let localSaved = false;
    let apiSaved = false;
    let savedTodoId: string | number | undefined = todoId;

    try {
      // Quick Notes are persisted to the device before any network request.
      if (isQuickNote) {
        const raw = await AsyncStorage.getItem(LOCAL_QUICK_NOTES_KEY);
        const localNotes: LocalQuickNote[] = raw ? JSON.parse(raw) : [];
        const existingIndex = localNotes.findIndex(
          (note) =>
            String(note._id) === String(todoId ?? "") ||
            String(note.id) === String(todoId ?? ""),
        );
        const now = new Date().toISOString();
        localQuickNoteId =
          existingIndex >= 0
            ? localNotes[existingIndex]._id
            : createLocalQuickNoteId();

        const localNote: LocalQuickNote = {
          _id: localQuickNoteId,
          id: localQuickNoteId,
          title: title.trim(),
          text: content,
          description: content,
          isQuickNote: true,
          quickNoteColor,
          quickNotePattern,
          templateTitle: quickNoteTemplateTitle || undefined,
          templateCategory: quickNoteTemplateCategory || undefined,
          templateEmoji: quickNoteTemplateEmoji || undefined,
          templateAccent: quickNoteTemplateAccent || undefined,
          quickNotePinned,
          createdAt:
            existingIndex >= 0
              ? localNotes[existingIndex].createdAt
              : createdAt || now,
          updatedAt: now,
          localOnly: true,
          drawingUri: drawingUri || undefined,
          drawingText: drawingText || undefined,
          imageUri: imageUri || undefined,
          videoUri: videoUri || undefined,
          voiceUri: voiceUri || undefined,
        } as LocalQuickNote;

        if (existingIndex >= 0)
          localNotes[existingIndex] = {
            ...localNotes[existingIndex],
            ...localNote,
          };
        else localNotes.unshift(localNote);

        await AsyncStorage.setItem(
          LOCAL_QUICK_NOTES_KEY,
          JSON.stringify(localNotes),
        );
        localSaved = true;
        savedTodoId = localQuickNoteId;

        const meta = JSON.stringify({
          isQuickNote: true,
          quickNoteColor,
          quickNotePattern,
          templateTitle: quickNoteTemplateTitle,
          templateCategory: quickNoteTemplateCategory,
          templateEmoji: quickNoteTemplateEmoji,
          templateAccent: quickNoteTemplateAccent,
          quickNotePinned,
          title: title.trim(),
          updatedAt: now,
        });
        await AsyncStorage.multiSet([
          [`quick-note-meta:${localQuickNoteId}`, meta],
          [`quick-note-meta:${title.trim().toLowerCase()}`, meta],
        ]);
        if (drawingUri) {
          await AsyncStorage.setItem(
            `note-drawing:${localQuickNoteId}`,
            drawingUri,
          );
        }
        console.log("[QuickNote] Saved locally first", {
          id: localQuickNoteId,
          totalLocalNotes: localNotes.length,
        });
      }

      // A local Quick Note is already saved. Sync with the API when available;
      // network/API failures must not discard the local copy.
      const isLocalQuickNoteEdit =
        isQuickNote &&
        Boolean(todoId) &&
        String(todoId).startsWith("quick-note-");

      if (token && userId && !isLocalQuickNoteEdit) {
        try {
          const formData = buildFormData();
          const url = isEditing
            ? `${API_BASE_URL}/api/updateTodolist/${todoId}`
            : `${API_BASE_URL}/api/createTodolist`;
          console.log("[QuickNote] Starting API save", {
            mode: isEditing ? "update" : "create",
            isQuickNote,
            endpoint: url,
          });

          const response = isEditing
            ? await axios.put<ApiResponse>(url, formData, {
                headers: {
                  ...authHeader(token),
                  "Content-Type": "multipart/form-data",
                },
                timeout: 15000,
              })
            : await axios.post<ApiResponse>(url, formData, {
                headers: {
                  ...authHeader(token),
                  "Content-Type": "multipart/form-data",
                },
                timeout: 15000,
              });

          console.log("[QuickNote] API response received", {
            success: response.data?.success,
            message: response.data?.message,
            responseKeys: Object.keys(response.data ?? {}),
          });

          if (response.data?.success === true) {
            apiSaved = true;
            const savedTodo = response.data?.data ?? response.data?.todo;
            const serverId =
              savedTodo?.tdlId ??
              savedTodo?._id ??
              savedTodo?.id ??
              savedTodo?.todoId;
            if (serverId != null) savedTodoId = serverId;

            if (isQuickNote && localQuickNoteId) {
              const raw = await AsyncStorage.getItem(LOCAL_QUICK_NOTES_KEY);
              const localNotes: LocalQuickNote[] = raw ? JSON.parse(raw) : [];
              const updated = localNotes.map((note) =>
                note._id === localQuickNoteId
                  ? ({
                      ...note,
                      serverTodoId:
                        serverId != null ? String(serverId) : undefined,
                    } as LocalQuickNote)
                  : note,
              );
              await AsyncStorage.setItem(
                LOCAL_QUICK_NOTES_KEY,
                JSON.stringify(updated),
              );
            }
          } else if (!isQuickNote) {
            throw new Error(
              response.data?.message ||
                "The server did not confirm saving this Todo.",
            );
          }
        } catch (apiError) {
          console.warn(
            "[QuickNote] API sync failed; local copy is retained.",
            apiError,
          );
          if (!isQuickNote) throw apiError;
        }
      } else if (!isQuickNote) {
        throw new Error("Please sign in before saving this Todo.");
      }

      if (!isQuickNote && !apiSaved) {
        throw new Error("The server did not confirm saving this Todo.");
      }

      await AsyncStorage.removeItem(draftKey);

      try {
        await scheduleLocalNotification(title.trim());
      } catch (notificationError) {
        console.warn("Reminder could not be scheduled:", notificationError);
      }

      console.log("[QuickNote] Save completed", {
        isQuickNote,
        localSaved,
        apiSaved,
        savedTodoId: savedTodoId != null ? String(savedTodoId) : null,
      });

      if (!mounted.current) return;
      Alert.alert(
        isQuickNote ? "Quick Note saved" : "Success",
        isQuickNote
          ? apiSaved
            ? "Your Quick Note is saved on this device and synced with the server."
            : "Your Quick Note is saved on this device."
          : isEditing
            ? "Note updated successfully."
            : "Note created successfully.",
        [{ text: "OK", onPress: () => router.replace("/viewtodolist") }],
      );
    } catch (error) {
      console.error("[QuickNote] Save failed:", error);
      if (mounted.current) {
        Alert.alert("Save failed", getErrorMessage(error));
      }
    } finally {
      savingRef.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [
    alarmDate,
    buildFormData,
    content,
    createdAt,
    dateText,
    drawingText,
    drawingUri,
    draftKey,
    imageUri,
    isEditing,
    isQuickNote,
    isRecording,
    quickNoteColor,
    quickNotePattern,
    quickNoteTemplateTitle,
    quickNoteTemplateCategory,
    quickNoteTemplateEmoji,
    quickNoteTemplateAccent,
    quickNotePinned,
    scheduleLocalNotification,
    title,
    token,
    todoId,
    userId,
    videoUri,
    voiceUri,
  ]);

  const clearReminder = useCallback(() => {
    setAlarmDate(null);
  }, []);

  const clearImage = useCallback(() => {
    setImageUri(null);
  }, []);

  const clearVoice = useCallback(async () => {
    try {
      await player.pause();
    } catch {
      // Ignore if the player is already stopped.
    }

    setVoiceUri(null);

    setPlayerError("");
  }, [player]);

  const cancel = useCallback(() => {
    if (loading) return;

    router.replace("/viewtodolist");
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
      style={[styles.formatButton, active && styles.formatButtonActive]}
    >
      <Text
        style={[
          styles.formatButtonText,

          label === "B" && styles.boldText,

          label === "I" && styles.italicText,

          label === "U" && styles.underlineText,

          active && styles.formatButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  if (initializing) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={COLORS.primary} />

        <Text style={styles.loadingText}>Preparing your Todo...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}

          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={cancel}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={22} color={COLORS.text} />
            </Pressable>

            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>
                {isSimpleQuickNoteScreen
                  ? "Quick Notes"
                  : isEditing
                    ? "Edit note"
                    : "Create note"}
              </Text>

              <Text style={styles.headerSubtitle}>
                Capture ideas, thoughts and details
              </Text>
            </View>

            {!isSimpleQuickNoteScreen && (
              <>
                <Pressable
                  style={styles.headerIcon}
                  onPress={() => router.push("/viewtodolist")}
                >
                  <Ionicons
                    name="settings-outline"
                    size={22}
                    color={COLORS.primary}
                  />
                </Pressable>
                <Pressable
                  style={styles.headerIcon}
                  onPress={() => router.push("/viewtodolist")}
                >
                  <Ionicons
                    name="clipboard-outline"
                    size={22}
                    color={COLORS.primary}
                  />
                </Pressable>
              </>
            )}
          </View>

          {isSimpleQuickNoteScreen ? (
            <View
              style={[
                styles.quickNoteSimpleContainer,
                { backgroundColor: quickNoteColor },
              ]}
            >
              <View style={[styles.sectionHeading, styles.quickNoteHeadingRow]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Quick Notes</Text>
                  <Text style={styles.quickNoteTemplateHint}>
                    Capture a thought or start with a template
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose a Quick Notes template"
                  style={styles.quickNoteTemplateButton}
                  onPress={() => router.push("/notetemplates" as never)}
                >
                  <Ionicons name="albums-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.quickNoteTemplateButtonText}>
                    Templates
                  </Text>
                </Pressable>
              </View>

              <View
                style={[
                  styles.card,
                  styles.quickNoteCustomCard,
                  { backgroundColor: quickNoteColor },
                ]}
              >
                {quickNotePattern !== "none" && (
                  <View
                    pointerEvents="none"
                    style={styles.quickNotePatternOverlay}
                  >
                    {Array.from({ length: 10 }, (_, index) => (
                      <Text
                        key={`${quickNotePattern}-${index}`}
                        style={styles.quickNotePatternOverlayText}
                      >
                        {
                          quickNotePatterns.find(
                            (pattern) => pattern.id === quickNotePattern,
                          )?.glyph
                        }
                      </Text>
                    ))}
                  </View>
                )}

                {quickNoteTemplateTitle ? (
                  <View
                    style={[
                      styles.quickNoteAppliedTemplate,
                      { borderColor: quickNoteTemplateAccent + "66" },
                    ]}
                  >
                    <View
                      style={[
                        styles.quickNoteAppliedTemplateIcon,
                        { backgroundColor: quickNoteTemplateAccent + "22" },
                      ]}
                    >
                      <Text style={styles.quickNoteAppliedTemplateEmoji}>
                        {quickNoteTemplateEmoji || "📝"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.quickNoteAppliedTemplateLabel}>
                        TEMPLATE APPLIED
                      </Text>
                      <Text style={styles.quickNoteAppliedTemplateTitle}>
                        {quickNoteTemplateTitle}
                      </Text>
                    </View>
                    {!!quickNoteTemplateCategory && (
                      <Text
                        style={[
                          styles.quickNoteAppliedTemplateCategory,
                          { color: quickNoteTemplateAccent },
                        ]}
                      >
                        {quickNoteTemplateCategory}
                      </Text>
                    )}
                  </View>
                ) : null}
                <Text style={styles.fieldLabel}>Note title *</Text>
                <TextInput
                  value={title}
                  onChangeText={(value) => {
                    setTitle(value);
                    setModifiedAt(new Date().toISOString());
                  }}
                  placeholder="Enter note title"
                  placeholderTextColor="#A0A8BB"
                  style={styles.titleInput}
                  maxLength={160}
                  returnKeyType="next"
                />
                <View style={styles.fieldDivider} />
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  ref={contentInputRef}
                  value={content}
                  onChangeText={handleContentChange}
                  placeholder="Write your note here..."
                  placeholderTextColor="#A0A8BB"
                  multiline
                  textAlignVertical="top"
                  maxLength={50000}
                  style={[
                    styles.descriptionInput,
                    styles.quickNoteDescriptionInput,
                  ]}
                />
              </View>

              <View style={styles.footer}>
                <Pressable
                  onPress={cancel}
                  disabled={loading}
                  style={[
                    styles.cancelButton,
                    loading && styles.disabledButton,
                  ]}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void saveTodo()}
                  disabled={loading}
                  style={[styles.saveButton, loading && styles.disabledButton]}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={20}
                        color="#FFFFFF"
                      />
                      <Text style={styles.saveButtonText}>
                        {isEditing ? "Save note" : "Save quick note"}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              {/* Quick note controls */}
              <View
                style={[
                  styles.quickNotePanel,
                  isQuickNote && { backgroundColor: quickNoteColor },
                ]}
              >
                <View style={styles.quickNoteTopRow}>
                  <View style={styles.quickNoteTitleWrap}>
                    <Ionicons
                      name="flash-outline"
                      size={19}
                      color={COLORS.primary}
                    />
                    <View>
                      <Text style={styles.quickNoteHeading}>Quick Notes</Text>
                      <Text style={styles.quickNoteCaption}>
                        Capture an idea in seconds
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      if (isQuickNote) {
                        setIsQuickNote(false);
                        return;
                      }
                      setIsQuickNote(true);
                      setTitle((current) =>
                        current.trim() ? current : "Quick note",
                      );
                      setModifiedAt(new Date().toISOString());
                      // Let React render the quick-note editor before focusing it.
                      setTimeout(() => contentInputRef.current?.focus?.(), 120);
                    }}
                    style={[
                      styles.quickModeButton,
                      isQuickNote && styles.quickModeButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickModeButtonText,
                        isQuickNote && styles.quickModeButtonTextActive,
                      ]}
                    >
                      {isQuickNote ? "Quick note on" : "Make quick note"}
                    </Text>
                  </Pressable>
                </View>
                {isQuickNote && (
                  <>
                    <View style={styles.quickNoteOptionsRow}>
                      <Text style={styles.quickNoteOptionLabel}>Color</Text>
                      <View style={styles.quickNoteColors}>
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
                              styles.quickNoteColorSwatch,
                              { backgroundColor: color },
                              quickNoteColor === color &&
                                styles.quickNoteColorSwatchSelected,
                            ]}
                          >
                            {quickNoteColor === color ? (
                              <Ionicons
                                name="checkmark"
                                size={14}
                                color="#253047"
                              />
                            ) : null}
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: quickNotePinned }}
                      onPress={() => setQuickNotePinned((value) => !value)}
                      style={[
                        styles.pinQuickNoteButton,
                        quickNotePinned && styles.pinQuickNoteButtonActive,
                      ]}
                    >
                      <Ionicons
                        name={quickNotePinned ? "pin" : "pin-outline"}
                        size={17}
                        color={
                          quickNotePinned
                            ? COLORS.primary
                            : COLORS.secondaryText
                        }
                      />
                      <Text style={styles.pinQuickNoteText}>
                        {quickNotePinned
                          ? "Pinned on this device"
                          : "Pin this note on this device"}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>

              {/* Intro card */}

              <View style={styles.heroCard}>
                <View style={styles.heroCopy}>
                  <Text style={styles.heroEyebrow}>YOUR DAILY PLAN</Text>

                  <Text style={styles.heroTitle}>Make it happen.</Text>

                  <Text style={styles.heroSubtitle}>
                    Add the details now. You can focus on getting it done later.
                  </Text>
                </View>

                <View style={styles.heroIllustration}>
                  <Ionicons name="clipboard" size={34} color="#FFFFFF" />

                  <View style={styles.heroCheck}>
                    <Ionicons
                      name="checkmark"
                      size={15}
                      color={COLORS.primary}
                    />
                  </View>
                </View>
              </View>

              {/* Note title */}

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Note details</Text>

                <Text style={styles.requiredText}>* Required</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.fieldLabel}>Note title *</Text>

                <TextInput
                  value={title}
                  onChangeText={(value) => {
                    setTitle(value);
                    setModifiedAt(new Date().toISOString());
                  }}
                  placeholder={
                    isQuickNote ? "Quick note title" : "Give your note a title"
                  }
                  placeholderTextColor="#A0A8BB"
                  style={styles.titleInput}
                  maxLength={160}
                  returnKeyType="next"
                />

                <View style={styles.fieldDivider} />

                <View style={styles.descriptionHeadingRow}>
                  <Text style={styles.fieldLabel}>Description</Text>
                  <View style={styles.autoSaveStatus}>
                    <Ionicons
                      name={
                        draftStatus === "saved"
                          ? "checkmark-circle-outline"
                          : draftStatus === "error"
                            ? "alert-circle-outline"
                            : draftStatus === "saving"
                              ? "cloud-upload-outline"
                              : "time-outline"
                      }
                      size={14}
                      color={
                        draftStatus === "saved"
                          ? COLORS.green
                          : draftStatus === "error"
                            ? COLORS.red
                            : COLORS.secondaryText
                      }
                    />
                    <Text
                      style={[
                        styles.autoSaveStatusText,
                        draftStatus === "saved" && styles.autoSaveStatusSaved,
                        draftStatus === "error" && styles.autoSaveStatusError,
                      ]}
                    >
                      {draftStatus === "loading"
                        ? "Restoring draft…"
                        : draftStatus === "saving"
                          ? "Saving locally…"
                          : draftStatus === "error"
                            ? "Auto-save failed"
                            : "Saved locally"}
                    </Text>
                  </View>
                </View>

                <View style={styles.editorToolbar}>
                  {/* Row 1: Text styling */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.toolbarRow}
                  >
                    <Text style={styles.toolbarLabel}>STYLE</Text>

                    {formatButton("B", bold, () => setBold((v) => !v), "Bold")}
                    {formatButton(
                      "I",
                      italic,
                      () => setItalic((v) => !v),
                      "Italic",
                    )}
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
                        styles.toolButton,
                        strikethrough && styles.toolButtonActive,
                      ]}
                      onPress={() => setStrikethrough((value) => !value)}
                    >
                      <Text
                        style={[
                          styles.toolText,
                          { textDecorationLine: "line-through" },
                        ]}
                      >
                        S
                      </Text>
                    </Pressable>

                    <Pressable
                      style={styles.toolButton}
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
                      style={styles.toolButton}
                      onPress={() => setFontPickerVisible(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Choose font family"
                    >
                      <Ionicons
                        name="text-outline"
                        size={19}
                        color={COLORS.secondaryText}
                      />
                    </Pressable>
                  </ScrollView>

                  <View style={styles.toolbarSeparator} />

                  {/* Row 2: Paragraph and lists */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.toolbarRow}
                  >
                    <Text style={styles.toolbarLabel}>PARAGRAPH</Text>

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
                          styles.toolButton,
                          alignment === value && styles.toolButtonActive,
                        ]}
                        onPress={() => setAlignment(value)}
                      >
                        <Ionicons
                          name={iconName}
                          size={19}
                          color={
                            alignment === value
                              ? COLORS.primary
                              : COLORS.secondaryText
                          }
                          style={
                            value === "right"
                              ? { transform: [{ scaleX: -1 }] }
                              : undefined
                          }
                        />
                      </Pressable>
                    ))}

                    {/* Bullet List */}
                    <Pressable
                      style={styles.toolButton}
                      onPress={() => replaceSelection("• ")}
                      accessibilityRole="button"
                      accessibilityLabel="Insert bullet list"
                    >
                      <Text style={styles.toolText}>• List</Text>
                    </Pressable>

                    {/* Numbered List */}
                    <Pressable
                      style={styles.toolButton}
                      onPress={() => {
                        replaceSelection(`${listNumber}. `);
                        setListNumber((prev) => prev + 1);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Insert numbered list"
                    >
                      <Text style={styles.toolText}>1. List</Text>
                    </Pressable>

                    {/* Toggle Checklist Symbol */}
                    <Pressable
                      style={styles.toolButton}
                      onPress={() => replaceSelection("☐ ")}
                      accessibilityRole="button"
                      accessibilityLabel="Insert unchecked checklist item"
                    >
                      <Text style={styles.toolText}>☐ Checklist</Text>
                    </Pressable>

                    <Pressable
                      style={styles.toolButton}
                      onPress={() => replaceSelection("☑ ")}
                      accessibilityRole="button"
                      accessibilityLabel="Insert checked checklist item"
                    >
                      <Text style={styles.toolText}>☑ Checked</Text>
                    </Pressable>

                    {/* Decrease Indent */}
                    <Pressable
                      style={styles.toolButton}
                      onPress={() => changeIndent("decrease")}
                      accessibilityRole="button"
                      accessibilityLabel="Decrease indent"
                    >
                      <Ionicons
                        name="return-up-back-outline"
                        size={18}
                        color={COLORS.secondaryText}
                      />
                    </Pressable>

                    {/* Increase Indent */}
                    <Pressable
                      style={styles.toolButton}
                      onPress={() => changeIndent("increase")}
                      accessibilityRole="button"
                      accessibilityLabel="Increase indent"
                    >
                      <Ionicons
                        name="return-down-forward-outline"
                        size={18}
                        color={COLORS.secondaryText}
                      />
                    </Pressable>

                    <Pressable
                      style={styles.toolButton}
                      onPress={() => setSpacingModalVisible(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Adjust text spacing"
                    >
                      <Ionicons
                        name="menu-outline"
                        size={18}
                        color={COLORS.secondaryText}
                      />
                      <Text style={styles.spacingButtonLabel}>Spacing</Text>
                    </Pressable>
                  </ScrollView>

                  <View style={styles.toolbarSeparator} />

                  {/* Row 3: Editing tools */}

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.toolbarRow}
                  >
                    <Text style={styles.toolbarLabel}>EDIT</Text>

                    {/* Undo */}
                    <Pressable
                      style={styles.toolButton}
                      onPress={undoEdit}
                      accessibilityRole="button"
                      accessibilityLabel="Undo"
                    >
                      <Ionicons
                        name="arrow-undo-outline"
                        size={18}
                        color={COLORS.secondaryText}
                      />
                    </Pressable>

                    {/* Redo */}
                    <Pressable
                      style={styles.toolButton}
                      onPress={redoEdit}
                      accessibilityRole="button"
                      accessibilityLabel="Redo"
                    >
                      <Ionicons
                        name="arrow-redo-outline"
                        size={18}
                        color={COLORS.secondaryText}
                      />
                    </Pressable>

                    {/* Copy */}
                    <Pressable
                      style={styles.toolButton}
                      onPress={() => void copyContent()}
                      accessibilityRole="button"
                      accessibilityLabel="Copy"
                    >
                      <Ionicons
                        name="copy-outline"
                        size={18}
                        color={COLORS.secondaryText}
                      />
                    </Pressable>

                    {/* Paste */}
                    <Pressable
                      style={styles.toolButton}
                      onPress={() => void pasteContent()}
                      accessibilityRole="button"
                      accessibilityLabel="Paste"
                    >
                      <Ionicons
                        name="clipboard-outline"
                        size={18}
                        color={COLORS.secondaryText}
                      />
                    </Pressable>

                    {/* Cut */}
                    <Pressable
                      style={styles.toolButton}
                      onPress={() => void cutSelection()}
                      accessibilityRole="button"
                      accessibilityLabel="Cut"
                    >
                      <Ionicons
                        name="cut-outline"
                        size={18}
                        color={COLORS.secondaryText}
                      />
                    </Pressable>

                    {/* Select All */}
                    <Pressable
                      style={styles.toolButton}
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
                        color={COLORS.secondaryText}
                      />
                    </Pressable>

                    {/* Insert Hyperlink */}
                    <Pressable
                      style={styles.toolButton}
                      onPress={insertHyperlink}
                      accessibilityRole="button"
                      accessibilityLabel="Insert hyperlink"
                    >
                      <Ionicons
                        name="link-outline"
                        size={18}
                        color={COLORS.secondaryText}
                      />
                    </Pressable>

                    {/* Open URL */}
                    <Pressable
                      style={styles.toolButton}
                      onPress={() => void openFirstHyperlink()}
                      accessibilityRole="button"
                      accessibilityLabel="Open URL"
                    >
                      <Ionicons
                        name="open-outline"
                        size={18}
                        color={COLORS.secondaryText}
                      />
                    </Pressable>

                    {/* Font Size */}
                    <View style={styles.fontSizeControl}>
                      <Pressable
                        onPress={() => setFontSize((v) => Math.max(12, v - 1))}
                        accessibilityRole="button"
                        accessibilityLabel="Decrease font size"
                        hitSlop={6}
                      >
                        <Ionicons
                          name="remove"
                          size={17}
                          color={COLORS.secondaryText}
                        />
                      </Pressable>

                      <Text style={styles.fontSizeText}>A</Text>

                      <Pressable
                        onPress={() => setFontSize((v) => Math.min(24, v + 1))}
                        accessibilityRole="button"
                        accessibilityLabel="Increase font size"
                        hitSlop={6}
                      >
                        <Ionicons
                          name="add"
                          size={17}
                          color={COLORS.secondaryText}
                        />
                      </Pressable>
                    </View>

                    {/* Character Count */}

                    <Text
                      style={[
                        styles.characterCount,
                        content.length === 0 && styles.characterCountEmpty,
                        content.length > 500 && styles.characterCountWarning,
                        content.length > 1000 && styles.characterCountLimit,
                      ]}
                    >
                      {content.length} characters
                    </Text>
                  </ScrollView>
                </View>

                <TextInput
                  ref={contentInputRef}
                  value={content}
                  onChangeText={handleContentChange}
                  onSelectionChange={(event) =>
                    setSelection(event.nativeEvent.selection)
                  }
                  selection={selection}
                  placeholder={
                    isQuickNote
                      ? "Write your quick note here…"
                      : "Write your note here. Long-form notes and line breaks are supported..."
                  }
                  placeholderTextColor="#A0A8BB"
                  multiline
                  textAlignVertical="top"
                  maxLength={50000}
                  style={[
                    styles.descriptionInput,
                    {
                      fontSize,
                      lineHeight: lineSpacing,
                      letterSpacing,
                      color: textColor,
                      fontFamily:
                        fontFamily === "System" ? undefined : fontFamily,
                      textAlign: alignment,
                      fontWeight: bold ? "700" : "400",
                      fontStyle: italic ? "italic" : "normal",
                      textDecorationLine:
                        [
                          underline ? "underline" : undefined,
                          strikethrough ? "line-through" : undefined,
                        ]
                          .filter(Boolean)
                          .join(" ") || "none",
                    },
                  ]}
                />
              </View>

              {/* Schedule */}

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Schedule</Text>

                <Text style={styles.optionalText}>Keep on track</Text>
              </View>

              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <View style={styles.scheduleLabelWrap}>
                    <View style={styles.fieldIcon}>
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color={COLORS.primary}
                      />
                    </View>

                    <View style={styles.scheduleTextWrap}>
                      <Text style={styles.fieldLabel}>Due date</Text>

                      <Text style={styles.dateValue}>{formattedDate}</Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={openDatePicker}
                    style={styles.smallOutlineButton}
                  >
                    <Text style={styles.smallOutlineButtonText}>Change</Text>
                  </Pressable>
                </View>

                <TextInput
                  value={dateText}
                  onChangeText={(value) => {
                    setDateText(value);

                    setTodoDate(value);
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#A0A8BB"
                  style={styles.dateInput}
                  autoCapitalize="none"
                  accessibilityLabel="Due date in YYYY-MM-DD format"
                />

                <View style={styles.quickDateRow}>
                  <Pressable
                    onPress={() => setQuickDate(0)}
                    style={[
                      styles.quickDateButton,

                      dateText === toDateInput(new Date()) &&
                        styles.quickDateButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickDateText,

                        dateText === toDateInput(new Date()) &&
                          styles.quickDateTextActive,
                      ]}
                    >
                      Today
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setQuickDate(1)}
                    style={[
                      styles.quickDateButton,

                      dateText ===
                        toDateInput(
                          new Date(Date.now() + 24 * 60 * 60 * 1000),
                        ) && styles.quickDateButtonActive,
                    ]}
                  >
                    <Text style={styles.quickDateText}>Tomorrow</Text>
                  </Pressable>

                  <View
                    style={[
                      styles.statusPill,

                      status === "Overdue"
                        ? styles.overduePill
                        : styles.pendingPill,
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,

                        status === "Overdue"
                          ? styles.overdueDot
                          : styles.pendingDot,
                      ]}
                    />

                    <Text
                      style={[
                        styles.statusText,

                        status === "Overdue"
                          ? styles.overdueText
                          : styles.pendingText,
                      ]}
                    >
                      {status}
                    </Text>
                  </View>
                </View>

                <View style={styles.fieldDivider} />

                <View style={styles.rowBetween}>
                  <View style={styles.scheduleLabelWrap}>
                    <View
                      style={[styles.fieldIcon, styles.reminderIconBackground]}
                    >
                      <Ionicons
                        name="notifications-outline"
                        size={20}
                        color={COLORS.orange}
                      />
                    </View>

                    <View style={styles.scheduleTextWrap}>
                      <Text style={styles.fieldLabel}>Reminder</Text>

                      <Text style={styles.reminderValue}>
                        {alarmDate
                          ? toAlarmLabel(alarmDate)
                          : "No reminder set"}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={openReminderPicker}
                    style={styles.smallOutlineButton}
                  >
                    <Text style={styles.smallOutlineButtonText}>
                      {alarmDate ? "Change" : "Set"}
                    </Text>
                  </Pressable>
                </View>

                {alarmDate && (
                  <Pressable
                    onPress={clearReminder}
                    style={styles.removeReminder}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={16}
                      color={COLORS.red}
                    />

                    <Text style={styles.removeReminderText}>
                      Remove reminder
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Attachments */}

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Attachments</Text>

                <Text style={styles.optionalText}>Optional</Text>
              </View>

              <View style={styles.attachmentGrid}>
                <Pressable
                  style={styles.attachmentAction}
                  onPress={() => void pickImage()}
                  disabled={loading}
                >
                  <View
                    style={[styles.attachmentIcon, styles.imageIconBackground]}
                  >
                    <Ionicons name="image-outline" size={23} color="#4B7BE5" />
                  </View>

                  <Text style={styles.attachmentTitle}>Add image</Text>

                  <Text style={styles.attachmentSubtitle}>
                    Photos and Video
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.attachmentAction}
                  onPress={() => {
                    setDrawingStrokes([]);
                    setCurrentDrawingStroke(null);
                    drawingUndoStack.current = [];
                    drawingRedoStack.current = [];
                    drawingStartRef.current = null;
                    setDrawingModalVisible(true);
                  }}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel="Create a drawing or sketch"
                >
                  <View
                    style={[
                      styles.attachmentIcon,
                      styles.drawingIconBackground,
                    ]}
                  >
                    <Ionicons name="pencil-outline" size={23} color="#15966A" />
                  </View>
                  <Text style={styles.attachmentTitle}>
                    {drawingUri ? "Replace sketch" : "Draw sketch"}
                  </Text>
                  <Text style={styles.attachmentSubtitle}>
                    Sketch or handwriting
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.attachmentAction,

                    isRecording && styles.recordingAction,
                  ]}
                  onPress={() => void toggleRecording()}
                  disabled={loading || recordingBusy}
                >
                  <View
                    style={[
                      styles.attachmentIcon,

                      isRecording
                        ? styles.recordingIconBackground
                        : styles.voiceIconBackground,
                    ]}
                  >
                    {recordingBusy ? (
                      <ActivityIndicator color={COLORS.primary} />
                    ) : (
                      <Ionicons
                        name={isRecording ? "stop" : "mic-outline"}
                        size={23}
                        color={isRecording ? COLORS.red : "#9A61D6"}
                      />
                    )}
                  </View>

                  <Text style={styles.attachmentTitle}>
                    {isRecording ? "Stop recording" : "Voice note"}
                  </Text>

                  <Text style={styles.attachmentSubtitle}>
                    {isRecording ? "Recording..." : "Record audio"}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.attachmentAction}
                  onPress={openReminderPicker}
                  disabled={loading}
                >
                  <View
                    style={[
                      styles.attachmentIcon,

                      styles.reminderAttachmentBackground,
                    ]}
                  >
                    <Ionicons name="alarm-outline" size={23} color="#D98A24" />
                  </View>

                  <Text style={styles.attachmentTitle}>Reminder</Text>

                  <Text style={styles.attachmentSubtitle}>
                    {alarmDate ? "Scheduled" : "Set an alert"}
                  </Text>
                </Pressable>
              </View>

              {/* Image preview */}

              {imageUri && (
                <Image
                  source={{ uri: imageUri }}
                  style={{ width: 180, height: 140, borderRadius: 12 }}
                  resizeMode="cover"
                />
              )}

              {videoUri && <VideoPreview uri={videoUri} />}

              {/* Drawing preview */}
              {drawingUri && (
                <View style={styles.previewCard}>
                  <View style={styles.previewHeader}>
                    <View style={styles.previewTitleWrap}>
                      <Ionicons
                        name="brush-outline"
                        size={18}
                        color={COLORS.green}
                      />
                      <Text style={styles.previewTitle}>Attached sketch</Text>
                    </View>
                    <Pressable
                      onPress={clearDrawingAttachment}
                      accessibilityRole="button"
                      accessibilityLabel="Remove sketch"
                      style={styles.removeButton}
                    >
                      <Ionicons name="close" size={18} color={COLORS.red} />
                    </Pressable>
                  </View>
                  <Image
                    source={{ uri: drawingUri }}
                    style={styles.drawingPreview}
                    resizeMode="contain"
                  />
                  <Pressable
                    style={styles.editDrawingButton}
                    onPress={() => {
                      setDrawingStrokes([]);
                      setCurrentDrawingStroke(null);
                      drawingUndoStack.current = [];
                      drawingRedoStack.current = [];
                      drawingStartRef.current = null;
                      setDrawingModalVisible(true);
                    }}
                  >
                    <Ionicons
                      name="pencil-outline"
                      size={16}
                      color={COLORS.primary}
                    />
                    <Text style={styles.editDrawingButtonText}>
                      Create replacement sketch
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Voice preview */}

              {voiceUri && (
                <View style={styles.voicePreviewCard}>
                  <View style={styles.voicePreviewIcon}>
                    <Ionicons
                      name="musical-notes"
                      size={22}
                      color={COLORS.primary}
                    />
                  </View>

                  <View style={styles.voicePreviewInfo}>
                    <Text style={styles.voicePreviewTitle}>
                      Voice note ready
                    </Text>

                    <Text style={styles.voicePreviewSubtitle} numberOfLines={1}>
                      {getFileName(voiceUri, "todo_voice.m4a")}
                    </Text>

                    {!!playerError && (
                      <Text style={styles.errorHint}>{playerError}</Text>
                    )}
                  </View>

                  <Pressable
                    onPress={() => void togglePlayback()}
                    style={styles.playButton}
                    accessibilityRole="button"
                    accessibilityLabel={
                      playerStatus.playing
                        ? "Pause voice note"
                        : "Play voice note"
                    }
                  >
                    <Ionicons
                      name={playerStatus.playing ? "pause" : "play"}
                      size={19}
                      color="#FFFFFF"
                    />
                  </Pressable>

                  <Pressable
                    onPress={() => void clearVoice()}
                    style={styles.removeButton}
                    accessibilityRole="button"
                    accessibilityLabel="Remove voice note"
                  >
                    <Ionicons name="close" size={18} color={COLORS.red} />
                  </Pressable>
                </View>
              )}

              <View style={styles.noteMetaCard}>
                <View style={styles.metaRow}>
                  <View style={styles.metaIcon}>
                    <Ionicons
                      name="calendar-outline"
                      size={17}
                      color={COLORS.primary}
                    />
                  </View>
                  <View style={styles.metaTextWrap}>
                    <Text style={styles.metaLabel}>Created</Text>
                    <Text style={styles.noteMetaText}>
                      {new Date(createdAt).toLocaleString()}
                    </Text>
                  </View>
                </View>

                <View style={styles.metaDivider} />

                <View style={styles.metaRow}>
                  <View style={styles.metaIcon}>
                    <Ionicons name="time-outline" size={17} color="#D98A24" />
                  </View>
                  <View style={styles.metaTextWrap}>
                    <Text style={styles.metaLabel}>Last edited</Text>
                    <Text style={styles.noteMetaText}>
                      {new Date(modifiedAt).toLocaleString()}
                    </Text>
                  </View>
                </View>

                <View style={styles.metaDivider} />

                <View style={styles.metaRow}>
                  <View style={styles.metaIcon}>
                    <Ionicons
                      name="cloud-done-outline"
                      size={17}
                      color={COLORS.green}
                    />
                  </View>
                  <View style={styles.metaTextWrap}>
                    <Text style={styles.metaLabel}>Draft status</Text>
                    <Text style={styles.autoSaveText}>
                      Auto-save enabled · Local draft
                    </Text>
                  </View>
                  <View style={styles.statusDot} />
                </View>
              </View>

              {/* Tip */}

              <View style={styles.tipCard}>
                <View style={styles.tipIcon}>
                  <Ionicons
                    name="bulb-outline"
                    size={20}
                    color={COLORS.primary}
                  />
                </View>

                <View style={styles.tipTextWrap}>
                  <Text style={styles.tipTitle}>A little tip</Text>

                  <Text style={styles.tipText}>
                    A clear title, a realistic due date, and a short description
                    make tasks easier to complete.
                  </Text>
                </View>
              </View>

              {/* Footer actions */}

              <View style={styles.footer}>
                <Pressable
                  onPress={cancel}
                  disabled={loading}
                  style={[
                    styles.cancelButton,

                    loading && styles.disabledButton,
                  ]}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={() => void saveTodo()}
                  disabled={loading || recordingBusy || isRecording}
                  style={[
                    styles.saveButton,

                    (loading || recordingBusy || isRecording) &&
                      styles.disabledButton,
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={20}
                        color="#FFFFFF"
                      />

                      <Text style={styles.saveButtonText}>
                        {isEditing
                          ? "Save note"
                          : isQuickNote
                            ? "Save quick note"
                            : "Create note"}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>

              <Text style={styles.footerNote}>
                Your progress starts with one small step.
              </Text>
            </>
          )}
          <Modal
            visible={colorPaletteVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setColorPaletteVisible(false)}
          >
            <Pressable
              style={styles.colorModalOverlay}
              onPress={() => setColorPaletteVisible(false)}
            >
              <Pressable
                style={styles.colorPaletteCard}
                onPress={(event) => event.stopPropagation()}
              >
                <View style={styles.colorPaletteHeader}>
                  <Text style={styles.colorPaletteTitle}>Text Color</Text>

                  <Pressable onPress={() => setColorPaletteVisible(false)}>
                    <Ionicons name="close" size={23} color="#19213D" />
                  </Pressable>
                </View>

                <View style={styles.colorGrid}>
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
                        styles.colorSwatch,
                        { backgroundColor: color },
                        textColor === color && styles.selectedColorSwatch,
                        color === "#FFFFFF" && styles.whiteColorSwatch,
                      ]}
                    >
                      {textColor === color && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={color === "#FFFFFF" ? "#19213D" : "#FFFFFF"}
                        />
                      )}
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.selectedColorLabel}>
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
              style={styles.fontModalOverlay}
              onPress={() => setFontPickerVisible(false)}
            >
              <Pressable
                style={styles.fontModalCard}
                onPress={(event) => event.stopPropagation()}
              >
                <View style={styles.fontModalHeader}>
                  <Text style={styles.fontModalTitle}>Choose Font</Text>

                  <Pressable onPress={() => setFontPickerVisible(false)}>
                    <Ionicons name="close" size={23} color="#19213D" />
                  </Pressable>
                </View>

                {fontFamilies.map((font) => (
                  <Pressable
                    key={font}
                    style={[
                      styles.fontOption,
                      fontFamily === font && styles.fontOptionActive,
                    ]}
                    onPress={() => {
                      setFontFamily(font);
                      setFontPickerVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.fontOptionText,
                        { fontFamily: font === "System" ? undefined : font },
                        fontFamily === font && styles.fontOptionTextActive,
                      ]}
                    >
                      {font === "System" ? "Default System Font" : font}
                    </Text>

                    {fontFamily === font && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#2563EB"
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
              style={styles.fontModalOverlay}
              onPress={() => setSpacingModalVisible(false)}
            >
              <Pressable
                style={styles.fontModalCard}
                onPress={(event) => event.stopPropagation()}
              >
                <View style={styles.fontModalHeader}>
                  <Text style={styles.fontModalTitle}>Text Spacing</Text>
                  <Pressable
                    onPress={() => setSpacingModalVisible(false)}
                    accessibilityLabel="Close text spacing"
                  >
                    <Ionicons name="close" size={23} color="#19213D" />
                  </Pressable>
                </View>

                <Text style={styles.spacingSettingLabel}>Line spacing</Text>
                <Text style={styles.spacingSettingHint}>
                  Controls the vertical distance between lines.
                </Text>
                <View style={styles.spacingControlRow}>
                  <Pressable
                    style={styles.spacingStepButton}
                    onPress={() =>
                      setLineSpacing((value) => Math.max(16, value - 2))
                    }
                    accessibilityLabel="Decrease line spacing"
                  >
                    <Ionicons name="remove" size={20} color="#19213D" />
                  </Pressable>
                  <Text style={styles.spacingValue}>{lineSpacing} px</Text>
                  <Pressable
                    style={styles.spacingStepButton}
                    onPress={() =>
                      setLineSpacing((value) => Math.min(40, value + 2))
                    }
                    accessibilityLabel="Increase line spacing"
                  >
                    <Ionicons name="add" size={20} color="#19213D" />
                  </Pressable>
                </View>

                <View style={styles.spacingDivider} />

                <Text style={styles.spacingSettingLabel}>Letter spacing</Text>
                <Text style={styles.spacingSettingHint}>
                  Controls the horizontal distance between characters.
                </Text>
                <View style={styles.spacingControlRow}>
                  <Pressable
                    style={styles.spacingStepButton}
                    onPress={() =>
                      setLetterSpacing((value) =>
                        Math.max(-1, Math.round((value - 0.25) * 100) / 100),
                      )
                    }
                    accessibilityLabel="Decrease letter spacing"
                  >
                    <Ionicons name="remove" size={20} color="#19213D" />
                  </Pressable>
                  <Text style={styles.spacingValue}>
                    {letterSpacing.toFixed(2)} px
                  </Text>
                  <Pressable
                    style={styles.spacingStepButton}
                    onPress={() =>
                      setLetterSpacing((value) =>
                        Math.min(3, Math.round((value + 0.25) * 100) / 100),
                      )
                    }
                    accessibilityLabel="Increase letter spacing"
                  >
                    <Ionicons name="add" size={20} color="#19213D" />
                  </Pressable>
                </View>

                <View style={styles.spacingActionRow}>
                  <Pressable
                    style={styles.spacingResetButton}
                    onPress={() => {
                      setLineSpacing(24);
                      setLetterSpacing(0);
                    }}
                  >
                    <Text style={styles.spacingResetText}>Reset</Text>
                  </Pressable>
                  <Pressable
                    style={styles.spacingDoneButton}
                    onPress={() => setSpacingModalVisible(false)}
                  >
                    <Text style={styles.spacingDoneText}>Done</Text>
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
            <SafeAreaView style={styles.drawingScreen}>
              <View style={styles.drawingHeader}>
                <Pressable
                  style={styles.drawingHeaderButton}
                  onPress={() => setDrawingModalVisible(false)}
                  accessibilityLabel="Close drawing editor"
                >
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </Pressable>
                <View style={styles.drawingHeaderText}>
                  <Text style={styles.drawingTitle}>Handwriting input</Text>
                  <Text style={styles.drawingSubtitle}>
                    Select Pen or Pencil, then write with your finger or stylus
                  </Text>
                </View>
                <Pressable
                  style={styles.drawingSaveButton}
                  onPress={() => void saveDrawing()}
                >
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  <Text style={styles.drawingSaveButtonText}>Save</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.drawingScrollView}
                contentContainerStyle={styles.drawingScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                scrollEnabled={!currentDrawingStroke}
              >
                <View style={styles.drawingToolbar}>
                  <Pressable
                    style={styles.drawingToolButton}
                    onPress={undoDrawing}
                    accessibilityLabel="Undo stroke"
                  >
                    <Ionicons
                      name="arrow-undo-outline"
                      size={20}
                      color={COLORS.text}
                    />
                  </Pressable>
                  <Pressable
                    style={styles.drawingToolButton}
                    onPress={redoDrawing}
                    accessibilityLabel="Redo stroke"
                  >
                    <Ionicons
                      name="arrow-redo-outline"
                      size={20}
                      color={COLORS.text}
                    />
                  </Pressable>
                  <Pressable
                    style={[
                      styles.drawingToolButton,
                      drawingTool === "pen" &&
                        !drawingEraser &&
                        styles.drawingToolButtonActive,
                    ]}
                    onPress={() => {
                      setDrawingTool("pen");
                      setDrawingEraser(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: drawingTool === "pen" && !drawingEraser,
                    }}
                    accessibilityLabel="Select pen tool"
                  >
                    <Ionicons
                      name="create-outline"
                      size={20}
                      color={
                        drawingTool === "pen" && !drawingEraser
                          ? COLORS.primary
                          : COLORS.text
                      }
                    />
                  </Pressable>
                  <Pressable
                    style={[
                      styles.drawingToolButton,
                      drawingTool === "pencil" &&
                        !drawingEraser &&
                        styles.drawingToolButtonActive,
                    ]}
                    onPress={() => {
                      setDrawingTool("pencil");
                      setDrawingEraser(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: drawingTool === "pencil" && !drawingEraser,
                    }}
                    accessibilityLabel="Select pencil tool"
                  >
                    <Ionicons
                      name="pencil-outline"
                      size={20}
                      color={
                        drawingTool === "pencil" && !drawingEraser
                          ? COLORS.primary
                          : COLORS.text
                      }
                    />
                  </Pressable>
                  <Pressable
                    style={[
                      styles.drawingToolButton,
                      drawingEraser && styles.drawingToolButtonActive,
                    ]}
                    onPress={() => setDrawingEraser((value) => !value)}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle eraser"
                  >
                    <Ionicons
                      name="backspace-outline"
                      size={20}
                      color={drawingEraser ? COLORS.primary : COLORS.text}
                    />
                  </Pressable>
                  <Pressable
                    style={styles.drawingToolButton}
                    onPress={clearDrawingCanvas}
                    accessibilityLabel="Clear canvas"
                  >
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color={COLORS.red}
                    />
                  </Pressable>
                  <View style={styles.drawingBrushControl}>
                    <Text style={styles.drawingBrushLabel}>Brush</Text>
                    {[2, 4, 7, 11].map((size) => (
                      <Pressable
                        key={size}
                        style={[
                          styles.brushSizeOption,
                          drawingBrushSize === size &&
                            styles.brushSizeOptionActive,
                        ]}
                        onPress={() => {
                          setDrawingBrushSize(size);
                          setDrawingEraser(false);
                        }}
                        accessibilityLabel={`Brush size ${size}`}
                      >
                        <View
                          style={[
                            styles.brushDot,
                            { width: size + 3, height: size + 3 },
                          ]}
                        />
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.drawingColorRow}>
                  {[
                    "#19213D",
                    "#DC2626",
                    "#2563EB",
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
                      accessibilityRole="button"
                      accessibilityLabel={`Drawing color ${color}`}
                      accessibilityState={{
                        selected: drawingColor === color && !drawingEraser,
                      }}
                      style={[
                        styles.drawingColorSwatch,
                        { backgroundColor: color },
                        drawingColor === color &&
                          !drawingEraser &&
                          styles.drawingColorSwatchSelected,
                        color === "#FFFFFF" && styles.drawingWhiteSwatch,
                      ]}
                    >
                      {drawingColor === color && !drawingEraser ? (
                        <Ionicons
                          name="checkmark"
                          size={15}
                          color={color === "#FFFFFF" ? COLORS.text : "#FFFFFF"}
                        />
                      ) : null}
                    </Pressable>
                  ))}
                  <Text style={styles.drawingColorHint}>
                    {drawingEraser
                      ? "Eraser on"
                      : drawingTool === "pencil"
                        ? "Pencil selected"
                        : "Pen selected"}
                  </Text>
                </View>

                <View style={styles.handwritingRecognitionBar}>
                  <View style={styles.handwritingLanguageChoices}>
                    <Pressable
                      style={[
                        styles.handwritingLanguageButton,
                        drawingLanguage === "ta" &&
                          styles.handwritingLanguageButtonActive,
                      ]}
                      onPress={() => {
                        setDrawingLanguage("ta");
                        setDrawingRecognitionStatus(
                          "தமிழ் எழுத்துகளை மாற்றுகிறது…",
                        );
                        void recognizeHandwriting(undefined, "ta");
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Recognize Tamil handwriting"
                    >
                      <Text
                        style={[
                          styles.handwritingLanguageText,
                          drawingLanguage === "ta" &&
                            styles.handwritingLanguageTextActive,
                        ]}
                      >
                        தமிழ்
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.handwritingLanguageButton,
                        drawingLanguage === "en-US" &&
                          styles.handwritingLanguageButtonActive,
                      ]}
                      onPress={() => {
                        // Do not ask the English handwriting model to interpret Tamil strokes.
                        // Recognize Tamil first, then call the backend translation endpoint.
                        setDrawingLanguage("en-US");
                        setDrawingRecognitionStatus(
                          "முதலில் தமிழில் அடையாளம் கண்டு English-க்கு மொழிபெயர்க்கிறது…",
                        );
                        void recognizeHandwriting(undefined, "ta", true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Translate Tamil handwriting to English"
                    >
                      <Text
                        style={[
                          styles.handwritingLanguageText,
                          drawingLanguage === "en-US" &&
                            styles.handwritingLanguageTextActive,
                        ]}
                      >
                        English
                      </Text>
                    </Pressable>
                  </View>
                  <Pressable
                    style={[
                      styles.handwritingConvertButton,
                      drawingRecognitionBusy &&
                        styles.handwritingConvertButtonDisabled,
                    ]}
                    onPress={() => void recognizeHandwriting()}
                    disabled={
                      drawingRecognitionBusy ||
                      (drawingStrokes.length === 0 && !currentDrawingStroke)
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Convert handwriting to editable text"
                  >
                    {drawingRecognitionBusy ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="text-outline" size={16} color="#FFFFFF" />
                    )}
                    <Text style={styles.handwritingConvertButtonText}>
                      {drawingRecognitionBusy
                        ? "Converting…"
                        : "Convert to text"}
                    </Text>
                  </Pressable>
                </View>
                {!!drawingRecognitionStatus && (
                  <Text style={styles.handwritingRecognitionStatus}>
                    {drawingRecognitionStatus}
                  </Text>
                )}

                <View style={styles.handwritingTextPanel}>
                  <Text style={styles.handwritingTextLabel}>
                    Editable text version
                  </Text>
                  <TextInput
                    value={drawingText}
                    onChangeText={setDrawingText}
                    placeholder="Type or correct the words represented by your handwriting…"
                    placeholderTextColor="#8792A7"
                    multiline
                    textAlignVertical="top"
                    style={styles.handwritingTextInput}
                    accessibilityLabel="Editable text version of handwriting"
                  />
                  <Text style={styles.handwritingTextHint}>
                    Recognized words appear here automatically after you pause.
                    You can also tap Convert to text, then edit the result
                    before saving.
                  </Text>
                </View>

                <View style={styles.handwritingLivePreview}>
                  <Text style={styles.handwritingLivePreviewLabel}>
                    Text preview above sketch
                  </Text>
                  <Text
                    numberOfLines={3}
                    style={styles.handwritingLivePreviewText}
                  >
                    {drawingText.trim()
                      ? drawingText
                      : "Your typed words will appear here as you type…"}
                  </Text>
                </View>

                <View style={styles.drawingCanvasOuter}>
                  <View
                    ref={drawingCanvasCaptureRef}
                    collapsable={false}
                    style={styles.drawingCanvas}
                    onLayout={(event) => {
                      const { width, height } = event.nativeEvent.layout;
                      setDrawingCanvasSize({ width, height });
                    }}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
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
                      viewBox={`0 0 ${drawingCanvasSize.width} ${drawingCanvasSize.height}`}
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
                <Text style={styles.drawingFooterHint}>
                  Write a word, pause for recognition, or tap Convert to text.
                  Save stores the PNG and editable text together.
                </Text>
              </ScrollView>
            </SafeAreaView>
          </Modal>

          <Modal
            visible={linkModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setLinkModalVisible(false)}
          >
            <Pressable
              style={styles.fontModalOverlay}
              onPress={() => setLinkModalVisible(false)}
            >
              <Pressable
                style={styles.fontModalCard}
                onPress={(event) => event.stopPropagation()}
              >
                <Text style={styles.fontModalTitle}>Insert hyperlink</Text>

                <TextInput
                  value={linkUrl}
                  onChangeText={setLinkUrl}
                  placeholder="https://example.com"
                  placeholderTextColor={COLORS.secondaryText}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.hyperlinkInput}
                />

                <View style={styles.fontModalActions}>
                  <Pressable
                    style={styles.toolButton}
                    onPress={() => setLinkModalVisible(false)}
                  >
                    <Text style={styles.toolText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    style={styles.toolButton}
                    onPress={handleInsertLink}
                  >
                    <Text style={styles.toolText}>Insert link</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  videoPreviewCard: {
    width: 220,
    marginTop: 12,
    padding: 8,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7EAF3",
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
    paddingHorizontal: 18,

    paddingTop: 12,

    paddingBottom: 34,
  },

  header: {
    flexDirection: "row",

    alignItems: "center",

    marginBottom: 20,

    gap: 12,
  },

  backButton: {
    width: 44,

    height: 44,

    borderRadius: 15,

    backgroundColor: COLORS.surface,

    borderWidth: 1,

    borderColor: COLORS.border,

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

    letterSpacing: -0.5,
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
    minHeight: 150,

    borderRadius: 24,

    backgroundColor: COLORS.primary,

    padding: 22,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    marginBottom: 28,

    overflow: "hidden",
  },

  heroCopy: {
    flex: 1,

    paddingRight: 10,
  },

  heroEyebrow: {
    color: "#DCDDFE",

    fontSize: 10,

    fontWeight: "800",

    letterSpacing: 1.7,
  },

  heroTitle: {
    marginTop: 8,

    color: "#FFFFFF",

    fontSize: 27,

    fontWeight: "800",

    letterSpacing: -0.7,
  },

  heroSubtitle: {
    marginTop: 7,

    color: "#E6E7FF",

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
    color: "#19213D",
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
    backgroundColor: "#F8F9FD",
    borderWidth: 1,
    borderColor: "#E7EAF3",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 14,
    gap: 4,
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
    color: "#929AB0",
    marginRight: 3,
  },

  toolbarSeparator: {
    height: 1,
    backgroundColor: "#E8EBF3",
    marginHorizontal: 2,
  },

  spacingSettingLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#19213D",
    marginTop: 12,
  },
  spacingSettingHint: {
    fontSize: 12,
    color: "#7B849B",
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
    color: "#19213D",
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
    backgroundColor: "#2563EB",
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
    borderColor: "#E9ECF5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  toolButtonActive: {
    backgroundColor: "#EEEEFF",
    borderColor: "#C9CBFF",
  },

  toolText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#59637C",
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
    borderColor: "#E9ECF5",
  },

  fontSizeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#59637C",
  },

  characterCount: {
    fontSize: 11,
    color: "#929AB0",
    paddingHorizontal: 4,
  },

  card: {
    backgroundColor: COLORS.surface,

    borderRadius: 22,

    borderWidth: 1,

    borderColor: COLORS.border,

    padding: 18,

    marginBottom: 27,
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

    borderColor: "#D6D7FF",
  },

  alignmentButton: {
    minWidth: 54,

    height: 38,

    paddingHorizontal: 12,

    borderRadius: 10,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: COLORS.muted,
  },

  toolbarDivider: {
    height: 24,

    width: 1,

    backgroundColor: COLORS.border,

    marginHorizontal: 2,
  },

  fontSizeButton: {
    height: 34,

    minWidth: 34,

    borderRadius: 10,

    backgroundColor: COLORS.muted,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "center",

    paddingHorizontal: 4,
  },

  largeA: {
    fontSize: 16,
  },

  toolbarSpacer: {
    flex: 1,
  },

  quickNotePatternOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 68,
    overflow: "hidden",
    opacity: 0.16,
    justifyContent: "space-around",
  },
  quickNotePatternOverlayText: {
    color: "#48536D",
    fontSize: 16,
    letterSpacing: 3,
    textAlign: "center",
    height: 26,
  },
  quickNoteHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  quickNoteTemplateHint: {
    marginTop: 4,
    color: "#758195",
    fontSize: 12,
    fontWeight: "500",
  },
  quickNoteTemplateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#5B5FEF",
    shadowColor: "#5B5FEF",
    shadowOpacity: 0.18,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  quickNoteTemplateButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  quickNoteCustomCard: {
    borderWidth: 1,
    borderColor: "rgba(226,231,241,0.95)",
    borderRadius: 26,
    padding: 16,
    overflow: "hidden",
    shadowColor: "#26324D",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  quickNoteSelectedSwatch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: "#F7F8FC",
    borderWidth: 1,
    borderColor: "#E8EAF2",
  },
  quickNoteSelectedSwatchDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(20,30,50,0.18)",
  },
  quickNoteSelectedSwatchText: {
    color: "#6F7890",
    fontSize: 10,
    fontWeight: "700",
  },
  quickNoteGalleryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  quickNoteGalleryTitle: {
    color: "#172033",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.45,
  },
  quickNoteGallerySubtitle: {
    color: "#788197",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  quickNoteGalleryCount: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: "#EDE7FF",
    borderWidth: 1,
    borderColor: "#D7CCFF",
  },
  quickNoteGalleryCountText: {
    color: "#6651A8",
    fontSize: 12,
    fontWeight: "800",
  },
  quickNoteBackgroundTabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 14,
    paddingRight: 6,
  },
  quickNoteBackgroundTab: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#F5F6FA",
    borderWidth: 1,
    borderColor: "#E9ECF2",
  },
  quickNoteBackgroundTabActive: {
    backgroundColor: "#292A50",
    borderColor: "#292A50",
  },
  quickNoteBackgroundTabText: {
    color: "#687287",
    fontSize: 12,
    fontWeight: "600",
  },
  quickNoteBackgroundTabTextActive: { color: "#FFFFFF", fontWeight: "800" },
  quickNoteBackgroundGrid: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 6,
  },
  quickNoteBackgroundTile: {
    width: 82,
    height: 76,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(40,55,80,0.10)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  quickNoteBackgroundTileSelected: {
    borderWidth: 2.5,
    borderColor: "#6258E8",
    transform: [{ scale: 0.97 }],
  },
  quickNoteTilePattern: {
    color: "rgba(48,62,80,0.30)",
    fontSize: 13,
    lineHeight: 17,
    textAlign: "center",
  },
  quickNoteTileCheck: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  quickNoteGalleryHint: { color: "#7B8497", fontSize: 11, marginTop: 10 },
  quickNoteCustomSection: {
    marginHorizontal: -2,
    marginBottom: 20,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "rgba(226,230,240,0.95)",
  },
  quickNotePatternChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  quickNotePatternChoice: {
    minWidth: 66,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.58)",
    borderWidth: 1,
    borderColor: "rgba(90,100,125,0.18)",
  },
  quickNotePatternChoiceSelected: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  quickNotePatternPreview: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "700",
    minHeight: 25,
  },
  quickNotePatternLabel: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 3,
  },
  quickNotePatternPreviewArea: {
    minHeight: 28,
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 12,
    borderRadius: 8,
    opacity: 0.35,
  },
  quickNotePatternPreviewText: {
    color: "#48536D",
    fontSize: 17,
    letterSpacing: 2,
    textAlign: "center",
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
    minHeight: 130,

    color: COLORS.text,

    lineHeight: 24,

    padding: 14,

    borderRadius: 14,

    borderWidth: 1,

    borderColor: COLORS.border,

    backgroundColor: "#FBFCFF",
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

  characterCount: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.secondaryText,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: "hidden",
    marginLeft: 6,
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

  imagePreview: {
    width: "100%",

    height: 190,

    borderRadius: 13,

    backgroundColor: COLORS.muted,
  },

  attachmentFileName: {
    color: COLORS.secondaryText,

    fontSize: 11,

    marginTop: 9,
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

    backgroundColor: "#EEEEFF",

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

    minHeight: 53,

    borderRadius: 16,

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
    borderColor: "#E7EAF3",
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginTop: 16,
    marginBottom: 16,
    gap: 2,
    shadowColor: "#19213D",
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
    backgroundColor: "#F1F2FF",
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
    backgroundColor: "#EEF0F6",
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
    shadowOffset: {
      width: 0,
      height: 8,
    },
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
    color: "#1D4ED8",
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
    shadowColor: "#172554",
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
    backgroundColor: "#EAF0FF",
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
    backgroundColor: "#EAF0FF",
    borderColor: COLORS.primary,
  },
  brushDot: {
    borderRadius: 20,
    backgroundColor: "#25324D",
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
    backgroundColor: "#EAF0FF",
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
    color: "#25324D",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
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
    color: "#8490A5",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 7,
  },
  handwritingLivePreview: {
    backgroundColor: "#EEF3FF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D9E3FF",
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
    maxHeight: 78,
  },
  handwritingLivePreviewLabel: {
    color: "#5B6F9A",
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  handwritingLivePreviewText: {
    color: "#25324D",
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
    borderColor: "#D8E0ED",
    overflow: "hidden",
    shadowColor: "#172554",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.055,
    shadowRadius: 8,
    elevation: 2,
  },
  drawingFooterHint: {
    color: "#8490A5",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
    paddingTop: 7,
    paddingBottom: 10,
  },

  quickNoteAppliedTemplate: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    marginBottom: 14,
    borderRadius: 15,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  quickNoteAppliedTemplateIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quickNoteAppliedTemplateEmoji: { fontSize: 22 },
  quickNoteAppliedTemplateLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#8A91A0",
  },
  quickNoteAppliedTemplateTitle: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: "800",
    color: "#253047",
  },
  quickNoteAppliedTemplateCategory: { fontSize: 10, fontWeight: "800" },
  quickNoteSimpleContainer: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 28,
    paddingHorizontal: 2,
  },
  quickNoteDescriptionInput: {
    minHeight: 260,
    paddingTop: 14,
    paddingBottom: 14,
  },
});
