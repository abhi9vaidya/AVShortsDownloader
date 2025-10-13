// backend/yt-dlp-run.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const sanitize = require('sanitize-filename');

const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp'; // Use yt-dlp from PATH (installed via pip3)
const COOKIE_PATH = process.env.COOKIE_FILE_PATH || path.join(__dirname, 'cookies.txt');
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || path.join(__dirname, 'downloads');

function ensureDownloadsDir() {
  try {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  } catch (e) {
    // ignore
  }
}

function runYtdlpArgs(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });

    let out = '';
    let err = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => err += d.toString());

    proc.on('close', code => {
      if (code === 0) {
        resolve(out);
      } else {
        reject(new Error(`yt-dlp exited ${code}: ${err || out}`));
      }
    });
  });
}

async function fetchVideoInfo(url) {
  if (!fs.existsSync(COOKIE_PATH)) {
    throw new Error(`Cookie file not found at ${COOKIE_PATH}`);
  }
  const args = ['-J', '--cookies', COOKIE_PATH, url];
  const out = await runYtdlpArgs(args);
  return JSON.parse(out);
}

function downloadVideo(url, filenameHint = null) {
  if (!fs.existsSync(COOKIE_PATH)) {
    return Promise.reject(new Error(`Cookie file not found at ${COOKIE_PATH}`));
  }
  ensureDownloadsDir();

  // sanitize filename hint if provided, otherwise let yt-dlp name it
  let filename = filenameHint ? sanitize(filenameHint) : '%(title)s.%(ext)s';
  // create full output path pattern
  const outPattern = path.join(DOWNLOADS_DIR, filename);

  const args = ['-f', 'best', '--cookies', COOKIE_PATH, '-o', outPattern, url];

  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());

    proc.on('close', code => {
      if (code === 0) {
        // find the newest file matching the filename or pattern
        // If filenameHint was used with extension it's exact; otherwise attempt to pick newest file
        try {
          const files = fs.readdirSync(DOWNLOADS_DIR).map(f => ({
            f,
            mtime: fs.statSync(path.join(DOWNLOADS_DIR, f)).mtimeMs
          })).sort((a,b) => b.mtime - a.mtime);
          if (files.length === 0) return resolve(null);
          return resolve(path.join(DOWNLOADS_DIR, files[0].f));
        } catch (e) {
          return resolve(null);
        }
      } else {
        reject(new Error(`yt-dlp failed (${code}): ${stderr}`));
      }
    });
  });
}

module.exports = { fetchVideoInfo, downloadVideo, DOWNLOADS_DIR };
