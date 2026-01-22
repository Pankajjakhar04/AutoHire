import { google } from 'googleapis';
import { Readable } from 'stream';

function getDriveClient() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('Google service account credentials are not configured');
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive']
  });

  return google.drive({ version: 'v3', auth });
}

export async function uploadToDrive({ buffer, originalName, mimeType, folderId }) {
  const drive = getDriveClient();
  const fileName = originalName || `upload-${Date.now()}`;
  const requestBody = {
    name: fileName,
    parents: folderId ? [folderId] : undefined
  };
  const media = {
    mimeType: mimeType || 'application/octet-stream',
    body: Buffer.isBuffer(buffer) ? bufferToStream(buffer) : buffer
  };

  const res = await drive.files.create({
    requestBody,
    media,
    fields: 'id, webViewLink'
  });
  return { fileId: res.data.id, webViewLink: res.data.webViewLink };
}

export async function downloadFromDrive(fileId) {
  const drive = getDriveClient();
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  return res.data;
}

export async function deleteFromDrive(fileId) {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
}

function bufferToStream(buffer) {
  return Readable.from(buffer);
}
