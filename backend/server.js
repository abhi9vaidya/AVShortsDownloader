// server.js (updated)
const express = require("express");
const cors = require("cors");
const play = require("play-dl");
const { spawn } = require("child_process");
const youtubedl = require("youtube-dl-exec"); // kept for potential use
let ytdl;
try { ytdl = require('ytdl-core'); } catch (e) { ytdl = null; }
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const { createWriteStream } = require("fs");
const sanitize = require("sanitize-filename");
const os = require("os");

require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT) || 10000;

// downloads dir (allow override)
let DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || path.join(__dirname, "downloads");

// Attempt to create downloads dir, fallback to os.tmpdir() if EACCES
(async () => {
  try {
    await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
    console.log(`📁 Downloads directory: ${DOWNLOADS_DIR}`);
  } catch (err) {
    console.warn(`[startup] Could not create downloads dir at ${DOWNLOADS_DIR}:`, err?.code || err?.message || err);
    const fallback = path.join(os.tmpdir(), "avshorts-downloads");
    try {
      await fs.mkdir(fallback, { recursive: true });
      DOWNLOADS_DIR = fallback;
      console.log(`[startup] Using fallback downloads dir: ${DOWNLOADS_DIR}`);
    } catch (err2) {
      console.error('[startup] Failed to create fallback downloads dir:', err2?.message || err2);
      // keep DOWNLOADS_DIR as-is (may fail later) but continue
    }
  }
})();

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

// Serve static frontend assets from ./public (put your built SPA here)
const staticDir = path.join(__dirname, "public");
app.use(express.static(staticDir));

// --- Helper: validate YouTube URL ---
function isValidYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const patterns = [
    /^(https?:\/\/)?(www\.)?(youtube\.com\/shorts\/|youtu\.be\/)/,
    /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=/
  ];
  return patterns.some((pattern) => pattern.test(url));
}

// ---------------- ROUTES ----------------

// Health
app.get("/health", (req, res) => {
  res.send(`Swift Shorts Downloader API — health: GET /health — downloads dir: ${DOWNLOADS_DIR}`);
});

