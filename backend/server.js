// server.js (play-dl version)
const express = require("express");
const cors = require("cors");
const play = require("play-dl");
const youtubedl = require('youtube-dl-exec'); // add near top of server.js
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

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:8080"],
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());
app.use(express.static("public"));

const DOWNLOADS_DIR = path.join(__dirname, "downloads");
fs.mkdir(DOWNLOADS_DIR, { recursive: true }).catch(console.error);

// ------------------ ROUTES ------------------

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Swift Shorts Downloader API is running" });
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
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });
    if (!isValidYouTubeUrl(url))
      return res.status(400).json({ error: "Invalid YouTube URL" });

    const info = await play.video_info(url);
    const video = info.video_details;
    const thumb = video.thumbnails?.[video.thumbnails.length - 1]?.url;

    const formats = (info.formats || []).map((f) => ({
      quality: f.qualityLabel || f.quality,
      container: f.container,
      hasAudio: f.hasAudio,
      hasVideo: f.hasVideo,
      itag: f.itag
    }));

    res.json({
      title: video.title,
      author: video.channel?.name,
      lengthSeconds: video.durationInSec?.toString(),
      viewCount: video.views?.toString(),
      thumbnail: thumb,
      description: video.description,
      uploadDate: video.uploadDate,
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

// Robust /api/download with play-dl then yt-dlp fallback


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
  // -f bestvideo+bestaudio/best  -> prefer merged
  // -o <pattern>                 -> output file pattern
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
  const files = fsSync.readdirSync(tmpDir)
    .filter(f => f.startsWith('video-') && f.includes(String(Date.now()).slice(0,4)) === false ? true : true ); // simpler: find by prefix
  // Better: get the file that was created most recently
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
    const ytdlpCmd = "yt-dlp"; // on Windows this might be yt-dlp.exe
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
      // If it ended with non-zero code and nothing was written, client may receive truncated file
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
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    const info = await play.video_info(url);
    const title = sanitize(info.video_details.title);
    const filename = `${title}-${Date.now()}.mp3`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "audio/mpeg");

    const stream = await play.stream(url, { quality: "highestaudio" });
    stream.stream.pipe(res);
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

app.use("/downloads", express.static(DOWNLOADS_DIR));

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
