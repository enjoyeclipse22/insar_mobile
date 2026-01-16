/**
 * ASF API 凭证验证测试
 * 测试 ASF Earthdata API Token 是否有效
 */

import { describe, it, expect } from "vitest";

describe("ASF API Credentials", () => {
  const ASF_API_TOKEN = process.env.ASF_API_TOKEN;
  const ASF_BASE_URL = "https://api.daac.asf.alaska.edu";

  it("should have ASF_API_TOKEN environment variable set", () => {
    expect(ASF_API_TOKEN).toBeDefined();
    expect(ASF_API_TOKEN).not.toBe("");
    expect(ASF_API_TOKEN!.length).toBeGreaterThan(100); // JWT tokens are typically long
  });

  it("should be a valid JWT token format", () => {
    expect(ASF_API_TOKEN).toBeDefined();
    // JWT tokens have 3 parts separated by dots
    const parts = ASF_API_TOKEN!.split(".");
    expect(parts.length).toBe(3);
    
    // Each part should be base64 encoded
    parts.forEach((part) => {
      expect(part.length).toBeGreaterThan(0);
    });
  });

  it("should successfully authenticate with ASF API", async () => {
    expect(ASF_API_TOKEN).toBeDefined();
    
    // Test authentication by making a simple search request
    const searchUrl = `${ASF_BASE_URL}/services/search/param?platform=Sentinel-1&maxResults=1&output=json`;
    
    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${ASF_API_TOKEN}`,
        "Accept": "application/json",
      },
    });

    // The API should respond (even if no results, it should not be 401/403)
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
    
    // Should be either 200 (success) or other non-auth error
    console.log(`ASF API Response Status: ${response.status}`);
  }, 30000); // 30 second timeout for network request

  it("should be able to search for Sentinel-1 data", async () => {
    expect(ASF_API_TOKEN).toBeDefined();
    
    // Search for a specific area (Turkey earthquake region)
    const searchParams = new URLSearchParams({
      platform: "Sentinel-1",
      bbox: "36.5,37.0,38.0,38.5", // Turkey earthquake region
      start: "2023-02-01",
      end: "2023-02-28",
      maxResults: "5",
      output: "json",
    });
    
    const searchUrl = `${ASF_BASE_URL}/services/search/param?${searchParams.toString()}`;
    
    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${ASF_API_TOKEN}`,
        "Accept": "application/json",
      },
    });

    console.log(`Search Response Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Found ${Array.isArray(data) ? data.length : 0} results`);
    }
    
    // Should not be authentication error
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  }, 30000);
});
