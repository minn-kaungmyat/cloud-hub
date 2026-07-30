import { google } from 'googleapis';
import { prisma } from '../src/database/prisma';

async function run() {
  const account = await prisma.cloudAccount.findFirst();
  if (!account) return;
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken
  });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  
  const rootRes = await drive.files.get({ fileId: 'root', fields: 'id' });
  console.log('Root ID:', rootRes.data.id);
  
  const appsFolder = await drive.files.list({
    q: "name='Apps' and trashed=false",
    fields: 'files(id, name, parents, shared, ownedByMe)'
  });
  console.log('Apps Folder:', appsFolder.data.files[0]);

  const deepMosaics = await drive.files.list({
    q: "name='DeepMosaics_V0.5.1' and trashed=false",
    fields: 'files(id, name, parents, shared, ownedByMe)'
  });
  console.log('DeepMosaics:', deepMosaics.data.files[0]);
}
run();
