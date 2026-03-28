import { useState } from "react";
import { Box } from "@shopify/polaris";

const MEDIA: string[] = [
  "/autogallery/1.mp4",
  "/autogallery/2.webp",
  "/autogallery/5.webp",
  "/autogallery/4.webp",
  "/autogallery/3.webp",
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
    return (
      <video
        src={url}
        autoPlay
        muted
        loop
        playsInline
        style={style}
      />
    );
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
          overflow-y: auto;
        }

        .ag-thumb {
          width: 140px;
          height: 140px;
          border-radius: 18px;
          overflow: hidden;
          cursor: pointer;
          border: 2px solid transparent;
          transition: transform 0.2s ease, border 0.2s ease;
          flex-shrink: 0;
        }

        .ag-thumb:hover {
          transform: scale(1.03);
        }
      `}</style>

      <div className="ag-root">
        {/* HERO */}
        <div className="ag-hero">
          <MediaItem key={hero} url={hero} />
        </div>

        {/* THUMBNAILS (exclude hero) */}
        <div className="ag-sidebar">
          {MEDIA.map((url, index) => {
            if (index === activeIndex) return null;

            return (
              <button
                type="button"
                key={index}
                className="ag-thumb"
                onClick={() => setActiveIndex(index)}
                style={{ padding: 0, background: "transparent" }}
              >
                <MediaItem url={url} />
              </button>
            );
          })}
        </div>
      </div>
    </Box>
  );
}
