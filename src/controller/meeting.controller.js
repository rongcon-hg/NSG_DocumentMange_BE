const Meeting = require("../models/meeting.model");
const User = require("../models/user.model");
const Task = require("../models/task.model");
const Notification = require("../models/notification.model");
const { sendPushToUsers } = require("../service/webPush.service");

/**
 * Tự động cập nhật trạng thái cuộc họp theo thời gian thực:
 * - Khi đến giờ bắt đầu (now >= startTime && now < endTime): tự động chuyển từ PREPARING sang IN_PROGRESS
 * - Khi đã hết giờ kết thúc (now >= endTime): tự động chuyển từ PREPARING / IN_PROGRESS sang CONCLUDED
 */
const autoUpdateMeetingStatuses = async (meetingIdOrFilter = null) => {
  try {
    const now = new Date();
    let baseFilter = {};
    if (meetingIdOrFilter) {
      if (typeof meetingIdOrFilter === "string" || (meetingIdOrFilter && meetingIdOrFilter._bsontype === "ObjectID")) {
        baseFilter = { _id: meetingIdOrFilter };
      } else if (typeof meetingIdOrFilter === "object") {
        baseFilter = meetingIdOrFilter;
      }
    }

    // 1. Tự động BẮT ĐẦU các cuộc họp đã đến giờ (startTime <= now < endTime)
    await Meeting.updateMany(
      {
        ...baseFilter,
        status: "PREPARING",
        startTime: { $lte: now },
        endTime: { $gt: now },
      },
      {
        $set: { status: "IN_PROGRESS" },
      }
    );

    // 2. Tự động KẾT THÚC các cuộc họp đã hết giờ (endTime <= now)
    const concludedMeetings = await Meeting.find({
      ...baseFilter,
      status: { $in: ["PREPARING", "IN_PROGRESS"] },
      endTime: { $lte: now },
    });

    if (concludedMeetings.length > 0) {
      for (const m of concludedMeetings) {
        m.status = "CONCLUDED";
        (m.votes || []).forEach((vote) => {
          if (vote.status === "OPEN") {
            vote.status = "CLOSED";
            if (!vote.closedAt) {
              vote.closedAt = now;
            }
          }
        });
        await m.save();
      }
    }
  } catch (err) {
    console.error("Lỗi autoUpdateMeetingStatuses:", err.message);
  }
};

/**
 * 1. Lấy danh sách cuộc họp (Lọc theo thời gian, trạng thái, vai trò tham gia)
 */
const getMeetings = async (req, res) => {
  try {
    // Tự động cập nhật trạng thái các cuộc họp đã đến giờ hoặc hết giờ
    await autoUpdateMeetingStatuses();

    const currentUserId = req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;
    const { status, type, startDate, endDate, search } = req.query;

    const query = {};

    if (status) query.status = status;
    if (type) query.meetingType = type;

    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) query.startTime.$gte = new Date(startDate);
      if (endDate) query.startTime.$lte = new Date(endDate);
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { meetingCode: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }

    // Phân quyền xem cuộc họp:
    // Chỉ Admin, người tạo cuộc họp, chủ tọa, thư ký và những người có tên trong danh sách tham dự mới thấy phiên họp trong tài khoản của mình
    const isAdminOnly = currentUserRole === "admin";

    if (!isAdminOnly) {
      const accessCondition = {
        $or: [
          { createdBy: currentUserId },
          { host: currentUserId },
          { secretary: currentUserId },
          { "attendees.user": currentUserId },
        ],
      };

      if (query.$or) {
        query.$and = [{ $or: query.$or }, accessCondition];
        delete query.$or;
      } else {
        Object.assign(query, accessCondition);
      }
    }

    const meetings = await Meeting.find(query)
      .populate("host", "name email position avatar")
      .populate("secretary", "name email position avatar")
      .populate("department", "departmentName")
      .populate("createdBy", "name email")
      .sort({ startTime: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: meetings,
      total: meetings.length,
    });
  } catch (error) {
    console.error("Lỗi getMeetings:", error);
    return res.status(500).json({ success: false, message: "Lỗi tải danh sách cuộc họp", error: error.message });
  }
};

/**
 * 2. Lấy chi tiết cuộc họp (Kèm tài liệu, đại biểu, agenda, biểu quyết)
 */
const getMeetingById = async (req, res) => {
  try {
    const { id } = req.params;
    await autoUpdateMeetingStatuses(id);
    const meeting = await Meeting.findById(id)
      .populate("host", "name email position avatar")
      .populate("secretary", "name email position avatar")
      .populate("department", "departmentName")
      .populate("createdBy", "name email")
      .populate({
        path: "attendees.user",
        select: "name email position department avatar",
        populate: [
          { path: "department", select: "departmentName" },
          { path: "position", select: "positionName" },
        ],
      })
      .populate("votes.options.voters", "name email");

    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    return res.status(200).json({
      success: true,
      data: meeting,
    });
  } catch (error) {
    console.error("Lỗi getMeetingById:", error);
    return res.status(500).json({ success: false, message: "Lỗi tải chi tiết phiên họp", error: error.message });
  }
};

/**
 * 3. Tạo mới phiên họp
 */
