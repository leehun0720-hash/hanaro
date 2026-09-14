import { describe, expect, it } from "vitest";
import { fileName, shortName } from "@/lib/filename";

describe("파일명 축약", () => {
  it("긴 제목 → 종류_핵심어 10자", () => {
    const title = "추석 선물세트 기획서 - 안성 한우 선물세트 선 예약 판매";
    expect(fileName(["기획서", shortName(title, 10)], "hwpx")).toBe("기획서_추석선물세트기획서안.hwpx");
  });
  it("금지 문자 제거, 빈 조각 생략", () => {
    expect(shortName('a/b:c*d?"e<f>g|h', 20)).toBe("abcdefgh");
    expect(fileName(["", null, "MV"], "mp4")).toBe("MV.mp4");
    expect(fileName([shortName("", 8), "음원"], "mp3")).toBe("음원.mp3");
  });
});
