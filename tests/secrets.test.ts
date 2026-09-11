import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { decryptSecret, encryptSecret, isSecretName, maskSecret, SECRET_DEFS } from "@/lib/secrets";

describe("app secrets", () => {
  const key = crypto.createHash("sha256").update("test-key").digest();
  it("암호화 왕복", () => {
    const enc = encryptSecret("sk-ant-1234567890abcdef", key);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("sk-ant");
    expect(decryptSecret(enc, key)).toBe("sk-ant-1234567890abcdef");
    // 같은 평문도 IV가 달라 암호문이 다르다
    expect(encryptSecret("x", key)).not.toBe(encryptSecret("x", key));
  });
  it("다른 키·변조된 암호문은 복호화 실패", () => {
    const enc = encryptSecret("secret", key);
    const other = crypto.createHash("sha256").update("other").digest();
    expect(() => decryptSecret(enc, other)).toThrow();
    const parts = enc.split(".");
    parts[3] = parts[3].slice(0, -2) + "AA";
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret("garbage", key)).toThrow();
  });
  it("마스킹은 앞 3자·뒤 4자만", () => {
    expect(maskSecret("sk-abcdefghijklmnop")).toBe("sk-…mnop");
    expect(maskSecret("short")).toBe("•••••");
  });
  it("관리 대상 키 목록", () => {
    expect(isSecretName("OPENAI_API_KEY")).toBe(true);
    expect(isSecretName("FAL_KEY")).toBe(true);
    expect(isSecretName("SUPABASE_SERVICE_ROLE_KEY")).toBe(false); // 부팅 전 필요 → 환경변수 전용
    expect(SECRET_DEFS.map((d) => d.name)).toContain("ANTHROPIC_API_KEY");
  });
});
