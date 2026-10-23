
import React, { useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSecurity } from "./SecurityProvider";

export default function ProtectedNoteContent({
  noteId,
  children,
}: {
  noteId: string;
  children: React.ReactNode;
}) {
  const { isNoteLocked, unlockNoteWithPin } = useSecurity();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  if (!isNoteLocked(noteId)) {
    return <>{children}</>;
  }

  const unlock = async () => {
    const success = await unlockNoteWithPin(noteId, pin);

    if (!success) {
      setPin("");
      setError("Incorrect PIN. Please try again.");
      return;
    }

    setError("");
  };

  return (
    <View
      style={{
        padding: 24,
        borderRadius: 18,
        backgroundColor: "#F5F6FB",
        alignItems: "center",
        margin: 16,
      }}
    >
      <Text style={{ fontSize: 32 }}>🔒</Text>

      <Text
        style={{
          fontSize: 20,
          fontWeight: "700",
          color: "#202938",
          marginTop: 12,
        }}
      >
        Private note
      </Text>

      <Text
        style={{
          color: "#697586",
          textAlign: "center",
          marginTop: 8,
        }}
      >
        Enter your security PIN to view this note.
      </Text>

      <TextInput
        value={pin}
        onChangeText={value =>
          setPin(value.replace(/\D/g, "").slice(0, 8))
        }
        placeholder="Enter PIN"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        style={{
          width: "100%",
          marginTop: 16,
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: "#DCE1EA",
          borderRadius: 12,
          padding: 14,
          textAlign: "center",
        }}
      />

      {!!error && (
        <Text style={{ color: "#DC2626", marginTop: 8 }}>
          {error}
        </Text>
      )}

      <Pressable
        onPress={() => void unlock()}
        style={{
          backgroundColor: "#6558E8",
          padding: 14,
          borderRadius: 12,
          width: "100%",
          alignItems: "center",
          marginTop: 12,
        }}
      >
        <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
          Unlock note
        </Text>
      </Pressable>
    </View>
  );
}
