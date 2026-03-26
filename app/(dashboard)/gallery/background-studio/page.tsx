"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import "./background-studio.css";

// Character sets
const CHARSETS = {
  alphanumeric:
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  symbols: "@#$%^&*+-=|\\/<>?!~`'\";:,.[]{}()",
  "ascii-art": "#*+=-:;.,`'\"\\|/^v<>",
  blocks: "█▓▒░█▌▐├┤┬┴┼═║╔╗╚╝╠╣╦╩╬",
  dense: "@%#*+=-:. ",
};

// Format presets
const FORMAT_PRESETS = {
  custom: { label: "Custom", w: 1920, h: 1080 },
  "1080x1440": { label: "IG Profile", w: 1080, h: 1440 },
  "1080x1350": { label: "IG Feed", w: 1080, h: 1350 },
  "1080x1920": { label: "IG Story", w: 1080, h: 1920 },
  "1920x1080": { label: "Desktop HD", w: 1920, h: 1080 },
  "2560x1440": { label: "Desktop QHD", w: 2560, h: 1440 },
  "2560x1664": { label: "MacBook Air", w: 2560, h: 1664 },
  "3024x1964": { label: 'MacBook Pro 14"', w: 3024, h: 1964 },
};

// Seeded Random Number Generator (Mulberry32)
function createSeededRandom(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
  density: number;
  inverted: boolean;
  hasLandmark: boolean;
}

