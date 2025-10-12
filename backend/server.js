// server.js (updated)
// Serves a production frontend build (./dist) at / and provides API endpoints.
// If creating the downloads directory fails due to permissions, fall back to os.tmpdir().

const express = require("express");
const cors = require("cors");
const play = require("play-dl");
const ytdlExec = require('youtube-dl-exec');
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const { createWriteStream } = require("fs");
const sanitize = require("sanitize-filename");
const os = require("os");
const https = require("https");

const app = express();
const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 3000);

// Allow overriding downloads location (useful in Render env)
let DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || path.join(__dirname, "downloads");

// Try to create downloads dir; if permission denied, fall back to tmpdir
async function ensureDownloadsDir() {
  try {
    await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
    // check write access by writing a tiny temp file and removing it
    const testFile = path.join(DOWNLOADS_DIR, `.perm_test_${Date.now()}`);
    await fs.writeFile(testFile, "ok");
    await fs.unlink(testFile);
    console.log(`[init] downloads dir writable: ${DOWNLOADS_DIR}`);
    return DOWNLOADS_DIR;
  } catch (err) {
    console.warn(`[init] unable to create/write to ${DOWNLOADS_DIR}:`, err.code || err.message);
    const fallback = os.tmpdir();
    DOWNLOADS_DIR = fallback;
    console.log(`[init] falling back to tmpdir for downloads: ${DOWNLOADS_DIR}`);
    try {
      await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
    } catch (e) {
      // tmpdir should exist; ignore
    }
    return DOWNLOADS_DIR;
  }
}

// Express middleware
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

