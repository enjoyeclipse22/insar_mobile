/**
 * ASF API Token 验证测试
 */
import { describe, it, expect } from "vitest";

describe("ASF API Token Validation", () => {
  it("should have ASF_API_TOKEN environment variable set", () => {
    const token = process.env.ASF_API_TOKEN;
    expect(token).toBeDefined();
    expect(token).not.toBe("");
    expect(token!.length).toBeGreaterThan(10);
  });

  it("should be able to authenticate with ASF API", async () => {
    const token = process.env.ASF_API_TOKEN;
    if (!token) {
      throw new Error("ASF_API_TOKEN not set");
    }

    // 使用 ASF API 进行简单的搜索测试
    const searchParams = new URLSearchParams({
      platform: "Sentinel-1",
      processingLevel: "SLC",
      beamMode: "IW",
      bbox: "106.0,29.0,107.0,30.0", // 重庆区域
      start: "2024-01-01",
      end: "2024-01-31",
      maxResults: "1",
      output: "json",
    });

    const searchUrl = `https://api.daac.asf.alaska.edu/services/search/param?${searchParams.toString()}`;

    const response = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    // ASF API 应该返回 200 状态码
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);

    const data = await response.json();
    // 验证返回的是数组格式
    expect(Array.isArray(data) || (Array.isArray(data) && data.length === 0)).toBe(true);
  }, 30000); // 30 秒超时
});
