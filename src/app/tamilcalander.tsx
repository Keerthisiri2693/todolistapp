import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";

const API_BASE_URL =
  "https://todolistbackend-855c.onrender.com/api/tamil-calendar";
const LOCATION_KEY = "thiruvarur";
const LOCATION_LABEL = "திருவாரூர், தமிழ்நாடு";
const COLORS = {
  background: "#F4F8F5",
  surface: "#FFFFFF",
  primary: "#26745E",
  primaryDark: "#174F40",
  primarySoft: "#E3F2E9",
  text: "#1D332B",
  muted: "#718078",
  border: "#E6EDE8",
  gold: "#C58B2A",
  goldSoft: "#FFF5DE",
  danger: "#B42318",
  dangerSoft: "#FDECEA",
  blue: "#386CB0",
  blueSoft: "#EAF1FC",
};

type AnyData = Record<string, any>;

const WEEKDAYS = [
  "ஞாயிற்றுக்கிழமை",
  "திங்கட்கிழமை",
  "செவ்வாய்க்கிழமை",
  "புதன்கிழமை",
  "வியாழக்கிழமை",
  "வெள்ளிக்கிழமை",
  "சனிக்கிழமை",
];

const TAMIL_MONTHS: Record<string, string> = {
  Chithirai: "சித்திரை",
  Vaikasi: "வைகாசி",
  Aani: "ஆனி",
  Aadi: "ஆடி",
  Avani: "ஆவணி",
  Purattasi: "புரட்டாசி",
  Aippasi: "ஐப்பசி",
  Karthigai: "கார்த்திகை",
  Margazhi: "மார்கழி",
  Thai: "தை",
  Maasi: "மாசி",
  Panguni: "பங்குனி",
  Pushya: "புஷ்ய",
};

function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function safeText(value: any, fallback = "தகவல் இல்லை"): string {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") {
    const candidate =
      value.ta ??
      value.tamil ??
      value.name?.ta ??
      value.name?.tamil ??
      value.name ??
      value.en ??
      value.english ??
      value.startTime ??
      value.start ??
      null;
    if (candidate !== null && candidate !== undefined && candidate !== "")
      return String(candidate);
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return String(value);
}

function formatTime(value: any): string {
  if (value === undefined || value === null || value === "")
    return "தகவல் இல்லை";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (value.start && value.end) return `${value.start} – ${value.end}`;
  if (value.from && value.to) return `${value.from} – ${value.to}`;
  if (value.startTime && value.endTime)
    return `${value.startTime} – ${value.endTime}`;
  if (value.start_time && value.end_time)
    return `${value.start_time} – ${value.end_time}`;
  return safeText(value);
}

function parseArray(value: any): AnyData[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function unwrapDay(response: any): AnyData {
  if (response?.data && !Array.isArray(response.data)) return response.data;
  return response ?? {};
}

function extractDays(response: any): AnyData[] {
  if (Array.isArray(response)) return response;
  const candidates = [
    response?.days,
    response?.items,
    response?.panchangam,
    response?.data?.days,
    response?.data?.items,
    response?.data?.panchangam,
    response?.data,
  ];
  return candidates.find(Array.isArray) ?? [];
}

function getRowDate(row: AnyData): string {
  return String(
    row?.date ?? row?.gregorian_date ?? row?.gregorianDate ?? "",
  ).slice(0, 10);
}

function extractFestivals(day: AnyData | null): string[] {
  if (!day) return [];
  const raw = day.festivals ?? day.events ?? day.festival ?? day.holidays;
  if (!raw) return [];
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) {
    return raw
      .map((item) =>
        typeof item === "string"
          ? item
          : (item?.name?.ta ??
            item?.name?.tamil ??
            item?.name ??
            item?.title ??
            item?.festival),
      )
      .filter(Boolean)
      .map(String);
  }
  if (typeof raw === "object") {
    const name = raw.name?.ta ?? raw.name?.tamil ?? raw.name ?? raw.title;
    return name ? [String(name)] : [];
  }
  return [];
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `HTTP ${response.status}${body ? ` — ${body.slice(0, 180)}` : ""}`,
    );
  }
  return response.json();
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionAccent} />
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

function InfoRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: any;
  accent?: boolean;
}) {
  const text = formatTime(value);
  const missing = text === "தகவல் இல்லை" || text === "API-ல் வழங்கப்படவில்லை";
  return (
    <View style={styles.infoRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          accent && styles.rowValueAccent,
          missing && styles.rowMissing,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>◌</Text>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

export default function TamilCalendarScreen() {
  const [selectedDate, setSelectedDate] = useState(localDateString());
  const [monthRows, setMonthRows] = useState<AnyData[]>([]);
  const [dayData, setDayData] = useState<AnyData | null>(null);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [monthError, setMonthError] = useState("");
  const [dayError, setDayError] = useState("");
  const [showAllPanchangam, setShowAllPanchangam] = useState(true);

  const selectedDateObject = useMemo(
    () => new Date(`${selectedDate}T12:00:00`),
    [selectedDate],
  );
  const year = selectedDateObject.getFullYear();
  const month = selectedDateObject.getMonth() + 1;
  const formattedDate = useMemo(
    () =>
      selectedDateObject.toLocaleDateString("ta-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [selectedDateObject],
  );

  const loadMonth = useCallback(async () => {
    setLoadingMonth(true);
    setMonthError("");
    try {
      const url = `${API_BASE_URL}/month?year=${year}&month=${month}&location=${LOCATION_KEY}`;
      const response = await getJson(url);
      const rows = extractDays(response);
      if (!rows.length) {
        console.log("Monthly calendar response:", response);
        throw new Error(
          "மாத API பதிலில் நாட்களின் பட்டியல் இல்லை. Backend response format-ஐ சரிபார்க்கவும்.",
        );
      }
      setMonthRows(rows);
    } catch (error: any) {
      setMonthError(error?.message ?? "மாதத் தகவலைப் பெற முடியவில்லை.");
      setMonthRows([]);
    } finally {
      setLoadingMonth(false);
    }
  }, [year, month]);

  const loadDay = useCallback(async () => {
    setLoadingDay(true);
    setDayError("");
    try {
      const url = `${API_BASE_URL}/day?date=${selectedDate}&location=${LOCATION_KEY}`;
      const response = await getJson(url);
      setDayData(unwrapDay(response));
    } catch (error: any) {
      setDayError(error?.message ?? "பஞ்சாங்கத் தகவலைப் பெற முடியவில்லை.");
      setDayData(null);
    } finally {
      setLoadingDay(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadMonth(), loadDay()]);
    setRefreshing(false);
  }, [loadMonth, loadDay]);

  const monthRow = monthRows.find((row) => getRowDate(row) === selectedDate);
  const detail = dayData ?? monthRow ?? null;
  const festivals = extractFestivals(detail);
  const marks: Record<string, any> = {};

  monthRows.forEach((row) => {
    const date = getRowDate(row);
    if (!date) return;
    if (extractFestivals(row).length || row?.holiday) {
      marks[date] = { marked: true, dotColor: COLORS.gold };
    }
  });

  marks[selectedDate] = {
    ...(marks[selectedDate] ?? {}),
    selected: true,
    selectedColor: COLORS.primary,
    selectedTextColor: "#FFFFFF",
  };

  const masa = detail?.masa;
  const masaRaw =
    masa?.ta ??
    masa?.en ??
    masa?.name?.ta ??
    masa?.name?.en ??
    masa?.name ??
    detail?.tamil_month ??
    detail?.tamilMonth;
  const tamilMonth = masaRaw
    ? (TAMIL_MONTHS[String(masaRaw)] ?? String(masaRaw))
    : safeText(detail?.tamil_month_name, "தகவல் இல்லை");

  const karanas = parseArray(detail?.karana_json ?? detail?.karanas);
  const durmuhurthams = parseArray(
    detail?.durmuhurtham_json ?? detail?.durmuhurthams,
  );
  const panchangRows: [string, any][] = [
    ["திதி", detail?.tithi_name ?? detail?.tithi],
    ["திதி முடியும் நேரம்", detail?.tithi_end ?? detail?.tithiEnd],
    ["நட்சத்திரம்", detail?.nakshatra_name ?? detail?.nakshatra],
    [
      "நட்சத்திரம் முடியும் நேரம்",
      detail?.nakshatra_end ?? detail?.nakshatraEnd,
    ],
    ["யோகம்", detail?.yoga_name ?? detail?.yoga],
    ["யோகம் முடியும் நேரம்", detail?.yoga_end ?? detail?.yogaEnd],
    [
      "கரணம்",
      karanas.length
        ? karanas
            .map(
              (item) =>
                `${safeText(item.name ?? item)}` +
                (item.end ? ` (${item.end})` : ""),
            )
            .join(", ")
        : detail?.karana,
    ],
    ["பக்ஷம்", detail?.paksha],
    ["சம்வத்ஸரம்", detail?.samvatsaram ?? detail?.samvatsara],
    ["அயனம்", detail?.ayana],
    ["ருது", detail?.ruthu ?? detail?.ritu],
    ["சூரிய ராசி", detail?.suryarashi ?? detail?.surya_rashi],
    ["சந்திர ராசி", detail?.chandrarashi ?? detail?.chandra_rashi],
    ["சூரிய உதயம்", detail?.sunrise],
    ["சூரிய அஸ்தமனம்", detail?.sunset],
    ["சந்திர உதயம்", detail?.moonrise],
    ["சந்திர அஸ்தமனம்", detail?.moonset],
  ];

  const timingRows: [string, any][] = [
    [
      "ராகு காலம்",
      detail?.rahukalam ?? detail?.rahu_kalam ?? detail?.rahuKalam,
    ],
    ["எமகண்டம்", detail?.yamagandam ?? detail?.yama_kalam ?? detail?.yamaganda],
    ["குளிகை", detail?.gulikai ?? detail?.gulika_kalam ?? detail?.gulika],
    ["நல்ல நேரம்", detail?.nalla_neram ?? detail?.nallaNeram],
    [
      "அபிஜித் முகூர்த்தம்",
      detail?.abhijit_muhurtham ?? detail?.abhijitMuhurtham,
    ],
    ["அமிர்த காலம்", detail?.amruthakalam ?? detail?.amritaKalam],
    ["வர்ஜ்யம்", detail?.varjyam],
    [
      "துர்முஹூர்த்தம்",
      durmuhurthams.length
        ? durmuhurthams
            .map(
              (item) =>
                `${item.start ?? item.from ?? ""} – ${item.end ?? item.to ?? ""}`,
            )
            .join(", ")
        : detail?.durmuhurtham,
    ],
  ];

  const availablePanchangCount = panchangRows.filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  ).length;
  const availableTimingCount = timingRows.filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  ).length;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        <View style={styles.topBar}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>தி</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>தமிழ் பாரம்பரியம்</Text>
            <Text style={styles.title}>தமிழ் காலண்டர்</Text>
            <Text style={styles.subtitle}>
              தேதி · பஞ்சாங்கம் · விசேஷ நாட்கள்
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onRefresh}
            style={styles.refreshButton}
          >
            <Text style={styles.refreshIcon}>↻</Text>
          </Pressable>
        </View>

        <View style={styles.locationPill}>
          <Text style={styles.locationPin}>●</Text>
          <Text style={styles.locationText}>{LOCATION_LABEL}</Text>
          <View style={styles.locationDivider} />
          <Text style={styles.timezone}>IST · UTC+5:30</Text>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.cardTopLine}>
            <View>
              <Text style={styles.cardEyebrow}>தேதியைத் தேர்வு செய்யவும்</Text>
              <Text style={styles.cardHeading}>மாத காலண்டர்</Text>
            </View>
            {loadingMonth && (
              <ActivityIndicator size="small" color={COLORS.primary} />
            )}
          </View>
          <Calendar
            current={selectedDate}
            enableSwipeMonths
            onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
            markedDates={marks}
            theme={{
              calendarBackground: COLORS.surface,
              backgroundColor: COLORS.surface,
              monthTextColor: COLORS.primaryDark,
              textMonthFontSize: 17,
              textMonthFontWeight: "800",
              textDayHeaderFontSize: 12,
              textDayHeaderFontWeight: "700",
              textSectionTitleColor: COLORS.muted,
              arrowColor: COLORS.primary,
              todayTextColor: COLORS.primary,
              selectedDayBackgroundColor: COLORS.primary,
              selectedDayTextColor: "#FFFFFF",
              dayTextColor: COLORS.text,
              textDisabledColor: "#C5CEC8",
              dotColor: COLORS.gold,
            }}
          />
          <View style={styles.calendarLegend}>
            <View style={styles.legendItem}>
              <View style={styles.legendDot} />
              <Text style={styles.legendText}>விசேஷ நாள்</Text>
            </View>
            <Pressable
              style={styles.todayButton}
              onPress={() => setSelectedDate(localDateString())}
            >
              <Text style={styles.todayButtonText}>இன்று பார்க்கவும் ↗</Text>
            </Pressable>
          </View>
          {!!monthError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{monthError}</Text>
              <Pressable onPress={loadMonth} style={styles.retryButton}>
                <Text style={styles.retryText}>மீண்டும் முயற்சி</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.dateHero}>
          <View style={styles.dateHeroTop}>
            <View style={styles.dateBadge}>
              <Text style={styles.dateBadgeText}>
                {WEEKDAYS[selectedDateObject.getDay()]}
              </Text>
            </View>
            <Text style={styles.dateYear}>{year}</Text>
          </View>
          <View style={styles.dateMainRow}>
            <Text style={styles.bigDate}>{selectedDateObject.getDate()}</Text>
            <View style={styles.dateDetails}>
              <Text style={styles.dateMonth}>{formattedDate}</Text>
              <Text style={styles.tamilMonth}>{tamilMonth}</Text>
              {!!(detail?.tamil_day ?? detail?.tamilDay) && (
                <Text style={styles.tamilDay}>
                  தமிழ் தேதி: {detail?.tamil_day ?? detail?.tamilDay}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.dateHeroFooter}>
            <Text style={styles.heroFooterText}>தேர்ந்தெடுத்த நாள்</Text>
            <Text style={styles.heroFooterText}>திருவாரூர் • தமிழ்நாடு</Text>
          </View>
        </View>

        {loadingDay && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.loadingText}>
              பஞ்சாங்க விவரங்களைப் பெறுகிறது…
            </Text>
          </View>
        )}
        {!!dayError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{dayError}</Text>
            <Pressable onPress={loadDay} style={styles.retryButton}>
              <Text style={styles.retryText}>மீண்டும் முயற்சி</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.sectionCard}>
          <SectionTitle
            title="பண்டிகைகள் & விசேஷ நாட்கள்"
            subtitle="தேர்ந்தெடுத்த தேதிக்கான நிகழ்வுகள்"
          />
          {festivals.length ? (
            festivals.map((name, index) => (
              <View key={`${name}-${index}`} style={styles.festivalItem}>
                <View style={styles.festivalIcon}>
                  <Text style={styles.festivalIconText}>✦</Text>
                </View>
                <Text style={styles.festivalText}>{name}</Text>
              </View>
            ))
          ) : detail?.holiday ? (
            <View style={styles.festivalItem}>
              <View style={styles.festivalIcon}>
                <Text style={styles.festivalIconText}>✦</Text>
              </View>
              <Text style={styles.festivalText}>
                அரசு விடுமுறை: {safeText(detail.holiday)}
              </Text>
            </View>
          ) : (
            <EmptyState text="இந்தத் தேதிக்கான பண்டிகைத் தகவல் API-ல் வழங்கப்படவில்லை." />
          )}
          {detail?.holiday && festivals.length > 0 && (
            <Text style={styles.holidayNote}>
              அரசு விடுமுறை: {safeText(detail.holiday)}
            </Text>
          )}
        </View>

        <View style={styles.sectionCard}>
          <SectionTitle
            title="தினசரி பஞ்சாங்கம்"
            subtitle={`${availablePanchangCount} விவரங்கள் கிடைக்கின்றன`}
          />
          <View style={styles.quickFacts}>
            <View style={styles.quickFact}>
              <Text style={styles.quickFactLabel}>திதி</Text>
              <Text style={styles.quickFactValue} numberOfLines={2}>
                {safeText(detail?.tithi_name ?? detail?.tithi)}
              </Text>
            </View>
            <View style={styles.quickFactDivider} />
            <View style={styles.quickFact}>
              <Text style={styles.quickFactLabel}>நட்சத்திரம்</Text>
              <Text style={styles.quickFactValue} numberOfLines={2}>
                {safeText(detail?.nakshatra_name ?? detail?.nakshatra)}
              </Text>
            </View>
            <View style={styles.quickFactDivider} />
            <View style={styles.quickFact}>
              <Text style={styles.quickFactLabel}>யோகம்</Text>
              <Text style={styles.quickFactValue} numberOfLines={2}>
                {safeText(detail?.yoga_name ?? detail?.yoga)}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setShowAllPanchangam((value) => !value)}
            style={styles.expandButton}
          >
            <Text style={styles.expandButtonText}>
              {showAllPanchangam
                ? "முழு விவரங்களை மறைக்கவும்"
                : "முழு பஞ்சாங்க விவரங்கள்"}
            </Text>
            <Text style={styles.expandChevron}>
              {showAllPanchangam ? "⌃" : "⌄"}
            </Text>
          </Pressable>
          {showAllPanchangam && (
            <View style={styles.rowsContainer}>
              {panchangRows.map(([label, value]) => (
                <InfoRow key={label} label={label} value={value} />
              ))}
            </View>
          )}
          {!detail && !loadingDay && (
            <EmptyState text="பஞ்சாங்கத் தகவல் கிடைக்கவில்லை. Backend connection மற்றும் API response-ஐச் சரிபார்க்கவும்." />
          )}
        </View>

        <View style={styles.sectionCard}>
          <SectionTitle
            title="நல்ல நேரம் & காலங்கள்"
            subtitle={`${availableTimingCount} நேர விவரங்கள் கிடைக்கின்றன`}
          />
          <View style={styles.timingBanner}>
            <Text style={styles.timingBannerIcon}>◷</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.timingBannerTitle}>நேர விவரங்கள்</Text>
              <Text style={styles.timingBannerSubtitle}>
                API வழங்கும் மதிப்புகள் மட்டும் காட்டப்படும்
              </Text>
            </View>
          </View>
          {timingRows.map(([label, value], index) => (
            <InfoRow
              key={label}
              label={label}
              value={value}
              accent={index < 3}
            />
          ))}
          <Text style={styles.disclaimer}>
            குறிப்பு: நல்ல நேரம், குளிகை, வர்ஜ்யம், அரசு விடுமுறை மற்றும் திருமண
            முகூர்த்தத் தகவல்கள் backend-ல் கணக்கிடப்பட்டு அல்லது நம்பகமான
            தரவிலிருந்து வழங்கப்பட்டால் மட்டுமே உறுதியாகக் காட்டப்படும்.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <SectionTitle
            title="தரவு நிலை"
            subtitle="API இணைப்பு மற்றும் தரவு முழுமை"
          />
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: detail ? COLORS.primary : COLORS.gold },
              ]}
            />
            <Text style={styles.statusLabel}>தினசரி API</Text>
            <Text style={styles.statusValue}>
              {detail
                ? "தரவு பெறப்பட்டது"
                : loadingDay
                  ? "பெறுகிறது…"
                  : "தரவு இல்லை"}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: monthRows.length
                    ? COLORS.primary
                    : COLORS.gold,
                },
              ]}
            />
            <Text style={styles.statusLabel}>மாத காலண்டர் API</Text>
            <Text style={styles.statusValue}>
              {monthRows.length
                ? `${monthRows.length} நாட்கள்`
                : loadingMonth
                  ? "பெறுகிறது…"
                  : "தரவு இல்லை"}
            </Text>
          </View>
          <Text style={styles.disclaimer}>
            ஏதேனும் விவரம் “தகவல் இல்லை” என வந்தால், அந்த field-ஐ backend
            response-ல் சேர்க்க வேண்டும். UI மட்டும் இல்லாத பஞ்சாங்கத் தரவை
            உருவாக்காது.
          </Text>
        </View>

        <Text style={styles.footer}>
          தமிழ் காலண்டர் · இடம்: {LOCATION_LABEL} · நேர மண்டலம்: Asia/Kolkata
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 36 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: { color: "#FFFFFF", fontSize: 23, fontWeight: "900" },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: { color: COLORS.text, fontSize: 25, fontWeight: "900", marginTop: 2 },
  subtitle: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshIcon: { color: COLORS.primary, fontSize: 27, fontWeight: "500" },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: COLORS.primarySoft,
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    gap: 7,
  },
  locationPin: { color: COLORS.primary, fontSize: 9 },
  locationText: { color: COLORS.primaryDark, fontSize: 12, fontWeight: "800" },
  locationDivider: {
    width: 1,
    height: 15,
    backgroundColor: "#B8D8C6",
    marginHorizontal: 2,
  },
  timezone: { color: COLORS.muted, fontSize: 10, fontWeight: "700" },
  calendarCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#173D2D",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardTopLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingTop: 4,
    marginBottom: 6,
  },
  cardEyebrow: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  cardHeading: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 3,
  },
  calendarLegend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 5,
    paddingTop: 8,
    paddingBottom: 2,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.gold,
  },
  legendText: { color: COLORS.muted, fontSize: 11, fontWeight: "600" },
  todayButton: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  todayButtonText: {
    color: COLORS.primaryDark,
    fontSize: 12,
    fontWeight: "800",
  },
  dateHero: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: 24,
    padding: 19,
    marginTop: 16,
    overflow: "hidden",
  },
  dateHeroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateBadge: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  dateBadgeText: { color: "#E5F5EC", fontSize: 11, fontWeight: "800" },
  dateYear: { color: "#B8D8C6", fontSize: 13, fontWeight: "800" },
  dateMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    marginTop: 8,
  },
  bigDate: {
    color: "#FFFFFF",
    fontSize: 68,
    fontWeight: "900",
    lineHeight: 78,
  },
  dateDetails: { flex: 1, paddingTop: 5 },
  dateMonth: {
    color: "#E2F1E8",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },
  tamilMonth: {
    color: "#D9E9A9",
    fontSize: 23,
    fontWeight: "900",
    marginTop: 5,
  },
  tamilDay: { color: "#D3E7DA", fontSize: 12, fontWeight: "700", marginTop: 5 },
  dateHeroFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
    marginTop: 12,
    paddingTop: 12,
  },
  heroFooterText: { color: "#BBD7C8", fontSize: 10, fontWeight: "700" },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 17,
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#173D2D",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.035,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 15,
  },
  sectionAccent: {
    width: 4,
    height: 33,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: "900" },
  sectionSubtitle: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  quickFacts: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#F3F8F4",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  quickFact: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  quickFactLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  quickFactValue: {
    color: COLORS.primaryDark,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 7,
    textAlign: "center",
  },
  quickFactDivider: { width: 1, backgroundColor: "#DDE9E0", marginVertical: 4 },
  expandButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    paddingVertical: 9,
  },
  expandButtonText: { color: COLORS.primary, fontSize: 12, fontWeight: "800" },
  expandChevron: { color: COLORS.primary, fontSize: 21, fontWeight: "800" },
  rowsContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 3,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2EF",
  },
  rowLabel: { flex: 1, color: COLORS.muted, fontSize: 12, lineHeight: 19 },
  rowValue: {
    flex: 1.15,
    color: COLORS.text,
    textAlign: "right",
    fontWeight: "800",
    fontSize: 12,
    lineHeight: 19,
  },
  rowValueAccent: { color: COLORS.primary, fontWeight: "900" },
  rowMissing: { color: "#A1ACA5", fontWeight: "500" },
  festivalItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  festivalIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: COLORS.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  festivalIconText: { color: COLORS.gold, fontSize: 15, fontWeight: "900" },
  festivalText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
    flex: 1,
    lineHeight: 20,
  },
  holidayNote: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 10,
  },
  emptyIcon: { color: "#A8C9B6", fontSize: 28, marginBottom: 3 },
  muted: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
  },
  timingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.blueSoft,
    padding: 13,
    borderRadius: 15,
    marginBottom: 5,
  },
  timingBannerIcon: { color: COLORS.blue, fontSize: 25, fontWeight: "700" },
  timingBannerTitle: { color: "#244E88", fontSize: 13, fontWeight: "900" },
  timingBannerSubtitle: { color: "#627DA2", fontSize: 10, marginTop: 3 },
  disclaimer: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 13,
    backgroundColor: "#F6F8F6",
    padding: 11,
    borderRadius: 12,
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 15,
  },
  loadingText: { color: COLORS.muted, fontSize: 12, fontWeight: "600" },
  errorBox: {
    backgroundColor: COLORS.dangerSoft,
    borderRadius: 14,
    padding: 13,
    marginTop: 12,
  },
  errorText: { color: COLORS.danger, fontSize: 12, lineHeight: 18 },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    marginTop: 9,
  },
  retryText: { color: COLORS.danger, fontSize: 12, fontWeight: "800" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 9,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: {
    flex: 1,
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  statusValue: { color: COLORS.text, fontSize: 12, fontWeight: "800" },
  footer: {
    color: "#8B9991",
    fontSize: 10,
    textAlign: "center",
    marginTop: 20,
    lineHeight: 17,
  },
});
