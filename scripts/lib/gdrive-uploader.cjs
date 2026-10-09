const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// load environment configuration if present
const ENV_LOCAL_PATH = path.resolve(__dirname, '../../.env.local');
let envConfig = {};
if (fs.existsSync(ENV_LOCAL_PATH)) {
  const envContent = fs.readFileSync(ENV_LOCAL_PATH, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim();
      envConfig[k] = v;
    }
  });
}

const CREDS_PATH =
  envConfig.GDRIVE_CREDENTIALS_PATH ||
  process.env.GDRIVE_CREDENTIALS_PATH ||
  path.join(process.env.USERPROFILE || 'C:\\Users\\noluv', '.credentials', 'samplelibrary-gdrive.json');

const ROOT_FOLDER_ID =
  envConfig.GDRIVE_ROOT_FOLDER_ID ||
  process.env.GDRIVE_ROOT_FOLDER_ID ||
  '1JrqnTUEambLgOM3z4yS2iWhYa3HtgCjh';

function getDriveClient() {
  if (!fs.existsSync(CREDS_PATH)) {
    console.warn(`[GDrive] Credentials file not found at: ${CREDS_PATH}`);
    return null;
  }
  try {
    const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return google.drive({ version: 'v3', auth });
  } catch (err) {
    console.error('[GDrive] Failed to initialize Google Drive client:', err.message);
    return null;
  }
}

// find or create subfolder inside the root shared folder
async function getOrCreatePackFolder(drive, packName) {
  const query = `'${ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${packName.replace(/'/g, "\\'")}' and trashed = false`;
  const existing = await drive.files.list({
    q: query,
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive',
  });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0];
  }

  const created = await drive.files.create({
    requestBody: {
      name: packName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [ROOT_FOLDER_ID],
    },
    fields: 'id, name, webViewLink',
  });

  // make public read for download link
  try {
    await drive.permissions.create({
      fileId: created.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
  } catch (permErr) {
    // inherited permission already active
  }

  return created.data;
}

// upload audio or zip file to pack's google drive folder
async function uploadFileToDrive(packName, localFilePath, originalFileName) {
  const drive = getDriveClient();
  if (!drive) {
    return { success: false, error: 'Google Drive client not configured' };
  }

  const folder = await getOrCreatePackFolder(drive, packName);

  const fileMetadata = {
    name: originalFileName,
    parents: [folder.id],
  };

  const media = {
    body: fs.createReadStream(localFilePath),
  };

  const uploaded = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, name, webViewLink, webContentLink',
  });

  // ensure anyone with link can view/download
  try {
    await drive.permissions.create({
      fileId: uploaded.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
  } catch (e) {}

  const downloadUrl = `https://drive.google.com/uc?export=download&id=${uploaded.data.id}`;
  const folderUrl = `https://drive.google.com/drive/folders/${folder.id}`;

  return {
    success: true,
    fileId: uploaded.data.id,
    fileName: originalFileName,
    downloadUrl,
    folderId: folder.id,
    folderUrl,
  };
}

module.exports = {
  getDriveClient,
  getOrCreatePackFolder,
  uploadFileToDrive,
  ROOT_FOLDER_ID,
};

