import { AbsoluteFill, Composition } from "remotion";

// 기본 릴스 규격: 1080×1920, 30fps, 15초 (rules/reels.md)
export const MyComposition = () => {
  return (
    <Composition
      id="Reel"
      component={Reel}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};

export const Reel: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        justifyContent: "center",
        alignItems: "center",
        color: "#f4f4f5",
        fontSize: 96,
        fontWeight: 800,
        fontFamily: "sans-serif",
      }}
    >
      설치 확인
    </AbsoluteFill>
  );
};
