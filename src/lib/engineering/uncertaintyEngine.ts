/**
 * Audit-friendly first-order uncertainty propagation.
 *
 * Uses independent-input assumptions and standard RSS propagation:
 *   y = product(x_i ^ a_i)
 *   (u_y / |y|)^2 = Σ (a_i * u_i / |x_i|)^2
 *
 * This is intentionally not a confidence score. It propagates measurement/
 * parameter uncertainty into an output interval that can affect decisions.
 */

export type UncertainInput = {
  id: string;
  value: number;
  absoluteUncertainty: number;
  unit: string;
};

export type PropagatedOutput = {
  value: number;
  standardUncertainty: number;
  relativeUncertainty: number;
  lower95: number;
  upper95: number;
  assumptions: string[];
  contributions: Array<{
    inputId: string;
    sensitivityExponent: number;
    relativeContribution: number;
    percentOfVariance: number;
  }>;
};

const finite = (value: number): boolean => Number.isFinite(value);

export function propagatePowerLaw(
  inputs: UncertainInput[],
  exponents: Record<string, number>,
): PropagatedOutput | null {
  if (!inputs.length) return null;

  let value = 1;
  const terms: Array<{ input: UncertainInput; exponent: number; varianceTerm: number }> = [];

  for (const input of inputs) {
    const exponent = exponents[input.id];
    if (!Number.isFinite(exponent) || !finite(input.value) || !finite(input.absoluteUncertainty)) return null;
    if (input.value === 0 && exponent < 0) return null;
    value *= Math.pow(input.value, exponent);
    const relative = input.value !== 0 ? input.absoluteUncertainty / Math.abs(input.value) : 0;
    terms.push({ input, exponent, varianceTerm: Math.pow(exponent * relative, 2) });
  }

  if (!finite(value)) return null;

  const variance = terms.reduce((sum, item) => sum + item.varianceTerm, 0);
  const relativeUncertainty = Math.sqrt(Math.max(variance, 0));
  const standardUncertainty = Math.abs(value) * relativeUncertainty;

  return {
    value,
    standardUncertainty,
    relativeUncertainty,
    lower95: value - 1.96 * standardUncertainty,
    upper95: value + 1.96 * standardUncertainty,
    assumptions: [
      "Input uncertainties are treated as standard uncertainties.",
      "Inputs are treated as independent; covariance is not included.",
      "95% interval uses a normal approximation: output ± 1.96u.",
    ],
    contributions: terms.map((item) => ({
      inputId: item.input.id,
      sensitivityExponent: item.exponent,
      relativeContribution: Math.abs(item.exponent) * (item.input.value !== 0 ? item.input.absoluteUncertainty / Math.abs(item.input.value) : 0),
      percentOfVariance: variance > 0 ? (item.varianceTerm / variance) * 100 : 0,
    })),
  };
}

export function intervalCrossesThreshold(output: PropagatedOutput, threshold: number): boolean {
  return output.lower95 < threshold && output.upper95 >= threshold;
}