// Ensure yt-dlp is available at runtime (download to local bin if missing)
const LOCAL_BIN_DIR = path.join(__dirname, 'bin');
const LOCAL_YTDLP = path.join(LOCAL_BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

function isExecutable(p) {
  try { fsSync.accessSync(p, fsSync.constants.X_OK); return true; } catch { return false; }
}

async function ensureYtDlp() {
  const candidates = [process.env.YTDLP_PATH, '/usr/local/bin/yt-dlp', LOCAL_YTDLP].filter(Boolean);
  for (const c of candidates) {
    if (isExecutable(c)) {
      process.env.YTDLP_PATH = c;
      console.log('[init] yt-dlp available at', c);
      return c;
    }
  }
  try {
    await fs.mkdir(LOCAL_BIN_DIR, { recursive: true });

    // Use specific version URL to avoid redirect issues
    const ytDlpUrl = process.platform === 'win32'
      ? 'https://github.com/yt-dlp/yt-dlp/releases/download/2024.12.13/yt-dlp.exe'
      : 'https://github.com/yt-dlp/yt-dlp/releases/download/2024.12.13/yt-dlp';

    console.log('[init] downloading yt-dlp from:', ytDlpUrl);

    const file = fsSync.createWriteStream(LOCAL_YTDLP);

    await new Promise((resolve, reject) => {
      const request = https.get(ytDlpUrl, {
        headers: {
          'User-Agent': 'Node.js yt-dlp downloader'
        }
      }, (response) => {
        console.log('[init] download response status:', response.statusCode);
        if (response.statusCode !== 200) {
          reject(new Error('yt-dlp download status ' + response.statusCode));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
        file.on('error', reject);
      });
      request.on('error', reject);
    });

    // Ensure executable permissions with multiple fallbacks
    if (process.platform !== 'win32') {
      let permissionsSet = false;

      // Try fs.chmod first
      try {
        await fs.chmod(LOCAL_YTDLP, 0o755);
        await fs.access(LOCAL_YTDLP, fs.constants.X_OK);
        console.log('[init] yt-dlp executable permissions set successfully via fs.chmod');
        permissionsSet = true;
      } catch (permErr) {
        console.warn('[init] fs.chmod failed:', permErr.message);
      }

      // Try execSync chmod as fallback
      if (!permissionsSet) {
        try {
          const { execSync } = require('child_process');
          execSync(`chmod +x "${LOCAL_YTDLP}"`, { stdio: 'inherit' });
          console.log('[init] yt-dlp permissions set via execSync chmod');
          permissionsSet = true;
        } catch (cmdErr) {
          console.warn('[init] execSync chmod failed:', cmdErr.message);
        }
      }

      // Final fallback: try spawn chmod
      if (!permissionsSet) {
        try {
          const { spawn } = require('child_process');
          await new Promise((resolve, reject) => {
            const chmodProcess = spawn('chmod', ['+x', LOCAL_YTDLP], { stdio: 'inherit' });
            chmodProcess.on('close', (code) => {
              if (code === 0) {
                console.log('[init] yt-dlp permissions set via spawn chmod');
                resolve();
              } else {
                reject(new Error(`chmod exited with code ${code}`));
              }
            });
            chmodProcess.on('error', reject);
          });
          permissionsSet = true;
        } catch (spawnErr) {
          console.warn('[init] spawn chmod failed:', spawnErr.message);
        }
      }

      if (!permissionsSet) {
        console.warn('[init] WARNING: Could not set executable permissions for yt-dlp');
      }
    }

    process.env.YTDLP_PATH = LOCAL_YTDLP;
    process.env.PATH = `${LOCAL_BIN_DIR}:${process.env.PATH || ''}`;
    console.log('[init] downloaded yt-dlp to', LOCAL_YTDLP);
    return LOCAL_YTDLP;
  } catch (e) {
    console.warn('[init] could not ensure yt-dlp:', e?.message || e);
    return null;
  }
}

let ytDlpReady = null;

// Disable yt-dlp update checks
process.env.YTDL_NO_UPDATE = '1';

// Add local bin to PATH and kick off ensure in background
process.env.PATH = `${LOCAL_BIN_DIR}:${process.env.PATH || ''}`;
ytDlpReady = ensureYtDlp();
ytDlpReady.then((p) => console.log('[init] yt-dlp available at', p || 'not found')).catch((e) => console.warn('[init] yt-dlp ensure failed', e));
// Serve static frontend from dist if it exists (production build)
// Try both ./dist (when built inside backend) and ../dist (when built at repo root)
const POSSIBLE_DIST_DIRS = [
  path.join(__dirname, "dist"),
  path.join(__dirname, "..", "dist"),
];
const DIST_DIR = POSSIBLE_DIST_DIRS.find((p) => fsSync.existsSync(p));

// Diagnostics: log candidates and selection
try {
  console.log('[init] DIST candidates check:', POSSIBLE_DIST_DIRS.map(p => [p, fsSync.existsSync(p)]));
} catch (e) {}

if (DIST_DIR) {
  try {
    console.log('[init] Serving frontend from:', DIST_DIR);
    console.log('[init] Dist sample files:', fsSync.readdirSync(DIST_DIR).slice(0, 20));
  } catch (e) {}
  app.use(express.static(DIST_DIR));
  // SPA fallback: serve index.html for any non-API GET
  app.get(/^\/(?!api\/|health).*/, (req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
} else {
  // If dist doesn't exist, keep a small root message for convenience
  try { console.log('[init] No dist dir found. Root will show API banner. __dirname=', __dirname); } catch(e) {}
  app.get("/", (req, res) => {
    res.send("Swift Shorts Downloader API — health: GET /health — downloads dir: " + DOWNLOADS_DIR);
  });
}

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Swift Shorts Downloader API is running", downloads: DOWNLOADS_DIR });
});

// Basic YouTube URL validation (shorts or watch)
function isValidYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const patterns = [
    /^(https?:\/\/)?(www\.)?(youtube\.com\/shorts\/|youtu\.be\/)/i,
    /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=/i
  ];
  return patterns.some((p) => p.test(url));
}

// --- /api/video-info ---
let ytdl;
try { ytdl = require('ytdl-core'); } catch (e) { ytdl = null; }

app.post("/api/video-info", async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL is required" });
    if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: "Invalid YouTube URL" });

    console.log('[video-info] Request for URL:', url);

    // Convert Shorts URL to watch URL for better compatibility
    let processedUrl = url;
    if (url.includes('/shorts/')) {
      const videoId = url.split('/shorts/')[1].split('?')[0];
      processedUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log('[video-info] Converted Shorts URL to:', processedUrl);
    }

    // Wait for yt-dlp to be ready
    if (ytDlpReady) await ytDlpReady;

    let title = null, author = null, lengthSeconds = null, viewCount = null, thumbnail = null, description = null, uploadDate = null;
    let formats = [];

    // Primary method: yt-dlp spawn -J
    try {
      const ytDlpPath = process.env.YTDLP_PATH || LOCAL_YTDLP || '/usr/local/bin/yt-dlp';
      if (!ytDlpPath) throw new Error('yt-dlp binary not available');
      console.log('[video-info] Using yt-dlp path for spawn:', ytDlpPath);
      const child = spawn(ytDlpPath, ['-J', processedUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '', errOut = '';
      child.stdout.on('data', (c) => out += c.toString());
      child.stderr.on('data', (c) => errOut += c.toString());
      const exitCode = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => resolve(code));
      });
      if (exitCode === 0 && out) {
        try {
          const parsed = JSON.parse(out);
          title = parsed.title || title;
          author = parsed.uploader || parsed.channel || author;
          lengthSeconds = parsed.duration ? String(parsed.duration) : lengthSeconds;
          viewCount = parsed.view_count ? String(parsed.view_count) : viewCount;
          thumbnail = (parsed.thumbnail || (Array.isArray(parsed.thumbnails) && parsed.thumbnails.length ? parsed.thumbnails[parsed.thumbnails.length-1].url : null)) || thumbnail;
          description = parsed.description || description;
          uploadDate = parsed.upload_date || uploadDate;
          const yformats = parsed.formats || [];
          formats = yformats.map((f) => ({
            quality: f.format_note || f.qualityLabel || (f.abr ? `${f.abr} kbps` : null) || null,
            container: f.ext || (f.format ? String(f.format).split(' ')[0] : null) || null,
            hasAudio: !!(f.acodec && f.acodec !== 'none') || !!f.abr,
            hasVideo: !!(f.vcodec && f.vcodec !== 'none') || !!f.width,
            itag: f.format_id || f.itag || null
          }));
          console.log('[video-info] yt-dlp spawn success, title:', title, 'formats:', formats.length);
        } catch (parseErr) {
          console.warn('[video-info] failed to parse yt-dlp JSON:', parseErr?.message || parseErr);
        }
      } else {
        console.warn('[video-info] yt-dlp -J failed:', exitCode, errOut.slice(0,200));
      }
    } catch (e) {
      console.warn('[video-info] yt-dlp spawn error:', e?.message || e);
    }

    // Fallback to ytdl-core if yt-dlp failed
    if ((!formats || formats.length === 0) && ytdl) {
      try {
        const yi = await ytdl.getInfo(processedUrl);
        title = yi.videoDetails?.title || title;
        author = yi.videoDetails?.author?.name || author;
        lengthSeconds = String(yi.videoDetails?.lengthSeconds || "");
        viewCount = String(yi.videoDetails?.viewCount || "");
        thumbnail = yi.videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url || thumbnail;
        description = yi.videoDetails?.shortDescription || description;
        uploadDate = yi.videoDetails?.uploadDate || uploadDate;

        formats = (yi.formats || []).map((f) => ({
          quality: f.qualityLabel || (f.audioBitrate ? `${f.audioBitrate} kbps` : null) || null,
          container: f.container || (f.mimeType ? String(f.mimeType).split(';')[0].split('/').pop() : null) || null,
          hasAudio: !!f.audioBitrate || /audio/i.test(String(f.mimeType)),
          hasVideo: !!f.qualityLabel || !!f.width || /video/i.test(String(f.mimeType)),
          itag: f.itag || null
        }));
        console.log('[video-info] ytdl-core fallback success, title:', title, 'formats:', formats.length);
      } catch (err) {
        console.warn('[video-info] ytdl-core fallback failed:', err?.message || err);
      }
    }

    res.json({
      title: title || 'Unknown title',
      author,
      lengthSeconds,
      viewCount,
      thumbnail: thumbnail || null,
      description,
      uploadDate,
      formats
    });
  } catch (err) {
    console.error("[video-info] unexpected error:", err);
    res.status(500).json({ error: "Failed to fetch video info", message: err.message });
  }
});

