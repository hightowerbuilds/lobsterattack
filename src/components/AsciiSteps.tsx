import { useEffect, useRef } from "react";

/** Steps to cycle through in the slideshow. */
const STEPS = [
  { number: "1", title: "Arrive", desc: "Read the board without signing in." },
  { number: "2", title: "Sign In", desc: "Enter an email and use the magic link." },
  { number: "3", title: "Post", desc: "Add notes, edit, delete, and comment." },
];

const CONFIG = {
  sourceFont: "bold 72px monospace",
  descFont: "bold 28px monospace",
  cellFont: "10px monospace",
  cellSize: 8,
  charColor: "#00ffc8",
  charColorDim: "#007a60",
  bgColor: "#0a0a1a",
  /** Frames each step is displayed. */
  stepDuration: 240,
  /** Frames for the transition between steps. */
  transitionFrames: 50,
  /** Bubble settings. */
  bubbleCount: 35,
  bubbleColor: "rgba(0, 255, 200, 0.12)",
  bubbleOutline: "rgba(0, 255, 200, 0.25)",
};

type AsciiCell = {
  col: number;
  row: number;
  tx: number;
  ty: number;
};

type Bubble = {
  x: number;
  y: number;
  radius: number;
  speed: number;
  wobbleOffset: number;
  wobbleSpeed: number;
  opacity: number;
};

/**
 * Render text onto an offscreen canvas and sample which cells are filled.
 * Returns cell positions (no animation state — just the grid).
 */
function sampleText(
  text: string,
  font: string,
  canvasWidth: number,
  canvasHeight: number,
  cellSize: number,
  offsetY: number
): AsciiCell[] {
  const offscreen = document.createElement("canvas");
  offscreen.width = canvasWidth;
  offscreen.height = canvasHeight;
  const ctx = offscreen.getContext("2d")!;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "#fff";
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Auto-scale if text is wider than canvas.
  const measured = ctx.measureText(text);
  const maxWidth = canvasWidth * 0.85;
  if (measured.width > maxWidth) {
    const sizeMatch = font.match(/(\d+)px/);
    if (sizeMatch) {
      const origSize = parseInt(sizeMatch[1]);
      const newSize = Math.floor(origSize * (maxWidth / measured.width));
      ctx.font = font.replace(/\d+px/, `${newSize}px`);
    }
  }

  ctx.fillText(text, canvasWidth / 2, offsetY);

  const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  const pixels = imageData.data;
  const cols = Math.floor(canvasWidth / cellSize);
  const rows = Math.floor(canvasHeight / cellSize);
  const cells: AsciiCell[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = Math.floor(col * cellSize + cellSize / 2);
      const sy = Math.floor(row * cellSize + cellSize / 2);
      const idx = (sy * canvasWidth + sx) * 4;
      if (pixels[idx] > 30) {
        cells.push({
          col,
          row,
          tx: col * cellSize + cellSize / 2,
          ty: row * cellSize + cellSize / 2,
        });
      }
    }
  }

  return cells;
}

function createBubbles(width: number, height: number): Bubble[] {
  const bubbles: Bubble[] = [];
  for (let i = 0; i < CONFIG.bubbleCount; i++) {
    bubbles.push({
      x: Math.random() * width,
      y: height + Math.random() * height, // start below viewport
      radius: 3 + Math.random() * 12,
      speed: 0.3 + Math.random() * 0.8,
      wobbleOffset: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.01 + Math.random() * 0.02,
      opacity: 0.15 + Math.random() * 0.35,
    });
  }
  return bubbles;
}

