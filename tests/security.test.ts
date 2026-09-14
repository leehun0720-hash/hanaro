import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/site";
import { safeEqual, isCronAuthorized } from "@/lib/safe-compare";

describe("safeNext — 로그인 후 이동 경로", () => {
  it("사이트 내부 경로만 통과", () => {
    expect(safeNext("/studio/practice")).toBe("/studio/practice");
    expect(safeNext("/studio?x=1#a")).toBe("/studio?x=1#a");
  });
  it("오픈 리다이렉트 형태는 기본 경로로", () => {
    expect(safeNext("//evil.com")).toBe("/studio");
    expect(safeNext("/\\evil.com")).toBe("/studio");
    expect(safeNext("https://evil.com")).toBe("/studio");
    expect(safeNext("javascript:alert(1)")).toBe("/studio");
    expect(safeNext("/a\nb")).toBe("/studio");
    expect(safeNext(null)).toBe("/studio");
    expect(safeNext("")).toBe("/studio");
  });
});

describe("safeEqual / isCronAuthorized", () => {
  it("같은 값만 참", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(false);
    expect(safeEqual(null, "x")).toBe(false);
  });
  it("CRON_SECRET 미설정이면 항상 거부", () => {
    const prev = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(new Request("http://x", { headers: { authorization: "Bearer " } }))).toBe(false);
    process.env.CRON_SECRET = "s3cret";
    expect(isCronAuthorized(new Request("http://x", { headers: { authorization: "Bearer s3cret" } }))).toBe(true);
    expect(isCronAuthorized(new Request("http://x", { headers: { authorization: "Bearer nope" } }))).toBe(false);
    expect(isCronAuthorized(new Request("http://x"))).toBe(false);
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });
});
