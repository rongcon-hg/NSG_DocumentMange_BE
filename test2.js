const mongoose = require('mongoose');
require('./src/models/user.model.js');
require('./src/models/repliedDoc.model.js');
mongoose.connect('mongodb+srv://Vercel-Admin-data_qlvb_0826:7ZiJFndmP45XoBxe@data-qlvb-0826.5us511e.mongodb.net/NSG_Database?retryWrites=true&w=majority')
  .then(async () => {
    const RepliedDoc = mongoose.model('RepliedDoc');
    
    // Simulate what the backend does when reviewerUser is NOT passed
    let reviewerUser = undefined;
    let filter = {
      status: { $in: ['inReview', 'rejectedByReviewer', 'approvedByReviewer', 'approved', 'rejected'] }
    };
    if (reviewerUser && mongoose.Types.ObjectId.isValid(reviewerUser)) {
      filter.reviewer = reviewerUser;
    } else {
      filter.reviewer = { $exists: true, $ne: null };
    }
    
    const docs = await RepliedDoc.find(filter);
    console.log('Docs for undefined:', docs.length);
    process.exit(0);
  });
