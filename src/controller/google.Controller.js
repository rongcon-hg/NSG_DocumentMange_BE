const { google } = require("googleapis");
const mongoose = require("mongoose");
const User = mongoose.model("User");
const Document = mongoose.model("Document");
const { generateToken } = require("../service/Token.service/Token");

const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

// 1. Lấy URL để user login Google (cho mục đích ủy quyền Calendar)
async function getGoogleAuthUrl(req, res) {
  const feOrigin = req.headers.origin || process.env.FE_URL || 'http://localhost:5173';
  const stateObj = { action: 'authorize', origin: feOrigin };
  const stateBase64 = Buffer.from(JSON.stringify(stateObj)).toString('base64');

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
        "https://www.googleapis.com/auth/calendar.events", 
        "https://www.googleapis.com/auth/userinfo.email", 
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/drive"
      ],
    state: stateBase64
  });
  res.json({ url });
};

// Lấy URL cho mục đích Đăng nhập vào hệ thống
async function getGoogleAuthLoginUrl(req, res) {
  const feOrigin = req.headers.origin || process.env.FE_URL || 'http://localhost:5173';
  const stateObj = { action: 'login', origin: feOrigin };
  const stateBase64 = Buffer.from(JSON.stringify(stateObj)).toString('base64');

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
        "https://www.googleapis.com/auth/calendar.events", 
        "https://www.googleapis.com/auth/userinfo.email", 
        "https://www.googleapis.com/auth/userinfo.profile"
      ],
    state: stateBase64
  });
  res.json({ url });
};

