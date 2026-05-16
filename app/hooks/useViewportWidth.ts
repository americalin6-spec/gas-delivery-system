"use client";

import { useEffect, useState } from "react";

/**
 * Returns `null` on server and on the client's first render so SSR markup matches hydration.
 * After mount, updates to `window.innerWidth` (and on resize).
 */
export function useViewportWidth(): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    function update() {
      setWidth(window.innerWidth);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return width;
}

export function useIsViewportBelow(maxWidth: number): boolean {
  const width = useViewportWidth();
  return width !== null && width < maxWidth;
}
