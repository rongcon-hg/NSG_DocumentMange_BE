const mongoose = require('mongoose');
require('./src/models/user.model.js');
require('./src/models/repliedDoc.model.js');
mongoose.connect('mongodb+srv://Vercel-Admin-data_qlvb_0826:7ZiJFndmP45XoBxe@data-qlvb-0826.5us511e.mongodb.net/NSG_Database?retryWrites=true&w=majority')
  .then(async () => {
    const RepliedDoc = mongoose.model('RepliedDoc');
    const filter = {
      status: { $in: ['inReview', 'rejectedByReviewer', 'approvedByReviewer', 'approved', 'rejected'] },
      reviewer: "680ec35ff148d83d0fd538d7"
    };
    const docs = await RepliedDoc.find(filter);
    console.log('Docs via Mongoose:', docs.length);
    process.exit(0);
  });