// 2. Callback sau khi user đồng ý
const googleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    
    let action = state;
    let feOrigin = process.env.FE_URL ? new URL(process.env.FE_URL).origin : 'http://localhost:5173';
    
    try {
        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
        if (decodedState && decodedState.action) {
            action = decodedState.action;
            if (decodedState.origin) {
                feOrigin = decodedState.origin;
            }
        }
    } catch (e) {
        // Fallback cho state cũ (plain text)
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
   
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
    const { data: profile } = await oauth2.userinfo.get();

    if (action === "login") {
      // Logic đăng nhập
      const user = await User.findOne({ email: profile.email });
      if (!user) {
        // Tài khoản không tồn tại trong hệ thống
        return res.redirect(`${feOrigin}/login?error=account_not_found`);
      }
      
      // Đăng nhập thành công, tạo JWT
      const { accessToken } = generateToken(user._id, user.role);
      
      // Update Google tokens
      const updateData = {
        "google.googleId": profile.id,
        "google.accessToken": tokens.access_token,
        "google.tokenExpiryDate": tokens.expiry_date ? new Date(tokens.expiry_date) : null
      };
      if (tokens.refresh_token) {
        updateData["google.refreshToken"] = tokens.refresh_token;
      }
      
      await User.updateOne({ _id: user._id }, { $set: updateData });

      return res.redirect(`${feOrigin}/login?token=${accessToken}&name=${encodeURIComponent(user.name)}`);
    } else {
      // Logic ủy quyền (Authorize) từ trang Profile
      await User.findOneAndUpdate(
        { email: profile.email },
        {
          $set: {
            "google.googleId": profile.id,
            "google.accessToken": tokens.access_token,
            "google.refreshToken": tokens.refresh_token,
            "google.tokenExpiryDate": tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          },
        },
        { upsert: true, new: true } // Vẫn giữ nguyên logic cũ nếu muốn
      );

      return res.redirect(`${feOrigin}/members`);
    }
  } catch (error) {
    console.error("Google Callback Error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};


// 3. Thêm sự kiện vào Calendar
const addCalendarEvent = async (req, res) => {
  try {
    const currentUser = req.user;
    const userId = currentUser._id;
    const { documentId } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.google?.refreshToken) {
      return res.status(400).json({ message: "User chưa kết nối Google" });
    }
    
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // ✅ CẢI TIẾN 1: Set cả access_token và refresh_token
    oauth2Client.setCredentials({
      access_token: user.google.accessToken,
      refresh_token: user.google.refreshToken,
      expiry_date: user.google.tokenExpiryDate 
        ? new Date(user.google.tokenExpiryDate).getTime() 
        : null,
    });

    // ✅ CẢI TIẾN 2: Sử dụng async/await trong event listener
    oauth2Client.on('tokens', async (tokens) => {
      try {
        const updateData = {};
        
        if (tokens.refresh_token) {
          updateData["google.refreshToken"] = tokens.refresh_token;
        }
        
        if (tokens.access_token) {
          updateData["google.accessToken"] = tokens.access_token;
          updateData["google.tokenExpiryDate"] = tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : null;
        }

        // Cập nhật một lần thay vì nhiều lần
        if (Object.keys(updateData).length > 0) {
          await User.findByIdAndUpdate(userId, updateData);
          console.log('✅ Tokens updated successfully');
        }
      } catch (err) {
        console.error('❌ Error updating tokens:', err);
      }
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    
    
    let startDateTime = new Date(document.createAt);
    let endDateTime = new Date(document.deadlineDay);

    if (endDateTime <= startDateTime) {
      endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // +1 giờ
    }

    let fileLinksText = "";
    if (document.files && document.files.length > 0) {
      fileLinksText = "\n\nTệp đính kèm:\n" + document.files.map(f => `- ${f.fileName}: https://drive.google.com/file/d/${f.fileId}/view`).join("\n");
    }

    const feOrigin = process.env.FE_URL ? new URL(process.env.FE_URL).origin : 'http://localhost:5173';
    const docLink = `${feOrigin}/documents/${document.docType === 'sent' ? 'SentDocumentList' : 'ReceivedDocumentList'}`;
    const fullDocCode = (document.docNum && document.docCode) 
        ? `${document.docNum}/${document.docCode}` 
        : (document.docNum || document.docCode || 'N/A');

    const event = {
      summary: `${fullDocCode} - ${document.shortDescription}`,
      description: (document.note || "") + `\n\nLink VB: ${docLink}` + fileLinksText,
      start: { 
        dateTime: startDateTime.toISOString(), 
        timeZone: "Asia/Ho_Chi_Minh" 
      },
      end: { 
        dateTime: endDateTime.toISOString(), 
        timeZone: "Asia/Ho_Chi_Minh" 
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 },
          { method: "popup", minutes: 24 * 60 },
        ],
      },
    };

    const result = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    if (!document.addedToCalendarBy) {
      document.addedToCalendarBy = [];
    }
    if (!document.addedToCalendarBy.includes(userId)) {
      document.addedToCalendarBy.push(userId);
      await document.save();
    }

    res.json({ 
      success: true,
      eventId: result.data.id,
      eventLink: result.data.htmlLink 
    });
    
  } catch (error) {
    console.error("Add Event Error:", error);
    
    // ✅ CẢI TIẾN 3: Xử lý lỗi chi tiết hơn
    if (error.code === 401) {
      return res.status(401).json({ 
        error: "Token không hợp lệ. Vui lòng kết nối lại Google" 
      });
    }
    
    res.status(500).json({ 
      error: "Failed to add event",
      details: error.message 
    });
  }
};

const checkGoogleAuth = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user || !user.google?.refreshToken) {
      return res.json({ googleConnected: false });
    }
    return res.status(200).json({
      googleConnected: true,
      googleId: user.google.googleId || null,
      scope: user.google.scope || null,
    });
  } catch (error) {
    console.error("Error in check google auth:", error);
    res.status(500).json({ error: "Failed to check google auth" });
  }
}

const revokeGoogleAuth = async (req, res) => {
  try {
    const userId = req.user._id;
    await User.findByIdAndUpdate(userId, { $unset: { google: 1 } });
    return res.status(200).json({ message: "Đã hủy ủy quyền Google Calendar thành công." });
  } catch (error) {
    console.error("Error revoking google auth:", error);
    res.status(500).json({ error: "Failed to revoke google auth" });
  }
}

module.exports = {
  getGoogleAuthUrl,
  getGoogleAuthLoginUrl,
  googleCallback,
  addCalendarEvent,
  checkGoogleAuth,
  revokeGoogleAuth
};