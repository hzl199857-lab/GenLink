import type { CSSProperties } from "react";

type RingStyle = CSSProperties &
  Record<"--ring-direction" | "--ring-index" | "--ring-count", string | number>;

const leftImages = [
  "https://framerusercontent.com/images/txRjEr7FUh5qwCt9kZAt1wZGU.png",
  "https://framerusercontent.com/images/abhUkc7NBajEKRsl5pkApVdkaZM.png",
  "https://framerusercontent.com/images/QVR8ljD45m43fV3ruIfzjyBORd8.png",
  "https://framerusercontent.com/images/gSnKzhZK2J9AQv1BMbdPkBbPGc.png",
  "https://framerusercontent.com/images/YbgilO5uI3wAP4uwpg8PEUxNjMU.png",
  "https://framerusercontent.com/images/B4uTLyJrkqjWjXV2c3DOp09wzDM.png",
  "https://framerusercontent.com/images/DJNrjI4dH4NlwMZ6gcXac147u4.png",
  "https://framerusercontent.com/images/LMFuixykHpQ6jpHdToPAPMGk6c.png",
  "https://framerusercontent.com/images/Jil3hfPMSuCDV4qf1xDcuedHZc.png",
  "https://framerusercontent.com/images/97uuAroqMWSBdcKKUZNlAMlqHkI.png",
  "https://framerusercontent.com/images/Ui2bBWyv9lCUfV3Q7qzMqyiabE.png",
  "https://framerusercontent.com/images/weWQUm4H72qngisDy0xrynpY.png",
];

const rightImages = [
  "https://framerusercontent.com/images/RETUcSpcwos6JmzKQPqIeVO0m2g.jpeg",
  "https://framerusercontent.com/images/GMA9qUbHz2vXVKBoxEEu7IjSU.jpeg",
  "https://framerusercontent.com/images/2u5U2LjCcNc17sa12cJuhm3VJ6w.jpeg",
  "https://framerusercontent.com/images/YWwz1mwDYS6l5E8WYZzSvJ6UPo.jpeg",
  "https://framerusercontent.com/images/CWKhN2weXACxkcClecvdKZoZNnc.jpeg",
  "https://framerusercontent.com/images/TZDp4UxmJxD44FBKLK7HBXchMA.jpeg",
  "https://framerusercontent.com/images/8LYyVNNeVrBdoDSeWnkv3U2NLE.jpeg",
  "https://framerusercontent.com/images/RsD8HdDCjHntwuTnNrt6tXTTha8.jpeg",
  "https://framerusercontent.com/images/iOMnPLnZwrjIKqIMxz45nUmJ88.jpeg",
  "https://framerusercontent.com/images/AZYksDRy98t1BHZ6iijSTserdc.jpeg",
  "https://framerusercontent.com/images/exyZDrAmIb3PDjjljQHbHUBqkEc.jpeg",
  "https://framerusercontent.com/images/9yekGR8xFgPx5CN9y5B2jEMn0xY.jpeg",
];

const features = [
  {
    title: "Lightning-Fast Image Generation",
    body: "Type what you imagine, hit enter, and watch AI bring it to life in moments.",
  },
  {
    title: "Multiple Styles & Customization",
    body: "Pick a style and fine-tune details like color, lighting, and mood.",
  },
  {
    title: "High-Resolution Downloads",
    body: "Export your creations in high-quality resolution for print, web, or social media.",
  },
];

function ImageRing({
  images,
  direction,
}: {
  images: string[];
  direction: "normal" | "reverse";
}) {
  return (
    <div
      className="image-ring"
      style={{ "--ring-direction": direction } as RingStyle}
    >
      {images.map((src, index) => (
        <div
          className="ring-card"
          key={src}
          style={{
            "--ring-index": index,
            "--ring-count": images.length,
          } as RingStyle}
        >
          <img src={src} alt="" />
        </div>
      ))}
    </div>
  );
}

function FramebloxLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 508 508" className="size-5">
      <rect x="34" y="34" width="440" height="440" rx="116" fill="#fff" />
      <path
        d="m226 66-123 71c-15 9-24 25-24 42v142c0 17 9 33 24 41l123 72c15 8 33 8 48 0l123-72c15-8 24-24 24-41V179c0-17-9-33-24-42L274 66c-15-8-33-8-48 0Z"
        fill="none"
        stroke="#1e2024"
        strokeWidth="30"
      />
      <path
        d="M234 267v82c0 4-4 6-7 4l-73-43a10 10 0 0 1-5-9v-82c0-3 4-5 7-3l73 42a10 10 0 0 1 5 9Z"
        fill="#1e2024"
      />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="day86-page">
      <a
        className="buy-badge"
        href="https://frameblox.com"
        target="_blank"
        rel="noreferrer"
      >
        <FramebloxLogo />
        <span>Buy Frameblox</span>
      </a>

      <section className="hero-shell" aria-label="AI image generator landing section">
        <div className="hero-copy">
          <h1>Create Stunning Images with Just a Prompt</h1>
          <p>
            Turn your ideas into high-quality visuals in seconds,
            <br />
            no design skills needed.
          </p>
          <a className="generate-button" href="#generate">
            <span>Generate image</span>
          </a>
        </div>

        <div className="visual-stage" aria-hidden="true">
          <div className="ticker ticker-left">
            <ImageRing images={leftImages} direction="normal" />
          </div>
          <div className="ticker ticker-right">
            <ImageRing images={rightImages} direction="reverse" />
          </div>
          <div className="center-orbit">
            <div className="orbital-grid" />
            <div className="core-glow core-glow-lg" />
            <div className="core-glow core-glow-md" />
            <div className="core-dot" />
          </div>
          <div className="outer-glow outer-glow-left" />
          <div className="outer-glow outer-glow-right" />
        </div>

        <div className="feature-row">
          {features.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <h2>{feature.title}</h2>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
