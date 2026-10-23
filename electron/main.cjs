const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

let mainWindow;
let server;
let serverPort;

const distPath = path.join(__dirname, "../dist");
const indexPath = path.join(distPath, "index.html");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
};

function startLocalServer() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(indexPath)) {
      reject(new Error("dist/index.html not found. Run npm run build:web"));
      return;
    }

    server = http.createServer((req, res) => {
      let pathname;

      try {
        pathname = decodeURIComponent(
          new URL(req.url, "http://127.0.0.1").pathname,
        );
      } catch {
        res.writeHead(400);
        res.end("Bad request");
        return;
      }

      let relativePath = pathname.replace(/^\/+/, "");
      let filePath = path.resolve(distPath, relativePath || "index.html");

      // Prevent requests from escaping the dist folder.
      if (filePath !== distPath && !filePath.startsWith(distPath + path.sep)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      // Expo Router web export uses a single-page app.
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        filePath = indexPath;
      }

      const contentType =
        mimeTypes[path.extname(filePath).toLowerCase()] ||
        "application/octet-stream";

      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      });

      fs.createReadStream(filePath)
        .on("error", () => {
          if (!res.headersSent) res.writeHead(500);
          res.end("Unable to load file");
        })
        .pipe(res);
    });

    server.once("error", reject);

    server.listen(0, "127.0.0.1", () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

async function createWindow() {
  await startLocalServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 650,
    title: "MyTodoApp",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, code, description, url) => {
      console.error("Page load failed:", code, description, url);
    },
  );

  mainWindow.webContents.on("console-message", (_event, details) => {
    console.log("Renderer console:", details.message);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
}

app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (error) {
    console.error("Electron startup error:", error);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (server) server.close();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (server) server.close();
});
