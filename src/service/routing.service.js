const https = require("https");

/**
 * Helper gọi API trả về JSON không phụ thuộc thư viện ngoài (sử dụng fetch hoặc https)
 */
const fetchJson = async (url, options = {}) => {
  if (typeof fetch === "function") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 5000);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: options.headers || { "User-Agent": "NSG-Vehicle-Routing/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  }

  // Fallback bằng native https module của Node.js
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: options.headers || { "User-Agent": "NSG-Vehicle-Routing/1.0" },
        timeout: options.timeout || 5000,
      },
      (res) => {
        let rawData = "";
        res.on("data", (chunk) => (rawData += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(rawData));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
};

/**
 * Tính khoảng cách đường chim bay (Haversine formula) giữa 2 tọa độ (km)
 */
const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; // Bán kính Trái Đất (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const birdFlyKm = R * c;
  // Hệ số uốn cong đường bộ trung bình tại các đô thị và tỉnh thành Việt Nam (~1.35)
  return Math.round(birdFlyKm * 1.35 * 10) / 10;
};

/**
 * Gọi API định tuyến đường bộ OSRM (Open Source Routing Machine)
 * @param {Array} coordinates Mảng các cặp [lng, lat]
 * @returns {Object} { totalDistanceKm, durationMinutes, segments }
 */
