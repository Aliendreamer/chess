/**
 * `oklch(L C h)` → `#rrggbb`, as CSS Color 4 converts it (OKLab → linear sRGB → gamma, clipped). React Native takes no
 * oklch(), so the tokens carry hex and the drift test converts theme.css with this.
 */
export function oklchToHex(oklch: string): string {
  const m = /^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/.exec(oklch.trim())
  if (!m) throw new Error(`not oklch: ${oklch}`)
  const [L, C, h] = [Number(m[1]), Number(m[2]), (Number(m[3]) * Math.PI) / 180]
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ]
  const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)
  const byte = (x: number) =>
    Math.round(Math.min(1, Math.max(0, gamma(x))) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${linear.map(byte).join('')}`
}
