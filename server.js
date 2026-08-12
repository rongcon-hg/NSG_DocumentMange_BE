const express = require('express');
require('dotenv').config();
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();
const port = process.env.PORT || 8888;
const hostname = process.env.HOST_NAME;

const connection = require('./src/config/db');
const mongoose = require('mongoose');
const cookieParser = require("cookie-parser");  
const cors = require("cors");
const compression = require("compression");

// Security Headers
app.use(helmet());

// Compress API responses
app.use(compression());

// Rate Limiting to prevent Brute-Force/DDoS
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 1500, // Giới hạn 1500 requests mỗi 15 phút trên Vercel Free
  message: { success: false, message: "Quá nhiều yêu cầu từ IP này, vui lòng thử lại sau." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));



// Static file configuration
// app.use(express.static(path.join(__dirname, 'public')));

// Cookie parser middleware
app.use(cookieParser());

const corsOptions = {
    origin: [
      "http://localhost:5173", 
      "https://nsg-document-mange-fe.vercel.app",
      "https://qlvb.nsgpc.edu.vn",
      "https://qlvb.namsaigon.edu.vn"
    ],
    methods: ["GET", "POST", "PUT", "DELETE","PATCH"],
    credentials: true, // Allow sending cookies
};
app.use(cors(corsOptions));

const authRoutes = require("./src/routes/authRoutes");
const departmentRoutes = require("./src/routes/departmentRoutes");
const positionRoutes = require("./src/routes/positionRoutes");
const uploadRoutes = require("./src/routes/uploadFile");
const docVariantRoutes = require("./src/routes/docVariantRoutes")
const replyDocRoutes = require("./src/routes/repliedDocRoutes");
const unitRoutes = require("./src/routes/unitRoutes");
const chartRoutes = require("./src/routes/chartRoutes")
const exportDocumentsToExcel =require('./src/routes/exportFile.Controller')
const statisticRoutes = require('./src/routes/statisticRoutes')
const googleRoutes = require('./src/routes/googleRouutes')
const taskRoutes = require('./src/routes/taskRoutes')
const chatbotConfigRoutes = require('./src/routes/chatbotConfig.routes');
const chatbotRoutes = require('./src/routes/chatbot.routes');
const driveConfigRoutes = require('./src/routes/driveConfig');
const driveRoutes = require('./src/routes/driveRoutes');
const backupRoutes = require("./src/routes/backupRoutes");

// Ensure DB connection is established before handling requests in Vercel Serverless
app.use(async (req, res, next) => {
    try {
        await connection();
        next();
    } catch (error) {
        res.status(500).json({ message: "Database connection failed", error: error.message });
    }
});

app.use('/authen', authRoutes);
app.use('/departments',departmentRoutes);
app.use('/positions', positionRoutes);
app.use('/documents',uploadRoutes);
app.use('/docVariants',docVariantRoutes);
app.use('/replyDoc',replyDocRoutes);
app.use('/units',unitRoutes);
app.use('/charts',chartRoutes);
app.use('/exports', exportDocumentsToExcel)
app.use('/statistics', statisticRoutes)
app.use('/google', googleRoutes);
app.use('/tasks', taskRoutes);
app.use('/chatbot-config', chatbotConfigRoutes);
app.use('/chatbot', chatbotRoutes);
app.use('/api/drive-config', driveConfigRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/backup', backupRoutes);

// Cron endpoint for Vercel
const cronRoutes = require('./src/routes/cronRoutes');
app.use('/api/cron', cronRoutes);

app.get("/test", (req, res) => {
  res.json({message: "Hello World! Backend is online successfully (28/04)."});
});

(async () => {
    try {
      await connection();

      if (process.env.NODE_ENV !== 'production') {
        app.listen(port, () => {
          console.log(`Ứng dụng mẫu đang nghe trên cổng http://localhost:${port}`);
        });
      }
    } catch (error) {
      console.log(">>> lỗi kết nối đến db", error);
    }
})();

module.exports = app;