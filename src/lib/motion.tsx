"use client";

// GSAP motion for the glass UI. Every animation runs only when the viewer has not asked for reduced motion,
// and everything renders in its final state without it.

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import * as React from "react";

gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };

const MOTION_OK = "(prefers-reduced-motion: no-preference)";

/** Runs `fn` only when motion is allowed; GSAP reverts it automatically if the preference changes. */
export function withMotion(fn: () => void) {
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, fn);
  return () => mm.revert();
}

export function prefersMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOTION_OK).matches;
}

/** Staggered rise-in for a container's direct children (page sections, list rows). */
export function useStaggerIn<T extends HTMLElement>(ref: React.RefObject<T | null>, deps: unknown[], selector = ":scope > *") {
  useGSAP(
    () =>
      withMotion(() => {
        const items = ref.current?.querySelectorAll(selector);
        if (!items?.length) return;
        gsap.from(items, { y: 14, autoAlpha: 0, duration: 0.5, ease: "power3.out", stagger: 0.05, clearProps: "transform,opacity,visibility" });
      }),
    { scope: ref, dependencies: deps },
  );
}

/** A number that counts up to its value, formatted on every frame. */
export function AnimatedNumber({ value, format, duration = 0.9 }: { value: number; format: (n: number) => string; duration?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const shown = React.useRef(0);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (!prefersMotion()) {
        el.textContent = format(value);
        shown.current = value;
        return;
      }
      const state = { v: shown.current };
      gsap.to(state, {
        v: value,
        duration,
        ease: "power2.out",
        onUpdate: () => {
          el.textContent = format(state.v);
        },
        onComplete: () => {
          shown.current = value;
          el.textContent = format(value);
        },
      });
    },
    { dependencies: [value] },
  );
  return (
    <span ref={ref} className="tnum">
      {format(value)}
    </span>
  );
}

/** Slow-drifting colour blobs behind the glass. Purely decorative; static when motion is reduced. */
export function AmbientBackground() {
  const ref = React.useRef<HTMLDivElement>(null);
  useGSAP(
    () =>
      withMotion(() => {
        gsap.utils.toArray<HTMLElement>(".ambient-blob").forEach((el, i) => {
          gsap.to(el, {
            xPercent: gsap.utils.random(-18, 18),
            yPercent: gsap.utils.random(-14, 14),
            scale: gsap.utils.random(0.9, 1.15),
            duration: gsap.utils.random(14, 22),
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
            delay: i * 0.8,
          });
        });
      }),
    { scope: ref },
  );
  const blob = "ambient-blob absolute rounded-full blur-3xl";
  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className={blob} style={{ left: "-8%", top: "-12%", width: "46vw", height: "46vw", background: "rgba(63,174,122,0.30)" }} />
      <div className={blob} style={{ right: "-10%", top: "4%", width: "40vw", height: "40vw", background: "rgba(58,166,185,0.26)" }} />
      <div className={blob} style={{ right: "6%", bottom: "-16%", width: "38vw", height: "38vw", background: "rgba(242,184,75,0.20)" }} />
      <div className={blob} style={{ left: "10%", bottom: "-14%", width: "34vw", height: "34vw", background: "rgba(155,140,242,0.18)" }} />
    </div>
  );
}
