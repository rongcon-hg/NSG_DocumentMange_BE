const webpush = require("web-push");
const PushSubscription = require("../models/pushSubscription.model");

// Cấu hình VAPID Keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BLAR1nd09K1_TOw-UbBSnjwT1_kYiNNk-0bQnXvMhP_oDnUaGOj4NlL_Il17r49T2G-NNXLpJInn-37v7oL0dxQ";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "1rzkkp7PvqqHa5Z8Buz2u6bCB_SfdiqHicct9gXLCRI";
const VAPID_MAILTO = process.env.VAPID_MAILTO || "mailto:qlvb@nsgpc.edu.vn";

webpush.setVapidDetails(
  VAPID_MAILTO,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

/**
 * Gửi thông báo Push đến 1 hoặc nhiều User
 * @param {Array|string} userIds Danh sách ObjectId hoặc 1 ObjectId của User
 * @param {Object} payload Dữ liệu thông báo { title, body, icon, url, data }
 */
const sendPushToUsers = async (userIds, payload) => {
  try {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    const subscriptions = await PushSubscription.find({ user: { $in: ids } });

    if (!subscriptions || subscriptions.length === 0) {
      return { success: true, count: 0 };
    }

    const notificationData = JSON.stringify({
      title: payload.title || "Văn phòng số NSG",
      body: payload.body || "Bạn có thông báo mới",
      icon: payload.icon || "/logo.webp",
      badge: payload.badge || "/logo.webp",
      data: {
        url: payload.url || "/dashboard",
        ...payload.data,
      },
    });

    const sendPromises = subscriptions.map(async (sub) => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
        },
      };

      try {
        await webpush.sendNotification(pushConfig, notificationData);
      } catch (err) {
        // Nếu subscription hết hạn (410 Gone hoặc 404 Not Found), xóa khỏi DB
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[WebPush] Xóa subscription hết hạn: ${sub.endpoint}`);
          await PushSubscription.findByIdAndDelete(sub._id);
        } else {
          console.error("[WebPush] Lỗi gửi push:", err.message);
        }
      }
    });

    await Promise.allSettled(sendPromises);
    return { success: true, count: subscriptions.length };
  } catch (error) {
    console.error("[WebPush] Error sendPushToUsers:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  VAPID_PUBLIC_KEY,
  sendPushToUsers,
};