const createMeeting = async (req, res) => {
  try {
    const currentUserId = req.user?.userId || req.user?._id;
    const {
      title,
      meetingType,
      location,
      roomType,
      onlineMeetingUrl,
      pinCode,
      startTime,
      endTime,
      host,
      secretary,
      department,
      agendas,
      documents,
      attendees,
      workScheduleId,
    } = req.body;

    if (!title || !startTime || !endTime || !host) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ Tiêu đề, Thời gian bắt đầu, kết thúc và Chủ tọa phiên họp.",
      });
    }

    const hostDoc = await User.findById(host).select("name");
    const secretaryDoc = secretary ? await User.findById(secretary).select("name") : null;

    // Chuẩn hóa danh sách người tham gia
    let formattedAttendees = [];
    if (Array.isArray(attendees) && attendees.length > 0) {
      const userIds = attendees.map((a) => (typeof a === "object" ? a.user || a.userId : a));
      const userDocs = await User.find({ _id: { $in: userIds } })
        .populate("department", "departmentName")
        .select("name email department");

      formattedAttendees = userDocs.map((u) => {
        const customRole =
          u._id.toString() === host.toString()
            ? "HOST"
            : secretary && u._id.toString() === secretary.toString()
            ? "SECRETARY"
            : "MEMBER";

        return {
          user: u._id,
          name: u.name,
          email: u.email,
          departmentName: u.department?.departmentName || "",
          roleInMeeting: customRole,
          attendanceStatus: "ABSENT",
        };
      });
    }

    // Đảm bảo Host và Secretary luôn có mặt trong attendees
    if (!formattedAttendees.some((a) => a.user.toString() === host.toString())) {
      formattedAttendees.unshift({
        user: host,
        name: hostDoc?.name || "",
        roleInMeeting: "HOST",
        attendanceStatus: "ABSENT",
      });
    }

    const newMeeting = new Meeting({
      title: title.trim(),
      meetingType: meetingType || "INTERNAL",
      location: location || "Phòng họp số 1",
      roomType: roomType || "PHYSICAL",
      onlineMeetingUrl: onlineMeetingUrl || "",
      pinCode: pinCode || Math.floor(1000 + Math.random() * 9000).toString(),
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      host,
      hostName: hostDoc?.name || "",
      secretary: secretary || null,
      secretaryName: secretaryDoc?.name || "",
      department: department || req.user?.department,
      createdBy: currentUserId,
      agendas: Array.isArray(agendas) ? agendas : [],
      documents: Array.isArray(documents) ? documents : [],
      attendees: formattedAttendees,
      workScheduleId: workScheduleId || null,
      status: "PREPARING",
    });

    await newMeeting.save();

    // Gửi thông báo đến các đại biểu
    (async () => {
      try {
        const notifRecipientIds = formattedAttendees
          .map((a) => a.user)
          .filter((id) => id.toString() !== currentUserId.toString());

        if (notifRecipientIds.length > 0) {
          const notifDocs = notifRecipientIds.map((uId) => ({
            recipient: uId,
            sender: currentUserId,
            type: "GENERAL",
            title: `Thư mời họp: ${newMeeting.title}`,
            message: `Bạn được mời tham dự phiên họp "${newMeeting.title}" lúc ${new Date(startTime).toLocaleString("vi-VN")}. Địa điểm: ${newMeeting.location}.`,
            link: `/meetings/${newMeeting._id}`,
            isRead: false,
            isPopupShown: false,
          }));
          await Notification.insertMany(notifDocs);

          sendPushToUsers(notifRecipientIds, {
            title: `Thư mời họp: ${newMeeting.title}`,
            body: `Thời gian: ${new Date(startTime).toLocaleString("vi-VN")} - ${newMeeting.location}`,
            url: `/meetings/${newMeeting._id}`,
          }).catch((e) => console.error("Push Error on Meeting invite:", e));
        }
      } catch (err) {
        console.error("Error sending meeting notifications:", err);
      }
    })();

    return res.status(201).json({
      success: true,
      message: "Tạo phiên họp số thành công!",
      data: newMeeting,
    });
  } catch (error) {
    console.error("Lỗi createMeeting:", error);
    return res.status(500).json({ success: false, message: "Lỗi tạo phiên họp", error: error.message });
  }
};

/**
 * 4. Cập nhật thông tin phiên họp (Admin, Người tạo cuộc họp, Chủ trì/Chủ tọa, hoặc Thư ký khi cập nhật chương trình/tài liệu)
 */
const updateMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;
    const updateData = { ...req.body };

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    const isCreator = (meeting.createdBy?._id || meeting.createdBy)?.toString() === currentUserId?.toString();
    const isHost = (meeting.host?._id || meeting.host)?.toString() === currentUserId?.toString();
    const isSecretary = (meeting.secretary?._id || meeting.secretary)?.toString() === currentUserId?.toString();
    const isAdmin = currentUserRole === "admin";

    if (!isAdmin && !isCreator && !isHost && !isSecretary) {
      return res.status(403).json({
        success: false,
        message: "Chỉ Admin, Người tạo cuộc họp hoặc Chủ trì mới có quyền chỉnh sửa phiên họp!",
      });
    }

    // Nếu thay đổi host hoặc secretary thì cập nhật luôn hostName / secretaryName
    const targetHostId = updateData.host || meeting.host;
    const targetSecretaryId = updateData.secretary !== undefined ? updateData.secretary : meeting.secretary;

    if (updateData.host) {
      const hostDoc = await User.findById(updateData.host).select("name");
      updateData.hostName = hostDoc?.name || "";
    }
    if (updateData.secretary !== undefined) {
      if (updateData.secretary) {
        const secretaryDoc = await User.findById(updateData.secretary).select("name");
        updateData.secretaryName = secretaryDoc?.name || "";
      } else {
        updateData.secretary = null;
        updateData.secretaryName = "";
      }
    }

    // Nếu gửi lên mảng attendees (dạng mảng userIds từ form sửa phiên họp hoặc mảng object)
    if (Array.isArray(updateData.attendees)) {
      const isSimpleIdArray = updateData.attendees.some(
        (a) => typeof a === "string" || (typeof a === "object" && !a.user && !a.guestId && a._bsontype === "ObjectID")
      );

      if (isSimpleIdArray || updateData.attendees.every((a) => typeof a === "string")) {
        const existingAttendeesMap = new Map();
        (meeting.attendees || []).forEach((att) => {
          if (att.user) {
            existingAttendeesMap.set(att.user.toString(), att.toObject ? att.toObject() : att);
          }
        });
        // Giữ lại các khách mời (GUEST không có user id) đã tham gia nếu có
        const existingGuests = (meeting.attendees || []).filter((att) => !att.user && att.guestId);

        const userIds = updateData.attendees.map((a) => (typeof a === "object" ? a.user || a.userId || a._id : a)).filter(Boolean);
        const userDocs = await User.find({ _id: { $in: userIds } })
          .populate("department", "departmentName")
          .populate("position", "positionName")
          .select("name email department position");

        const formattedAttendees = userDocs.map((u) => {
          const uIdStr = u._id.toString();
          const customRole =
            targetHostId && uIdStr === targetHostId.toString()
              ? "HOST"
              : targetSecretaryId && uIdStr === targetSecretaryId.toString()
              ? "SECRETARY"
              : "MEMBER";

          const existing = existingAttendeesMap.get(uIdStr);
          if (existing) {
            return {
              ...existing,
              user: u._id,
              name: u.name || existing.name,
              email: u.email || existing.email,
              positionName: u.position?.positionName || existing.positionName || "",
              departmentName: u.department?.departmentName || existing.departmentName || "",
              roleInMeeting: customRole,
            };
          }

          return {
            user: u._id,
            name: u.name,
            email: u.email,
            positionName: u.position?.positionName || "",
            departmentName: u.department?.departmentName || "",
            roleInMeeting: customRole,
            attendanceStatus: "ABSENT",
          };
        });

        // Đảm bảo Host luôn có mặt trong attendees
        if (targetHostId && !formattedAttendees.some((a) => a.user && a.user.toString() === targetHostId.toString())) {
          const existingHost = existingAttendeesMap.get(targetHostId.toString());
          const hostDoc = await User.findById(targetHostId).populate("department", "departmentName").populate("position", "positionName");
          formattedAttendees.unshift(
            existingHost
              ? { ...existingHost, roleInMeeting: "HOST" }
              : {
                  user: targetHostId,
                  name: hostDoc?.name || updateData.hostName || meeting.hostName || "",
                  email: hostDoc?.email || "",
                  positionName: hostDoc?.position?.positionName || "",
                  departmentName: hostDoc?.department?.departmentName || "",
                  roleInMeeting: "HOST",
                  attendanceStatus: "ABSENT",
                }
          );
        }

        updateData.attendees = [...formattedAttendees, ...existingGuests];
      }
    }

    if (updateData.startTime) updateData.startTime = new Date(updateData.startTime);
    if (updateData.endTime) updateData.endTime = new Date(updateData.endTime);

    Object.assign(meeting, updateData);
    await meeting.save();
    // Tự động kiểm tra cập nhật lại trạng thái theo startTime/endTime mới nếu có
    await autoUpdateMeetingStatuses(id);
    const updatedMeeting = await Meeting.findById(id)
      .populate("host", "name email position avatar")
      .populate("secretary", "name email position avatar")
      .populate("department", "departmentName")
      .populate("createdBy", "name email");

    return res.status(200).json({
      success: true,
      message: "Cập nhật phiên họp thành công!",
      data: updatedMeeting || meeting,
    });
  } catch (error) {
    console.error("Lỗi updateMeeting:", error);
    return res.status(500).json({ success: false, message: "Lỗi cập nhật phiên họp", error: error.message });
  }
};

/**
 * 5. Cập nhật trạng thái phiên họp (Bắt đầu / Bế mạc kết luận / Hủy)
 */
const updateMeetingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // "PREPARING", "IN_PROGRESS", "CONCLUDED", "CANCELLED"

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    meeting.status = status;

    // Nếu chuyển sang bế mạc (CONCLUDED) hoặc hủy (CANCELLED): tự động khóa tất cả các đợt biểu quyết đang mở
    if (status === "CONCLUDED" || status === "CANCELLED") {
      const now = new Date();
      (meeting.votes || []).forEach((vote) => {
        if (vote.status === "OPEN") {
          vote.status = "CLOSED";
          if (!vote.closedAt) {
            vote.closedAt = now;
          }
        }
      });
    }

    await meeting.save();

    return res.status(200).json({
      success: true,
      message: `Đã chuyển trạng thái phiên họp sang: ${status}`,
      data: meeting,
    });
  } catch (error) {
    console.error("Lỗi updateMeetingStatus:", error);
    return res.status(500).json({ success: false, message: "Lỗi cập nhật trạng thái", error: error.message });
  }
};

/**
 * 6. Điểm danh tham dự cuộc họp (QR Scan hoặc Tự điểm danh kèm Vị trí & Thiết bị)
 */
const checkInMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    await autoUpdateMeetingStatuses(id);
    const currentUserId = req.user?.userId || req.user?._id;
    const { pinCode, method, location, coords, device } = req.body;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    if (pinCode && meeting.pinCode && pinCode.trim() !== meeting.pinCode.trim()) {
      return res.status(400).json({ success: false, message: "Mã PIN phòng họp không chính xác!" });
    }

    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
    const now = new Date();

    let attendee = meeting.attendees.find((a) => a.user.toString() === currentUserId.toString());
    if (attendee) {
      attendee.attendanceStatus = "ATTENDED";
      attendee.checkInTime = now;
      attendee.checkInMethod = method || "AUTO_JOIN";
      if (location) attendee.checkInLocation = location;
      if (coords && coords.latitude && coords.longitude) {
        attendee.checkInCoords = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy || 0,
        };
      }
      attendee.checkInIp = clientIp;

      if (!attendee.accessLogs) attendee.accessLogs = [];
      attendee.accessLogs.push({
        action: "CHECK_IN",
        time: now,
        location: location || "",
        coords: coords ? { latitude: coords.latitude, longitude: coords.longitude } : undefined,
        ip: clientIp,
        device: device || req.headers["user-agent"] || "",
      });
    } else {
      // Nếu là khách mời chưa có trong danh sách
      const userDoc = await User.findById(currentUserId).populate("department", "departmentName");
      attendee = {
        user: currentUserId,
        name: userDoc?.name || "Đại biểu",
        email: userDoc?.email || "",
        departmentName: userDoc?.department?.departmentName || "",
        roleInMeeting: "GUEST",
        attendanceStatus: "ATTENDED",
        checkInTime: now,
        checkInMethod: method || "AUTO_JOIN",
        checkInLocation: location || "",
        checkInCoords: coords ? { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy } : undefined,
        checkInIp: clientIp,
        accessLogs: [
          {
            action: "CHECK_IN",
            time: now,
            location: location || "",
            coords: coords ? { latitude: coords.latitude, longitude: coords.longitude } : undefined,
            ip: clientIp,
            device: device || req.headers["user-agent"] || "",
          },
        ],
      };
      meeting.attendees.push(attendee);
    }

    await meeting.save();

    return res.status(200).json({
      success: true,
      message: "Điểm danh tham gia phiên họp thành công!",
      data: meeting,
    });
  } catch (error) {
    console.error("Lỗi checkInMeeting:", error);
    return res.status(500).json({ success: false, message: "Lỗi điểm danh", error: error.message });
  }
};

