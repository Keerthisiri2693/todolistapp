import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

// ======================================================
// API CONFIGURATION
// ======================================================

const BASE_URL = "https://todolistbackend-855c.onrender.com";

const API = axios.create({
  baseURL: BASE_URL,
  timeout: 45000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

// ======================================================
// REQUEST INTERCEPTOR
// ======================================================

API.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem("login_token");

      if (token) {
        config.headers = config.headers || {};

        if (typeof config.headers.set === "function") {
          config.headers.set("Authorization", `Bearer ${token}`);
        } else {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }

      console.log("========== API REQUEST ==========");
      console.log("METHOD:", config.method?.toUpperCase());
      console.log("BASE URL:", config.baseURL);
      console.log("PATH:", config.url);
      console.log(
        "FULL URL:",
        `${config.baseURL}${config.url?.startsWith("/") ? "" : "/"}${config.url || ""}`,
      );
      console.log("TOKEN EXISTS:", !!token);
      console.log("=================================");

      return config;
    } catch (error) {
      console.error("API REQUEST INTERCEPTOR ERROR:", error?.message || error);

      return Promise.reject(error);
    }
  },
  (error) => {
    console.error("API REQUEST SETUP ERROR:", error?.message || error);
    return Promise.reject(error);
  },
);

// ======================================================
// RESPONSE INTERCEPTOR
// ======================================================

API.interceptors.response.use(
  (response) => {
    console.log("========== API SUCCESS ==========");
    console.log("STATUS:", response.status);
    console.log("METHOD:", response.config?.method?.toUpperCase());
    console.log("PATH:", response.config?.url);
    console.log("=================================");

    return response;
  },
  async (error) => {
    console.error("========== API ERROR ==========");
    console.error("MESSAGE:", error?.message);
    console.error("CODE:", error?.code);
    console.error("STATUS:", error?.response?.status ?? "No HTTP response");
    console.error("RESPONSE:", error?.response?.data ?? "No response body");
    console.error("METHOD:", error?.config?.method?.toUpperCase());
    console.error("PATH:", error?.config?.url);
    console.error("BASE URL:", error?.config?.baseURL);
    console.error("REQUEST SENT:", !!error?.request);
    console.error("================================");

    return Promise.reject(error);
  },
);

// ======================================================
// TOKEN HELPERS
// ======================================================

export const saveLoginToken = async (token) => {
  if (!token || typeof token !== "string") {
    throw new Error("A valid login token is required.");
  }

  await AsyncStorage.setItem("login_token", token);
};

export const getLoginToken = async () => {
  return AsyncStorage.getItem("login_token");
};

export const removeLoginToken = async () => {
  await AsyncStorage.removeItem("login_token");
};

// ======================================================
// EXPORT
// ======================================================

export default API;
