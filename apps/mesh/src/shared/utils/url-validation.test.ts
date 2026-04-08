import { describe, it, expect } from "bun:test";
import { isPrivateNetworkUrl } from "./url-validation";

describe("isPrivateNetworkUrl", () => {
  describe("blocks private IPv4 ranges", () => {
    it("blocks loopback (127.x.x.x)", () => {
      expect(isPrivateNetworkUrl("http://127.0.0.1/mcp")).toBe(true);
      expect(isPrivateNetworkUrl("http://127.0.0.1:51388")).toBe(true);
      expect(isPrivateNetworkUrl("http://127.255.255.255")).toBe(true);
    });

    it("blocks 10.x.x.x", () => {
      expect(isPrivateNetworkUrl("http://10.0.0.1")).toBe(true);
      expect(isPrivateNetworkUrl("http://10.255.255.255")).toBe(true);
    });

    it("blocks 172.16.x.x - 172.31.x.x", () => {
      expect(isPrivateNetworkUrl("http://172.16.0.1")).toBe(true);
      expect(isPrivateNetworkUrl("http://172.31.255.255")).toBe(true);
    });

    it("blocks 192.168.x.x", () => {
      expect(isPrivateNetworkUrl("http://192.168.0.1")).toBe(true);
      expect(isPrivateNetworkUrl("http://192.168.1.100:8080")).toBe(true);
    });

    it("blocks link-local / IMDS (169.254.x.x)", () => {
      expect(
        isPrivateNetworkUrl("http://169.254.169.254/latest/meta-data/"),
      ).toBe(true);
      expect(isPrivateNetworkUrl("http://169.254.0.1")).toBe(true);
    });

    it("blocks 0.0.0.0/8", () => {
      expect(isPrivateNetworkUrl("http://0.0.0.0")).toBe(true);
    });
  });

  describe("blocks private hostnames", () => {
    it("blocks localhost", () => {
      expect(isPrivateNetworkUrl("http://localhost")).toBe(true);
      expect(isPrivateNetworkUrl("http://localhost:3000/mcp")).toBe(true);
    });
  });

  describe("blocks IPv6 private addresses", () => {
    it("blocks ::1 loopback", () => {
      expect(isPrivateNetworkUrl("http://[::1]")).toBe(true);
    });

    it("blocks unique local (fc/fd)", () => {
      expect(isPrivateNetworkUrl("http://[fc00::1]")).toBe(true);
      expect(isPrivateNetworkUrl("http://[fd12:3456::1]")).toBe(true);
    });

    it("blocks link-local (fe80)", () => {
      expect(isPrivateNetworkUrl("http://[fe80::1]")).toBe(true);
    });

    it("blocks IPv4-mapped IPv6", () => {
      expect(isPrivateNetworkUrl("http://[::ffff:127.0.0.1]")).toBe(true);
      expect(isPrivateNetworkUrl("http://[::ffff:169.254.169.254]")).toBe(true);
    });
  });

  describe("allows public URLs", () => {
    it("allows public domains", () => {
      expect(isPrivateNetworkUrl("https://example.com/mcp")).toBe(false);
      expect(isPrivateNetworkUrl("https://api.stripe.com")).toBe(false);
      expect(isPrivateNetworkUrl("https://mcp.clickhouse.cloud/mcp")).toBe(
        false,
      );
    });

    it("allows public IPs", () => {
      expect(isPrivateNetworkUrl("http://8.8.8.8")).toBe(false);
      expect(isPrivateNetworkUrl("https://1.1.1.1")).toBe(false);
    });

    it("does not block 172.32+ (outside private range)", () => {
      expect(isPrivateNetworkUrl("http://172.32.0.1")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("blocks unparseable URLs", () => {
      expect(isPrivateNetworkUrl("not-a-url")).toBe(true);
      expect(isPrivateNetworkUrl("")).toBe(true);
    });
  });
});