const getOsrmRoute = async (coordinates) => {
  if (!coordinates || coordinates.length < 2) {
    return { totalDistanceKm: 0, durationMinutes: 0, segments: [] };
  }

  try {
    const coordsStr = coordinates.map((c) => `${c[0]},${c[1]}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=false&steps=false`;

    const data = await fetchJson(url, {
      timeout: 4000,
      headers: { "User-Agent": "NSG-Vehicle-Routing/1.0" },
    });

    if (data && data.code === "Ok" && data.routes && data.routes[0]) {
      const route = data.routes[0];
      const totalDistanceKm = Math.round((route.distance / 1000) * 10) / 10;
      const durationMinutes = Math.round(route.duration / 60);

      // Phân tách cự ly từng chặng nếu có legs
      const segments = (route.legs || []).map((leg, idx) => ({
        fromIndex: idx,
        toIndex: idx + 1,
        distanceKm: Math.round((leg.distance / 1000) * 10) / 10,
        durationMinutes: Math.round(leg.duration / 60),
      }));

      return {
        totalDistanceKm,
        durationMinutes,
        segments,
        method: "ROUTING_API",
      };
    }
  } catch (err) {
    console.warn("[RoutingService] OSRM API không khả dụng hoặc timeout, chuyển sang tính theo Haversine fallback:", err.message);
  }

  // Fallback Haversine
  let totalDistanceKm = 0;
  const segments = [];
  for (let i = 0; i < coordinates.length - 1; i++) {
    const c1 = coordinates[i];
    const c2 = coordinates[i + 1];
    const dist = calculateHaversineDistance(c1[1], c1[0], c2[1], c2[0]);
    totalDistanceKm += dist;
    segments.push({
      fromIndex: i,
      toIndex: i + 1,
      distanceKm: dist,
      durationMinutes: Math.round(dist * 2.5), // Ước tính 25 km/h trong nội thành
    });
  }

  return {
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    durationMinutes: Math.round(totalDistanceKm * 2.5),
    segments,
    method: "ESTIMATED",
  };
};

/**
 * Tính toán lộ trình và tổng số Km cho danh sách waypoints
 * @param {Array} waypoints Danh sách điểm dừng [{ address, lat, lng, name, ... }]
 * @param {Boolean} isRoundTrip Có khứ hồi quay về điểm xuất phát hay không
 */
const calculateRoute = async (waypoints = [], isRoundTrip = true) => {
  if (!Array.isArray(waypoints) || waypoints.length === 0) {
    return {
      totalDistanceKm: 0,
      estimatedDurationMinutes: 0,
      durationMinutes: 0,
      segments: [],
      legs: [],
      waypoints: [],
      method: "MANUAL",
    };
  }

  // Lọc các điểm hợp lệ có address hoặc name
  let points = waypoints.filter((w) => w && (w.address || w.name));
  if (points.length === 0) {
    return {
      totalDistanceKm: 0,
      estimatedDurationMinutes: 0,
      durationMinutes: 0,
      segments: [],
      legs: [],
      waypoints: [],
      method: "MANUAL",
    };
  }

  // Tự động tìm kiếm tọa độ (Geocoding) nếu có điểm chưa có lat/lng
  for (let i = 0; i < points.length; i++) {
    if (!points[i].lat || !points[i].lng) {
      const q = points[i].address || points[i].name;
      if (q && q.trim()) {
        try {
          const geo = await geocodeAddress(q.trim());
          if (geo && geo.length > 0 && geo[0].lat && geo[0].lng) {
            points[i].lat = geo[0].lat;
            points[i].lng = geo[0].lng;
            if (!points[i].name) points[i].name = geo[0].name;
          }
        } catch (e) {
          // ignore error
        }
      }
    }
  }

  // Nếu chọn khứ hồi và điểm cuối chưa phải là điểm xuất phát, tự động thêm điểm quay về
  const origin = points[0];
  if (isRoundTrip && points.length >= 2) {
    const lastPoint = points[points.length - 1];
    const isSameAsOrigin =
      lastPoint.isRoundTripReturn ||
      (lastPoint.address && origin.address && lastPoint.address.trim().toLowerCase() === origin.address.trim().toLowerCase());

    if (!isSameAsOrigin) {
      points = [
        ...points,
        {
          order: points.length + 1,
          name: `Về: ${origin.name || "Điểm xuất phát"}`,
          address: origin.address,
          lat: origin.lat,
          lng: origin.lng,
          isRoundTripReturn: true,
        },
      ];
    }
  }

  // Đánh lại số thứ tự order
  points = points.map((p, idx) => ({ ...p, order: idx + 1 }));

  // Trích xuất tọa độ để gửi OSRM
  const validCoords = points.filter((p) => p.lat && p.lng);
  if (validCoords.length >= 2) {
    const coords = validCoords.map((p) => [Number(p.lng), Number(p.lat)]);
    const routeRes = await getOsrmRoute(coords);
    return {
      ...routeRes,
      totalDistanceKm: routeRes.totalDistanceKm || 0,
      estimatedDurationMinutes: routeRes.durationMinutes || Math.round((routeRes.totalDistanceKm || 0) * 2.5),
      durationMinutes: routeRes.durationMinutes || 0,
      segments: routeRes.segments || [],
      legs: routeRes.segments || [],
      waypoints: points,
    };
  }

  return {
    totalDistanceKm: 0,
    estimatedDurationMinutes: 0,
    durationMinutes: 0,
    segments: [],
    legs: [],
    waypoints: points,
    method: "MANUAL",
  };
};

/**
 * Tối ưu hóa thứ tự các điểm dừng trung gian (Traveling Salesperson Problem / Permutation)
 * Điểm xuất phát (index 0) cố định.
 * Nếu là khứ hồi: điểm kết thúc cố định là điểm xuất phát.
 * Các điểm trung gian được sắp xếp lại sao cho tổng quãng đường ngắn nhất.
 * @param {Array} waypoints
 * @param {Boolean} isRoundTrip
 */
const optimizeRoute = async (waypoints = [], isRoundTrip = true) => {
  if (!Array.isArray(waypoints) || waypoints.length <= 2) {
    const calc = await calculateRoute(waypoints, isRoundTrip);
    const editable = (calc.waypoints || []).filter((w) => !w.isRoundTripReturn).map((w, idx) => ({ ...w, order: idx }));
    return {
      ...calc,
      optimizedWaypoints: editable,
      savedDistanceKm: 0,
      legs: calc.segments || [],
    };
  }

  // Lọc các điểm hợp lệ
  let validPoints = waypoints.filter((w) => w && (w.address || w.name));
  if (validPoints.length <= 2) {
    const calc = await calculateRoute(validPoints, isRoundTrip);
    const editable = (calc.waypoints || []).filter((w) => !w.isRoundTripReturn).map((w, idx) => ({ ...w, order: idx }));
    return {
      ...calc,
      optimizedWaypoints: editable,
      savedDistanceKm: 0,
      legs: calc.segments || [],
    };
  }

  // Tự động tìm kiếm tọa độ (Geocoding) nếu có điểm chưa có lat/lng
  for (let i = 0; i < validPoints.length; i++) {
    if (!validPoints[i].lat || !validPoints[i].lng) {
      const q = validPoints[i].address || validPoints[i].name;
      if (q && q.trim()) {
        try {
          const geo = await geocodeAddress(q.trim());
          if (geo && geo.length > 0 && geo[0].lat && geo[0].lng) {
            validPoints[i].lat = geo[0].lat;
            validPoints[i].lng = geo[0].lng;
            if (!validPoints[i].name) validPoints[i].name = geo[0].name;
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }

  const origin = validPoints[0];
  const intermediateStops = validPoints.slice(1).filter((w) => !w.isRoundTripReturn);

  if (intermediateStops.length <= 1) {
    const calc = await calculateRoute(validPoints, isRoundTrip);
    const editable = (calc.waypoints || []).filter((w) => !w.isRoundTripReturn).map((w, idx) => ({ ...w, order: idx }));
    return {
      ...calc,
      optimizedWaypoints: editable,
      savedDistanceKm: 0,
      legs: calc.segments || [],
    };
  }

  // Hàm tính khoảng cách giữa 2 điểm (Haversine)
  const getDist = (p1, p2) => {
    if (p1 && p2 && p1.lat && p1.lng && p2.lat && p2.lng) {
      return calculateHaversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
    }
    return 2.0; // fallback mặc định nếu chưa có tọa độ
  };

  // Hàm tính tổng cự ly của 1 cấu hình dừng
  const evalRouteDistance = (stops) => {
    let dist = getDist(origin, stops[0]);
    for (let i = 0; i < stops.length - 1; i++) {
      dist += getDist(stops[i], stops[i + 1]);
    }
    if (isRoundTrip) {
      dist += getDist(stops[stops.length - 1], origin);
    }
    return dist;
  };

  let bestPerm = intermediateStops;

  if (intermediateStops.length <= 7) {
    // Hoán vị brute-force trong bộ nhớ (< 1ms, không tốn network call)
    const permute = (arr) => {
      if (arr.length <= 1) return [arr];
      const result = [];
      for (let i = 0; i < arr.length; i++) {
        const cur = arr[i];
        const rem = arr.slice(0, i).concat(arr.slice(i + 1));
        for (const p of permute(rem)) {
          result.push([cur, ...p]);
        }
      }
      return result;
    };

    const allPerms = permute(intermediateStops);
    let minDistance = Infinity;

    for (const p of allPerms) {
      const d = evalRouteDistance(p);
      if (d < minDistance) {
        minDistance = d;
        bestPerm = p;
      }
    }
  } else {
    // Thuật toán Tham lam (Nearest Neighbor) nếu nhiều hơn 7 điểm
    let unvisited = [...intermediateStops];
    let current = origin;
    const ordered = [];

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let shortest = Infinity;
      for (let i = 0; i < unvisited.length; i++) {
        const d = getDist(current, unvisited[i]);
        if (d < shortest) {
          shortest = d;
          nearestIdx = i;
        }
      }
      const nextPoint = unvisited.splice(nearestIdx, 1)[0];
      ordered.push(nextPoint);
      current = nextPoint;
    }
    bestPerm = ordered;
  }

  // Danh sách các điểm dừng đã tối ưu theo thứ tự (không bao gồm chặng khứ hồi về)
  const winningWaypoints = [origin, ...bestPerm].map((w, idx) => ({ ...w, order: idx }));

  // Chỉ gọi calculateRoute đúng 2 lần (lộ trình ban đầu và lộ trình tối ưu) để lấy OSRM đường bộ chính xác
  const [originalResult, optimizedResult] = await Promise.all([
    calculateRoute(validPoints, isRoundTrip),
    calculateRoute(winningWaypoints, isRoundTrip),
  ]);

  const origKm = originalResult.totalDistanceKm || 0;
  const optKm = optimizedResult.totalDistanceKm || 0;
  const savedDistanceKm = Math.max(0, Math.round((origKm - optKm) * 10) / 10);

  return {
    ...optimizedResult,
    optimizedWaypoints: winningWaypoints,
    waypoints: optimizedResult.waypoints || winningWaypoints,
    savedDistanceKm,
    legs: optimizedResult.legs || optimizedResult.segments || [],
    totalDistanceKm: optKm,
    estimatedDurationMinutes: optimizedResult.estimatedDurationMinutes || optimizedResult.durationMinutes || 0,
  };
};

/**
 * Tìm kiếm gợi ý địa chỉ (Geocoding) qua Photon / Nominatim
 * @param {String} query Chuỗi tìm kiếm (địa chỉ, tên trường, cơ quan)
 */
const geocodeAddress = async (query = "") => {
  if (!query || !query.trim()) return [];

  const cleanQuery = query.trim();

  try {
    // Ưu tiên gọi Photon API (nhanh, tối ưu tìm kiếm địa danh)
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&limit=5&lang=vi`;
    const data = await fetchJson(url, {
      timeout: 3000,
      headers: { "User-Agent": "NSG-Vehicle-Geocode/1.0" },
    });

    if (data && data.features && data.features.length > 0) {
      return data.features.map((f) => {
        const props = f.properties || {};
        const coords = f.geometry?.coordinates || [0, 0];
        const nameParts = [props.name, props.street, props.district, props.city || props.county, props.state]
          .filter(Boolean);
        const displayName = nameParts.length > 0 ? nameParts.join(", ") : cleanQuery;

        return {
          name: props.name || cleanQuery,
          address: displayName,
          lat: coords[1],
          lng: coords[0],
        };
      });
    }
  } catch (e) {
    console.warn("[Geocode] Photon API timeout hoặc lỗi, fallback Nominatim:", e.message);
  }

  try {
    // Fallback Nominatim OpenStreetMap
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      cleanQuery
    )}&countrycodes=vn&limit=5`;

    const data = await fetchJson(nominatimUrl, {
      timeout: 3000,
      headers: { "User-Agent": "NSG-Vehicle-Geocode/1.0" },
    });

    if (Array.isArray(data) && data.length > 0) {
      return data.map((item) => ({
        name: item.name || cleanQuery,
        address: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }));
    }
  } catch (err) {
    console.warn("[Geocode] Nominatim API lỗi:", err.message);
  }

  return [];
};

module.exports = {
  calculateHaversineDistance,
  getOsrmRoute,
  calculateRoute,
  optimizeRoute,
  geocodeAddress,
};