// --- /api/download ---
// Try play-dl stream first, then yt-dlp fallback streaming to stdout , then file-download fallback
app.post("/api/download", async (req, res) => {
  try {
    const { url, quality } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL is required" });
    if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: "Invalid YouTube URL" });

    // Prefer yt-dlp stdout streaming first (more reliable on servers)
    try {
      const ytDlpPath = process.env.YTDLP_PATH || LOCAL_YTDLP || '/usr/local/bin/yt-dlp';
      const ytdlpArgs = ['--no-playlist', '-f', 'bestvideo+bestaudio/best', '-o', '-', url];
      const child = spawn(ytDlpPath, ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      child.on('error', (err) => {
        console.error('[download] yt-dlp spawn error (first):', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'yt-dlp not available', message: err.message });
        }
      });

      const fallbackFilename = `video-${Date.now()}.mp4`;
      if (!res.headersSent) {
        res.setHeader('Content-Disposition', `attachment; filename="${fallbackFilename}"`);
        res.setHeader('Content-Type', 'video/mp4');
      }

      child.stdout.pipe(res);
      child.stderr.on('data', (c) => console.log('[yt-dlp stderr]', String(c).slice(0,200)));
      child.on('close', (code) => console.log('[download] yt-dlp (first) closed with code', code));
      return;
    } catch (e) {
      console.warn('[download] yt-dlp first streaming failed:', e?.message || e);
    }

