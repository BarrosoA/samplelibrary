const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CREDS_PATH = path.resolve(__dirname, '../../gdrive-credentials.json');
const ROOT_FOLDER_ID = '1JrqnTUEambLgOM3z4yS2iWhYa3HtgCjh';

function getDriveClient() {
  if (!fs.existsSync(CREDS_PATH)) {
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

