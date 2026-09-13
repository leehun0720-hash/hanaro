import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  assembleKlingPrompt,
  clampDialogue,
  defaultCues,
  DIALOGUE_MAX,
  NEGATIVE_REQUIRED,
  normalizeCues,
  normalizeVideoPrompt,
  PRACTICE_SYSTEM_PROMPT,
  practiceInputSchema,
  practicePhotoPrompt,
  practiceUserMessage,
  sceneInputSchema,
} from "@/lib/prompts/practice";
import { backoffMs, isRetryable, ProviderHttpError, withRetry } from "@/lib/providers/retry";
import { estimateWaitSeconds, hasCapacity } from "@/lib/concurrency";
import { isContentRejection, klingCostUsd, koReasonFor, verifyFalSignature } from "@/lib/providers/fal";
import { buildAss, downloadFileName } from "@/lib/video/wasm-subtitles";
import { assColor, normalizeStyle } from "@/lib/video/subtitle-style";
import { subtitleFilter } from "@/lib/video/subtitles";
import { costFor, DEFAULT_COSTS } from "@/lib/credits";

describe("practice input (SPEC ①②③)", () => {
  it("기본값과 범위", () => {
    const p = practiceInputSchema.parse({ photoPath: "u1/practice/a.jpg" });
    expect(p.preset).toBe("photo");
    expect(p.ratio).toBe("16:9");
    expect(p.allowText).toBe(false);
    expect(() => practiceInputSchema.parse({})).toThrow();
    expect(() => practiceInputSchema.parse({ photoPath: "a", preset: "anime" })).toThrow();
  });
  it("장면 입력: 길이는 5 또는 10", () => {
    expect(sceneInputSchema.parse({ sceneKo: "웃는다", duration: "10" }).duration).toBe(10);
    expect(() => sceneInputSchema.parse({ sceneKo: "웃는다", duration: 7 })).toThrow();
    expect(() => sceneInputSchema.parse({ sceneKo: "" })).toThrow();
  });
  it("§7 사용자 메시지 형식", () => {
    const m = practiceUserMessage({ sceneKo: "과수원에서 웃는다", dialogueKo: "달아요!", duration: 5 }, "poster");
    expect(m).toBe("[장면 설명] 과수원에서 웃는다\n[대사] 달아요!\n[길이] 5초\n[스타일] 영화 포스터");
    expect(practiceUserMessage({ sceneKo: "x y", duration: 10 }, "photo")).toContain("[대사] 없음");
  });
  it("§7 시스템 프롬프트에 핵심 규칙이 있다", () => {
    expect(PRACTICE_SYSTEM_PROMPT).toContain("the person in the image");
    expect(PRACTICE_SYSTEM_PROMPT).toContain("blank signage, no text anywhere");
    expect(PRACTICE_SYSTEM_PROMPT).toContain('"error"');
  });
  it("이미지 프롬프트: 글자 금지(D10)", () => {
    const p = practicePhotoPrompt("character3d", "배를 들고", "9:16");
    expect(p).toContain("3D");
    expect(p).toContain("세로(9:16)");
    expect(p).toContain("no text anywhere");
    expect(practicePhotoPrompt("photo", undefined, "16:9", true)).toContain("정확한 철자");
  });
});

