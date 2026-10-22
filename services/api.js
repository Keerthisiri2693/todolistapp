import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API = axios.create({
  baseURL: "http://192.168.1.2:5003",
  timeout: 30000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

API.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem("login_token");

    if (token) {
      config.headers.set
        ? config.headers.set("Authorization", `Bearer ${token}`)
        : (config.headers.Authorization = `Bearer ${token}`);
    }

    console.log("========== API REQUEST ==========");
    console.log("METHOD:", config.method?.toUpperCase());
    console.log("BASE URL:", config.baseURL);
    console.log("PATH:", config.url);
    console.log(
      "FULL URL:",
      `${config.baseURL}${config.url}`
    );
    console.log("TOKEN EXISTS:", !!token);
    console.log("=================================");

    return config;
  },
  (error) => Promise.reject(error)
);

API.interceptors.response.use(
  (response) => {
    console.log(
      "API SUCCESS:",
      response.status,
      response.config.url
    );

    return response;
  },
  (error) => {
    console.log("========== API ERROR ==========");
    console.log("MESSAGE:", error.message);
    console.log("CODE:", error.code);
    console.log("STATUS:", error.response?.status);
    console.log("RESPONSE:", error.response?.data);
    console.log("METHOD:", error.config?.method);
    console.log("PATH:", error.config?.url);
    console.log("BASE URL:", error.config?.baseURL);
    console.log(
      "REQUEST SENT:",
      !!error.request
    );
    console.log("================================");

    return Promise.reject(error);
  }
);

export default API;