const mongoose = require('mongoose');
require('./src/models/user.model.js');
require('./src/models/repliedDoc.model.js');
require('./src/models/department.model.js');
require('./src/models/docVariant.model.js');
mongoose.connect('mongodb+srv://Vercel-Admin-data_qlvb_0826:7ZiJFndmP45XoBxe@data-qlvb-0826.5us511e.mongodb.net/NSG_Database?retryWrites=true&w=majority')
  .then(async () => {
    const RepliedDoc = mongoose.model('RepliedDoc');
    const filter = {
      status: { $in: ['inReview', 'rejectedByReviewer', 'approvedByReviewer', 'approved', 'rejected'] },
      reviewer: '680ec35ff148d83d0fd538d7'
    };
    const docs = await RepliedDoc.find(filter)
      .populate('reviewer', 'name')
      .populate('replyBy', 'name email')
      .populate('docVariant', 'docVariantName')
      .populate({ path: 'repliedDoc', select: 'shortDescription docCode docNum sentBy' })
      .sort({ createdAt: -1 })
      .limit(50);
      
    console.log('Docs:', JSON.stringify(docs, null, 2));
    process.exit(0);
  });
