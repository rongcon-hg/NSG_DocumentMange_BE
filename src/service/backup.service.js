const mongoose = require('mongoose');
const { google } = require('googleapis');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const DriveConfig = require('../models/driveConfig.model');
const BackupConfig = require('../models/backupConfig.model');
const BackupHistory = require('../models/backupHistory.model');
const unzipper = require('unzipper');
const { EJSON } = require('bson');

async function authorize() {
  const config = await DriveConfig.findOne();
  if (!config || !config.clientEmail || !config.privateKey) {
    throw new Error(`Chưa cấu hình Service Account cho Google Drive.`);
  }
  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return auth;
}

async function exportDatabaseToZip(zipFilePath) {
  return new Promise(async (resolve, reject) => {
    try {
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve(archive.pointer()));
      archive.on('error', (err) => reject(err));

      archive.pipe(output);

      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();

      for (let col of collections) {
        const colName = col.name;
        if (colName === 'backuphistories') continue; // Không backup lịch sử sao lưu
        
        const data = await db.collection(colName).find({}).toArray();
        // Dùng EJSON để Serialize ObjectId, Date... chuẩn MongoDB
        archive.append(EJSON.stringify(data, { relaxed: false }), { name: `${colName}.json` });
      }

      await archive.finalize();
    } catch (err) {
      reject(err);
    }
  });
}

async function uploadToDrive(auth, filePath, folderId, fileName) {
  const drive = google.drive({ version: 'v3', auth });
  const fileMetadata = {
    name: fileName,
    parents: [folderId]
  };
  const media = {
    mimeType: 'application/zip',
    body: fs.createReadStream(filePath)
  };
  
  const response = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, size',
    supportsAllDrives: true
  });
  return response.data;
}

async function restoreDatabaseFromDrive(fileId) {
  const extractPath = path.join(__dirname, '../../temp_restore');
  try {
    const auth = await authorize();
    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.get({ 
        fileId: fileId, 
        alt: 'media',
        supportsAllDrives: true 
    }, { responseType: 'stream' });

    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath);
    } else {
        fs.readdirSync(extractPath).forEach(f => fs.unlinkSync(path.join(extractPath, f)));
    }

    await new Promise((resolve, reject) => {
      response.data.pipe(unzipper.Extract({ path: extractPath }))
        .on('close', resolve)
        .on('error', reject);
    });

    const db = mongoose.connection.db;
    const files = fs.readdirSync(extractPath).filter(f => f.endsWith('.json'));

    for (let file of files) {
      const colName = file.replace('.json', '');
      const filePath = path.join(extractPath, file);
      
      const fileData = fs.readFileSync(filePath, 'utf8');
      if (!fileData) continue;
      
      // Parse EJSON
      const data = EJSON.parse(fileData);

      await db.collection(colName).deleteMany({}); 
      if (data.length > 0) {
        await db.collection(colName).insertMany(data);
      }
    }

    // Cleanup
    fs.readdirSync(extractPath).forEach(f => fs.unlinkSync(path.join(extractPath, f)));
    fs.rmdirSync(extractPath);
    
    return true;
  } catch (error) {
    if (fs.existsSync(extractPath)) {
      fs.readdirSync(extractPath).forEach(f => fs.unlinkSync(path.join(extractPath, f)));
      fs.rmdirSync(extractPath);
    }
    throw error;
  }
}

async function performBackup(userId = null) {
    let backupConfig = await BackupConfig.findOne();
    if (!backupConfig || !backupConfig.folderId) {
        throw new Error("Cấu hình sao lưu chưa được thiết lập.");
    }
    
    const dateStr = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const fileName = `Backup_QLVB_${dateStr}.zip`;
    const tempFilePath = path.join(__dirname, `../../${fileName}`);

    try {
        const auth = await authorize();
        const fileSize = await exportDatabaseToZip(tempFilePath);
        const driveData = await uploadToDrive(auth, tempFilePath, backupConfig.folderId, fileName);

        const history = new BackupHistory({
            fileName: fileName,
            fileId: driveData.id,
            fileSize: fileSize,
            status: 'SUCCESS',
            createdBy: userId
        });
        await history.save();
        
        backupConfig.lastBackupAt = new Date();
        await backupConfig.save();

        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return history;
    } catch (error) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        
        const history = new BackupHistory({
            fileName: fileName,
            fileId: 'N/A',
            fileSize: 0,
            status: 'FAILED',
            errorMessage: error.message,
            createdBy: userId
        });
        await history.save();
        throw error;
    }
}

module.exports = {
  performBackup,
  restoreDatabaseFromDrive
};
