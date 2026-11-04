/**
 * Physically calibrated Kelvin (Planckian Blackbody) to RGB conversion
 * Based on Tanner Helland's algorithm calibrated for cinema lighting
 */
export function kelvinToRgb(kelvin: number, tint = 0): { r: number; g: number; b: number; hex: string; css: string } {
  // Clamp kelvin between 1000 and 12000
  const temp = Math.max(1000, Math.min(12000, kelvin)) / 100;
  
  let r: number;
  let g: number;
  let b: number;

  // Calculate Red
  if (temp <= 66) {
    r = 255;
  } else {
    r = temp - 60;
    r = 329.698727446 * Math.pow(r, -0.1332047592);
    r = Math.min(255, Math.max(0, r));
  }

  // Calculate Green
  if (temp <= 66) {
    g = temp;
    g = 99.4708025861 * Math.log(g) - 161.1195681661;
    g = Math.min(255, Math.max(0, g));
  } else {
    g = temp - 60;
    g = 288.1221695283 * Math.pow(g, -0.0755148492);
    g = Math.min(255, Math.max(0, g));
  }

  // Calculate Blue
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = temp - 10;
    b = 138.5177312231 * Math.log(b) - 305.0447927307;
    b = Math.min(255, Math.max(0, b));
  }

  // Apply +/- Green tint (-1.0 to +1.0)
  // Positive tint adds green (Plus Green), negative tint adds magenta (Minus Green, subtracts green & boosts R/B)
  if (tint !== 0) {
    if (tint > 0) {
      g = Math.min(255, g + tint * 50);
      r = Math.max(0, r - tint * 15);
      b = Math.max(0, b - tint * 15);
    } else {
      const absTint = Math.abs(tint);
      g = Math.max(0, g - absTint * 45);
      r = Math.min(255, r + absTint * 20);
      b = Math.min(255, b + absTint * 25);
    }
  }

  const red = Math.round(r);
  const green = Math.round(g);
  const blue = Math.round(b);

  const hex = `#${((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1).toUpperCase()}`;
  const css = `rgb(${red}, ${green}, ${blue})`;

  return { r: red, g: green, b: blue, hex, css };
}

/**
 * HSI to RGB conversion for colored studio lights
 */
export function hsiToRgb(h: number, s: number, i: number): { r: number; g: number; b: number; hex: string } {
  const sat = s / 100;
  const val = i / 100;
  const c = val * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = val - c;

  let r1 = 0, g1 = 0, b1 = 0;
  if (h >= 0 && h < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (h >= 60 && h < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (h >= 120 && h < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (h >= 180 && h < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (h >= 240 && h < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;

  return { r, g, b, hex };
}
