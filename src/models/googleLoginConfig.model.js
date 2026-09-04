const mongoose = require('mongoose');

const googleLoginConfigSchema = new mongoose.Schema({
  isEnabled: { type: Boolean, default: true },
  clientId: { type: String, default: '' },
  clientSecret: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('GoogleLoginConfig', googleLoginConfigSchema);
