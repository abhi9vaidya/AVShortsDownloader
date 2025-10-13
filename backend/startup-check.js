// backend/startup-check.js
const fs = require('fs');
const COOKIE_PATH = process.env.COOKIE_FILE_PATH || '/etc/secrets/cookies.txt';

if (fs.existsSync(COOKIE_PATH)) {
  console.log(`Cookie file found at ${COOKIE_PATH}`);
} else {
  console.log(`Cookie file NOT found at ${COOKIE_PATH} — upload it as a Render Secret File.`);
  // If you want to fail the process when cookie is missing, uncomment:
  // process.exit(1);
}
