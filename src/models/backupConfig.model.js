const mongoose = require('mongoose');

const backupConfigSchema = new mongoose.Schema({
  folderId: {
    type: String,
    required: true,
    default: '1Q_gZeAqZW8x58pc2cuZVSCLrlfowDx8Z'
  },
  schedule: {
    type: String,
    enum: ['none', 'daily', 'weekly', 'monthly'],
    default: 'none'
  },
  lastBackupAt: {
    type: Date,
  }
}, { timestamps: true });

module.exports = mongoose.model('BackupConfig', backupConfigSchema);
