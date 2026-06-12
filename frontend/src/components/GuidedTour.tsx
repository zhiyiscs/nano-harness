import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

export interface TourStep {
  selector?: string;
  title: string;
  body: string;
  placement?: TourPlacement;
}

interface GuidedTourProps {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 8;
const CARD_WIDTH = 330;
const CARD_GAP = 16;
const FALLBACK_CARD_HEIGHT = 220;

interface Size {
  width: number;
  height: number;
}

function computeCardStyle(rect: Rect | null, placement: TourPlacement, card: Size): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardWidth = card.width || CARD_WIDTH;
  const cardHeight = card.height || FALLBACK_CARD_HEIGHT;

  if (!rect || placement === "center") {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  const rectBottom = rect.top + rect.height;
  const rectRight = rect.left + rect.width;

  let top = rect.top;
  let left = rect.left;

  switch (placement) {
    case "right":
      left = rectRight + CARD_GAP;
      // Flip to the left side if it would run past the right edge.
      if (left + cardWidth > vw - CARD_GAP) {
        left = rect.left - cardWidth - CARD_GAP;
      }
      break;
    case "left":
      left = rect.left - cardWidth - CARD_GAP;
      if (left < CARD_GAP) {
        left = rectRight + CARD_GAP;
      }
      break;
    case "top":
      top = rect.top - cardHeight - CARD_GAP;
      // Flip below the target if there is not enough room above.
      if (top < CARD_GAP) {
        top = rectBottom + CARD_GAP;
      }
      break;
    case "bottom":
    default:
      top = rectBottom + CARD_GAP;
      // Flip above the target if it would drop below the viewport.
      if (top + cardHeight > vh - CARD_GAP) {
        top = rect.top - cardHeight - CARD_GAP;
      }
      break;
  }

  // Final guard: keep the whole card inside the viewport using its real size.
  const clampedLeft = Math.max(CARD_GAP, Math.min(left, vw - cardWidth - CARD_GAP));
  const clampedTop = Math.max(CARD_GAP, Math.min(top, vh - cardHeight - CARD_GAP));
  return { left: clampedLeft, top: clampedTop };
}

export function GuidedTour({ steps, open, onClose }: GuidedTourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState<Size>({ width: CARD_WIDTH, height: FALLBACK_CARD_HEIGHT });
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setIndex(0);
    }
  }, [open]);

  const step = open ? steps[index] : undefined;

  const measure = useCallback(() => {
    if (!step?.selector) {
      setRect(null);
      return;
    }
    const element = document.querySelector(step.selector);
    if (!element) {
      setRect(null);
      return;
    }
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    const bounds = element.getBoundingClientRect();
    setRect({ top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height });
  }, [step]);

  useLayoutEffect(() => {
    measure();
  }, [measure, index]);

  // Measure the card itself so we can keep it fully on screen regardless of content length.
  useLayoutEffect(() => {
    if (!cardRef.current) {
      return;
    }
    const bounds = cardRef.current.getBoundingClientRect();
    setCardSize((current) =>
      current.width === bounds.width && current.height === bounds.height
        ? current
        : { width: bounds.width, height: bounds.height },
    );
  }, [index, open, rect]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = () => measure();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [open, measure]);

  const goNext = useCallback(() => {
    setIndex((current) => {
      if (current >= steps.length - 1) {
        onClose();
        return current;
      }
      return current + 1;
    });
  }, [steps.length, onClose]);

  const goBack = useCallback(() => {
    setIndex((current) => Math.max(current - 1, 0));
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowRight" || event.key === "Enter") {
        goNext();
      } else if (event.key === "ArrowLeft") {
        goBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, goNext, goBack]);

  if (!open || !step) {
    return null;
  }

  const placement = step.placement ?? "bottom";
  const isLast = index === steps.length - 1;
  const cardStyle = computeCardStyle(rect, placement, cardSize);

  return (
    <div className="tour-root" role="dialog" aria-label="Guided tour">
      {rect ? (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
          }}
        />
      ) : (
        <div className="tour-backdrop" />
      )}

      <div className="tour-card" ref={cardRef} style={cardStyle}>
        <div className="tour-progress">
          {steps.map((_, dotIndex) => (
            <span
              key={dotIndex}
              className={`tour-dot ${dotIndex === index ? "active" : ""} ${
                dotIndex < index ? "done" : ""
              }`}
            />
          ))}
          <span className="tour-step-count">
            {index + 1} / {steps.length}
          </span>
        </div>

        <h3>{step.title}</h3>
        <p>{step.body}</p>

        <div className="tour-footer">
          <button className="tour-skip" type="button" onClick={onClose}>
            Skip
          </button>
          <span className="tour-spacer" />
          {index > 0 && (
            <button className="tour-back" type="button" onClick={goBack}>
              Back
            </button>
          )}
          <button type="button" onClick={goNext}>
            {isLast ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
