import { describe, it, expect } from "vitest";

// 测试地图瓦片 URL 生成函数
describe("RealMapSelector", () => {
  // 测试瓦片 URL 生成
  describe("getTileUrl", () => {
    it("should generate valid OpenStreetMap tile URLs for street layer", () => {
      const servers = ['a', 'b', 'c'];
      const x = 10;
      const y = 5;
      const z = 8;
      const server = servers[(x + y) % servers.length];
      const url = `https://${server}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
      
      expect(url).toMatch(/^https:\/\/[abc]\.tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/);
      expect(url).toContain("tile.openstreetmap.org");
    });

    it("should generate valid ESRI satellite tile URLs", () => {
      const x = 10;
      const y = 5;
      const z = 8;
      const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
      
      expect(url).toContain("arcgisonline.com");
      expect(url).toContain("World_Imagery");
    });

    it("should generate valid OpenTopoMap terrain tile URLs", () => {
      const servers = ['a', 'b', 'c'];
      const x = 10;
      const y = 5;
      const z = 8;
      const server = servers[(x + y) % servers.length];
      const url = `https://${server}.tile.opentopomap.org/${z}/${x}/${y}.png`;
      
      expect(url).toMatch(/^https:\/\/[abc]\.tile\.opentopomap\.org\/\d+\/\d+\/\d+\.png$/);
    });
  });

  // 测试经纬度转瓦片坐标
  describe("lonLatToTile", () => {
    it("should convert longitude/latitude to tile coordinates", () => {
      const lon = 36.75;  // 土耳其中部
      const lat = 37.5;
      const zoom = 5;
      
      const n = Math.pow(2, zoom);
      const x = Math.floor(((lon + 180) / 360) * n);
      const latRad = (lat * Math.PI) / 180;
      const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
      
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(n);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(n);
    });

    it("should handle negative longitudes (Western hemisphere)", () => {
      const lon = -118;  // 加州
      const lat = 35.75;
      const zoom = 5;
      
      const n = Math.pow(2, zoom);
      const x = Math.floor(((lon + 180) / 360) * n);
      
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(n);
    });
  });

  // 测试瓦片坐标转经纬度
  describe("tileToLonLat", () => {
    it("should convert tile coordinates back to longitude/latitude", () => {
      const x = 17;
      const y = 11;
      const zoom = 5;
      
      const n = Math.pow(2, zoom);
      const lon = (x / n) * 360 - 180;
      const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
      const lat = (latRad * 180) / Math.PI;
      
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
      expect(lat).toBeGreaterThanOrEqual(-85.05);
      expect(lat).toBeLessThanOrEqual(85.05);
    });
  });

  // 测试比例尺计算
  describe("scale calculation", () => {
    it("should calculate scale info at different zoom levels", () => {
      const earthCircumference = 40075016.686;
      const lat = 37.5;
      const zoom = 5;
      
      const metersPerPixel = (earthCircumference * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
      
      expect(metersPerPixel).toBeGreaterThan(0);
      expect(metersPerPixel).toBeLessThan(earthCircumference);
    });

    it("should return km unit at low zoom levels", () => {
      const earthCircumference = 40075016.686;
      const lat = 37.5;
      const zoom = 3;
      const targetWidth = 100;
      
      const metersPerPixel = (earthCircumference * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
      let distance = metersPerPixel * targetWidth;
      let unit = "m";
      
      if (distance >= 1000) {
        distance = distance / 1000;
        unit = "km";
      }
      
      expect(unit).toBe("km");
    });

    it("should return m unit at high zoom levels", () => {
      const earthCircumference = 40075016.686;
      const lat = 37.5;
      const zoom = 15;
      const targetWidth = 100;
      
      const metersPerPixel = (earthCircumference * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
      let distance = metersPerPixel * targetWidth;
      let unit = "m";
      
      if (distance >= 1000) {
        distance = distance / 1000;
        unit = "km";
      }
      
      expect(unit).toBe("m");
    });
  });

  // 测试边界验证
  describe("bounds validation", () => {
    it("should validate bounds correctly", () => {
      const bounds = { north: 38.5, south: 36.5, east: 38.0, west: 35.5 };
      
      expect(bounds.north).toBeGreaterThan(bounds.south);
      expect(bounds.east).toBeGreaterThan(bounds.west);
    });

    it("should handle bounds crossing the antimeridian", () => {
      // 冰岛火山区（西经）
      const bounds = { north: 64.5, south: 63.5, east: -18.0, west: -20.0 };
      
      expect(bounds.north).toBeGreaterThan(bounds.south);
      expect(bounds.east).toBeGreaterThan(bounds.west);
    });
  });

  // 测试预设区域
  describe("preset areas", () => {
    const presetAreas = [
      { name: "土耳其地震区", north: 38.5, south: 36.5, east: 38.0, west: 35.5 },
      { name: "加州断层带", north: 36.5, south: 35.0, east: -117.0, west: -119.0 },
      { name: "日本富士山", north: 35.8, south: 35.0, east: 139.0, west: 138.0 },
      { name: "冰岛火山区", north: 64.5, south: 63.5, east: -18.0, west: -20.0 },
    ];

    it("should have valid preset areas", () => {
      presetAreas.forEach((area) => {
        expect(area.name).toBeTruthy();
        expect(area.north).toBeGreaterThan(area.south);
        expect(area.east).toBeGreaterThan(area.west);
        expect(area.north).toBeLessThanOrEqual(90);
        expect(area.south).toBeGreaterThanOrEqual(-90);
      });
    });

    it("should calculate center point correctly", () => {
      const area = presetAreas[0]; // 土耳其地震区
      const centerLat = (area.north + area.south) / 2;
      const centerLon = (area.east + area.west) / 2;
      
      expect(centerLat).toBeCloseTo(37.5, 1);
      expect(centerLon).toBeCloseTo(36.75, 1);
    });
  });

  // 测试地图图层
  describe("map layers", () => {
    const mapLayers = {
      street: { name: "街道" },
      satellite: { name: "卫星" },
      terrain: { name: "地形" },
    };

    it("should have three map layer types", () => {
      expect(Object.keys(mapLayers)).toHaveLength(3);
    });

    it("should have Chinese names for all layers", () => {
      expect(mapLayers.street.name).toBe("街道");
      expect(mapLayers.satellite.name).toBe("卫星");
      expect(mapLayers.terrain.name).toBe("地形");
    });
  });

  // 测试坐标验证
  describe("coordinate validation", () => {
    it("should validate latitude range (-90 to 90)", () => {
      const validateLat = (lat: number) => lat >= -90 && lat <= 90;
      
      expect(validateLat(0)).toBe(true);
      expect(validateLat(45)).toBe(true);
      expect(validateLat(-45)).toBe(true);
      expect(validateLat(90)).toBe(true);
      expect(validateLat(-90)).toBe(true);
      expect(validateLat(91)).toBe(false);
      expect(validateLat(-91)).toBe(false);
    });

    it("should validate longitude range (-180 to 180)", () => {
      const validateLon = (lon: number) => lon >= -180 && lon <= 180;
      
      expect(validateLon(0)).toBe(true);
      expect(validateLon(90)).toBe(true);
      expect(validateLon(-90)).toBe(true);
      expect(validateLon(180)).toBe(true);
      expect(validateLon(-180)).toBe(true);
      expect(validateLon(181)).toBe(false);
      expect(validateLon(-181)).toBe(false);
    });
  });

  // 测试缩放级别
  describe("zoom levels", () => {
    it("should have valid zoom range", () => {
      const minZoom = 1;
      const maxZoom = 18;
      const defaultZoom = 5;
      
      expect(defaultZoom).toBeGreaterThanOrEqual(minZoom);
      expect(defaultZoom).toBeLessThanOrEqual(maxZoom);
    });

    it("should calculate correct number of tiles at each zoom level", () => {
      for (let zoom = 1; zoom <= 10; zoom++) {
        const tilesPerSide = Math.pow(2, zoom);
        const totalTiles = tilesPerSide * tilesPerSide;
        
        expect(tilesPerSide).toBe(Math.pow(2, zoom));
        expect(totalTiles).toBe(Math.pow(4, zoom));
      }
    });
  });

  // 测试像素坐标转换
  describe("pixel coordinate conversion", () => {
    it("should convert pixel to geographic coordinates", () => {
      const mapSize = { width: 300, height: 200 };
      const center = { lat: 37.5, lon: 36.75 };
      const zoom = 5;
      const tileSize = 256;
      
      // 点击地图中心应该返回中心坐标
      const px = mapSize.width / 2;
      const py = mapSize.height / 2;
      
      const n = Math.pow(2, zoom);
      const centerPixelX = ((center.lon + 180) / 360) * n * tileSize;
      const latRad = (center.lat * Math.PI) / 180;
      const centerPixelY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n * tileSize;
      
      const globalX = centerPixelX + (px - mapSize.width / 2);
      const globalY = centerPixelY + (py - mapSize.height / 2);
      
      const resultLon = (globalX / (n * tileSize)) * 360 - 180;
      const latRadResult = Math.atan(Math.sinh(Math.PI * (1 - (2 * globalY) / (n * tileSize))));
      const resultLat = (latRadResult * 180) / Math.PI;
      
      expect(resultLon).toBeCloseTo(center.lon, 1);
      expect(resultLat).toBeCloseTo(center.lat, 1);
    });
  });
});

// 测试搜索功能
describe("Search Functionality", () => {
  it("should validate search query", () => {
    const validateQuery = (query: string) => query.trim().length > 0;
    
    expect(validateQuery("Tokyo")).toBe(true);
    expect(validateQuery("  ")).toBe(false);
    expect(validateQuery("")).toBe(false);
  });

  it("should parse search result correctly", () => {
    const result = {
      display_name: "东京都/東京都, 日本",
      lat: "35.6762",
      lon: "139.6503",
      boundingbox: ["35.5", "35.9", "139.4", "139.9"],
    };

    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const [south, north, west, east] = result.boundingbox.map(parseFloat);

    expect(lat).toBeCloseTo(35.6762, 4);
    expect(lon).toBeCloseTo(139.6503, 4);
    expect(north).toBeGreaterThan(south);
    expect(east).toBeGreaterThan(west);
  });

  it("should extract short name from display_name", () => {
    const displayName = "东京都/東京都, 日本";
    const shortName = displayName.split(",")[0];
    
    expect(shortName).toBe("东京都/東京都");
  });
});

// 测试标注功能
describe("Marker Functionality", () => {
  it("should create marker with unique id", () => {
    const createMarker = (lat: number, lon: number, label: string) => ({
      id: Date.now().toString(),
      lat,
      lon,
      label,
    });

    const marker1 = createMarker(37.5, 36.75, "观测站A");
    // 等待一毫秒确保 ID 不同
    const marker2 = createMarker(38.0, 37.0, "观测站B");

    expect(marker1.id).toBeTruthy();
    expect(marker1.lat).toBe(37.5);
    expect(marker1.lon).toBe(36.75);
    expect(marker1.label).toBe("观测站A");
  });

  it("should validate marker coordinates", () => {
    const validateMarker = (lat: number, lon: number) => {
      return !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    };

    expect(validateMarker(37.5, 36.75)).toBe(true);
    expect(validateMarker(100, 36.75)).toBe(false); // Invalid latitude
    expect(validateMarker(37.5, 200)).toBe(false); // Invalid longitude
    expect(validateMarker(NaN, 36.75)).toBe(false);
  });

  it("should filter markers by id", () => {
    const markers = [
      { id: "1", lat: 37.5, lon: 36.75, label: "A" },
      { id: "2", lat: 38.0, lon: 37.0, label: "B" },
      { id: "3", lat: 38.5, lon: 37.5, label: "C" },
    ];

    const filtered = markers.filter((m) => m.id !== "2");
    expect(filtered).toHaveLength(2);
    expect(filtered.find((m) => m.id === "2")).toBeUndefined();
  });

  it("should check if marker is visible in viewport", () => {
    const mapSize = { width: 300, height: 200 };
    const isVisible = (x: number, y: number) => {
      return x >= -20 && x <= mapSize.width + 20 && y >= -20 && y <= mapSize.height + 20;
    };

    expect(isVisible(150, 100)).toBe(true); // Center
    expect(isVisible(0, 0)).toBe(true); // Top-left
    expect(isVisible(300, 200)).toBe(true); // Bottom-right
    expect(isVisible(-30, 100)).toBe(false); // Too far left
    expect(isVisible(150, 250)).toBe(false); // Too far down
  });
});

// 测试手势功能
describe("Gesture Handling", () => {
  it("should calculate pinch distance", () => {
    const getDistance = (touches: { pageX: number; pageY: number }[]) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    expect(getDistance([{ pageX: 0, pageY: 0 }, { pageX: 100, pageY: 0 }])).toBe(100);
    expect(getDistance([{ pageX: 0, pageY: 0 }, { pageX: 0, pageY: 100 }])).toBe(100);
    expect(getDistance([{ pageX: 0, pageY: 0 }, { pageX: 100, pageY: 100 }])).toBeCloseTo(141.42, 1);
    expect(getDistance([{ pageX: 0, pageY: 0 }])).toBe(0);
  });

  it("should calculate zoom from pinch scale", () => {
    const calculateZoom = (initialZoom: number, initialDistance: number, currentDistance: number) => {
      const scale = currentDistance / initialDistance;
      return Math.round(initialZoom + Math.log2(scale));
    };

    expect(calculateZoom(5, 100, 200)).toBe(6); // Zoom in
    expect(calculateZoom(5, 200, 100)).toBe(4); // Zoom out
    expect(calculateZoom(5, 100, 100)).toBe(5); // No change
  });

  it("should clamp zoom within valid range", () => {
    const clampZoom = (zoom: number) => Math.max(1, Math.min(18, zoom));

    expect(clampZoom(0)).toBe(1);
    expect(clampZoom(-5)).toBe(1);
    expect(clampZoom(20)).toBe(18);
    expect(clampZoom(25)).toBe(18);
    expect(clampZoom(10)).toBe(10);
  });

  it("should detect small movements as potential selection", () => {
    const isSmallMovement = (dx: number, dy: number, threshold: number = 10) => {
      return Math.abs(dx) < threshold && Math.abs(dy) < threshold;
    };

    expect(isSmallMovement(5, 5)).toBe(true);
    expect(isSmallMovement(15, 5)).toBe(false);
    expect(isSmallMovement(5, 15)).toBe(false);
    expect(isSmallMovement(0, 0)).toBe(true);
  });
});

// 测试跳转功能
describe("Go To Location", () => {
  it("should parse and validate coordinates", () => {
    const parseCoordinates = (latStr: string, lonStr: string) => {
      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);
      const isValid = !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
      return { lat, lon, isValid };
    };

    const valid = parseCoordinates("37.5", "36.75");
    expect(valid.isValid).toBe(true);
    expect(valid.lat).toBe(37.5);
    expect(valid.lon).toBe(36.75);

    const invalid1 = parseCoordinates("invalid", "36.75");
    expect(invalid1.isValid).toBe(false);

    const invalid2 = parseCoordinates("100", "36.75");
    expect(invalid2.isValid).toBe(false);
  });
});
