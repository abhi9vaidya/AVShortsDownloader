// server.js (play-dl version)
const express = require("express");
const cors = require("cors");
const play = require("play-dl");
const youtubedl = require('youtube-dl-exec'); // optional (might not be used directly)
let ytdl;
try { ytdl = require('ytdl-core'); } catch (e) { ytdl = null; }
const path = require("path");
const fs = require("fs").promises;
const { createWriteStream } = require("fs");
const sanitize = require("sanitize-filename");
const { spawn } = require('child_process');
const os = require('os');
const { join } = require('path');
const fsSync = require('fs'); // for createReadStream & unlinkSync

const app = express();
const PORT = process.env.PORT || 3000;

// During development allow all origins so browser requests from Vite don't get blocked by CORS.
// In production restrict this to your frontend origin(s).
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());
app.use(express.static("public"));

// Load env (optional)
require('dotenv').config();

// nodemailer for sending contact emails (optional)
let nodemailer;
try { nodemailer = require('nodemailer'); } catch (e) { nodemailer = null; }

// Default downloads dir; can be overridden with env DOWNLOADS_DIR
let DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || path.join(__dirname, "downloads");

// Attempt to create the downloads directory. If that fails due to permissions (EACCES),
// fall back to a writable temp directory and log a warning.
async function ensureDownloadsDir() {
  try {
    await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
    return;
  } catch (err) {
    // If permission denied, pick a fallback in the system temp dir or home
    if (err && (err.code === 'EACCES' || err.code === 'EPERM')) {
      const fallback = path.join(os.tmpdir(), "avshorts-downloads");
      try {
        await fs.mkdir(fallback, { recursive: true });
        DOWNLOADS_DIR = fallback;
        console.warn(`[WARN] Could not create ${path.join(__dirname,"downloads")}, using fallback ${DOWNLOADS_DIR}`);
        return;
      } catch (err2) {
        console.error("[FATAL] Could not create fallback downloads dir:", err2);
      }
    }
    // For any other errors, log and continue — routes will handle missing dir errors
    console.error("Error creating downloads dir:", err);
  }
}

// run at startup (fire-and-forget but log errors)
ensureDownloadsDir().catch(console.error);

// ------------------ ROUTES ------------------

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Swift Shorts Downloader API is running" });
});

// Helpful root route so browser GET / doesn't return "Cannot GET /"
app.get("/", (req, res) => {
  res.send(`Swift Shorts Downloader API — health: GET /health — downloads dir: ${DOWNLOADS_DIR}`);
});

// Validate YouTube URL
function isValidYouTubeUrl(url) {
  const patterns = [
    /^(https?:\/\/)?(www\.)?(youtube\.com\/shorts\/|youtu\.be\/)/,
    /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=/
  ];
  return patterns.some((pattern) => pattern.test(url));
}