describe("대사·프롬프트 조립", () => {
  it("대사 길이 제한: 5초 20자 · 10초 40자", () => {
    expect(DIALOGUE_MAX[5]).toBe(20);
    expect(clampDialogue("올해 배, 진짜 달아요!", 5)).toBe("올해 배, 진짜 달아요!");
    const long = "가".repeat(30);
    expect([...clampDialogue(long, 5)!].length).toBeLessThanOrEqual(20);
    expect(clampDialogue("   ", 5)).toBeNull();
    expect(clampDialogue("첫 문장입니다. 두 번째 문장이 아주 길어서 잘려야 합니다.", 5)).toBe("첫 문장입니다.");
  });
  it("Kling 프롬프트: 대사 문장·글자 금지·negative 포함, 중복 제거", () => {
    const p = assembleKlingPrompt({ prompt_en: "The person in the image smiles. Blank signage, no text anywhere.", dialogue_ko: "달아요!", negative: "watermark, logo, blur" });
    expect(p).toContain('The person speaks in Korean: "달아요!"');
    expect(p).toContain(NEGATIVE_REQUIRED.split(",")[0]);
    expect(p).toContain("blur");
    expect(p.match(/no text anywhere/g)?.length).toBe(1);
    expect(p.match(/watermark/g)?.length).toBe(1);
    const noDlg = assembleKlingPrompt({ prompt_en: 'Smiles. The person speaks in Korean: "x". Natural lip sync, clear Korean pronunciation.', dialogue_ko: null, negative: null });
    expect(noDlg).not.toContain("speaks in Korean");
    expect(noDlg).toContain("no text anywhere");
  });
  it("사용자 프롬프트 검증", () => {
    expect("error" in normalizeVideoPrompt("short")).toBe(true);
    expect(normalizeVideoPrompt("  slow  dolly in, a farmer smiling  ")).toEqual({ prompt: "slow dolly in, a farmer smiling" });
  });
});

describe("자막 (SPEC ⑤)", () => {
  it("기본 자막은 대사 전체 구간", () => {
    expect(defaultCues("달아요!", 5)).toEqual([{ start: 0, end: 5, text: "달아요!" }]);
    expect(defaultCues(null, 5)).toEqual([]);
  });
  it("사용자 편집: 범위 자르기·겹침 정리·정렬", () => {
    const r = normalizeCues([{ start: 6, end: 20, text: "둘" }, { start: 0, end: 8, text: "하나" }, { start: 2, end: 1, text: "무효" }], 10);
    expect("cues" in r).toBe(true);
    if ("cues" in r) {
      expect(r.cues.map((c) => c.text)).toEqual(["하나", "둘"]);
      expect(r.cues[1].start).toBe(8);
      expect(r.cues[1].end).toBe(10);
    }
    expect("error" in normalizeCues("x", 10)).toBe(true);
  });
  it("ASS 문서: 폰트명·PlayRes·이벤트·이스케이프", () => {
    const ass = buildAss([{ start: 0, end: 2.5, text: "올해 배 {진짜} 달아요" }, { start: 2.5, end: 5, text: "" }], { position: "top", fontSize: 64, fontId: "noto", themeId: "box-black" }, { w: 1920, h: 1080 });
    expect(ass).toContain("PlayResX: 1920");
    expect(ass).toContain("Style: Default,Noto Sans KR,64,&H00FFFFFF,");
    expect(ass).toContain(",8,60,60,"); // 상단 정렬
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:02.50,Default,,0,0,0,,올해 배 (진짜) 달아요");
    expect(ass.match(/Dialogue:/g)?.length).toBe(1);
    // 시작=끝 자막은 제외
    expect(buildAss([{ start: 5, end: 5, text: "x" }]).match(/Dialogue:/g)).toBeNull();
  });
  it("폰트·테마: family 이름과 색이 ASS/drawtext에 반영된다", () => {
    const ass = buildAss([{ start: 0, end: 5, text: "가" }], { position: "bottom", fontSize: 80, fontId: "blackhan", themeId: "outline-yellow" });
    expect(ass).toContain("Style: Default,Black Han Sans,80,&H0000E6FF,"); // #FFE600 → BGR 00E6FF
    expect(ass).toMatch(/,0,0,0,0,100,100,0,0,1,\d+,2,2,60,60,/); // Bold 0 · BorderStyle 1(외곽선) · Shadow 2 · 하단
    expect(assColor("#0B6B3A", 0.85)).toBe("&H263A6B0B");
    expect(normalizeStyle({ fontId: "zzz", themeId: "nope", fontSize: 9999, position: "top" })).toEqual({ fontId: "noto", themeId: "box-black", fontSize: 140, position: "top" });
    const f = subtitleFilter([{ start: 0, end: 5, text: "가" }], 1080, { style: { position: "top", fontSize: 64, fontId: "jua", themeId: "box-green" } });
    expect(f).toContain("Jua-Regular.ttf");
    expect(f).toContain("boxcolor=0x0B6B3A@0.85");
    expect(f).toContain("fontsize=64");
    expect(f).toContain(":y=86:");
  });
  it("파일명 규칙 {닉네임}_{yyyyMMdd_HHmm}.mp4", () => {
    expect(downloadFileName("홍길동/팀", new Date(2026, 8, 11, 9, 5))).toBe("홍길동_팀_20260911_0905.mp4");
  });
});

