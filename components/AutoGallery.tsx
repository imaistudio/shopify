'use client';
import { useState } from "react";
import { Box } from "@shopify/polaris";

const MEDIA: string[] = [
  "https://assets.imai.studio/global/video/0bb62b1c-47c0-4dde-a285-4e6d849d5d61.mp4",
  "https://www.imai.studio/_next/image?url=https%3A%2F%2Fassets.imai.studio%2Fglobal%2Fimage%2Fa6cb8f51-3aaf-456b-8a7d-010b78374b45.jpg&w=640&q=75",
  "https://www.imai.studio/_next/image?url=https%3A%2F%2Fassets.imai.studio%2Fglobal%2Fimage%2F9677b934-5960-49f2-ae38-290bd4cf66f7.jpg&w=640&q=75",
  "https://www.imai.studio/_next/image?url=https%3A%2F%2Fassets.imai.studio%2Fglobal%2Fimage%2F598ba541-b03f-44cd-8d39-028613693b13.png&w=640&q=75",
  "https://www.imai.studio/_next/image?url=https%3A%2F%2Fassets.imai.studio%2Fglobal%2Fimage%2F0821a66f-a1f5-4d37-a7bb-dfaf84ac8293.jpg&w=640&q=75",
];

function isVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
}

function MediaItem({ url }: { url: string }) {
  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  };

  if (isVideo(url)) {
    return <video src={url} autoPlay muted loop playsInline style={style} />;
  }

  return <img src={url} alt="" style={style} />;
}

export function AutoGallery() {
  const [activeIndex, setActiveIndex] = useState(0);

  const hero = MEDIA[activeIndex];

  return (
    <Box>
      <style>{`
        .ag-root {
          display: flex;
          gap: 10px;
          width: 100%;
          height: 540px;
        }

        .ag-hero {
          flex: 1;
          border-radius: 24px;
          overflow: hidden;
          background: #ebebeb;
        }

        .ag-sidebar {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 140px;
        }

        .ag-thumb {
          flex: 1;
          border-radius: 18px;
          overflow: hidden;
          cursor: pointer;
          border: 2px solid transparent;
          transition: transform 0.2s ease, border 0.2s ease;
        }

        .ag-thumb:hover {
          transform: scale(1.03);
        }
      `}</style>

      <div className="ag-root">
        {/* HERO */}
        <div className="ag-hero">
          <MediaItem url={hero} />
        </div>

        {/* THUMBNAILS (exclude hero) */}
        <div className="ag-sidebar">
          {MEDIA.map((url, index) => {
            if (index === activeIndex) return null;

            return (
              <div
                key={index}
                className="ag-thumb"
                onClick={() => setActiveIndex(index)}
              >
                <MediaItem url={url} />
              </div>
            );
          })}
        </div>
      </div>
    </Box>
  );
}