// Get video info
app.post("/api/video-info", async (req, res) => {
  console.log('[api/video-info] incoming request from', req.ip, 'body=', JSON.stringify(req.body).slice(0,200));
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });
    if (!isValidYouTubeUrl(url))
      return res.status(400).json({ error: "Invalid YouTube URL" });
    // Prefer ytdl-core for metadata (more consistent). If ytdl-core not available or fails,
    // fall back to play.video_info.
    let title = null, author = null, lengthSeconds = null, viewCount = null, thumbnail = null, description = null, uploadDate = null;
    let formats = [];

    if (ytdl) {
      try {
        console.log('[video-info] using ytdl-core to get info');
        const yi = await ytdl.getInfo(url);
        title = yi.videoDetails?.title || yi.player_response?.videoDetails?.title || null;
        author = yi.videoDetails?.author?.name || null;
        lengthSeconds = String(yi.videoDetails?.lengthSeconds || '');
        viewCount = String(yi.videoDetails?.viewCount || '');
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

        console.log('[video-info] ytdl-core formats count=', formats.length);
      } catch (yerr) {
        console.warn('[video-info] ytdl-core failed, falling back to play.video_info:', yerr?.message || yerr);
      }
    }

    // If ytdl didn't produce formats, try play.video_info
    if ((!formats || formats.length === 0)) {
      try {
        const info = await play.video_info(url);
        console.log('[video-info] play.video_info fetched; formats count=', (info.formats || []).length);
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
        console.warn('[video-info] play.video_info also failed:', err2?.message || err2);
      }
    }

    // If still no formats, attempt to call yt-dlp -J and parse JSON output (requires yt-dlp in PATH)
    if ((!formats || formats.length === 0)) {
      try {
        console.log('[video-info] attempting yt-dlp -J fallback (needs yt-dlp on PATH)');
        const spawnOpts = { stdio: ['ignore', 'pipe', 'pipe'] };
        const child = spawn('yt-dlp', ['-J', url], spawnOpts);
        let out = '';
        let errOut = '';
        child.stdout.on('data', (c) => out += c.toString());
        child.stderr.on('data', (c) => errOut += c.toString());

        const exitCode = await new Promise((resolve, reject) => {
          child.on('error', (e) => reject(e));
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
            console.log('[video-info] yt-dlp returned formats count=', formats.length);
          } catch (parseErr) {
            console.warn('[video-info] failed to parse yt-dlp JSON:', parseErr?.message || parseErr);
          }
        } else {
          console.warn('[video-info] yt-dlp -J failed:', exitCode, errOut.substring(0, 200));
        }
      } catch (ytdlpErr) {
        console.warn('[video-info] yt-dlp fallback error:', ytdlpErr?.message || ytdlpErr);
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
    console.error("Error fetching video info:", err);
    res.status(500).json({
      error: "Failed to fetch video information",
      message: err.message
    });
  }
});