describe("retry", () => {
  it("429·5xx는 재시도, 400은 즉시 실패", async () => {
    let n = 0;
    const v = await withRetry(async () => { n++; if (n < 3) throw new ProviderHttpError(429, "rate"); return "ok"; }, { tries: 4, sleep: async () => {} });
    expect(v).toBe("ok");
    expect(n).toBe(3);
    let m = 0;
    await expect(withRetry(async () => { m++; throw new ProviderHttpError(400, "bad"); }, { tries: 4, sleep: async () => {} })).rejects.toThrow("bad");
    expect(m).toBe(1);
  });
  it("백오프는 지수 증가하고 상한이 있다", () => {
    expect(backoffMs(0, 1000, 20000, 0.5)).toBe(1000);
    expect(backoffMs(1, 1000, 20000, 0.5)).toBe(2000);
    expect(backoffMs(10, 1000, 20000, 0.5)).toBe(20000);
    expect(isRetryable(new Error("Too Many Requests"))).toBe(true);
    expect(isRetryable(new Error("invalid api key"))).toBe(false);
  });
});

describe("동시성·큐 (SPEC §8)", () => {
  it("전체 상한과 예상 대기", () => {
    expect(hasCapacity(2, 1, 3)).toBe(true);
    expect(hasCapacity(3, 1, 3)).toBe(false);
    expect(estimateWaitSeconds(0, 120, 3)).toBe(40);
    expect(estimateWaitSeconds(5, 120, 3)).toBe(240);
    expect(estimateWaitSeconds(5, 120, 20)).toBe(36);
  });
});

describe("fal.ai (SPEC ④·§13)", () => {
  it("비용: turbo standard $0.112/초, pro $0.14/초", () => {
    expect(klingCostUsd("fal-ai/kling-video/v3/turbo/standard/image-to-video", 5)).toBe(0.56);
    expect(klingCostUsd("fal-ai/kling-video/v3/turbo/pro/image-to-video", 10)).toBe(1.4);
  });
  it("필터 거부 판별과 한국어 사유", () => {
    expect(isContentRejection(new ProviderHttpError(422, "Input image contains a public figure / celebrity"))).toBe(true);
    expect(isContentRejection(new ProviderHttpError(503, "service unavailable"))).toBe(false);
    expect(isContentRejection(new ProviderHttpError(429, "rate limit"))).toBe(false);
    expect(koReasonFor(new Error("celebrity detected"))).toContain("유명인");
    expect(koReasonFor(new Error("No face detected in image"))).toContain("얼굴");
    expect(koReasonFor(new Error("nsfw content"))).toContain("안전 정책");
  });
  it("웹훅 ED25519 서명 검증", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const raw = (publicKey.export({ format: "der", type: "spki" }) as Buffer).subarray(-32);
    const body = Buffer.from(JSON.stringify({ request_id: "r1", status: "OK", payload: { video: { url: "https://x/y.mp4" } } }));
    const ts = String(Math.floor(Date.now() / 1000));
    const msg = Buffer.from(`r1\nu1\n${ts}\n${crypto.createHash("sha256").update(body).digest("hex")}`);
    const sig = crypto.sign(null, msg, privateKey).toString("hex");
    expect(verifyFalSignature({ requestId: "r1", userId: "u1", timestamp: ts, signature: sig }, body, [raw]).ok).toBe(true);
    expect(verifyFalSignature({ requestId: "r2", userId: "u1", timestamp: ts, signature: sig }, body, [raw]).ok).toBe(false);
    expect(verifyFalSignature({ requestId: "r1", userId: "u1", timestamp: String(Number(ts) - 1000), signature: sig }, body, [raw]).ok).toBe(false);
    expect(verifyFalSignature({ requestId: "r1", userId: "u1", timestamp: ts, signature: null }, body, [raw]).ok).toBe(false);
  });
  it("실습 ro 단가", () => {
    expect(costFor("practice", DEFAULT_COSTS)).toBe(40);
  });
});
