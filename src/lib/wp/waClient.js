import qrcode from "qrcode";
import { Client, RemoteAuth } from "whatsapp-web.js";
import { MongoStore } from "wwebjs-mongo";
import mongoose from "mongoose";
import path from "path";
import { normalizePhoneDigits } from "@/lib/wp/phone";
import connectDB from "@/lib/mongodb";

// Simple Schema to track connection status in DB for Vercel
const WhatsAppStatusSchema = new mongoose.Schema({
  clientId: { type: String, unique: true },
  connected: { type: Boolean, default: false },
  lastQrDataUrl: String,
  lastInitAt: { type: Date }, // Added to throttle initializations
  updatedAt: { type: Date, default: Date.now }
});
const WhatsAppStatus = mongoose.models.WhatsAppStatus || mongoose.model("WhatsAppStatus", WhatsAppStatusSchema);

const WA_CLIENT_ID_BASE = process.env.WA_WEB_CLIENT_ID || "default";
const WA_CHROME_EXECUTABLE_PATH = process.env.WA_CHROME_EXECUTABLE_PATH || "";

const isVercel = !!(
  process.env.VERCEL === "1" ||
  process.env.VERCEL === "true" ||
  process.env.VERCEL_ENV ||
  process.env.NOW_BUILDER ||
  (typeof process.cwd === 'function' && (process.cwd().includes('/vercel') || process.cwd().includes('/var/task')))
);

function getIsVercelRuntime() {
  // Check if we are running in a Vercel-like environment (real or simulated)
  const isVercelPath = typeof process.cwd === 'function' && (process.cwd().includes('/vercel') || process.cwd().includes('/var/task'));
  const hasVercelEnv = !!(process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_BUILDER);
  
  return isVercelPath || hasVercelEnv;
}

console.log(`[WA] Environment check - isLocal: ${process.platform === 'darwin' || process.platform === 'win32'}, isVercel: ${isVercel}, platform: ${process.platform}`);
console.log(`[WA] Final check - getIsVercelRuntime(): ${getIsVercelRuntime()}`);
console.log(`[WA] BROWSERLESS_API_KEY exists: ${!!process.env.BROWSERLESS_API_KEY}`);

function getClientKey(rawKey) {
  const key = String(rawKey || "default").trim();
  return key || "default";
}

const clients = global._waClients || new Map();
if (process.env.NODE_ENV !== "production") {
  global._waClients = clients;
}

function getOrCreateState(rawKey) {
  const clientKey = getClientKey(rawKey);
  if (!clients.has(clientKey)) {
    clients.set(clientKey, {
      client: null,
      initPromise: null,
      connected: false,
      lastQrDataUrl: "",
      lastQrAt: null,
      lastError: "",
      readyPromise: null,
      resolveReady: null,
      rejectReady: null,
      isInitializing: false,
    });
  }
  return { clientKey, state: clients.get(clientKey) };
}

function getInitState(state) {
  return {
    connected: state.connected,
    lastQrDataUrl: state.lastQrDataUrl,
    lastQrAt: state.lastQrAt,
    lastError: state.lastError,
  };
}

async function getPuppeteerConfig() {
  const isLocal = process.platform === 'darwin' || process.platform === 'win32';
  
  // If we are on a desktop OS, ALWAYS use local Chrome to avoid Browserless 401/429
  if (isLocal) {
    console.log(`[WA-CONFIG-LOG] Desktop OS detected (${process.platform}). Forcing Local Browser.`);
    const macChromePaths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome",
    ];
    const fs = await import("fs");
    let localPath = WA_CHROME_EXECUTABLE_PATH || undefined;
    if (!localPath && process.platform === "darwin") {
      for (const p of macChromePaths) {
        if (fs.existsSync(p)) {
          localPath = p;
          break;
        }
      }
    }
    const config = {
      headless: true,
      executablePath: localPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-accelerated-2d-canvas"
      ],
    };
    return config;
  }

  // From here on, we assume it's a server environment (Linux/Vercel)
  const browserlessKey = process.env.BROWSERLESS_API_KEY;
  const isVercelRuntime = getIsVercelRuntime();
  
  console.log(`[WA] getPuppeteerConfig (Server) - isVercelRuntime: ${isVercelRuntime}, browserlessKey: ${!!browserlessKey}`);

  if (isVercelRuntime) {
    console.log("[WA] Selected Mode: Remote Browser (Browserless)");
    if (!browserlessKey) throw new Error("BROWSERLESS_API_KEY is missing in Vercel environment.");
    return {
      browserWSEndpoint: `wss://chrome.browserless.io/?token=${browserlessKey.trim()}&timeout=60000`,
    };
  }

  // Fallback for other Linux environments
  return {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'chromium',
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-accelerated-2d-canvas"
    ],
  };
}