/**
 * 6.1 Ghi nhận thời gian Ra / Vào phòng họp (Access Log)
 */
const logMeetingAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId || req.user?._id;
    const { action, location, coords, device } = req.body; // action: "JOIN" hoặc "LEAVE"

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
    const now = new Date();

    const guestId = req.body?.guestId;
    let attendee = meeting.attendees.find((a) => {
      if (currentUserId && a.user && a.user.toString() === currentUserId.toString()) return true;
      if (guestId && a.guestId && a.guestId === guestId) return true;
      return false;
    });

    if (!attendee) {
      if (currentUserId) {
        const userDoc = await User.findById(currentUserId).populate("department", "departmentName");
        attendee = {
          user: currentUserId,
          name: userDoc?.name || "Đại biểu",
          email: userDoc?.email || "",
          departmentName: userDoc?.department?.departmentName || "",
          roleInMeeting: "GUEST",
          attendanceStatus: meeting.status === "IN_PROGRESS" ? "ATTENDED" : "ABSENT",
          checkInTime: meeting.status === "IN_PROGRESS" ? now : undefined,
          accessLogs: [],
          totalAttendanceMinutes: 0,
        };
        meeting.attendees.push(attendee);
      }
    }

    if (attendee) {
      if (!attendee.accessLogs) attendee.accessLogs = [];

      if (action === "LEAVE") {
        attendee.checkOutTime = now;

        // Tìm lần JOIN hoặc CHECK_IN gần nhất chưa tính thời gian
        const lastJoinLog = [...attendee.accessLogs]
          .reverse()
          .find((l) => l.action === "JOIN" || l.action === "CHECK_IN");

        if (lastJoinLog && lastJoinLog.time) {
          const sessionMinutes = Math.max(1, Math.round((now.getTime() - new Date(lastJoinLog.time).getTime()) / 60000));
          attendee.totalAttendanceMinutes = (attendee.totalAttendanceMinutes || 0) + sessionMinutes;
        }
      }

      attendee.accessLogs.push({
        action: action || "JOIN",
        time: now,
        location: location || "",
        coords: coords && coords.latitude ? { latitude: coords.latitude, longitude: coords.longitude } : undefined,
        ip: clientIp,
        device: device || req.headers["user-agent"] || "",
      });

      await meeting.save();
    }

    return res.status(200).json({
      success: true,
      message: action === "LEAVE" ? "Đã ghi nhận rời phòng họp" : "Đã ghi nhận vào phòng họp",
      data: attendee ? (attendee.accessLogs || []) : [],
    });
  } catch (error) {
    console.error("Lỗi logMeetingAccess:", error);
    return res.status(500).json({ success: false, message: "Lỗi ghi nhận truy cập phòng họp", error: error.message });
  }
};

/**
 * 7. Đăng ký phát biểu / Hủy đăng ký phát biểu (Hỗ trợ cả đại biểu đăng nhập và khách)
 */
const toggleSpeakRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId || req.user?._id;
    const { isRequested, guestId } = req.body;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    const isNowSpeaking = Boolean(isRequested);

    let attendee = meeting.attendees.find((a) => {
      if (currentUserId && a.user && a.user.toString() === currentUserId.toString()) return true;
      if (guestId && a.guestId && a.guestId === guestId) return true;
      return false;
    });

    if (attendee) {
      attendee.isSpeakingRequested = isNowSpeaking;
      attendee.speakRequestTime = isNowSpeaking ? new Date() : null;
    } else if (isNowSpeaking) {
      // Nếu user/khách chưa có trong danh sách đại biểu, tự động thêm vào
      if (currentUserId) {
        const userDoc = await User.findById(currentUserId).populate("department", "departmentName");
        attendee = {
          user: currentUserId,
          name: userDoc?.name || "Đại biểu",
          email: userDoc?.email || "",
          departmentName: userDoc?.department?.departmentName || "",
          roleInMeeting: "MEMBER",
          attendanceStatus: "ATTENDED",
          checkInTime: new Date(),
          checkInMethod: "AUTO_JOIN",
          isSpeakingRequested: true,
          speakRequestTime: new Date(),
        };
        meeting.attendees.push(attendee);
      } else if (guestId) {
        attendee = {
          guestId: guestId,
          name: req.body?.name || "Khách mời",
          roleInMeeting: "GUEST",
          attendanceStatus: "ATTENDED",
          checkInTime: new Date(),
          checkInMethod: "QR_SCAN",
          isSpeakingRequested: true,
          speakRequestTime: new Date(),
        };
        meeting.attendees.push(attendee);
      } else {
        return res.status(400).json({ success: false, message: "Không xác định được danh tính người tham gia" });
      }
    }
    await meeting.save();

    // Nếu là Đăng ký phát biểu (isNowSpeaking === true), gửi thông báo đẩy đến Chủ tọa (Host) và Thư ký
    if (isNowSpeaking && attendee) {
      (async () => {
        try {
          const attendeeName = attendee.name || req.user?.name || "Một đại biểu";
          const hostId = meeting.host?._id || meeting.host;
          const secretaryId = meeting.secretary?._id || meeting.secretary;

          const notifyUserIds = [];
          if (hostId && (!currentUserId || hostId.toString() !== currentUserId.toString())) {
            notifyUserIds.push(hostId.toString());
          }
          if (
            secretaryId &&
            (!currentUserId || secretaryId.toString() !== currentUserId.toString()) &&
            !notifyUserIds.includes(secretaryId.toString())
          ) {
            notifyUserIds.push(secretaryId.toString());
          }

          if (notifyUserIds.length > 0) {
            const notifs = notifyUserIds.map((uId) => ({
              recipient: uId,
              sender: currentUserId || null,
              type: "GENERAL",
              title: `Đăng ký phát biểu: ${meeting.title}`,
              message: `Đại biểu ${attendeeName} vừa đăng ký xin phát biểu trong phiên họp.`,
              link: `/meetings/${meeting._id}`,
              isRead: false,
              isPopupShown: false,
            }));
            await Notification.insertMany(notifs);

            sendPushToUsers(notifyUserIds, {
              title: `Đăng ký phát biểu: ${meeting.title}`,
              body: `Đại biểu ${attendeeName} xin phát biểu. Nhấp để mời phát biểu.`,
              url: `/meetings/${meeting._id}`,
            }).catch((err) => console.error("Push Error on speak request:", err));
          }
        } catch (pushErr) {
          console.error("Lỗi gửi thông báo xin phát biểu:", pushErr);
        }
      })();
    }

    return res.status(200).json({
      success: true,
      message: isNowSpeaking ? "Đã gửi yêu cầu đăng ký phát biểu đến Chủ tọa" : "Đã hủy đăng ký phát biểu",
      data: meeting.attendees,
    });
  } catch (error) {
    console.error("Lỗi toggleSpeakRequest:", error);
    return res.status(500).json({ success: false, message: "Lỗi đăng ký phát biểu", error: error.message });
  }
};

