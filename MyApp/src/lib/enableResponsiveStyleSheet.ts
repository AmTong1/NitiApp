import { StyleSheet, Dimensions, PixelRatio } from 'react-native';


const DESIGN_WIDTH = 390;
const DESIGN_HEIGHT = 844;
const PATCH_FLAG = '__NITI_RESPONSIVE_STYLESHEET_PATCHED__';
const PATCH_SUSPEND_FLAG = '__NITI_RESPONSIVE_STYLESHEET_SUSPENDED__';

const WIDTH_KEYS = new Set([
  'width',
  'minWidth',
  'maxWidth',
  'left',
  'right',
  'marginLeft',
  'marginRight',
  'paddingLeft',
  'paddingRight',
  'borderLeftWidth',
  'borderRightWidth',
  'translateX',
]);

const HEIGHT_KEYS = new Set([
  'height',
  'minHeight',
  'maxHeight',
  'top',
  'bottom',
  'marginTop',
  'marginBottom',
  'paddingTop',
  'paddingBottom',
  'borderTopWidth',
  'borderBottomWidth',
  'translateY',
]);

const SCALE_KEYS = new Set([
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'margin',
  'marginHorizontal',
  'marginVertical',
  'padding',
  'paddingHorizontal',
  'paddingVertical',
  'borderWidth',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'gap',
  'rowGap',
  'columnGap',
  'shadowRadius',
  'shadowOffset',
]);

const SKIP_KEYS = new Set([
  'flex',
  'flexGrow',
  'flexShrink',
  'zIndex',
  'opacity',
  'elevation',
  'fontWeight',
  'aspectRatio',
]);

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const shortDim = Math.min(SCREEN_WIDTH, SCREEN_HEIGHT);
const longDim = Math.max(SCREEN_WIDTH, SCREEN_HEIGHT);

// Maximum scale factor. 1.0 means original phone size. 
// 1.15 allows slight scaling up on large phones and tablets without blowing up the UI.
const MAX_SCALE = 1.15;

const scaleWidth = Math.min(shortDim / DESIGN_WIDTH, MAX_SCALE);
const scaleHeight = Math.min(longDim / DESIGN_HEIGHT, MAX_SCALE);

const toResponsiveWidth = (px: number) => PixelRatio.roundToNearestPixel(px * scaleWidth);
const toResponsiveHeight = (px: number) => PixelRatio.roundToNearestPixel(px * scaleHeight);

function shouldKeepRawNumber(styleKey: string, value: number): boolean {
  if (!Number.isFinite(value)) return true;
  if (value === 0) return true;
  if (SKIP_KEYS.has(styleKey)) return true;

  // Keep tiny borders crisp and avoid blurry 0.x values.
  if (/border/i.test(styleKey) && Math.abs(value) <= 1) return true;

  return false;
}

function transformTransformArray(items: any[]): any[] {
  if (!Array.isArray(items)) return items;

  return items.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const kv = Object.entries(entry);
    if (kv.length !== 1) return entry;

    const [key, raw] = kv[0];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return entry;

    if (key === 'translateX') return { [key]: toResponsiveWidth(raw) };
    if (key === 'translateY') return { [key]: toResponsiveHeight(raw) };

    // Keep scale / rotate / skew untouched.
    return entry;
  });
}

function transformNumber(styleKey: string, value: number): number {
  if (shouldKeepRawNumber(styleKey, value)) return value;

  if (HEIGHT_KEYS.has(styleKey)) return toResponsiveHeight(value);
  if (WIDTH_KEYS.has(styleKey)) return toResponsiveWidth(value);
  if (SCALE_KEYS.has(styleKey)) return toResponsiveWidth(value);

  if (/(height|top|bottom)$/i.test(styleKey)) return toResponsiveHeight(value);
  if (/(width|left|right|radius|padding|margin|font|lineHeight|letterSpacing|gap)$/i.test(styleKey)) {
    return toResponsiveWidth(value);
  }

  return value;
}

function transformStyleValue(styleKey: string, value: any): any {
  if (Array.isArray(value)) {
    if (styleKey === 'transform') return transformTransformArray(value);
    return value.map((item) => transformStyleValue(styleKey, item));
  }

  if (value && typeof value === 'object') {
    const output: Record<string, any> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      output[childKey] = transformStyleValue(childKey, childValue);
    }
    return output;
  }

  if (typeof value === 'number') {
    return transformNumber(styleKey, value);
  }

  return value;
}

function transformStyles(styles: Record<string, any>): Record<string, any> {
  if (!styles || typeof styles !== 'object') return styles;

  const transformed: Record<string, any> = {};
  for (const [styleName, styleValue] of Object.entries(styles)) {
    if (!styleValue || typeof styleValue !== 'object') {
      transformed[styleName] = styleValue;
      continue;
    }

    // Opt-out per style block: { __noResponsiveScale: true, ... }
    if (styleValue.__noResponsiveScale === true) {
      const clone = { ...styleValue };
      delete clone.__noResponsiveScale;
      transformed[styleName] = clone;
      continue;
    }

    const nextStyle: Record<string, any> = {};
    for (const [styleKey, rawValue] of Object.entries(styleValue)) {
      nextStyle[styleKey] = transformStyleValue(styleKey, rawValue);
    }
    transformed[styleName] = nextStyle;
  }

  return transformed;
}

function enableResponsiveStyleSheet(): void {
  const globalObj = global as unknown as Record<string, any>;
  if (globalObj[PATCH_FLAG]) return;
  globalObj[PATCH_FLAG] = true;

  const originalCreate = StyleSheet.create.bind(StyleSheet);

  StyleSheet.create = ((styles: Record<string, any>) => {
    try {
      if (globalObj[PATCH_SUSPEND_FLAG] === true) {
        return originalCreate(styles);
      }
      return originalCreate(transformStyles(styles));
    } catch {
      return originalCreate(styles);
    }
  }) as typeof StyleSheet.create;
}

function setResponsiveStyleSheetSuspended(suspended: boolean): void {
  const globalObj = global as unknown as Record<string, any>;
  globalObj[PATCH_SUSPEND_FLAG] = suspended;
}

function runWithoutResponsivePatch<T>(work: () => T): T {
  const globalObj = global as unknown as Record<string, any>;
  const prev = globalObj[PATCH_SUSPEND_FLAG] === true;

  globalObj[PATCH_SUSPEND_FLAG] = true;
  try {
    return work();
  } finally {
    globalObj[PATCH_SUSPEND_FLAG] = prev;
  }
}

enableResponsiveStyleSheet();

export { enableResponsiveStyleSheet, setResponsiveStyleSheetSuspended, runWithoutResponsivePatch };
