"use client";

import { useEffect } from "react";

type GestureEvent = Event & {
  scale?: number;
};

export default function ZoomBlocker() {
  useEffect(() => {
    const preventDefault = (event: Event) => {
      event.preventDefault();
    };

    const preventTouchZoom = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    };

    const preventScaledTouch = (event: GestureEvent) => {
      if (typeof event.scale === "number" && event.scale !== 1) {
        event.preventDefault();
      }
    };

    document.addEventListener("gesturestart", preventDefault, {
      passive: false,
    });
    document.addEventListener("gesturechange", preventScaledTouch, {
      passive: false,
    });
    document.addEventListener("touchmove", preventTouchZoom, {
      passive: false,
    });

    return () => {
      document.removeEventListener("gesturestart", preventDefault);
      document.removeEventListener("gesturechange", preventScaledTouch);
      document.removeEventListener("touchmove", preventTouchZoom);
    };
  }, []);

  return null;
}