export async function ensureWaClient(rawKey, force = false) {
  const { clientKey, state } = getOrCreateState(rawKey);
  
  if (state.isInitializing) {
    console.log(`[WA] Client ${clientKey} is already initializing, skipping force request and returning existing promise...`);
    return state.initPromise;
  }

  if (force) {
    console.log(`[WA] Force re-initialization requested for ${clientKey}`);
    if (state.client) {
      try {
        await state.client.destroy();
      } catch (e) {
        console.error(`[WA] Error destroying client during force re-init:`, e.message);
      }
    }
    state.client = null;
    state.initPromise = null;
    state.connected = false;
  }

  if (state.client && state.connected) return state.client;
  if (state.initPromise) return state.initPromise;

  const clientId = `${WA_CLIENT_ID_BASE}-${clientKey}`;
  const isVercelRuntime = getIsVercelRuntime();
  const isLocal = process.platform === 'darwin' || process.platform === 'win32';

  // THROTTLE: Don't initialize too often on Vercel unless it's a FORCE request (like sending a message)
  if (isVercelRuntime && !force) {
    await connectDB();
    const dbStatus = await WhatsAppStatus.findOne({ clientId: clientId });
    const now = new Date();
    if (dbStatus?.lastInitAt && (now.getTime() - dbStatus.lastInitAt.getTime() < 15000)) {
      console.log(`[WA] Throttling status check for ${clientKey}.`);
      if (dbStatus.lastQrDataUrl) {
        state.lastQrDataUrl = dbStatus.lastQrDataUrl;
        state.lastQrAt = dbStatus.updatedAt;
      }
      return null;
    }
  }

  // Force local-only mode: Stop here if on Vercel/Production
  if (isVercelRuntime && !isLocal) {
    const errMsg = "WhatsApp initialization is disabled in Production (Vercel). Please use Local Development mode for this feature.";
    console.warn(`[WA] ${errMsg}`);
    state.connected = false;
    state.lastError = errMsg;
    return null; // Don't even start the initPromise
  }

  state.isInitializing = true;
  state.initPromise = (async () => {
    try {
      // Double check inside the promise to prevent race conditions
      if (state.client && state.connected) return state.client;
      
      state.connected = false;
      state.lastError = "";
      state.lastQrDataUrl = "";
      state.lastQrAt = null;

      state.readyPromise = new Promise((resolve, reject) => {
        state.resolveReady = resolve;
        state.rejectReady = reject;
      });
      state.readyPromise.catch(() => {});

      console.log(`[WA] Initializing client for key: ${clientKey}`);
      
      await connectDB();
      
      const fs = await import("fs");
      const currentPath = process.cwd();
      let remoteDataPath = path.join(currentPath, ".wwebjs_auth_local");

      // Aggressively force /tmp if we see Vercel-like paths or environment
      if (process.env.VERCEL || process.env.VERCEL_ENV || currentPath.includes('/vercel') || currentPath.includes('/var/task')) {
        remoteDataPath = "/tmp/wa_session_v3";
      }

      // Fallback: If not explicitly Vercel but directory is not writable, use /tmp
      if (!remoteDataPath.startsWith("/tmp")) {
        try {
          const testDir = path.join(process.cwd(), ".wwebjs_write_test");
          if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
          fs.rmdirSync(testDir);
        } catch (e) {
          console.log(`[WA] Current directory not writable (${process.cwd()}), forcing /tmp/.wwebjs_auth`);
          remoteDataPath = "/tmp/.wwebjs_auth";
        }
      }
      
      console.log(`[WA] Path check - isVercelRuntime: ${isVercelRuntime}, remoteDataPath: ${remoteDataPath}, cwd: ${process.cwd()}`);
      const clientId = `${WA_CLIENT_ID_BASE}-${clientKey}`;

      let auth;
      if (isVercelRuntime || remoteDataPath.startsWith("/tmp")) {
        console.log(`[WA] Using RemoteAuth for Vercel/Serverless persistence`);
        await connectDB();
        const store = new MongoStore({ mongoose: mongoose });
        auth = new RemoteAuth({
          clientId: clientId,
          store: store,
          backupSyncIntervalMs: 60000, // Minimum allowed value is 1 minute
          dataPath: remoteDataPath
        });
        
        // Ensure temp dirs for RemoteAuth
        const tempSessionDir = path.join(remoteDataPath, `wwebjs_temp_session_${clientId}`);
        const tempDefaultDir = path.join(tempSessionDir, "Default");
        [tempSessionDir, tempDefaultDir].forEach(dir => {
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });
      } else {
        console.log(`[WA] Using LocalAuth for local development`);
        const { LocalAuth } = await import("whatsapp-web.js");
        auth = new LocalAuth({
          clientId: clientId,
          dataPath: remoteDataPath
        });
        // Explicitly ensure the session directory exists
        const sessionDir = path.join(remoteDataPath, `session-${clientId}`);
        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
      }

      const puppeteerOptions = await getPuppeteerConfig();
      
      let puppeteerConfig = {
        ...puppeteerOptions,
      };

      // If using a remote browser (Browserless), we need to connect to it first
      if (puppeteerOptions.browserWSEndpoint) {
        console.log(`[WA] Connecting to remote browser...`);
        const puppeteerModule = await import("puppeteer-core");
        const puppeteer = puppeteerModule.default || puppeteerModule;
        
        try {
          const browser = await puppeteer.connect({
            browserWSEndpoint: puppeteerOptions.browserWSEndpoint,
            defaultViewport: puppeteerOptions.defaultViewport || null
          });
          console.log(`[WA] Successfully connected to remote browser!`);
          // When providing a browser instance, we MUST NOT provide other launch options
          puppeteerConfig = { browser: browser };
        } catch (err) {
          console.error(`[WA] Failed to connect to remote browser:`, err.message);
          if (isVercelRuntime) throw new Error(`Remote browser connection failed: ${err.message}`);
        }
      }

      const client = new Client({
        authStrategy: auth,
        takeoverOnConflict: true,
        takeoverTimeoutMs: 20000,
        puppeteer: puppeteerConfig,
        authTimeoutMs: 90000,
      });

      state.client = client;

    client.on("qr", async (qr) => {
      console.log(`[WA] QR received for ${clientKey}`);
      try {
        state.lastQrDataUrl = await qrcode.toDataURL(qr);
        state.lastQrAt = new Date();
      } catch (e) {
        console.error(`[WA] QR processing error:`, e);
      }
    });

    client.on("authenticated", async () => {
      console.log(`[WA] Authenticated successfully for ${clientKey}`);
      // SAVE CONNECTED STATUS IMMEDIATELY ON AUTHENTICATION
      try {
        await WhatsAppStatus.findOneAndUpdate(
          { clientId: clientId },
          { connected: true, lastQrDataUrl: "", updatedAt: new Date() },
          { upsert: true }
        );
        state.connected = true;
      } catch (e) {
        console.error(`[WA] Error saving authenticated status to DB:`, e.message);
      }
    });

    client.on("auth_failure", (msg) => {
      console.error(`[WA] Auth failure for ${clientKey}:`, msg);
      state.lastError = `Auth failure: ${msg}`;
    });

    client.on("ready", async () => {
      console.log(`[WA] Client is ready and CONNECTED for ${clientKey}`);
      state.connected = true;
      state.lastError = "";
      state.lastQrDataUrl = "";
      state.resolveReady?.();
      
      // PERSIST STATUS TO DB
      try {
        await WhatsAppStatus.findOneAndUpdate(
          { clientId: clientId },
          { connected: true, lastQrDataUrl: "", updatedAt: new Date() },
          { upsert: true }
        );
      } catch (e) {
        console.error(`[WA] Error saving status to DB:`, e.message);
      }
    });

    client.on("remote_session_saved", async () => {
      console.log(`[WA] Remote session successfully saved to MongoDB for ${clientKey}`);
    });

    client.on("disconnected", async (reason) => {
      console.log(`[WA] Client DISCONNECTED for ${clientKey}:`, reason);
      state.connected = false;
      state.client = null;
      state.initPromise = null;
      state.lastQrDataUrl = "";
      
      // UPDATE STATUS IN DB
      try {
        await WhatsAppStatus.findOneAndUpdate(
          { clientId: clientId },
          { connected: false, updatedAt: new Date() },
          { upsert: true }
        );
      } catch (e) {
        console.error(`[WA] Error updating logout status in DB:`, e.message);
      }

      if (reason !== "NAVIGATION") {
        setTimeout(() => ensureWaClient(clientKey), 5000);
      }
    });

    console.log(`[WA] Initializing client for key: ${clientKey}...`);
    await client.initialize();
    console.log(`[WA] client.initialize() call completed for ${clientKey}. Waiting for Ready...`);
    state.isInitializing = false;
    return client;
    } catch (err) {
      const errMsg = err?.message || String(err);
      console.error(`[WA] CRITICAL Initialization error for ${clientKey}:`, errMsg);
      
      // Cleanup on failure
      state.client = null;
      state.initPromise = null;
      state.connected = false;
      state.isInitializing = false;
      
      // If session is corrupt, this might be why it fails. Suggest logout or clear.
      if (errMsg.includes("Session") || errMsg.includes("auth")) {
        throw new Error(`WhatsApp Session Error: ${errMsg}. Please Logout and Login again.`);
      }

      if (errMsg.includes("429")) {
        throw new Error(`Browser Limit Reached (429): Too many concurrent sessions or requests. Please wait a few minutes or check your Browserless dashboard.`);
      }

      if (errMsg.includes("already running")) {
        throw new Error(`WhatsApp Session Locked: The browser is already running. Please Logout first or wait a few seconds.`);
      }

      if (errMsg.includes("401")) {
        throw new Error(`WhatsApp Auth Failed (401): ${errMsg}. Please ensure you are logged in correctly.`);
      }
      
      throw new Error(`WhatsApp Init Failed: ${errMsg}`);
    }
  })();

  return state.initPromise;
}