/**
 * 8. Tạo và Mở phiên biểu quyết / Bỏ phiếu
 */
const createOrOpenVote = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, isSecret, isMultipleChoice, options } = req.body;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    const formattedOptions = (options || ["Tán thành", "Không tán thành", "Ý kiến khác"]).map((opt) => ({
      optionText: typeof opt === "string" ? opt : opt.optionText,
      voteCount: 0,
      voters: [],
    }));

    meeting.votes.push({
      title: title.trim(),
      description: description || "",
      isSecret: Boolean(isSecret),
      isMultipleChoice: Boolean(isMultipleChoice),
      status: "OPEN",
      options: formattedOptions,
      totalVotes: 0,
      createdAt: new Date(),
    });

    await meeting.save();

    return res.status(201).json({
      success: true,
      message: "Đã mở phiên biểu quyết điện tử!",
      data: meeting.votes,
    });
  } catch (error) {
    console.error("Lỗi createOrOpenVote:", error);
    return res.status(500).json({ success: false, message: "Lỗi mở phiên biểu quyết", error: error.message });
  }
};

/**
 * 9. Đại biểu bỏ phiếu / Biểu quyết (Hỗ trợ cả đại biểu đăng nhập và khách)
 */
const submitVote = async (req, res) => {
  try {
    const { id, voteId } = req.params;
    const currentUserId = req.user?.userId || req.user?._id;
    const guestId = req.body?.guestId;
    const { selectedOptionIndexes } = req.body; // Mảng các index lựa chọn [0, 1]

    const voterIdentifier = currentUserId ? currentUserId.toString() : (guestId ? guestId.toString() : null);

    if (!voterIdentifier) {
      return res.status(400).json({ success: false, message: "Không xác định được danh tính người bỏ phiếu" });
    }

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    const vote = meeting.votes.id(voteId);
    if (!vote || vote.status !== "OPEN") {
      return res.status(400).json({ success: false, message: "Phiên biểu quyết không còn mở!" });
    }

    // Kiểm tra xem đại biểu hoặc khách đã bỏ phiếu chưa
    const alreadyVoted = vote.options.some((opt) =>
      opt.voters.some((vId) => vId && vId.toString() === voterIdentifier)
    );

    if (alreadyVoted) {
      return res.status(400).json({ success: false, message: "Bạn đã thực hiện biểu quyết cho nội dung này rồi!" });
    }

    const indexes = Array.isArray(selectedOptionIndexes) ? selectedOptionIndexes : [selectedOptionIndexes];
    indexes.forEach((idx) => {
      if (vote.options[idx]) {
        vote.options[idx].voteCount += 1;
        vote.options[idx].voters.push(voterIdentifier);
      }
    });

    vote.totalVotes += 1;
    await meeting.save();

    return res.status(200).json({
      success: true,
      message: "Biểu quyết thành công!",
      data: vote,
    });
  } catch (error) {
    console.error("Lỗi submitVote:", error);
    return res.status(500).json({ success: false, message: "Lỗi biểu quyết", error: error.message });
  }
};

/**
 * 10. Đóng phiên biểu quyết
 */
const closeVote = async (req, res) => {
  try {
    const { id, voteId } = req.params;
    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    const vote = meeting.votes.id(voteId);
    if (vote) {
      vote.status = "CLOSED";
      vote.closedAt = new Date();
      await meeting.save();
    }

    return res.status(200).json({
      success: true,
      message: "Đã đóng phiên biểu quyết!",
      data: vote,
    });
  } catch (error) {
    console.error("Lỗi closeVote:", error);
    return res.status(500).json({ success: false, message: "Lỗi đóng biểu quyết", error: error.message });
  }
};

/**
 * 10b. Chỉnh sửa thông tin biểu quyết (Admin, Chủ tọa, Thư ký, Người tạo)
 */
