// server.js (updated)
// Serves a production frontend build (./dist) at / and provides API endpoints.
// If creating the downloads directory fails due to permissions, fall back to os.tmpdir().

const express = require("express");
const cors = require("cors");
const play = require("play-dl");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const { createWriteStream } = require("fs");
const sanitize = require("sanitize-filename");
const os = require("os");

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

// Serve static frontend from ./dist if it exists (production build)
const DIST_DIR = path.join(__dirname, "dist");
if (fsSync.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  // SPA fallback: serve index.html for any non-API GET
  app.get(/^\/(?!api\/|health).*/, (req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
} else {
  // If dist doesn't exist, keep a small root message for convenience
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

    let title = null, author = null, lengthSeconds = null, viewCount = null, thumbnail = null, description = null, uploadDate = null;
    let formats = [];

    if (ytdl) {
      try {
        const yi = await ytdl.getInfo(url);
        title = yi.videoDetails?.title || null;
        author = yi.videoDetails?.author?.name || null;
        lengthSeconds = String(yi.videoDetails?.lengthSeconds || "");
        viewCount = String(yi.videoDetails?.viewCount || "");
        thumbnail = yi.videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url || null;
        description = yi.videoDetails?.shortDescription || null;
        uploadDate = yi.videoDetails?.uploadDate || null;

        formats = (yi.formats || []).map((f) => ({
          quality: f.qualityLabel || (f.audioBitrate ? `${f.audioBitrate} kbps` : null) || null,
          container: f.container || (f.mimeType ? String(f.mimeType).split(';')[0].split('/').pop() : null) || null,
          hasAudio: !!f.audioBitrate || /audio/i.test(String(f.mimeType)),
          hasVideo: !!f.qualityLabel || !!f.width || /video/i.test(String(f.mimeType)),
          itag: f.itag || null
        }));
      } catch (err) {
        console.warn('[video-info] ytdl-core failed:', err?.message || err);
      }
    }

    if ((!formats || formats.length === 0)) {
      try {
        const info = await play.video_info(url);
        const video = info.video_details || {};
        title = title || video.title || null;
        author = author || video.channel?.name || null;
        lengthSeconds = lengthSeconds || (video.durationInSec ? String(video.durationInSec) : null);
        viewCount = viewCount || (video.views ? String(video.views) : null);
        thumbnail = thumbnail || video.thumbnails?.[video.thumbnails.length - 1]?.url || null;
        description = description || video.description || null;
        uploadDate = uploadDate || video.uploadDate || null;

        formats = (info.formats || []).map((f) => ({
          quality: f.qualityLabel || f.quality || null,
          container: f.container || null,
          hasAudio: typeof f.hasAudio === 'boolean' ? f.hasAudio : (f.audioBitrate != null),
          hasVideo: typeof f.hasVideo === 'boolean' ? f.hasVideo : (f.qualityLabel != null || f.fps != null),
          itag: f.itag || null
        }));
      } catch (err2) {
        console.warn('[video-info] play.video_info failed:', err2?.message || err2);
      }
    }

    // yt-dlp fallback (if available) - spawn yt-dlp -J
    if ((!formats || formats.length === 0)) {
      try {
        const child = spawn('yt-dlp', ['-J', url], { stdio: ['ignore', 'pipe', 'pipe'] });
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
            const yformats = parsed.formats || [];
            formats = yformats.map((f) => ({
              quality: f.format_note || f.qualityLabel || (f.abr ? `${f.abr} kbps` : null) || null,
              container: f.ext || (f.format ? String(f.format).split(' ')[0] : null) || null,
              hasAudio: !!(f.acodec && f.acodec !== 'none') || !!f.abr,
              hasVideo: !!(f.vcodec && f.vcodec !== 'none') || !!f.width,
              itag: f.format_id || f.itag || null
            }));
          } catch (parseErr) {
            console.warn('[video-info] failed to parse yt-dlp JSON:', parseErr?.message || parseErr);
          }
        } else {
          console.warn('[video-info] yt-dlp -J failed:', exitCode, errOut.slice(0,200));
        }
      } catch (e) {
        console.warn('[video-info] yt-dlp fallback error:', e?.message || e);
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
      const ytdlpCmd = "yt-dlp";
      const ytdlpArgs = ['--no-playlist', '-f', 'bestvideo+bestaudio/best', '-o', '-', url];
      const child = spawn(ytdlpCmd, ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

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
      const child = spawn('yt-dlp', ['--no-playlist', '-f', 'bestvideo+bestaudio/best', '-o', tmpPattern, url], { stdio: ['ignore', 'pipe', 'pipe'] });
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
      const child = spawn('yt-dlp', ['--no-playlist', '-f', 'bestaudio', '-o', '-', url], { stdio: ['ignore', 'pipe', 'pipe'] });
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
      const child = spawn('yt-dlp', ['--no-playlist', '-f', 'bestaudio', '-o', tmpPattern, url], { stdio: ['ignore', 'pipe', 'pipe'] });
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

// Start server after ensuring downloads dir
ensureDownloadsDir().then(() => {
  const server = app.listen(PORT, "0.0.0.0", () => {
    const addr = server.address();
    console.log(`🚀 Swift Shorts Downloader Backend running at http://${addr.address}:${addr.port}`);
    console.log(`📁 Downloads directory: ${DOWNLOADS_DIR}`);
  });
}).catch((e) => {
  console.error("Failed to initialize downloads dir:", e);
  // Start anyway
  const server = app.listen(PORT, "0.0.0.0", () => {
    const addr = server.address();
    console.log(`🚀 Swift Shorts Downloader Backend running at http://${addr.address}:${addr.port}`);
    console.log(`📁 Downloads directory (fallback): ${DOWNLOADS_DIR}`);
  });
});
