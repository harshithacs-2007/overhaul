"use client";

import { useEffect } from "react";

const DECIMAL_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function isNumericControl(input: HTMLInputElement) {
  return input.type === "number" || input.inputMode === "decimal" || input.inputMode === "numeric";
}

export function parseEngineeringNumber(rawValue: string) {
  const raw = rawValue.trim();
  if (!raw) return null;
  const normalized = raw.replace(/[,_\s]/g, "");
  if (!DECIMAL_RE.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
}

function normalize(input: HTMLInputElement) {
  if (!isNumericControl(input)) return;
  const raw = input.value;
  if (!raw.trim()) {
    input.removeAttribute("aria-invalid");
    return;
  }
  const value = parseEngineeringNumber(raw);
  if (value == null) {
    input.setAttribute("aria-invalid", "true");
    setValue(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  input.removeAttribute("aria-invalid");
  const normalized = String(value);
  if (normalized === raw.trim().replace(/[_\s,]/g, "")) return;
  setValue(input, normalized);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export default function NumericInputSafety() {
  useEffect(() => {
    const onInput = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement) normalize(target);
    };
    const onBlur = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement) normalize(target);
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("blur", onBlur, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("blur", onBlur, true);
    };
  }, []);
  return null;
}
