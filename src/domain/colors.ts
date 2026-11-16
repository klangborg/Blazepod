export const ColorName = {
  red: 'red',
  green: 'green',
  blue: 'blue',
  yellow: 'yellow',
  magenta: 'magenta',
  cyan: 'cyan',
  white: 'white',
  orange: 'orange',
} as const

export type ColorName = (typeof ColorName)[keyof typeof ColorName]

export interface NamedRgb {
  name: ColorName
  label: string
  r: number
  g: number
  b: number
}

export const PALETTE: Record<ColorName, NamedRgb> = {
  red: { name: 'red', label: 'Rød', r: 255, g: 16, b: 32 },
  green: { name: 'green', label: 'Grøn', r: 16, g: 220, b: 72 },
  blue: { name: 'blue', label: 'Blå', r: 32, g: 96, b: 255 },
  yellow: { name: 'yellow', label: 'Gul', r: 255, g: 200, b: 16 },
  magenta: { name: 'magenta', label: 'Magenta', r: 255, g: 24, b: 180 },
  cyan: { name: 'cyan', label: 'Cyan', r: 16, g: 220, b: 255 },
  white: { name: 'white', label: 'Hvid', r: 255, g: 255, b: 255 },
  orange: { name: 'orange', label: 'Orange', r: 255, g: 96, b: 16 },
}

export const COLOR_ORDER: ColorName[] = [
  'red',
  'green',
  'blue',
  'yellow',
  'magenta',
  'cyan',
  'white',
  'orange',
]

export function colorRgb(name: ColorName): { r: number; g: number; b: number } {
  const c = PALETTE[name]
  return { r: c.r, g: c.g, b: c.b }
}