// Try play-dl stream
    try {
      const info = await play.video_info(url).catch(() => null);
      const title = info && info.video_details ? sanitize(info.video_details.title) : `video-${Date.now()}`;
      const filename = `${title}-${Date.now()}.mp4`;

      // set headers early
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "video/mp4");

      let streamInfo;
      if (quality && !isNaN(Number(quality))) {
        streamInfo = await play.stream(url, { quality: Number(quality) }).catch(e => null);
      } else {
        streamInfo = await play.stream(url).catch(e => null);
      }

      if (streamInfo && streamInfo.stream) {
        streamInfo.stream.on("error", (e) => console.error("[download] play stream error:", e));
        streamInfo.stream.pipe(res);
        return;
      }
    } catch (playErr) {
      console.warn("[download] play-dl overall error:", playErr?.message || playErr);
    }

    // Fallback: stream via yt-dlp stdout (merged)
    try {
      const ytDlpPath = process.env.YTDLP_PATH || LOCAL_YTDLP || '/usr/local/bin/yt-dlp';
      const ytdlpArgs = ['--no-playlist', '-f', 'bestvideo+bestaudio/best', '-o', '-', url];
      const child = spawn(ytDlpPath, ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

      child.on('error', (err) => {
        console.error("[download] yt-dlp spawn error:", err);
        if (!res.headersSent) {
          res.status(500).json({
            error: "yt-dlp not found or failed to spawn",
            message: err.message
          });
        }
      });

      const fallbackFilename = `video-${Date.now()}.mp4`;
      if (!res.headersSent) {
        res.setHeader("Content-Disposition", `attachment; filename="${fallbackFilename}"`);
        res.setHeader("Content-Type", "video/mp4");
      }

      child.stdout.pipe(res);
      child.stderr.on('data', (c) => console.log("[yt-dlp stderr]", String(c).slice(0,200)));
      child.on('close', (code) => console.log("[download] yt-dlp closed with code", code));
      return;
    } catch (ytdlpErr) {
      console.warn("[download] yt-dlp streaming fallback failed:", ytdlpErr?.message || ytdlpErr);
    }

    // Final fallback: download to tmp file then stream it
    try {
      const tmpDir = os.tmpdir();
      const tmpFilename = `video-${Date.now()}.%(ext)s`;
      const tmpPattern = path.join(tmpDir, tmpFilename);
      const ytDlpPath = process.env.YTDLP_PATH || LOCAL_YTDLP || '/usr/local/bin/yt-dlp';
      const child = spawn(ytDlpPath, ['--no-playlist', '-f', 'bestvideo+bestaudio/best', '-o', tmpPattern, url], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stderr.on('data', (c) => console.log("[yt-dlp stderr]", String(c).slice(0,200)));
      const exitCode = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => resolve(code));
      });
      if (exitCode !== 0) throw new Error('yt-dlp failed');

      // pick newest file prefix video-
      const files = fsSync.readdirSync(tmpDir).filter(f => f.startsWith('video-'));
      const candidates = files.map(f => ({ f, t: fsSync.statSync(path.join(tmpDir, f)).mtimeMs })).sort((a,b) => b.t - a.t);
      if (!candidates.length) throw new Error('downloaded file not found');
      const downloaded = path.join(tmpDir, candidates[0].f);

      const stat = fsSync.statSync(downloaded);
      if (!res.headersSent) {
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(downloaded)}"`);
        res.setHeader('Content-Type', 'video/mp4');
      }

      const rs = fsSync.createReadStream(downloaded);
      rs.pipe(res);
      rs.on('close', () => setTimeout(() => {
        fsSync.unlink(downloaded, () => {});
      }, 2000));
      rs.on('error', (e) => {
        try { fsSync.unlinkSync(downloaded); } catch(e) {}
      });
      return;
    } catch (finalErr) {
      console.error("[download] all fallbacks failed:", finalErr);
      if (!res.headersSent) return res.status(500).json({ error: "Failed to download video", message: finalErr.message });
    }
  } catch (err) {
    console.error("[download] unexpected error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to download video", message: err.message });
  }
});