export default function BackgroundStudio() {
  // Canvas refs
  const fullResCanvasRef = useRef<HTMLCanvasElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // State
  const [canvasWidth, setCanvasWidth] = useState(1920);
  const [canvasHeight, setCanvasHeight] = useState(1080);
  const [seed, setSeed] = useState("background-studio");
  const [pattern, setPattern] = useState("zone-architecture");
  const [density, setDensity] = useState(0.6);
  const [sizeMin, setSizeMin] = useState(16);
  const [sizeMax, setSizeMax] = useState(48);
  const [jitter, setJitter] = useState(0.2);
  const [charset, setCharset] = useState("alphanumeric");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [fgColor, setFgColor] = useState("#000000");
  const [showOverlay, setShowOverlay] = useState("none");
  const [overlayText, setOverlayText] = useState("");
  const [overlayOpacity, setOverlayOpacity] = useState(1.0);
  const [ditherMode, setDitherMode] = useState("grayscale");
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(
    null,
  );
  const [activeFormat, setActiveFormat] = useState("custom");

  // Get random character from charset
  const getRandomChar = useCallback(
    (rng: () => number, charsetName: string): string => {
      const chars =
        CHARSETS[charsetName as keyof typeof CHARSETS] || CHARSETS.alphanumeric;
      const idx = Math.floor(rng() * chars.length);
      return chars[idx];
    },
    [],
  );

  // Generate zones using BSP
  const generateZones = useCallback(
    (rng: () => number, w: number, h: number): Zone[] => {
      const zones: Zone[] = [];

      function subdivide(
        x: number,
        y: number,
        w: number,
        h: number,
        depth: number,
      ) {
        if (depth > 5 || (w < 80 && h < 80)) {
          zones.push({
            x,
            y,
            w,
            h,
            density: rng() * 0.8 + 0.2,
            inverted: rng() < 0.12,
            hasLandmark: rng() < 0.08,
          });
          return;
        }

        const horizontal = rng() < 0.5;
        const splitRatio = rng() * 0.4 + 0.3;

        if (horizontal) {
          const splitY = y + Math.floor(h * splitRatio);
          subdivide(x, y, w, splitY - y, depth + 1);
          subdivide(x, splitY, w, h - (splitY - y), depth + 1);
        } else {
          const splitX = x + Math.floor(w * splitRatio);
          subdivide(x, y, splitX - x, h, depth + 1);
          subdivide(splitX, y, w - (splitX - x), h, depth + 1);
        }
      }

      subdivide(0, 0, w, h, 0);
      return zones;
    },
    [],
  );

  // Draw ASCII border
  const drawAsciiBorder = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      zone: Zone,
      rng: () => number,
      inverted: boolean,
    ) => {
      const borderChar = "+";
      const hlineChar = "-";
      const vlineChar = "|";
      const fontSize = 16;
      const charWidth = 9.6;
      const charHeight = 19.2;

      ctx.font = `${fontSize}px 'Courier New', monospace`;
      ctx.fillStyle = inverted ? bgColor : fgColor;

      const maxX = Math.min(Math.floor(zone.w / charWidth), 40);
      for (let i = 0; i < maxX; i++) {
        const x = zone.x + i * charWidth;
        if (i === 0 || i === maxX - 1) {
          ctx.fillText(borderChar, x, zone.y + charHeight);
          ctx.fillText(borderChar, x, zone.y + zone.h - 2);
        } else {
          ctx.fillText(hlineChar, x, zone.y + charHeight);
          ctx.fillText(hlineChar, x, zone.y + zone.h - 2);
        }
      }

      const maxY = Math.min(Math.floor(zone.h / charHeight), 30);
      for (let i = 1; i < maxY; i++) {
        const y = zone.y + i * charHeight;
        ctx.fillText(vlineChar, zone.x, y);
        ctx.fillText(vlineChar, zone.x + zone.w - charWidth, y);
      }
    },
    [bgColor, fgColor],
  );

  // Fill zone with characters
  const fillZoneWithChars = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      zone: Zone,
      rng: () => number,
      inverted: boolean,
      densityOverride?: number,
    ) => {
      const fontSize = Math.max(
        sizeMin,
        Math.floor(sizeMin + rng() * (sizeMax - sizeMin)),
      );
      const charWidth = fontSize * 0.6;
      const charHeight = fontSize * 1.2;
      const zoneDensity =
        (densityOverride !== undefined ? densityOverride : zone.density) *
        density;

      ctx.font = `${fontSize}px 'Courier New', monospace`;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = inverted ? bgColor : fgColor;

      const cols = Math.floor(zone.w / charWidth);
      const rows = Math.floor(zone.h / charHeight);

      for (let row = 1; row < rows - 1; row++) {
        for (let col = 1; col < cols - 1; col++) {
          if (rng() < zoneDensity) {
            const char = getRandomChar(rng, charset);
            const x = zone.x + col * charWidth;
            const y = zone.y + (row + 1) * charHeight;
            const offsetX = (rng() - 0.5) * jitter * charWidth;
            const offsetY = (rng() - 0.5) * jitter * charHeight;
            ctx.fillText(char, x + offsetX, y + offsetY);
          }
        }
      }
    },
    [
      sizeMin,
      sizeMax,
      density,
      jitter,
      charset,
      bgColor,
      fgColor,
      getRandomChar,
    ],
  );

  // Draw Zone Architecture pattern
  const drawZoneArchitecture = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      rng: () => number,
    ) => {
      const zones = generateZones(rng, w, h);

      for (const zone of zones) {
        if (zone.inverted) {
          ctx.fillStyle = fgColor;
          ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
        } else {
          ctx.fillStyle = bgColor;
          ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
        }

        drawAsciiBorder(ctx, zone, rng, zone.inverted);
        fillZoneWithChars(ctx, zone, rng, zone.inverted);
      }
    },
    [bgColor, fgColor, generateZones, drawAsciiBorder, fillZoneWithChars],
  );

  // Draw Terminal Data pattern
  const drawTerminalData = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      rng: () => number,
    ) => {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);

      const fontSize = 16;
      const charWidth = fontSize * 0.6;
      const charHeight = fontSize * 1.3;
      const cols = Math.floor(w / charWidth);
      const rows = Math.floor(h / charHeight);

      ctx.font = `${fontSize}px 'Courier New', monospace`;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = fgColor;

      for (let row = 0; row < rows; row++) {
        const y = row * charHeight + charHeight;
        let line = "";

        for (let col = 0; col < cols; col++) {
          if (rng() < density) {
            const char = getRandomChar(rng, charset);
            line += char;
          } else {
            line += " ";
          }
        }

        if (rng() < 0.1) {
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, y - charHeight + 2, w, charHeight);
          ctx.fillStyle = fgColor;
        }

        ctx.fillText(line, 0, y);
      }
    },
    [bgColor, fgColor, density, charset, getRandomChar],
  );

  // Draw Dense Blocks pattern
  const drawDenseBlocks = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      rng: () => number,
    ) => {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);

      const blockCount = Math.floor(6 + rng() * 8);

      for (let i = 0; i < blockCount; i++) {
        const blockW = Math.floor(w * (0.2 + rng() * 0.6));
        const blockH = Math.floor(h * (0.2 + rng() * 0.6));
        const blockX = Math.floor(rng() * (w - blockW));
        const blockY = Math.floor(rng() * (h - blockH));
        const isSolid = rng() < 0.4;
        const isInverted = rng() < 0.3;

        if (isSolid) {
          ctx.fillStyle = isInverted ? fgColor : bgColor;
          ctx.fillRect(blockX, blockY, blockW, blockH);
        } else {
          fillZoneWithChars(
            ctx,
            {
              x: blockX,
              y: blockY,
              w: blockW,
              h: blockH,
              density: 0.8,
              inverted: false,
              hasLandmark: false,
            },
            rng,
            isInverted,
            0.8,
          );
        }
      }
    },
    [bgColor, fgColor, fillZoneWithChars],
  );

  // Draw Scatter pattern
  const drawScatter = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      rng: () => number,
    ) => {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = fgColor;
      const count = Math.floor((w * h * density) / 100);

      for (let i = 0; i < count; i++) {
        const x = rng() * w;
        const y = rng() * h;
        const size = sizeMin + rng() * (sizeMax - sizeMin);
        ctx.font = `${size}px 'Courier New', monospace`;
        ctx.imageSmoothingEnabled = false;
        const char = getRandomChar(rng, charset);
        ctx.fillText(char, x, y);
      }
    },
    [bgColor, fgColor, density, sizeMin, sizeMax, charset, getRandomChar],
  );

  // Draw Grid pattern
  const drawGrid = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      rng: () => number,
    ) => {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);

      const spacing = 20 + rng() * 10;
      ctx.font = '16px "Courier New", monospace';
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = fgColor;

      for (let y = 0; y < h; y += spacing) {
        for (let x = 0; x < w; x += spacing) {
          if (rng() < density) {
            const char = getRandomChar(rng, charset);
            ctx.fillText(char, x, y);
          }
        }
      }
    },
    [bgColor, fgColor, density, getRandomChar],
  );

  // Image processing functions
  const convertToAsciiArt = useCallback(
    (ctx: CanvasRenderingContext2D, imageData: ImageData) => {
      const asciiChars = "@%#*+=-:. ";
      const data = imageData.data;
      const w = imageData.width;
      const h = imageData.height;
      const fontSize = 16;
      const charWidth = fontSize * 0.6;

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${fontSize}px 'Courier New', monospace`;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = fgColor;

      for (let y = 0; y < h; y += fontSize) {
        for (let x = 0; x < w; x += charWidth) {
          const idx = (Math.floor(y) * w + Math.floor(x)) * 4;
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          const charIdx = Math.floor(
            (brightness / 255) * (asciiChars.length - 1),
          );
          const char = asciiChars[charIdx];
          ctx.fillText(char, x, y);
        }
      }
    },
    [bgColor, fgColor],
  );

  const convertToHalftone = useCallback(
    (ctx: CanvasRenderingContext2D, imageData: ImageData) => {
      const data = imageData.data;
      const w = imageData.width;
      const h = imageData.height;
      const dotSize = 6;
      const spacing = 8;

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = fgColor;

      for (let y = 0; y < h; y += spacing) {
        for (let x = 0; x < w; x += spacing) {
          const idx = (y * w + x) * 4;
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          const radius = (brightness / 255) * (dotSize / 2);
          if (radius > 0.5) {
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    },
    [bgColor, fgColor],
  );

  const ditherFloydSteinberg = useCallback((imageData: ImageData) => {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const old = data[idx];
        const newVal = old > 128 ? 255 : 0;
        const error = old - newVal;

        data[idx] = data[idx + 1] = data[idx + 2] = newVal;

        if (x + 1 < w) {
          const i = idx + 4;
          data[i] = Math.min(255, data[i] + (error * 7) / 16);
        }
        if (y + 1 < h) {
          if (x > 0) {
            const i = ((y + 1) * w + x - 1) * 4;
            data[i] = Math.min(255, data[i] + (error * 3) / 16);
          }
          const i = ((y + 1) * w + x) * 4;
          data[i] = Math.min(255, data[i] + (error * 5) / 16);
          if (x + 1 < w) {
            const i2 = ((y + 1) * w + x + 1) * 4;
            data[i2] = Math.min(255, data[i2] + (error * 1) / 16);
          }
        }
      }
    }
  }, []);

  const processImage = useCallback(
    (img: HTMLImageElement) => {
      if (!fullResCanvasRef.current) return;

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvasWidth;
      tempCanvas.height = canvasHeight;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;

      const scale = Math.min(
        canvasWidth / img.width,
        canvasHeight / img.height,
      );
      const scaledW = img.width * scale;
      const scaledH = img.height * scale;
      const x = (canvasWidth - scaledW) / 2;
      const y = (canvasHeight - scaledH) / 2;

      tempCtx.drawImage(img, x, y, scaledW, scaledH);

      const imageData = tempCtx.getImageData(
        0,
        0,
        tempCanvas.width,
        tempCanvas.height,
      );
      const ctx = fullResCanvasRef.current.getContext("2d");
      if (!ctx) return;

      if (ditherMode === "floyd-steinberg") {
        ditherFloydSteinberg(imageData);
        ctx.putImageData(imageData, 0, 0);
      } else if (ditherMode === "ascii-art") {
        convertToAsciiArt(ctx, imageData);
      } else if (ditherMode === "halftone") {
        convertToHalftone(ctx, imageData);
      } else {
        // Grayscale
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
          data[i] = data[i + 1] = data[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);
      }
    },
    [
      canvasWidth,
      canvasHeight,
      ditherMode,
      ditherFloydSteinberg,
      convertToAsciiArt,
      convertToHalftone,
    ],
  );

  // Main render function
  const render = useCallback(() => {
    if (
      !fullResCanvasRef.current ||
      !displayCanvasRef.current ||
      !canvasContainerRef.current
    )
      return;

    const fullResCanvas = fullResCanvasRef.current;
    const displayCanvas = displayCanvasRef.current;
    const ctx = fullResCanvas.getContext("2d");
    const displayCtx = displayCanvas.getContext("2d");

    if (!ctx || !displayCtx) return;

    fullResCanvas.width = canvasWidth;
    fullResCanvas.height = canvasHeight;

    const seedHash = seed.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);
    const rng = createSeededRandom(seedHash || 12345);

    switch (pattern) {
      case "zone-architecture":
        drawZoneArchitecture(ctx, canvasWidth, canvasHeight, rng);
        break;
      case "terminal-data":
        drawTerminalData(ctx, canvasWidth, canvasHeight, rng);
        break;
      case "dense-blocks":
        drawDenseBlocks(ctx, canvasWidth, canvasHeight, rng);
        break;
      case "scatter":
        drawScatter(ctx, canvasWidth, canvasHeight, rng);
        break;
      case "grid":
        drawGrid(ctx, canvasWidth, canvasHeight, rng);
        break;
    }

    if (showOverlay === "image" && uploadedImage) {
      processImage(uploadedImage);
    }

    const maxWidth = canvasContainerRef.current.clientWidth - 10;
    const maxHeight = canvasContainerRef.current.clientHeight - 10;
    const scale = Math.min(maxWidth / canvasWidth, maxHeight / canvasHeight);

    displayCanvas.width = canvasWidth * scale;
    displayCanvas.height = canvasHeight * scale;

    displayCtx.scale(scale, scale);
    displayCtx.drawImage(fullResCanvas, 0, 0);
  }, [
    canvasWidth,
    canvasHeight,
    seed,
    pattern,
    density,
    sizeMin,
    sizeMax,
    jitter,
    charset,
    bgColor,
    fgColor,
    showOverlay,
    uploadedImage,
    ditherMode,
    drawZoneArchitecture,
    drawTerminalData,
    drawDenseBlocks,
    drawScatter,
    drawGrid,
    processImage,
  ]);

  // Debounced render
  useEffect(() => {
    const timer = setTimeout(render, 300);
    return () => clearTimeout(timer);
  }, [render]);

  // Handlers
  const handleFormatChange = (formatKey: string) => {
    setActiveFormat(formatKey);
    if (formatKey !== "custom") {
      const preset = FORMAT_PRESETS[formatKey as keyof typeof FORMAT_PRESETS];
      setCanvasWidth(preset.w);
      setCanvasHeight(preset.h);
    }
  };

  const handleRandomSeed = () => {
    setSeed(Math.random().toString(36).substr(2, 9));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setUploadedImage(img);
        setShowOverlay("image");
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleExport = (format: "png" | "webp") => {
    if (!fullResCanvasRef.current) return;
    const link = document.createElement("a");
    const mimeType = format === "png" ? "image/png" : "image/webp";
    const ext = format;
    link.href = fullResCanvasRef.current.toDataURL(mimeType);
    link.download = `background-${seed}.${ext}`;
    link.click();
  };

  return (
    <div className="background-studio">
      {/* Header */}
      <div className="studio-header">
        <h1>Background Studio</h1>
        <div className="format-buttons">
          {Object.entries(FORMAT_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              className={`format-btn ${activeFormat === key ? "format-btn--active" : ""}`}
              onClick={() => handleFormatChange(key)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Layout */}
      <div className="studio-layout">
        {/* Canvas Area */}
        <div className="studio-canvas" ref={canvasContainerRef}>
          <canvas ref={displayCanvasRef} className="display-canvas" />
        </div>

        {/* Controls Sidebar */}
        <div className="studio-sidebar">
          {/* Pattern Section */}
          <section className="control-section">
            <h2 className="section-title">Pattern</h2>
            <div className="control-group">
              <label className="control-label">Type</label>
              <select
                className="control-select"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
              >
                <option value="zone-architecture">Zone Architecture</option>
                <option value="terminal-data">Terminal Data</option>
                <option value="dense-blocks">Dense Blocks</option>
                <option value="scatter">Scatter</option>
                <option value="grid">Grid</option>
              </select>
            </div>

            <div className="control-group">
              <label className="control-label">
                Density{" "}
                <span className="control-value">{density.toFixed(2)}</span>
              </label>
              <input
                type="range"
                className="control-slider"
                min="0"
                max="1"
                step="0.01"
                value={density}
                onChange={(e) => setDensity(parseFloat(e.target.value))}
              />
            </div>

            <div className="control-group">
              <label className="control-label">Min Size (px)</label>
              <input
                type="number"
                className="control-input-number"
                min="8"
                max="40"
                value={sizeMin}
                onChange={(e) => setSizeMin(parseInt(e.target.value))}
              />
            </div>

            <div className="control-group">
              <label className="control-label">Max Size (px)</label>
              <input
                type="number"
                className="control-input-number"
                min="16"
                max="96"
                value={sizeMax}
                onChange={(e) => setSizeMax(parseInt(e.target.value))}
              />
            </div>

            <div className="control-group">
              <label className="control-label">
                Jitter{" "}
                <span className="control-value">{jitter.toFixed(2)}</span>
              </label>
              <input
                type="range"
                className="control-slider"
                min="0"
                max="1"
                step="0.01"
                value={jitter}
                onChange={(e) => setJitter(parseFloat(e.target.value))}
              />
            </div>
          </section>

          {/* Characters Section */}
          <section className="control-section">
            <h2 className="section-title">Characters</h2>
            <div className="control-group">
              <label className="control-label">Charset</label>
              <select
                className="control-select"
                value={charset}
                onChange={(e) => setCharset(e.target.value)}
              >
                <option value="alphanumeric">Alphanumeric</option>
                <option value="symbols">Symbols & ASCII</option>
                <option value="ascii-art">ASCII Art</option>
                <option value="blocks">Blocks & Lines</option>
                <option value="dense">Dense</option>
              </select>
            </div>
          </section>

          {/* Colors Section */}
          <section className="control-section">
            <h2 className="section-title">Colors</h2>
            <div className="control-group">
              <label className="control-label">Background</label>
              <input
                type="color"
                className="control-color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
              />
            </div>

            <div className="control-group">
              <label className="control-label">Foreground</label>
              <input
                type="color"
                className="control-color"
                value={fgColor}
                onChange={(e) => setFgColor(e.target.value)}
              />
            </div>
          </section>

          {/* Image Section */}
          <section className="control-section">
            <h2 className="section-title">Image</h2>
            <div className="control-group">
              <label className="control-label">Upload</label>
              <input
                type="file"
                id="imageInput"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: "none" }}
              />
              <button
                className="control-button"
                onClick={() => document.getElementById("imageInput")?.click()}
              >
                Upload Image
              </button>
            </div>

            {uploadedImage && (
              <div className="control-group">
                <button
                  className="control-button"
                  onClick={() => {
                    setUploadedImage(null);
                    setShowOverlay("none");
                  }}
                >
                  Clear Image
                </button>
              </div>
            )}

            <div className="control-group">
              <label className="control-label">Dither Mode</label>
              <select
                className="control-select"
                value={ditherMode}
                onChange={(e) => setDitherMode(e.target.value)}
              >
                <option value="grayscale">Grayscale</option>
                <option value="ascii-art">ASCII Art</option>
                <option value="halftone">Halftone Dots</option>
                <option value="floyd-steinberg">Floyd - Steinberg</option>
              </select>
            </div>

            <div className="control-group">
              <label className="control-label">Show Overlay</label>
              <select
                className="control-select"
                value={showOverlay}
                onChange={(e) => setShowOverlay(e.target.value)}
              >
                <option value="none">None</option>
                <option value="text">Custom Text</option>
                <option value="image">Image</option>
              </select>
            </div>

            {showOverlay === "text" && (
              <div className="control-group">
                <label className="control-label">
                  Text Opacity{" "}
                  <span className="control-value">
                    {overlayOpacity.toFixed(2)}
                  </span>
                </label>
                <input
                  type="range"
                  className="control-slider"
                  min="0"
                  max="1"
                  step="0.05"
                  value={overlayOpacity}
                  onChange={(e) =>
                    setOverlayOpacity(parseFloat(e.target.value))
                  }
                />
              </div>
            )}

            {showOverlay === "text" && (
              <div className="control-group">
                <textarea
                  className="control-textarea"
                  placeholder="Enter text to overlay..."
                  value={overlayText}
                  onChange={(e) => setOverlayText(e.target.value)}
                />
              </div>
            )}
          </section>

          {/* Seed Section */}
          <section className="control-section">
            <h2 className="section-title">Seed</h2>
            <div className="control-group">
              <label className="control-label">Seed Value</label>
              <input
                type="text"
                className="control-input-text"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="background-studio"
              />
            </div>

            <button className="control-button" onClick={handleRandomSeed}>
              Random Seed
            </button>
          </section>

          {/* Export Section */}
          <section className="control-section">
            <h2 className="section-title">Export</h2>
            <div className="export-buttons">
              <button
                className="control-button control-button--export"
                onClick={() => handleExport("png")}
              >
                PNG
              </button>
              <button
                className="control-button control-button--export"
                onClick={() => handleExport("webp")}
              >
                WebP
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Hidden full-res canvas for rendering */}
      <canvas ref={fullResCanvasRef} style={{ display: "none" }} />
    </div>
  );
}
