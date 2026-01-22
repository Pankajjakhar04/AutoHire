import { Storage } from '@google-cloud/storage';

function getStorage() {
  const clientEmail = process.env.GCP_CLIENT_EMAIL;
  const privateKey = process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const projectId = process.env.GCP_PROJECT_ID;
  if (!clientEmail || !privateKey) {
    throw new Error('GCP client credentials are not configured');
  }

  return new Storage({
    projectId,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey
    }
  });
}

export async function uploadToGCS({ bucketName, objectName, buffer, contentType }) {
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return { objectName };
}

export function downloadFromGCS({ bucketName, objectName }) {
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  return file.createReadStream();
}

export async function deleteFromGCS({ bucketName, objectName }) {
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.delete({ ignoreNotFound: true });
}
