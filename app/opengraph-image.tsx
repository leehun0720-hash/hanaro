import { ImageResponse } from "next/og";
import fs from "node:fs/promises";
import path from "node:path";
import { SITE_NAME } from "@/lib/site";
import { getBranding } from "@/lib/branding";

export const alt = `${SITE_NAME} — 소재 하나로, 산출물 다섯`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

/** 링크 공유 카드 (카톡·페이스북·X). 한글은 번들 폰트(Noto Sans KR Bold)로 그린다 */
export default async function OpenGraphImage() {
  const b = await getBranding();
  const font = await fs.readFile(path.join(process.cwd(), "assets", "fonts", "NotoSansKR-Bold.otf"));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #084d2a 0%, #0b6b3a 60%, #146d3f 100%)", color: "white", fontFamily: "Noto Sans KR" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, letterSpacing: 6, color: "#f2c94c" }}>농축협 디지털 프로젝트과정 · 공식 제작 도구</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", fontSize: 96, lineHeight: 1.1 }}>소재 하나로,</div>
          <div style={{ display: "flex", fontSize: 96, lineHeight: 1.1 }}>
            산출물&nbsp;<span style={{ color: "#f2c94c" }}>다섯.</span>
          </div>
          <div style={{ display: "flex", marginTop: 24, fontSize: 32, color: "rgba(255,255,255,0.82)" }}>기획서 · 뉴스레터 · 카드뉴스 · 30초 홍보영상 · 1분 뮤직비디오</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30 }}>
          <div style={{ display: "flex", fontWeight: 700 }}>{b.name}{b.byline ? <span style={{ marginLeft: 12, fontSize: 22, color: "rgba(255,255,255,0.7)" }}>{b.byline}</span> : null}</div>
          <div style={{ display: "flex", color: "rgba(255,255,255,0.7)" }}>Claude · GPT Image · Kling · ElevenLabs</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Noto Sans KR", data: font, weight: 700, style: "normal" }] },
  );
}