export default function AsciiSteps() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const ctx = canvas.getContext("2d")!;

    const resizeCanvas = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
      return { width: rect.width, height: rect.height };
    };

    const start = () => {
      if (cancelled) return;

      let { width, height } = resizeCanvas();

      // Pre-build ASCII grids for each step (title + description).
      const stepGrids = STEPS.map((step) => {
        const titleText = `${step.number}. ${step.title}`;
        const titleCells = sampleText(
          titleText,
          CONFIG.sourceFont,
          width,
          height,
          CONFIG.cellSize,
          height * 0.38
        );
        const descCells = sampleText(
          step.desc,
          CONFIG.descFont,
          width,
          height,
          CONFIG.cellSize,
          height * 0.68
        );
        return { titleCells, descCells };
      });

      let bubbles = createBubbles(width, height);
      let frame = 0;

      const totalStepFrames = CONFIG.stepDuration + CONFIG.transitionFrames;

      const draw = () => {
        const cycleFrame = frame % (totalStepFrames * STEPS.length);
        const currentStepIdx = Math.floor(cycleFrame / totalStepFrames);
        const frameInStep = cycleFrame % totalStepFrames;

        ctx.fillStyle = CONFIG.bgColor;
        ctx.fillRect(0, 0, width, height);

        // --- Draw bubbles ---
        for (const b of bubbles) {
          b.y -= b.speed;
          b.x += Math.sin(frame * b.wobbleSpeed + b.wobbleOffset) * 0.4;

          // Reset bubble when it goes above canvas.
          if (b.y + b.radius < 0) {
            b.y = height + b.radius + Math.random() * 40;
            b.x = Math.random() * width;
          }

          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.fillStyle = CONFIG.bubbleColor;
          ctx.globalAlpha = b.opacity * 0.5;
          ctx.fill();

          // Bubble outline.
          ctx.strokeStyle = CONFIG.bubbleOutline;
          ctx.globalAlpha = b.opacity;
          ctx.lineWidth = 0.8;
          ctx.stroke();

          // Highlight on bubble.
          ctx.beginPath();
          ctx.arc(
            b.x - b.radius * 0.3,
            b.y - b.radius * 0.3,
            b.radius * 0.25,
            0,
            Math.PI * 2
          );
          ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
          ctx.globalAlpha = b.opacity * 0.6;
          ctx.fill();
        }

        ctx.globalAlpha = 1;

        // --- Draw ASCII step ---
        ctx.font = CONFIG.cellFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Calculate opacity for fade in/out transitions.
        let stepOpacity = 1;
        const fadeInEnd = CONFIG.transitionFrames;
        const fadeOutStart = CONFIG.stepDuration;

        if (frameInStep < fadeInEnd) {
          stepOpacity = frameInStep / fadeInEnd;
        } else if (frameInStep >= fadeOutStart) {
          stepOpacity = 1 - (frameInStep - fadeOutStart) / CONFIG.transitionFrames;
        }
        stepOpacity = Math.max(0, Math.min(1, stepOpacity));

        // Ease the opacity.
        const easedOpacity = stepOpacity * stepOpacity * (3 - 2 * stepOpacity);

        const grid = stepGrids[currentStepIdx];

        // Draw title cells.
        for (const cell of grid.titleCells) {
          ctx.globalAlpha = easedOpacity;
          ctx.fillStyle = CONFIG.charColor;
          ctx.fillText("@", cell.tx, cell.ty);
        }

        // Draw description cells.
        for (const cell of grid.descCells) {
          ctx.globalAlpha = easedOpacity * 0.7;
          ctx.fillStyle = CONFIG.charColorDim;
          ctx.fillText("@", cell.tx, cell.ty);
        }

        ctx.globalAlpha = 1;

        // --- Step indicator dots ---
        const dotY = height - 18;
        const dotSpacing = 18;
        const dotsStartX = width / 2 - ((STEPS.length - 1) * dotSpacing) / 2;

        for (let i = 0; i < STEPS.length; i++) {
          const dotX = dotsStartX + i * dotSpacing;
          ctx.beginPath();
          ctx.arc(dotX, dotY, i === currentStepIdx ? 4 : 2.5, 0, Math.PI * 2);
          ctx.fillStyle =
            i === currentStepIdx ? CONFIG.charColor : "rgba(0, 255, 200, 0.3)";
          ctx.fill();
        }

        frame++;
        animRef.current = requestAnimationFrame(draw);
      };

      animRef.current = requestAnimationFrame(draw);

      const handleResize = () => {
        cancelAnimationFrame(animRef.current);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ({ width, height } = resizeCanvas());

        // Rebuild grids for new size.
        for (let i = 0; i < STEPS.length; i++) {
          const step = STEPS[i];
          const titleText = `${step.number}. ${step.title}`;
          stepGrids[i] = {
            titleCells: sampleText(
              titleText,
              CONFIG.sourceFont,
              width,
              height,
              CONFIG.cellSize,
              height * 0.38
            ),
            descCells: sampleText(
              step.desc,
              CONFIG.descFont,
              width,
              height,
              CONFIG.cellSize,
              height * 0.68
            ),
          };
        }
        bubbles = createBubbles(width, height);
        frame = 0;
        animRef.current = requestAnimationFrame(draw);
      };

      window.addEventListener("resize", handleResize);
      cleanupRef.current = () => {
        cancelAnimationFrame(animRef.current);
        window.removeEventListener("resize", handleResize);
      };
    };

    const cleanupRef = { current: () => {} };
    start();

    return () => {
      cancelled = true;
      cleanupRef.current();
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div className="ascii-steps-wrapper">
      <canvas ref={canvasRef} className="ascii-steps-canvas" />
    </div>
  );
}
