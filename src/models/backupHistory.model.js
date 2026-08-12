const mongoose = require('mongoose');

const backupHistorySchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true
  },
  fileId: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number, // in bytes
    required: true
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED'],
    default: 'SUCCESS'
  },
  errorMessage: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  }
}, { timestamps: true });

module.exports = mongoose.model('BackupHistory', backupHistorySchema);
