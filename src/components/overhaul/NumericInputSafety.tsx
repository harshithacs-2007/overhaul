"use client";

import { useEffect } from "react";

function normalize(input: HTMLInputElement) {
  if (input.type !== "number") return;
  const raw = input.value.trim();
  if (!raw) { input.removeAttribute("aria-invalid"); return; }
  const normalized = raw.replace(/,/g, "").replace(/\s/g, "");
  const value = Number(normalized);
  const valid = Number.isFinite(value);
  input.toggleAttribute("aria-invalid", !valid);
  if (!valid || normalized === raw) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, normalized);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export default function NumericInputSafety() {
  useEffect(() => {
    const onInput = (event: Event) => normalize(event.target as HTMLInputElement);
    const onBlur = (event: FocusEvent) => normalize(event.target as HTMLInputElement);
    document.addEventListener("input", onInput, true);
    document.addEventListener("blur", onBlur, true);
    return () => { document.removeEventListener("input", onInput, true); document.removeEventListener("blur", onBlur, true); };
  }, []);
  return null;
}
