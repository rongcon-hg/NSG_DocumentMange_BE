const mongoose = require('mongoose');

const driveConfigSchema = new mongoose.Schema({
  clientEmail: {
    type: String,
    required: true,
  },
  privateKey: {
    type: String,
    required: true,
  },
  folderId: {
    type: String,
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('DriveConfig', driveConfigSchema);