// --- /api/download-to-server (save on server's downloads dir) ---
app.post("/api/download-to-server", async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL is required" });

    // ensure DOWNLOADS_DIR available and writable (with fallback)
    await ensureDownloadsDir();

    const info = await play.video_info(url).catch(() => null);
    const title = info && info.video_details ? sanitize(info.video_details.title) : `video-${Date.now()}`;
    const filename = `${title}-${Date.now()}.mp4`;
    const filepath = path.join(DOWNLOADS_DIR, filename);

    const streamInfo = await play.stream(url).catch((e) => { throw e; });
    if (!streamInfo || !streamInfo.stream) throw new Error("play-dl couldn't create stream");

    const writer = createWriteStream(filepath);
    streamInfo.stream.pipe(writer);

    writer.on('finish', () => {
      res.json({ success: true, filename, path: `/downloads/${filename}` });
    });

    writer.on('error', (err) => {
      console.error("Write error:", err);
      try { fsSync.unlinkSync(filepath); } catch(e) {}
      res.status(500).json({ error: "Failed to save video", message: err.message });
    });
  } catch (err) {
    console.error("[download-to-server] error:", err);
    res.status(500).json({ error: "Failed to download video", message: err.message });
  }
});

// --- /api/download-audio --- (same robust fallback strategy)
app.post("/api/download-audio", async (req, res) => {
  try {
    const { url, quality } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL is required" });

    // Prefer yt-dlp stdout streaming first (more reliable on servers)
    try {
      const ytDlpPath = process.env.YTDLP_PATH || LOCAL_YTDLP || '/usr/local/bin/yt-dlp';
      const child = spawn(ytDlpPath, ['--no-playlist', '-f', 'bestaudio', '-o', '-', url], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.on('error', (err) => {
        console.error('[download-audio] yt-dlp spawn error (first):', err);
        if (!res.headersSent) return res.status(500).json({ error: 'yt-dlp spawn failed', message: err.message });
      });

      const fallbackFilename = `audio-${Date.now()}.mp3`;
      if (!res.headersSent) {
        res.setHeader('Content-Disposition', `attachment; filename="${fallbackFilename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
      }

      child.stdout.pipe(res);
      child.stderr.on('data', (c) => console.log('[yt-dlp stderr]', String(c).slice(0,200)));
      child.on('close', (code) => console.log('[download-audio] yt-dlp (first) close', code));
      return;
    } catch (e) {
      console.warn('[download-audio] yt-dlp first streaming failed:', e?.message || e);
    }

    try {
      const info = await play.video_info(url).catch(() => null);
      const title = info && info.video_details ? sanitize(info.video_details.title) : `audio-${Date.now()}`;
      const filename = `${title}-${Date.now()}.mp3`;

      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "audio/mpeg");

      let playQuality = 'highestaudio';
      if (quality && String(quality).toLowerCase() !== 'highest' && !isNaN(Number(quality))) {
        playQuality = Number(quality);
      }

      const streamInfo = await play.stream(url, { quality: playQuality }).catch(e => null);
      if (streamInfo && streamInfo.stream) {
        streamInfo.stream.on('error', (e) => console.error('[download-audio] play stream error:', e));
        streamInfo.stream.pipe(res);
        return;
      }
    } catch (playErr) {
      console.warn('[download-audio] play-dl failed:', playErr?.message || playErr);
    }

    // fallback: yt-dlp to stdout (bestaudio)
    try {
      const ytDlpPath = process.env.YTDLP_PATH || LOCAL_YTDLP || '/usr/local/bin/yt-dlp';
      const child = spawn(ytDlpPath, ['--no-playlist', '-f', 'bestaudio', '-o', '-', url], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.on('error', (err) => {
        console.error('[download-audio] yt-dlp spawn error:', err);
        if (!res.headersSent) return res.status(500).json({ error: 'yt-dlp spawn failed', message: err.message });
      });

      const fallbackFilename = `audio-${Date.now()}.mp3`;
      if (!res.headersSent) {
        res.setHeader('Content-Disposition', `attachment; filename="${fallbackFilename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
      }

      child.stdout.pipe(res);
      child.stderr.on('data', (c) => console.log('[yt-dlp stderr]', String(c).slice(0,200)));
      child.on('close', (code) => console.log('[download-audio] yt-dlp close', code));
      return;
    } catch (e) {
      console.warn('[download-audio] yt-dlp streaming fallback failed:', e?.message || e);
    }

    // final fallback: file download via yt-dlp then stream file
    try {
      const tmpDir = os.tmpdir();
      const tmpFilename = `audio-${Date.now()}.%(ext)s`;
      const tmpPattern = path.join(tmpDir, tmpFilename);
      const ytDlpPath = process.env.YTDLP_PATH || LOCAL_YTDLP || '/usr/local/bin/yt-dlp';
      const child = spawn(ytDlpPath, ['--no-playlist', '-f', 'bestaudio', '-o', tmpPattern, url], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stderr.on('data', (c) => console.log('[yt-dlp stderr]', String(c).slice(0,200)));
      const exitCode = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => resolve(code));
      });
      if (exitCode !== 0) throw new Error('yt-dlp failed');

      const files = fsSync.readdirSync(tmpDir).filter(f => f.startsWith('audio-'));
      const candidates = files.map(f => ({ f, t: fsSync.statSync(path.join(tmpDir, f)).mtimeMs })).sort((a,b) => b.t - a.t);
      if (!candidates.length) throw new Error('downloaded audio file not found');
      const downloaded = path.join(tmpDir, candidates[0].f);

      const stat = fsSync.statSync(downloaded);
      if (!res.headersSent) {
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(downloaded)}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
      }

      const rs = fsSync.createReadStream(downloaded);
      rs.pipe(res);
      rs.on('close', () => setTimeout(() => {
        fsSync.unlink(downloaded, () => {});
      }, 2000));
      return;
    } catch (finalErr) {
      console.error('[download-audio] all fallbacks failed:', finalErr);
      if (!res.headersSent) return res.status(500).json({ error: 'Failed to download audio', message: finalErr.message });
    }
  } catch (err) {
    console.error('[download-audio] unexpected:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed', message: err.message });
  }
});

