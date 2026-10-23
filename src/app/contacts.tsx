import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Contacts from "expo-contacts/legacy";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

type ContactItem = {
  id?: string;
  name?: string | null;
  phoneNumbers?: Array<{ number?: string | null }>;
  emails?: Array<{ email?: string | null }>;
};

export default function ContactsScreen() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      let permission = await Contacts.getPermissionsAsync();
      if (!permission.granted) {
        permission = await Contacts.requestPermissionsAsync();
      }

      if (!permission.granted) {
        Alert.alert(
          "Contacts Permission Required",
          "Allow contacts access in your device settings to view your contacts.",
          [
            { text: "Cancel", onPress: () => router.back(), style: "cancel" },
            { text: "Open Settings", onPress: () => void Linking.openSettings() },
          ]
        );
        setContacts([]);
        return;
      }

      const allContacts: ContactItem[] = [];
      let pageOffset = 0;
      const pageSize = 500;

      while (true) {
        const result = await Contacts.getContactsAsync({
          fields: [
            Contacts.Fields.Name,
            Contacts.Fields.PhoneNumbers,
            Contacts.Fields.Emails,
          ],
          sort: Contacts.SortTypes.FirstName,
          pageSize,
          pageOffset,
        });

        allContacts.push(...(result.data as ContactItem[]));
        if (!result.hasNextPage || result.data.length === 0) break;
        pageOffset += result.data.length;
      }

      setContacts(allContacts);
    } catch (error) {
      console.error("Failed to load contacts:", error);
      Alert.alert("Could not load contacts", "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) => {
      const searchable = [
        contact.name ?? "",
        ...(contact.phoneNumbers ?? []).map((phone) => phone.number ?? ""),
        ...(contact.emails ?? []).map((email) => email.email ?? ""),
      ].join(" ").toLowerCase();
      return searchable.includes(query);
    });
  }, [contacts, search]);

  const initials = (name?: string | null) =>
    (name?.trim() || "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={22} color="#20332C" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>My Contacts</Text>
          <Text style={styles.subtitle}>{contacts.length} contacts on this device</Text>
        </View>
        <Pressable
          onPress={() => void loadContacts()}
          accessibilityRole="button"
          accessibilityLabel="Refresh contacts"
          style={styles.refreshButton}
        >
          <Ionicons name="refresh-outline" size={21} color="#208A75" />
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={20} color="#71827D" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, phone or email"
          placeholderTextColor="#87958E"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel="Search contacts"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={20} color="#87958E" />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#208A75" />
          <Text style={styles.loadingText}>Loading contacts…</Text>
        </View>
      ) : (
        <FlatList
          data={filteredContacts}
          keyExtractor={(item, index) => item.id ?? `${item.name ?? "contact"}-${index}`}
          contentContainerStyle={[
            styles.listContent,
            filteredContacts.length === 0 && styles.emptyList,
          ]}
          onRefresh={() => void loadContacts()}
          refreshing={loading}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="people-outline" size={46} color="#A3B4AA" />
              <Text style={styles.emptyTitle}>
                {contacts.length === 0 ? "No contacts found" : "No matching contacts"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {contacts.length === 0
                  ? "No contacts are available to display."
                  : "Try another name, phone number or email."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const phone = item.phoneNumbers?.[0]?.number;
            const email = item.emails?.[0]?.email;
            return (
              <View style={styles.contactCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(item.name)}</Text>
                </View>
                <View style={styles.contactDetails}>
                  <Text style={styles.contactName} numberOfLines={1}>
                    {item.name || "Unnamed Contact"}
                  </Text>
                  {phone ? (
                    <Text style={styles.contactInfo} numberOfLines={2}>
                      <Ionicons name="call-outline" size={13} color="#71827D" /> {phone}
                    </Text>
                  ) : null}
                  {email ? (
                    <Text style={styles.contactInfo} numberOfLines={2}>
                      <Ionicons name="mail-outline" size={13} color="#71827D" /> {email}
                    </Text>
                  ) : null}
                  {!phone && !email ? (
                    <Text style={styles.noDetails}>No phone number or email</Text>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F8F5" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DCE9E3",
  },
  headerCopy: { flex: 1 },
  title: { color: "#172F2B", fontSize: 23, fontWeight: "800" },
  subtitle: { color: "#71827D", fontSize: 12, marginTop: 4 },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#DDF4EB",
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    marginHorizontal: 18,
    marginBottom: 14,
    paddingHorizontal: 14,
    height: 52,
    borderWidth: 1,
    borderColor: "#DCE9E3",
  },
  searchInput: { flex: 1, marginLeft: 10, color: "#172F2B", fontSize: 14 },
  listContent: { paddingHorizontal: 18, paddingBottom: 28 },
  emptyList: { flexGrow: 1 },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#DCE9E3",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#DDF4EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  avatarText: { fontSize: 16, fontWeight: "800", color: "#208A75" },
  contactDetails: { flex: 1 },
  contactName: { color: "#172F2B", fontSize: 15, fontWeight: "700", marginBottom: 5 },
  contactInfo: { color: "#64756E", fontSize: 13, marginTop: 3 },
  noDetails: { color: "#87958E", fontSize: 12, marginTop: 3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  loadingText: { marginTop: 12, color: "#71827D", fontSize: 13 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#20332C", marginTop: 12 },
  emptySubtitle: { color: "#71827D", textAlign: "center", marginTop: 6, lineHeight: 20 },
});