// Video info
app.post("/api/video-info", async (req, res) => {
  try {
    const { url } = req.body || {};
    console.log('[api/video-info] incoming request from', req.ip, 'body=', JSON.stringify(req.body).slice(0,200));
    if (!url) return res.status(400).json({ error: "URL is required" });
    if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: "Invalid YouTube URL" });

    let title = null, author = null, lengthSeconds = null, viewCount = null, thumbnail = null, description = null, uploadDate = null;
    let formats = [];

    // Try ytdl-core first
    if (ytdl) {
      try {
        console.log('[video-info] using ytdl-core to get info');
        const yi = await ytdl.getInfo(url);
        title = yi.videoDetails?.title || null;
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
        console.warn('[video-info] ytdl-core failed:', yerr?.message || yerr);
      }
    }

    // play-dl fallback
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
        console.warn('[video-info] play.video_info failed:', err2?.message || err2);
      }
    }

    // yt-dlp -J fallback (if still empty)
    if ((!formats || formats.length === 0)) {
      try {
        console.log('[video-info] attempting yt-dlp -J fallback (needs yt-dlp on PATH)');
        const child = spawn('yt-dlp', ['-J', url], { stdio: ['ignore', 'pipe', 'pipe'] });

        let out = '';
        let errOut = '';
        child.stdout.on('data', (c) => out += c.toString());
        child.stderr.on('data', (c) => errOut += c.toString());

        const exitCode = await new Promise((resolve, reject) => {
          child.on('error', (e) => reject(e));
          child.on('close', (code) => resolve(code));
        });

        if (exitCode === 0 && out) {
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

// ------------------ DOWNLOAD (video) ------------------
app.post("/api/download", async (req, res) => {
  try {
    const { url, quality } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL is required" });
    if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: "Invalid YouTube URL" });

    console.log("[download] requested:", { url, quality });

    // Try play-dl streaming first
    try {
      const info = await play.video_info(url).catch(() => null);
      const title = info && info.video_details ? sanitize(info.video_details.title) : `video-${Date.now()}`;
      const filename = `${title}-${Date.now()}.mp4`;

      // set headers before piping
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "video/mp4");

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
        return;
      }

      console.log("[download] play-dl did not provide a usable stream — will try yt-dlp fallback");
    } catch (playErr) {
      console.warn("[download] play-dl error, falling back:", playErr?.message || playErr);
    }

    // Fallback: try yt-dlp to download merged file to tmp and stream
    try {
      const tmpDir = os.tmpdir();
      const tmpPattern = `video-${Date.now()}.%(ext)s`;
      const tmpFilepathPattern = path.join(tmpDir, tmpPattern);

      const args = ['--no-playlist', '-f', 'bestvideo+bestaudio/best', '-o', tmpFilepathPattern, url];
      console.log('[download] yt-dlp file-download args:', args.join(' '));

      const child = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      child.stderr.on('data', (c) => console.log('[yt-dlp stderr]', c.toString().trim()));

      const exitCode = await new Promise((resolve, reject) => {
        child.on('error', (err) => reject(err));
        child.on('close', (code) => resolve(code));
      });

      console.log('[download] yt-dlp finished with code', exitCode);

      if (exitCode !== 0) {
        throw new Error('yt-dlp failed to download/merge video');
      }

      // Find newest matching file in tmp dir
      const files = fsSync.readdirSync(tmpDir).filter(f => f.startsWith('video-'));
      const candidates = files.map(f => ({ f, t: fsSync.statSync(path.join(tmpDir, f)).mtimeMs }))
                              .sort((a,b) => b.t - a.t);
      if (!candidates || candidates.length === 0) throw new Error('Downloaded file not found in temp dir');
      const downloadedFile = path.join(tmpDir, candidates[0].f);

      const stat = fsSync.statSync(downloadedFile);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(downloadedFile)}"`);
      res.setHeader('Content-Type', 'video/mp4');

      const readStream = fsSync.createReadStream(downloadedFile);
      readStream.pipe(res);
      readStream.on('close', () => {
        setTimeout(() => {
          fsSync.unlink(downloadedFile, (e) => {
            if (e) console.warn('[download] Could not delete tmp file:', e.code || e?.message);
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

    // Final fallback: stream yt-dlp to stdout
    try {
      const ytdlpCmd = "yt-dlp";
      const ytdlpArgs = ['--no-playlist', '-f', 'bestvideo+bestaudio/best', '-o', '-', url];
      console.log("[download] attempting yt-dlp streaming fallback:", ytdlpCmd, ytdlpArgs.join(' '));
      const child = spawn(ytdlpCmd, ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

      child.on('error', (err) => {
        console.error("[download] yt-dlp spawn error:", err);
        if (!res.headersSent) {
          return res.status(500).json({
            error: "yt-dlp not found or failed to spawn",
            message: err.message,
            help: "Install yt-dlp and ensure it's on PATH"
          });
        }
      });

      const fallbackFilename = `video-${Date.now()}.mp4`;
      if (!res.headersSent) {
        res.setHeader("Content-Disposition", `attachment; filename="${fallbackFilename}"`);
        res.setHeader("Content-Type", "video/mp4");
      }

      child.stdout.pipe(res);
      child.stderr.on('data', (chunk) => console.log("[yt-dlp stderr]", chunk.toString().trim()));
      child.on('close', (code, signal) => {
        console.log(`[download] yt-dlp exited with code ${code} signal ${signal}`);
      });

      return;
    } catch (err) {
      console.error('[download] final fallback failed:', err);
      if (!res.headersSent) return res.status(500).json({ error: 'Failed to download video', message: err.message });
    }
  } catch (err) {
    console.error("[download] unexpected error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to download video", message: err.message });
  }
});

// ------------------ DOWNLOAD TO SERVER ------------------
app.post("/api/download-to-server", async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL is required" });

    const info = await play.video_info(url);
    const title = sanitize(info?.video_details?.title || `video-${Date.now()}`);
    const filename = `${title}-${Date.now()}.mp4`;
    const filepath = path.join(DOWNLOADS_DIR, filename);

    const streamInfo = await play.stream(url, { quality: "highest" }).catch(e => null);
    if (!streamInfo || !streamInfo.stream) {
      return res.status(500).json({ error: "Failed to get stream from play-dl" });
    }

    const writer = createWriteStream(filepath);
    streamInfo.stream.pipe(writer);

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

// ------------------ AUDIO ONLY ------------------
app.post("/api/download-audio", async (req, res) => {
  try {
    const { url, quality } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL is required" });

    console.log('[download-audio] requested', { url, quality });

    // Try play-dl first
    try {
      let playQuality = 'highestaudio';
      if (quality && String(quality).toLowerCase() !== 'highest' && !isNaN(Number(quality))) {
        playQuality = Number(quality);
      }

      const info = await play.video_info(url).catch(() => null);
      const title = info?.video_details ? sanitize(info.video_details.title) : `audio-${Date.now()}`;
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

    // Fallback: stream yt-dlp bestaudio to stdout
    try {
      console.log('[download-audio] attempting yt-dlp streaming fallback');
      const ytdlpArgs = ['--no-playlist', '-f', 'bestaudio', '-o', '-', url];
      const child = spawn('yt-dlp', ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

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

      child.stdout.pipe(res);
      child.stderr.on('data', (chunk) => console.log('[yt-dlp stderr]', chunk.toString().trim()));
      child.on('close', (code) => {
        console.log(`[download-audio] yt-dlp exited with code ${code}`);
      });

      return;
    } catch (ytdlpErr) {
      console.warn('[download-audio] yt-dlp streaming fallback failed:', ytdlpErr?.message || ytdlpErr);
    }

    // Final fallback: download to tmp file then stream
    try {
      console.log('[download-audio] attempting yt-dlp file-download fallback');
      const tmpDir = os.tmpdir();
      const tmpFilename = `audio-${Date.now()}.%(ext)s`;
      const tmpFilepathPattern = path.join(tmpDir, tmpFilename);
      const args = ['--no-playlist', '-f', 'bestaudio', '-o', tmpFilepathPattern, url];
      const child = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stderr.on('data', (c) => console.log('[yt-dlp stderr]', c.toString().trim()));

      const exitCode = await new Promise((resolve, reject) => {
        child.on('error', (err) => reject(err));
        child.on('close', (code) => resolve(code));
      });

      if (exitCode !== 0) throw new Error('yt-dlp failed to download audio');

      // pick newest matching file
      const files = fsSync.readdirSync(tmpDir).filter(f => f.startsWith('audio-'));
      const candidates = files.map(f => ({ f, t: fsSync.statSync(path.join(tmpDir, f)).mtimeMs })).sort((a,b) => b.t - a.t);
      if (!candidates || candidates.length === 0) throw new Error('downloaded audio file not found');
      const downloadedFile = path.join(tmpDir, candidates[0].f);

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
    if (!res.headersSent) res.status(500).json({ error: "Failed to download audio", message: err.message });
  }
});

// ------------------ Downloads listing & delete ------------------
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

// Serve the downloads folder statically
app.use("/downloads", express.static(DOWNLOADS_DIR));

// ------------------ Contact endpoint ------------------
let nodemailer;
try { nodemailer = require('nodemailer'); } catch (e) { nodemailer = null; }

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

// ------------------ SPA fallback ------------------
// Place this after API routes so APIs are handled first.
app.get('*', (req, res, next) => {
  // allow API & downloads to pass through
  if (req.path.startsWith('/api/') || req.path.startsWith('/downloads/')) return next();

  const indexPath = path.join(staticDir, 'index.html');
  if (fsSync.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  } else {
    // helpful fallback for debugging / root view
    return res.status(200).send(`No frontend found. Place your build into ./public (index.html & assets). For health check GET /health`);
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err && err.stack ? err.stack : err);
  if (!res.headersSent) res.status(500).json({ error: 'Server error' });
});

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  const addr = server.address();
  console.log(`🚀 Swift Shorts Downloader Backend running at http://${addr.address}:${addr.port}`);
  console.log(`📁 Downloads directory: ${DOWNLOADS_DIR}`);
});