// List files in downloads folder (if accessible)
app.get("/api/downloads", async (req, res) => {
  try {
    await ensureDownloadsDir();
    const files = await fs.readdir(DOWNLOADS_DIR);
    const details = await Promise.all(files.map(async (f) => {
      const stats = await fs.stat(path.join(DOWNLOADS_DIR, f));
      return {
        filename: f,
        size: stats.size,
        created: stats.birthtime,
        downloadUrl: `/downloads/${f}`
      };
    }));
    res.json(details);
  } catch (err) {
    console.error("/api/downloads error:", err);
    res.status(500).json({ error: "Failed to list downloads" });
  }
});

// Serve downloads statically (only works if DOWNLOADS_DIR is readable by node process)
try {
  app.use("/downloads", express.static(DOWNLOADS_DIR));
} catch (e) {
  console.warn("Could not mount static downloads:", e?.message || e);
}

// Delete file
app.delete("/api/downloads/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    await fs.unlink(path.join(DOWNLOADS_DIR, filename));
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting file:", err);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// Contact endpoint (saves to downloads/contacts when SMTP not configured)
let nodemailer;
try { nodemailer = require('nodemailer'); } catch (e) { nodemailer = null; }

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message required' });

    const contact = { name: name || 'Anonymous', email: email || null, message, receivedAt: new Date().toISOString() };

    if (nodemailer && process.env.SMTP_HOST && process.env.CONTACT_TO_EMAIL) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
        });
        await transporter.sendMail({
          from: process.env.SMTP_FROM || (contact.email || 'no-reply@example.com'),
          to: process.env.CONTACT_TO_EMAIL,
          subject: `Contact from ${contact.name}`,
          text: `Name: ${contact.name}\nEmail: ${contact.email || 'N/A'}\n\n${contact.message}`
        });
        return res.json({ success: true, sent: true });
      } catch (mailErr) {
        console.warn('Failed to send mail, falling back to file:', mailErr.message || mailErr);
      }
    }

    await ensureDownloadsDir();
    const contactsDir = path.join(DOWNLOADS_DIR, 'contacts');
    await fs.mkdir(contactsDir, { recursive: true });
    const filename = `contact-${Date.now()}.json`;
    await fs.writeFile(path.join(contactsDir, filename), JSON.stringify(contact, null, 2), 'utf8');
    res.json({ success: true, saved: true, path: `/downloads/contacts/${filename}` });
  } catch (err) {
    console.error('/api/contact error', err);
    res.status(500).json({ error: 'Failed to process contact', message: err.message });
  }
});

// generic error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: "Something went wrong" });
});

// Start server after ensuring downloads dir and yt-dlp
ensureDownloadsDir().then(async () => {
  await ensureYtDlp();
  const server = app.listen(PORT, "0.0.0.0", () => {
    const addr = server.address();
    console.log(`🚀 Swift Shorts Downloader Backend running at http://${addr.address}:${addr.port}`);
    console.log(`📁 Downloads directory: ${DOWNLOADS_DIR}`);
  });
}).catch(async (e) => {
  console.error("Failed to initialize downloads dir:", e);
  await ensureYtDlp();
  // Start anyway
  const server = app.listen(PORT, "0.0.0.0", () => {
    const addr = server.address();
    console.log(`🚀 Swift Shorts Downloader Backend running at http://${addr.address}:${addr.port}`);
    console.log(`📁 Downloads directory (fallback): ${DOWNLOADS_DIR}`);
  });
});