// Robust /api/download handler: play-dl first, yt-dlp (spawn) fallback
app.post("/api/download", async (req, res) => {
  try {
    const { url, quality } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL is required" });

    console.log("[download] requested:", { url, quality });
    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    // Try play-dl first (do NOT pass string 'highest' or 'lowest' as quality to play.stream)
    try {
      const info = await play.video_info(url);
      const title = sanitize((info.video_details && info.video_details.title) || "video");
      const filename = `${title}-${Date.now()}.mp4`;

      // Set headers *before* piping
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "video/mp4");

      // Only pass numeric quality or no quality (let play choose)
      // If quality is a number-like string or number, pass it; otherwise call without second arg
      let streamInfo;
      if (quality && !isNaN(Number(quality))) {
        streamInfo = await play.stream(url, { quality: Number(quality) }).catch(e => {
          console.warn("[download] play.stream (with numeric quality) failed:", e?.message || e);
          return null;
        });
      } else {
        streamInfo = await play.stream(url).catch(e => {
          console.warn("[download] play.stream (no quality) failed:", e?.message || e);
          return null;
        });
      }

      if (streamInfo && streamInfo.stream) {
        console.log("[download] using play-dl stream, type:", streamInfo.type);
        streamInfo.stream.on("error", (e) => console.error("[download] play stream error:", e));
        streamInfo.stream.pipe(res);
        return; // done
      }

      console.log("[download] play-dl did not provide a usable stream — will try yt-dlp fallback");
      // fallthrough to yt-dlp fallback
    } catch (playErr) {
      console.warn("[download] play-dl overall error (falling back):", playErr?.message || playErr);
      // continue to yt-dlp fallback
    }

    // -------------------------
    // Fallback: spawn yt-dlp to stream merged bestvideo+bestaudio -> stdout -> response
    // -------------------------

    // Fallback: download merged file locally then stream it
    try {
      // tmp file path
      const tmpDir = os.tmpdir();
      const tmpFilename = `video-${Date.now()}.%(ext)s`; // yt-dlp will replace ext
      const tmpFilepathPattern = join(tmpDir, tmpFilename);

      // Use yt-dlp to download & merge into a file (requires ffmpeg for merging)
      const ytdlpArgsFile = [
        '--no-playlist',
        '-f', 'bestvideo+bestaudio/best',
        '-o', tmpFilepathPattern,
        url
      ];

      console.log('[download] yt-dlp file-download args:', ytdlpArgsFile.join(' '));
      const child = spawn('yt-dlp', ytdlpArgsFile, { stdio: ['ignore', 'pipe', 'pipe'] });

      // capture stderr for logs
      child.stderr.on('data', (c) => console.log('[yt-dlp stderr]', c.toString().trim()));

      const exitCode = await new Promise((resolve, reject) => {
        child.on('error', (err) => reject(err));
        child.on('close', (code) => resolve(code));
      });

      console.log('[download] yt-dlp finished with code', exitCode);

      if (exitCode !== 0) {
        throw new Error('yt-dlp failed to download/merge video (check server logs for details)');
      }

      // find the downloaded file (yt-dlp replaces %(ext)s) — pick newest matching file
      const files = fsSync.readdirSync(tmpDir).filter(f => f.startsWith('video-'));
      const candidates = files.map(f => ({ f, t: fsSync.statSync(join(tmpDir, f)).mtimeMs }))
                              .sort((a,b) => b.t - a.t);
      if (!candidates || candidates.length === 0) {
        throw new Error('Downloaded file not found in temp dir');
      }
      const downloadedFile = join(tmpDir, candidates[0].f);

      // Stream the merged file to the client
      const stat = fsSync.statSync(downloadedFile);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(downloadedFile)}"`);
      res.setHeader('Content-Type', 'video/mp4');

      const readStream = fsSync.createReadStream(downloadedFile);
      readStream.pipe(res);
      readStream.on('close', () => {
        setTimeout(() => {
          fsSync.unlink(downloadedFile, (e) => {
            if (e) console.warn('Could not delete tmp file (will auto-clean later):', e.code);
            else console.log('[download] deleted tmp file', downloadedFile);
          });
        }, 2000);
        console.log('[download] served file', downloadedFile);
      });

      readStream.on('error', (e) => {
        console.error('[download] readStream error', e);
        try { fsSync.unlinkSync(downloadedFile); } catch (e) {}
      });

      return;
    } catch (fileFallbackErr) {
      console.error('[download] yt-dlp file fallback error:', fileFallbackErr);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'yt-dlp fallback failed', message: fileFallbackErr.message });
      }
    }

    // yt-dlp must be installed and in PATH for this to work.
    // Recommended format string: bestvideo+bestaudio/best
    const ytdlpCmd = "yt-dlp";
    const ytdlpArgs = [
      '--no-playlist',
      '-f', 'bestvideo+bestaudio/best',
      '-o', '-', // output to stdout
      url
    ];

    console.log("[download] attempting yt-dlp fallback:", ytdlpCmd, ytdlpArgs.join(' '));

    // spawn yt-dlp
    const child = spawn(ytdlpCmd, ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    // If spawn failed immediately (ENOENT) child.error event will fire
    child.on('error', (err) => {
      console.error("[download] yt-dlp spawn error:", err);
      if (!res.headersSent) {
        // Helpful message for the client / frontend to display
        return res.status(500).json({
          error: "yt-dlp not found or failed to spawn",
          message: err.message,
          help: "Install yt-dlp and ensure it's on PATH. e.g. 'pip install -U yt-dlp' or download binary from https://github.com/yt-dlp/yt-dlp/releases"
        });
      }
    });

    // Set headers for fallback stream
    const fallbackFilename = `video-${Date.now()}.mp4`;
    if (!res.headersSent) {
      res.setHeader("Content-Disposition", `attachment; filename="${fallbackFilename}"`);
      res.setHeader("Content-Type", "video/mp4");
    }

    // Pipe stdout from yt-dlp into the response
    child.stdout.pipe(res);

    // Log stderr for debugging
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      // Print relevant stderr to console; avoid huge logs otherwise
      console.log("[yt-dlp stderr]", text.trim());
    });

    child.on('close', (code, signal) => {
      console.log(`[download] yt-dlp exited with code ${code} signal ${signal}`);
    });

    return;
  } catch (err) {
    console.error("[download] unexpected error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to download video", message: err.message });
    }
  }
});