const updateVote = async (req, res) => {
  try {
    const { id, voteId } = req.params;
    const currentUserId = req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;
    const { title, description, isSecret, isMultipleChoice, status, options } = req.body;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    const hostId = meeting.host?._id || meeting.host;
    const secretaryId = meeting.secretary?._id || meeting.secretary;
    const createdById = meeting.createdBy?._id || meeting.createdBy;

    const isHost = hostId && hostId.toString() === currentUserId?.toString();
    const isSecretary = secretaryId && secretaryId.toString() === currentUserId?.toString();
    const isCreator = createdById && createdById.toString() === currentUserId?.toString();
    const isAdmin = currentUserRole === "admin" || currentUserRole === "manager";

    if (!isHost && !isSecretary && !isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Chỉ Quản trị viên, Chủ tọa hoặc Thư ký phiên họp mới có quyền chỉnh sửa biểu quyết!",
      });
    }

    const vote = meeting.votes.id(voteId);
    if (!vote) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên biểu quyết cần sửa" });
    }

    const hasVotesCast =
      (vote.totalVotes || 0) > 0 ||
      (vote.options || []).some((opt) => (opt.voteCount || 0) > 0 || (opt.voters && opt.voters.length > 0));

    const isOnlyStatusChange =
      status !== undefined &&
      title === undefined &&
      description === undefined &&
      isSecret === undefined &&
      isMultipleChoice === undefined &&
      options === undefined;

    if (hasVotesCast && !isOnlyStatusChange && currentUserRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Đợt biểu quyết này đã có người thực hiện biểu quyết, không thể chỉnh sửa nội dung hoặc danh sách (trừ quyền Admin)!",
      });
    }

    if (title !== undefined) vote.title = title.trim();
    if (description !== undefined) vote.description = description || "";
    if (isSecret !== undefined) vote.isSecret = Boolean(isSecret);
    if (isMultipleChoice !== undefined) vote.isMultipleChoice = Boolean(isMultipleChoice);
    if (status && ["OPEN", "CLOSED", "DRAFT"].includes(status)) {
      vote.status = status;
      if (status === "CLOSED" && !vote.closedAt) {
        vote.closedAt = new Date();
      }
    }

    // Cập nhật danh sách phương án / nhân sự bầu chọn nếu có
    if (Array.isArray(options) && options.length > 0) {
      const existingOptionsMap = new Map();
      vote.options.forEach((opt) => {
        if (opt._id) existingOptionsMap.set(opt._id.toString(), opt);
        if (opt.optionText) existingOptionsMap.set(opt.optionText.trim().toLowerCase(), opt);
      });

      const newOptions = options.map((opt) => {
        const text = (typeof opt === "string" ? opt : opt.optionText || "").trim();
        const optId = opt._id ? opt._id.toString() : null;

        let matched = null;
        if (optId && existingOptionsMap.has(optId)) {
          matched = existingOptionsMap.get(optId);
        } else if (existingOptionsMap.has(text.toLowerCase())) {
          matched = existingOptionsMap.get(text.toLowerCase());
        }

        if (matched) {
          return {
            _id: matched._id,
            optionText: text,
            voteCount: matched.voteCount || 0,
            voters: matched.voters || [],
          };
        }

        return {
          optionText: text,
          voteCount: 0,
          voters: [],
        };
      });

      vote.options = newOptions;

      // Tính lại tổng số phiếu
      const allVoterIds = new Set();
      vote.options.forEach((opt) => {
        (opt.voters || []).forEach((v) => {
          const vStr = typeof v === "object" ? (v._id || v.userId || v.guestId) : v;
          if (vStr) allVoterIds.add(vStr.toString());
        });
      });
      vote.totalVotes = allVoterIds.size;
    }

    await meeting.save();

    return res.status(200).json({
      success: true,
      message: "Cập nhật phiên biểu quyết thành công!",
      data: meeting.votes,
    });
  } catch (error) {
    console.error("Lỗi updateVote:", error);
    return res.status(500).json({ success: false, message: "Lỗi cập nhật biểu quyết", error: error.message });
  }
};

/**
 * 10c. Xóa phiên biểu quyết (Admin, Chủ tọa, Thư ký, Người tạo)
 */
const deleteVote = async (req, res) => {
  try {
    const { id, voteId } = req.params;
    const currentUserId = req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    const hostId = meeting.host?._id || meeting.host;
    const secretaryId = meeting.secretary?._id || meeting.secretary;
    const createdById = meeting.createdBy?._id || meeting.createdBy;

    const isHost = hostId && hostId.toString() === currentUserId?.toString();
    const isSecretary = secretaryId && secretaryId.toString() === currentUserId?.toString();
    const isCreator = createdById && createdById.toString() === currentUserId?.toString();
    const isAdmin = currentUserRole === "admin" || currentUserRole === "manager";

    if (!isHost && !isSecretary && !isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Chỉ Quản trị viên, Chủ tọa hoặc Thư ký phiên họp mới có quyền xóa biểu quyết!",
      });
    }

    const vote = meeting.votes.id(voteId);
    if (!vote) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên biểu quyết cần xóa" });
    }

    const hasVotesCast =
      (vote.totalVotes || 0) > 0 ||
      (vote.options || []).some((opt) => (opt.voteCount || 0) > 0 || (opt.voters && opt.voters.length > 0));

    if (hasVotesCast && currentUserRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Đợt biểu quyết này đã có người thực hiện biểu quyết, không thể xóa (trừ quyền Admin)!",
      });
    }

    meeting.votes.pull(voteId);
    await meeting.save();

    return res.status(200).json({
      success: true,
      message: "Đã xóa phiên biểu quyết thành công!",
      data: meeting.votes,
    });
  } catch (error) {
    console.error("Lỗi deleteVote:", error);
    return res.status(500).json({ success: false, message: "Lỗi xóa biểu quyết", error: error.message });
  }
};

/**
 * 11. Lưu biên bản cuộc họp & Tự động sinh công việc (Action Items)
 */
