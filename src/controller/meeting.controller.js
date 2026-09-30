const Meeting = require("../models/meeting.model");
const User = require("../models/user.model");
const Task = require("../models/task.model");
const Notification = require("../models/notification.model");
const { sendPushToUsers } = require("../service/webPush.service");

/**
 * 1. Lấy danh sách cuộc họp (Lọc theo thời gian, trạng thái, vai trò tham gia)
 */
const getMeetings = async (req, res) => {
  try {
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
    // Admin / Manager / BGH: Thấy tất cả các cuộc họp
    // Cán bộ thông thường: Thấy cuộc họp do mình tạo, mình làm chủ tọa/thư ký, hoặc có tên trong danh sách tham dự
    const isPrivileged = ["admin", "manager"].includes(currentUserRole);

    if (!isPrivileged) {
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
 * 4. Cập nhật thông tin phiên họp
 */
const updateMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    Object.assign(meeting, updateData);
    await meeting.save();

    return res.status(200).json({
      success: true,
      message: "Cập nhật phiên họp thành công!",
      data: meeting,
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
          attendanceStatus: "ATTENDED",
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
      data: attendee.accessLogs,
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
    const { pinCode, name, position, department, location, coords, guestId, device } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập Họ và tên của bạn!" });
    }

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiên họp" });
    }

    // Kiểm tra trạng thái cuộc họp: Nếu đã bế mạc hoặc hủy thì mã QR hết hiệu lực
    if (meeting.status === "CONCLUDED" || meeting.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Phiên họp này đã bế mạc hoặc kết thúc. Mã QR tham gia không còn hiệu lực!",
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
  getMeetings,
  getMeetingById,
  createMeeting,
  updateMeeting,
  updateMeetingStatus,
  checkInMeeting,
  toggleSpeakRequest,
  createOrOpenVote,
  submitVote,
  closeVote,
  saveMinutesAndActionItems,
  deleteMeeting,
  addMeetingDocument,
  deleteMeetingDocument,
  logMeetingAccess,
  getPublicMeeting,
  guestJoinMeeting,
};