// Download to server
app.post("/api/download-to-server", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    const info = await play.video_info(url);
    const title = sanitize(info.video_details.title);
    const filename = `${title}-${Date.now()}.mp4`;
    const filepath = path.join(DOWNLOADS_DIR, filename);

    const stream = await play.stream(url, { quality: "highest" });
    const writer = createWriteStream(filepath);
    stream.stream.pipe(writer);

    writer.on("finish", () => {
      res.json({
        success: true,
        message: "Video downloaded successfully",
        filename,
        filepath: `/downloads/${filename}`
      });
    });

    writer.on("error", (err) => {
      console.error("Write error:", err);
      res.status(500).json({ error: "Failed to save video" });
    });
  } catch (err) {
    console.error("Error downloading video:", err);
    res.status(500).json({
      error: "Failed to download video",
      message: err.message
    });
  }
});

// Audio only
app.post("/api/download-audio", async (req, res) => {
  try {
    const { url, quality } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL is required" });

    console.log('[download-audio] requested', { url, quality });

    // Try play-dl first
    try {
      // Choose best audio quality or a numeric itag if provided
      let playQuality = 'highestaudio';
      if (quality && String(quality).toLowerCase() !== 'highest' && !isNaN(Number(quality))) {
        playQuality = Number(quality);
      }

      const info = await play.video_info(url).catch(() => null);
      const title = info && info.video_details ? sanitize(info.video_details.title) : `audio-${Date.now()}`;
      const filename = `${title}-${Date.now()}.mp3`;

      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "audio/mpeg");

      const streamInfo = await play.stream(url, { quality: playQuality }).catch((e) => {
        console.warn('[download-audio] play.stream failed:', e?.message || e);
        return null;
      });

      if (streamInfo && streamInfo.stream) {
        console.log('[download-audio] piping play-dl stream');
        streamInfo.stream.on('error', (e) => console.error('[download-audio] play stream error:', e));
        streamInfo.stream.pipe(res);
        return;
      }
    } catch (playErr) {
      console.warn('[download-audio] play-dl attempt failed:', playErr?.message || playErr);
    }

    // Fallback: try streaming with yt-dlp directly to stdout (bestaudio)
    try {
      console.log('[download-audio] attempting yt-dlp streaming fallback');
      const ytdlpCmd = 'yt-dlp';
      const ytdlpArgs = ['--no-playlist', '-f', 'bestaudio', '-o', '-', url];
      const child = spawn(ytdlpCmd, ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

      child.on('error', (err) => {
        console.error('[download-audio] yt-dlp spawn error:', err);
        if (!res.headersSent) {
          return res.status(500).json({ error: 'yt-dlp spawn failed', message: err.message });
        }
      });

      const fallbackFilename = `audio-${Date.now()}.mp3`;
      if (!res.headersSent) {
        res.setHeader('Content-Disposition', `attachment; filename="${fallbackFilename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
      }

      // Pipe stdout from yt-dlp into the response
      child.stdout.pipe(res);

      child.stderr.on('data', (chunk) => console.log('[yt-dlp stderr]', chunk.toString().trim()));

      child.on('close', (code) => {
        console.log(`[download-audio] yt-dlp exited with code ${code}`);
      });

      return;
    } catch (ytdlpErr) {
      console.warn('[download-audio] yt-dlp streaming fallback failed:', ytdlpErr?.message || ytdlpErr);
    }

    // Final fallback: download to temp file via yt-dlp then stream the file
    try {
      console.log('[download-audio] attempting yt-dlp file-download fallback');
      const tmpDir = os.tmpdir();
      const tmpFilename = `audio-${Date.now()}.%(ext)s`;
      const tmpFilepathPattern = join(tmpDir, tmpFilename);

      const args = ['--no-playlist', '-f', 'bestaudio', '-o', tmpFilepathPattern, url];
      const child = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stderr.on('data', (c) => console.log('[yt-dlp stderr]', c.toString().trim()));

      const exitCode = await new Promise((resolve, reject) => {
        child.on('error', (err) => reject(err));
        child.on('close', (code) => resolve(code));
      });

      if (exitCode !== 0) throw new Error('yt-dlp failed to download audio');

      // pick the newest matching file in tmp
      const files = fsSync.readdirSync(tmpDir).filter(f => f.startsWith('audio-'));
      const candidates = files.map(f => ({ f, t: fsSync.statSync(join(tmpDir, f)).mtimeMs })).sort((a,b) => b.t - a.t);
      if (!candidates || candidates.length === 0) throw new Error('downloaded audio file not found');
      const downloadedFile = join(tmpDir, candidates[0].f);

      const stat = fsSync.statSync(downloadedFile);
      if (!res.headersSent) {
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(downloadedFile)}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
      }

      const readStream = fsSync.createReadStream(downloadedFile);
      readStream.pipe(res);
      readStream.on('close', () => {
        setTimeout(() => {
          fsSync.unlink(downloadedFile, (e) => {
            if (e) console.warn('Could not delete tmp file (will auto-clean later):', e.code);
            else console.log('[download-audio] deleted tmp file', downloadedFile);
          });
        }, 2000);
      });

      readStream.on('error', (e) => {
        console.error('[download-audio] readStream error', e);
        try { fsSync.unlinkSync(downloadedFile); } catch (e) {}
      });

      return;
    } catch (finalErr) {
      console.error('[download-audio] all fallbacks failed:', finalErr);
      if (!res.headersSent) return res.status(500).json({ error: 'Failed to download audio', message: finalErr.message });
    }
  } catch (err) {
    console.error("Error downloading audio:", err);
    if (!res.headersSent)
      res.status(500).json({
        error: "Failed to download audio",
        message: err.message
      });
  }
});

// List downloaded files
app.get("/api/downloads", async (req, res) => {
  try {
    const files = await fs.readdir(DOWNLOADS_DIR);
    const details = await Promise.all(
      files.map(async (f) => {
        const stats = await fs.stat(path.join(DOWNLOADS_DIR, f));
        return {
          filename: f,
          size: stats.size,
          created: stats.birthtime,
          downloadUrl: `/downloads/${f}`
        };
      })
    );
    res.json(details);
  } catch (err) {
    console.error("Error listing downloads:", err);
    res.status(500).json({ error: "Failed to list downloads" });
  }
});

// Serve downloads directory dynamically (use current DOWNLOADS_DIR value)
app.use("/downloads", (req, res, next) => {
  // express.static returns a middleware function; call it with current DOWNLOADS_DIR
  return express.static(DOWNLOADS_DIR)(req, res, next);
});

app.delete("/api/downloads/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    await fs.unlink(path.join(DOWNLOADS_DIR, filename));
    res.json({ success: true, message: "File deleted successfully" });
  } catch (err) {
    console.error("Error deleting file:", err);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// Contact form endpoint: send email if SMTP configured, otherwise save to downloads/contacts
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const contact = {
      name: name || 'Anonymous',
      email: email || null,
      message,
      receivedAt: new Date().toISOString()
    };

    const smtpHost = process.env.SMTP_HOST;

    // If nodemailer and SMTP config present, attempt to send mail
    if (nodemailer && smtpHost && process.env.CONTACT_TO_EMAIL) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: process.env.SMTP_USER ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          } : undefined
        });

        const mail = {
          from: process.env.SMTP_FROM || (contact.email || 'no-reply@example.com'),
          to: process.env.CONTACT_TO_EMAIL,
          subject: `New contact form message from ${contact.name}`,
          text: `Name: ${contact.name}\nEmail: ${contact.email || 'N/A'}\n\nMessage:\n${contact.message}`
        };

        await transporter.sendMail(mail);
        return res.json({ success: true, sent: true });
      } catch (mailErr) {
        console.warn('Failed to send contact email, falling back to file save:', mailErr.message || mailErr);
        // fall through to file save
      }
    }

    // Fallback: save to downloads/contacts
    const contactsDir = path.join(DOWNLOADS_DIR, 'contacts');
    await fs.mkdir(contactsDir, { recursive: true });
    const filename = `contact-${Date.now()}.json`;
    await fs.writeFile(path.join(contactsDir, filename), JSON.stringify(contact, null, 2), 'utf8');

    return res.json({ success: true, saved: true, path: `/downloads/contacts/${filename}` });
  } catch (err) {
    console.error('/api/contact error', err);
    res.status(500).json({ error: 'Failed to process contact message', message: err.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  const addr = server.address();
  console.log(`🚀 Swift Shorts Downloader Backend running at http://${addr.address}:${addr.port}`);
  console.log(`📁 Downloads directory: ${DOWNLOADS_DIR}`);
});