const saveMinutesAndActionItems = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId || req.user?._id;
    const { content, conclusions, actionItems, aiSummary } = req.body;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    meeting.minutes = {
      content: content || "",
      conclusions: conclusions || "",
      aiSummary: aiSummary || "",
      actionItems: Array.isArray(actionItems) ? actionItems : [],
      updatedAt: new Date(),
    };

    // Nếu có action items cần giao việc trực tiếp sang module Task
    if (Array.isArray(actionItems) && actionItems.length > 0) {
      for (const item of actionItems) {
        if (item.assignee && !item.createdTaskId) {
          try {
            const newTask = new Task({
              title: `[KL Cuộc họp ${meeting.meetingCode}] ${item.taskTitle}`,
              description: `Nhiệm vụ được giao từ kết luận cuộc họp: "${meeting.title}". Kết luận: ${conclusions || ""}`,
              startDate: new Date(),
              endDate: item.deadline ? new Date(item.deadline) : new Date(Date.now() + 7 * 86400000),
              assignees: [item.assignee],
              createdBy: currentUserId,
              priority: "NORMAL",
            });
            await newTask.save();
            item.createdTaskId = newTask._id;
            item.status = "ASSIGNED";
          } catch (tErr) {
            console.error("Lỗi sinh task từ actionItem cuộc họp:", tErr);
          }
        }
      }
    }

    await meeting.save();

    return res.status(200).json({
      success: true,
      message: "Đã lưu biên bản và đồng bộ nhiệm vụ thành công!",
      data: meeting.minutes,
    });
  } catch (error) {
    console.error("Lỗi saveMinutesAndActionItems:", error);
    return res.status(500).json({ success: false, message: "Lỗi lưu biên bản", error: error.message });
  }
};

/**
 * 12. Xóa phiên họp (Chỉ người tạo hoặc Admin/Manager khi ở trạng thái PREPARING/CANCELLED)
 */
const deleteMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    const isOwner = meeting.createdBy.toString() === currentUserId.toString();
    const isAdmin = currentUserRole === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền xóa phiên họp này!" });
    }

    await Meeting.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Đã xóa phiên họp thành công!",
    });
  } catch (error) {
    console.error("Lỗi deleteMeeting:", error);
    return res.status(500).json({ success: false, message: "Lỗi xóa phiên họp", error: error.message });
  }
};

/**
 * 13. Thêm tài liệu đính kèm vào phiên họp
 */
const addMeetingDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, fileId, fileUrl, fileName, fileSize, mimeType, isConfidential } = req.body;
    const currentUserId = req.user?.userId || req.user?._id;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    const newDoc = {
      title: title || fileName || "Tài liệu phiên họp",
      fileId: fileId || "",
      fileUrl: fileUrl || (fileId ? `https://drive.google.com/file/d/${fileId}/view?usp=sharing` : ""),
      fileName: fileName || title || "document.pdf",
      fileSize: fileSize || "",
      mimeType: mimeType || "application/pdf",
      isConfidential: Boolean(isConfidential),
      uploadedBy: currentUserId,
      uploadedAt: new Date(),
    };

    meeting.documents.push(newDoc);
    await meeting.save();

    return res.status(200).json({
      success: true,
      message: "Thêm tài liệu vào phiên họp thành công!",
      data: meeting.documents,
    });
  } catch (error) {
    console.error("Lỗi addMeetingDocument:", error);
    return res.status(500).json({ success: false, message: "Lỗi thêm tài liệu phiên họp", error: error.message });
  }
};

/**
 * 13b. Chỉnh sửa thông tin tài liệu đính kèm trong phiên họp
 */
const updateMeetingDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { title, fileId, fileUrl, fileName, fileSize, mimeType, isConfidential } = req.body;
    const currentUserId = req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    const docIndex = meeting.documents.findIndex(
      (d) => d._id?.toString() === docId || d.fileId === docId
    );

    if (docIndex === -1) {
      return res.status(404).json({ success: false, message: "Không tìm thấy tài liệu này trong phiên họp" });
    }

    const targetDoc = meeting.documents[docIndex];
    const isOwner = targetDoc.uploadedBy && targetDoc.uploadedBy.toString() === currentUserId?.toString();
    const isHost = (meeting.host?._id || meeting.host)?.toString() === currentUserId?.toString();
    const isSecretary = (meeting.secretary?._id || meeting.secretary)?.toString() === currentUserId?.toString();
    const isCreator = (meeting.createdBy?._id || meeting.createdBy)?.toString() === currentUserId?.toString();
    const isPrivileged = ["admin", "manager"].includes(currentUserRole);

    if (!isHost && !isSecretary && !isPrivileged && !isCreator && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền chỉnh sửa tài liệu này!",
      });
    }

    if (title !== undefined) targetDoc.title = title.trim() || targetDoc.fileName || "Tài liệu phiên họp";
    if (fileId !== undefined) targetDoc.fileId = fileId;
    if (fileUrl !== undefined) {
      targetDoc.fileUrl = fileUrl || (targetDoc.fileId ? `https://drive.google.com/file/d/${targetDoc.fileId}/view?usp=sharing` : "");
    } else if (fileId) {
      targetDoc.fileUrl = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
    }
    if (fileName !== undefined) targetDoc.fileName = fileName || targetDoc.title || "document.pdf";
    if (fileSize !== undefined) targetDoc.fileSize = fileSize;
    if (mimeType !== undefined) targetDoc.mimeType = mimeType;
    if (isConfidential !== undefined) targetDoc.isConfidential = Boolean(isConfidential);

    await meeting.save();

    return res.status(200).json({
      success: true,
      message: "Cập nhật thông tin tài liệu thành công!",
      data: meeting.documents,
    });
  } catch (error) {
    console.error("Lỗi updateMeetingDocument:", error);
    return res.status(500).json({ success: false, message: "Lỗi cập nhật tài liệu phiên họp", error: error.message });
  }
};

/**
 * 14. Xóa tài liệu khỏi phiên họp (Chủ trì, Quản lý/Manager, Admin, hoặc người tải lên)
 */
const deleteMeetingDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const currentUserId = req.user?.userId || req.user?._id;
    const currentUserRole = req.user?.role;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    const docIndex = meeting.documents.findIndex(
      (d) => d._id?.toString() === docId || d.fileId === docId
    );

    if (docIndex === -1) {
      return res.status(404).json({ success: false, message: "Không tìm thấy tài liệu này trong phiên họp" });
    }

    const targetDoc = meeting.documents[docIndex];
    const isOwner = targetDoc.uploadedBy && targetDoc.uploadedBy.toString() === currentUserId.toString();
    const isHost = (meeting.host?._id || meeting.host)?.toString() === currentUserId.toString();
    const isCreator = (meeting.createdBy?._id || meeting.createdBy)?.toString() === currentUserId.toString();
    const isPrivileged = ["admin", "manager"].includes(currentUserRole);

    if (!isHost && !isPrivileged && !isCreator && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xóa tài liệu này! Chỉ Chủ tọa, Manager hoặc người tải lên mới có quyền.",
      });
    }

    meeting.documents.splice(docIndex, 1);
    await meeting.save();

    return res.status(200).json({
      success: true,
      message: "Đã xóa tài liệu khỏi phiên họp thành công!",
      data: meeting.documents,
    });
  } catch (error) {
    console.error("Lỗi deleteMeetingDocument:", error);
    return res.status(500).json({ success: false, message: "Lỗi xóa tài liệu phiên họp", error: error.message });
  }
};

/**
 * 15. Lấy thông tin phiên họp công khai (dành cho khách quét QR)
 */
const getPublicMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    await autoUpdateMeetingStatuses(id);
    const meeting = await Meeting.findById(id)
      .populate("host", "name email department position")
      .populate("secretary", "name email department position")
      .populate({
        path: "attendees.user",
        select: "name email position department avatar",
        populate: [
          { path: "department", select: "departmentName" },
          { path: "position", select: "positionName" },
        ],
      })
      .select("-minutes.actionItems.createdTaskId");

    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    return res.status(200).json({
      success: true,
      data: meeting,
    });
  } catch (error) {
    console.error("Lỗi getPublicMeeting:", error);
    return res.status(500).json({ success: false, message: "Lỗi tải thông tin phiên họp", error: error.message });
  }
};

/**
 * 16. Khách tham gia phiên họp qua mã QR (nhập PIN, Họ tên, Chức vụ, Đơn vị)
 */
const guestJoinMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    await autoUpdateMeetingStatuses(id);
    const { pinCode, name, position, department, location, coords, guestId, device } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập Họ và tên của bạn!" });
    }

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    // Chỉ cho phép tham gia và điểm danh khi phiên họp đang ở trạng thái Bắt đầu (IN_PROGRESS)
    if (meeting.status !== "IN_PROGRESS") {
      let statusMsg = "Phiên họp chưa ở trạng thái bắt đầu hoặc đã kết thúc, không thể thực hiện điểm danh!";
      if (meeting.status === "PREPARING") {
        statusMsg = "Phiên họp đang ở trạng thái chuẩn bị (chưa bắt đầu). Vui lòng đợi Chủ tọa / Thư ký bắt đầu phiên họp để tham gia điểm danh!";
      } else if (meeting.status === "CONCLUDED") {
        statusMsg = "Phiên họp này đã bế mạc (kết thúc). Mã QR điểm danh và tham gia không còn hiệu lực!";
      } else if (meeting.status === "CANCELLED") {
        statusMsg = "Phiên họp này đã bị hủy, không thể tham gia điểm danh!";
      }
      return res.status(400).json({
        success: false,
        message: statusMsg,
      });
    }

    // Kiểm tra mã PIN nếu phòng họp có cài đặt PIN
    if (meeting.pinCode && meeting.pinCode.trim()) {
      if (!pinCode || pinCode.trim() !== meeting.pinCode.trim()) {
        return res.status(400).json({
          success: false,
          message: "Mã xác nhận PIN phòng họp không chính xác! Vui lòng kiểm tra trên màn hình hoặc mã QR.",
        });
      }
    }

    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
    const now = new Date();
    const finalGuestId = guestId || `guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Tìm xem khách này đã có trong danh sách chưa
    let attendee = meeting.attendees.find((a) => a.guestId === finalGuestId);
    if (attendee) {
      attendee.name = name.trim();
      if (position) attendee.positionName = position.trim();
      if (department) attendee.departmentName = department.trim();
      attendee.attendanceStatus = "ATTENDED";
      if (!attendee.checkInTime) attendee.checkInTime = now;
      if (location) attendee.checkInLocation = location;
      if (coords && coords.latitude) {
        attendee.checkInCoords = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy || 0,
        };
      }
    } else {
      attendee = {
        guestId: finalGuestId,
        name: name.trim(),
        positionName: position ? position.trim() : "",
        departmentName: department ? department.trim() : "",
        roleInMeeting: "GUEST",
        attendanceStatus: "ATTENDED",
        checkInTime: now,
        checkInMethod: "QR_SCAN",
        checkInLocation: location || "",
        checkInCoords: coords && coords.latitude ? {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy || 0,
        } : undefined,
        checkInIp: clientIp,
        totalAttendanceMinutes: 0,
        accessLogs: [
          {
            action: "CHECK_IN",
            time: now,
            location: location || "",
            coords: coords && coords.latitude ? { latitude: coords.latitude, longitude: coords.longitude } : undefined,
            ip: clientIp,
            device: device || req.headers["user-agent"] || "QR Guest Scan",
          },
        ],
      };
      meeting.attendees.push(attendee);
    }

    await meeting.save();

    return res.status(200).json({
      success: true,
      message: "Chào mừng quý khách đến với phiên họp!",
      data: {
        meeting,
        guest: attendee,
        guestId: finalGuestId,
      },
    });
  } catch (error) {
    console.error("Lỗi guestJoinMeeting:", error);
    return res.status(500).json({ success: false, message: "Lỗi đăng ký tham gia phiên họp", error: error.message });
  }
};

module.exports = {
  autoUpdateMeetingStatuses,
  getMeetings,
  getMeetingById,
  createMeeting,
  updateMeeting,
  updateMeetingStatus,
  checkInMeeting,
  toggleSpeakRequest,
  createOrOpenVote,
  updateVote,
  deleteVote,
  submitVote,
  closeVote,
  saveMinutesAndActionItems,
  deleteMeeting,
  addMeetingDocument,
  updateMeetingDocument,
  deleteMeetingDocument,
  logMeetingAccess,
  getPublicMeeting,
  guestJoinMeeting,
};