export async function getWaStatus(rawKey) {
  const { clientKey, state } = getOrCreateState(rawKey);
  const clientId = `${WA_CLIENT_ID_BASE}-${clientKey}`;
  
  await connectDB();
  
  try {
    // 1. Check DB first
    const dbStatus = await WhatsAppStatus.findOne({ clientId: clientId });
    if (dbStatus?.connected) {
      state.connected = true;
      // If we are in-memory connected, just return
      if (state.client) return getInitState(state);
    }

    // 2. If not in-memory or DB says disconnected, ensure client
    await ensureWaClient(rawKey);
    
    // Wait a short time for the ready event
    if (!state.connected && state.readyPromise) {
      await Promise.race([
        state.readyPromise,
        new Promise((resolve) => setTimeout(resolve, 5000))
      ]);
    }
  } catch (e) {
    console.error(`[WA] Status error for ${rawKey}:`, e.message);
    state.lastError = e?.message || "WhatsApp initialization failed";
  }
  return getInitState(state);
}

export async function logoutWaClient(rawKey) {
  const { clientKey, state } = getOrCreateState(rawKey);
  const clientId = `${WA_CLIENT_ID_BASE}-${clientKey}`;
  
  console.log(`[WA] Logging out client: ${clientKey}`);
  
  // 1. Destroy client if exists
  if (state.client) {
    try {
      if (state.connected) {
        console.log(`[WA] Attempting graceful logout for ${clientKey}...`);
        await state.client.logout(); // This tells WA servers to invalidate session
      }
    } catch (e) {
      console.error(`[WA] Graceful logout failed:`, e.message);
    }
    try {
      await state.client.destroy();
    } catch (e) {
      console.error(`[WA] Error destroying client during logout:`, e.message);
    }
  }

  // 1.5 Delete the local session directory to force a new QR code
  try {
    const fs = await import("fs");
    const currentPath = process.cwd();
    let remoteDataPath = path.join(currentPath, ".wwebjs_auth_local");
    
    // Aggressively force /tmp if we see Vercel-like paths or environment
    if (process.env.VERCEL || process.env.VERCEL_ENV || currentPath.includes('/vercel') || currentPath.includes('/var/task')) {
      remoteDataPath = "/tmp/wa_session_v3";
    } else if (!remoteDataPath.startsWith("/tmp")) {
      try {
        const testDir = path.join(process.cwd(), ".wwebjs_write_test");
        if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
        fs.rmdirSync(testDir);
      } catch (e) {
        remoteDataPath = "/tmp/.wwebjs_auth";
      }
    }

    const sessionDir = path.join(remoteDataPath, `session-${clientId}`);
    if (fs.existsSync(sessionDir)) {
      console.log(`[WA] Deleting session directory: ${sessionDir}`);
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    
    // Also delete RemoteAuth temp dirs if they exist
    const tempSessionDir = path.join(remoteDataPath, `wwebjs_temp_session_${clientId}`);
    if (fs.existsSync(tempSessionDir)) {
      console.log(`[WA] Deleting temp session directory: ${tempSessionDir}`);
      fs.rmSync(tempSessionDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.error(`[WA] Error deleting session files:`, e.message);
  }
  
  // 2. Clear state
  state.client = null;
  state.connected = false;
  state.initPromise = null;
  state.lastQrDataUrl = "";
  state.lastError = "";
  
  // 3. Update DB status
  await connectDB();
  await WhatsAppStatus.findOneAndUpdate(
    { clientId },
    { connected: false, lastQrDataUrl: "", updatedAt: new Date() },
    { upsert: true }
  );

  return { success: true, message: "Logged out successfully. You can now re-initialize or scan again." };
}

// Helper to check if client is truly ready to send
function isClientTrulyReady(client) {
  try {
    return client && client.pupPage && !client.pupPage.isClosed();
  } catch (e) {
    return false;
  }
}

function isTransientInitializationError(message) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("init failed") ||
    normalized.includes("initialize") ||
    normalized.includes("starting up") ||
    normalized.includes("not connected yet") ||
    normalized.includes("timeout") ||
    normalized.includes("execution context was destroyed") ||
    normalized.includes("detached frame") ||
    normalized.includes("protocol error") ||
    normalized.includes("target closed") ||
    normalized.includes("navigation")
  );
}

export async function sendWhatsAppMessage({ phone, message, clientKey }) {
  const { state } = getOrCreateState(clientKey);
  
  try {
    await ensureWaClient(clientKey);
  } catch (err) {
    console.error(`[WA] ensureWaClient failed for ${clientKey}:`, err);
    return {
      queued: false,
      sent: false,
      status: "initializing",
      error: err?.message || String(err) || "Failed to initialize WhatsApp client",
    };
  }

  const digits = normalizePhoneDigits(phone);
  if (!digits) {
    console.error(`[WA] Invalid phone number: ${phone}`);
    return { queued: false, sent: false, error: "Missing or invalid phone digits" };
  }

  // Wait if not connected
  if (!state.connected || !state.client) {
    console.log(`[WA] Client not connected for ${clientKey}, waiting up to 30s...`);
    try {
      await Promise.race([
        state.readyPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("WhatsApp not connected yet (timeout)")), 30000)),
      ]);
    } catch (e) {
      console.error(`[WA] Connection wait failed for ${clientKey}:`, e.message);
      return {
        queued: false,
        sent: false,
        status: "initializing",
        error: e?.message || "WhatsApp is still connecting",
      };
    }
  }

  const waChatId = `${digits}@c.us`;
  const waLink = `https://wa.me/${digits}?text=${encodeURIComponent(message || "")}`;

  console.log(`[WA] Sending message to ${waChatId}...`);
  
  // Try to send with a simple retry for detached frame errors
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      // ENSURE CLIENT AND PAGE OBJECTS ARE VALID
      if (!isClientTrulyReady(state.client)) {
        console.log(`[WA] Client or Page is null/closed, checking DB and re-init...`);
        
        // Check DB for status
        const dbStatus = await WhatsAppStatus.findOne({ clientId: `${WA_CLIENT_ID_BASE}-${clientKey}` });
        if (!dbStatus?.connected) {
          return { queued: false, sent: false, status: "initializing", error: "WhatsApp is not connected yet. Please wait..." };
        }

        // Destroy old client and re-init
        await ensureWaClient(clientKey, true);
        
        // Wait for ready!
        if (state.readyPromise) {
          await Promise.race([
            state.readyPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout waiting for ready")), 20000))
          ]).catch(e => console.log(`[WA] Wait for ready after forced init failed:`, e.message));
        }
        
        // If still not ready after a quick init, tell the UI to retry later
        if (!isClientTrulyReady(state.client)) {
          return { queued: false, sent: false, status: "initializing", error: "WhatsApp is starting up. Retrying in 5s..." };
        }
      }
      
      // Ensure WWebJS is injected before sending
      try {
        let isWWebJSInjected = await state.client.pupPage.evaluate(() => typeof window.WWebJS !== 'undefined');
        if (!isWWebJSInjected) {
           console.log("[WA] WWebJS is not injected yet, waiting 2 seconds...");
           await new Promise(r => setTimeout(r, 2000));
           isWWebJSInjected = await state.client.pupPage.evaluate(() => typeof window.WWebJS !== 'undefined');
           if (!isWWebJSInjected) {
             throw new Error("WWebJS still not injected");
           }
        }
      } catch (e) {
        // If WWebJS is missing or evaluation fails, we throw to trigger retry
        throw new Error("WWebJS evaluation failed: " + e.message);
      }
      
      // Verify number is registered on WhatsApp
      const isRegistered = await state.client.isRegisteredUser(waChatId);
      if (!isRegistered) {
        throw new Error("Number is not registered on WhatsApp");
      }

      // Simulate human typing behavior
      try {
        const chat = await state.client.getChatById(waChatId);
        if (chat) {
          await chat.sendStateTyping();
          // Simulate typing duration: 30ms per character, min 1.5s, max 5s
          const typingDelay = Math.min(Math.max((message || "").length * 30, 1500), 5000);
          await new Promise(r => setTimeout(r, typingDelay));
        }
      } catch (err) {
        console.warn(`[WA] Typing simulation failed (non-fatal):`, err.message);
      }
      
      const result = await state.client.sendMessage(waChatId, message || "");
      console.log(`[WA] Message sent successfully to ${digits}`);
      return { queued: true, sent: true, waLink, resultId: result?.id?._serialized || "" };
    } catch (err) {
      lastErr = err;
      console.error(`[WA] Send attempt ${i+1} failed for ${digits}:`, err.message);
      
      if (err.message.includes("detached") || err.message.includes("Protocol error") || err.message.includes("destroyed") || err.message.includes("getChat") || err.message.includes("WWebJS")) {
        console.log(`[WA] Stale browser detected, attempting to re-initialize...`);
        // Clear the state so the next attempt gets a fresh client
        if (state.client) {
          try { await state.client.destroy(); } catch (e) {}
        }
        state.client = null;
        state.initPromise = null;
        state.connected = false;
        
        try {
          await ensureWaClient(clientKey);
          // Wait for the new client to be ready
          if (state.readyPromise) {
            await Promise.race([
              state.readyPromise,
              new Promise((_, reject) => setTimeout(() => reject(new Error("Wait timeout")), 20000))
            ]).catch(e => console.log(`[WA] Wait during retry failed:`, e.message));
          } else {
            await new Promise(r => setTimeout(r, 5000));
          }
        } catch (initErr) {
          console.error(`[WA] Re-initialization failed during retry:`, initErr.message);
        }
        continue;
      }
      
      // For other errors, wait a bit and retry
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (isTransientInitializationError(lastErr?.message)) {
    return {
      queued: false,
      sent: false,
      status: "initializing",
      error: lastErr?.message || "WhatsApp is starting up. Retrying shortly...",
    };
  }

  return { queued: false, sent: false, error: lastErr?.message || "Failed to send message" };
}
