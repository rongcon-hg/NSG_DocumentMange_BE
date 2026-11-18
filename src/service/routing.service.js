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
      durationMinutes: 0,
      segments: [],
      waypoints: [],
    };
  }

  // Lọc các điểm hợp lệ có address
  let points = waypoints.filter((w) => w && (w.address || w.name));
  if (points.length === 0) {
    return { totalDistanceKm: 0, durationMinutes: 0, segments: [], waypoints: [] };
  }

  // Nếu chọn khứ hồi và điểm cuối chưa phải là điểm xuất phát, tự động thêm điểm quay về
  const origin = points[0];
  if (isRoundTrip && points.length >= 2) {
    const lastPoint = points[points.length - 1];
    const isSameAsOrigin =
      lastPoint.isRoundTripReturn ||
      (lastPoint.address && lastPoint.address.trim().toLowerCase() === origin.address.trim().toLowerCase());

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
  if (validCoords.length >= 2 && validCoords.length === points.length) {
    const coords = points.map((p) => [Number(p.lng), Number(p.lat)]);
    const routeRes = await getOsrmRoute(coords);
    return {
      ...routeRes,
      waypoints: points,
    };
  }

  return {
    totalDistanceKm: 0,
    durationMinutes: 0,
    segments: [],
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
    return calculateRoute(waypoints, isRoundTrip);
  }

  const origin = waypoints[0];
  // Lấy danh sách các điểm trung gian (loại trừ điểm xuất phát và điểm quay về khứ hồi cũ nếu có)
  const intermediateStops = waypoints.slice(1).filter((w) => !w.isRoundTripReturn);

  if (intermediateStops.length <= 1) {
    return calculateRoute(waypoints, isRoundTrip);
  }

  // Nếu số điểm trung gian <= 6, thử tất cả hoán vị (Brute-force Permutations) để tìm lời giải tối ưu tuyệt đối
  if (intermediateStops.length <= 6) {
    const permute = (arr) => {
      if (arr.length <= 1) return [arr];
      const result = [];
      for (let i = 0; i < arr.length; i++) {
        const current = arr[i];
        const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
        const remainingPerms = permute(remaining);
        for (const p of remainingPerms) {
          result.push([current, ...p]);
        }
      }
      return result;
    };

    const allPermutations = permute(intermediateStops);
    let bestWaypoints = null;
    let bestDistance = Infinity;
    let bestResult = null;

    for (const perm of allPermutations) {
      const candidateList = [origin, ...perm];
      const candidateResult = await calculateRoute(candidateList, isRoundTrip);
      if (candidateResult.totalDistanceKm < bestDistance) {
        bestDistance = candidateResult.totalDistanceKm;
        bestWaypoints = candidateResult.waypoints;
        bestResult = candidateResult;
      }
    }

    return bestResult || calculateRoute(waypoints, isRoundTrip);
  }

  // Nếu nhiều hơn 6 điểm, dùng giải thuật Tham lam (Nearest Neighbor)
  let unvisited = [...intermediateStops];
  let current = origin;
  const orderedStops = [];

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let shortestDist = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const target = unvisited[i];
      let dist = 0;
      if (current.lat && current.lng && target.lat && target.lng) {
        dist = calculateHaversineDistance(current.lat, current.lng, target.lat, target.lng);
      }
      if (dist < shortestDist) {
        shortestDist = dist;
        nearestIdx = i;
      }
    }

    const nextStop = unvisited.splice(nearestIdx, 1)[0];
    orderedStops.push(nextStop);
    current = nextStop;
  }

  const finalWaypoints = [origin, ...orderedStops];
  return calculateRoute(finalWaypoints, isRoundTrip);
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
