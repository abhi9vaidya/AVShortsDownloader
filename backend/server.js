// backend/server.js
require('./startup-check'); // runs cookie existence check at startup

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const { fetchVideoInfo, downloadVideo, DOWNLOADS_DIR } = require('./yt-dlp-run');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Simple health endpoint
app.get('/healthz', (req, res) => res.json({ ok: true }));

// video-info: returns yt-dlp JSON metadata
app.post('/api/video-info', async (req, res) => {
  const url = req.body && req.body.url;
  if (!url) return res.status(400).json({ error: 'missing url' });
  try {
    const info = await fetchVideoInfo(url);
    return res.json(info);
  } catch (err) {
    console.error('video-info error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// download endpoint: triggers yt-dlp download and returns path (or link)
app.post('/api/download', async (req, res) => {
  const url = req.body && req.body.url;
  if (!url) return res.status(400).json({ error: 'missing url' });

  try {
    // optional filename hint: req.body.filename
    const hint = req.body.filename || null;
    const outFile = await downloadVideo(url, hint);
    if (!outFile) return res.status(500).json({ error: 'download completed but could not determine file path' });

    // If you serve downloads via static route, return a relative URL
    // Example: serve DOWNLOADS_DIR via /downloads static route
    const publicPath = '/downloads/' + path.basename(outFile);
    return res.json({ file: publicPath, path: outFile });
  } catch (err) {
    console.error('download error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// Serve downloads directory (note: Render's filesystem is ephemeral)
app.use('/downloads', express.static(DOWNLOADS_DIR, { dotfiles: 'deny', index: false }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Swift Shorts Downloader Backend running at http://0.0.0.0:${PORT}`);
  console.log(`Downloads directory: ${DOWNLOADS_DIR}`);
});
