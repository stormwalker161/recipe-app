// Scales the leading quantity in an ingredient string (e.g. "2 cups flour",
// "1 1/2 tsp salt", "3/4 cup sugar", "½ cup butter") by a multiplier, leaving
// ingredients with no parseable leading quantity (e.g. "Salt to taste")
// untouched.

export const SERVING_MULTIPLIERS = [
  { key: 'half', label: '1/2x', value: 0.5 },
  { key: 'normal', label: '1x', value: 1 },
  { key: 'double', label: '2x', value: 2 },
  { key: 'triple', label: '3x', value: 3 },
];

const VULGAR_FRACTIONS = {
  '¼': 1 / 4,
  '½': 1 / 2,
  '¾': 3 / 4,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};

const VULGAR_FRACTION_CHARS = Object.keys(VULGAR_FRACTIONS).join('');

const QUANTITY_PATTERNS = [
  // Mixed number with a unicode fraction, e.g. "1½"
  {
    re: new RegExp(`^(\\d+)\\s*([${VULGAR_FRACTION_CHARS}])`),
    toValue: (m) => parseInt(m[1], 10) + VULGAR_FRACTIONS[m[2]],
  },
  // Standalone unicode fraction, e.g. "½"
  {
    re: new RegExp(`^([${VULGAR_FRACTION_CHARS}])`),
    toValue: (m) => VULGAR_FRACTIONS[m[1]],
  },
  // Mixed number, e.g. "1 1/2"
  {
    re: /^(\d+)\s+(\d+)\/(\d+)/,
    toValue: (m) => parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10),
  },
  // Simple fraction, e.g. "3/4"
  {
    re: /^(\d+)\/(\d+)/,
    toValue: (m) => parseInt(m[1], 10) / parseInt(m[2], 10),
  },
  // Decimal or whole number, e.g. "2" or "2.5"
  {
    re: /^(\d+(?:\.\d+)?)/,
    toValue: (m) => parseFloat(m[1]),
  },
];

function parseLeadingQuantity(text) {
  const leadingWhitespace = text.match(/^\s*/)[0];
  const rest = text.slice(leadingWhitespace.length);

  for (const { re, toValue } of QUANTITY_PATTERNS) {
    const match = rest.match(re);
    if (match) {
      return {
        value: toValue(match),
        leadingWhitespace,
        remainder: rest.slice(match[0].length),
      };
    }
  }

  return null;
}

const COMMON_FRACTIONS = [
  [1 / 8, '1/8'],
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [3 / 8, '3/8'],
  [1 / 2, '1/2'],
  [5 / 8, '5/8'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
  [7 / 8, '7/8'],
];

function formatQuantity(value) {
  const rounded = Math.round(value * 1000) / 1000;
  const whole = Math.floor(rounded);
  const fraction = rounded - whole;

  if (fraction < 0.02) {
    return String(whole);
  }
  if (fraction > 0.98) {
    return String(whole + 1);
  }

  for (const [fractionValue, label] of COMMON_FRACTIONS) {
    if (Math.abs(fraction - fractionValue) < 0.03) {
      return whole > 0 ? `${whole} ${label}` : label;
    }
  }

  const decimal = Math.round(rounded * 100) / 100;
  return String(decimal);
}

export function scaleIngredientText(text, multiplier) {
  if (!text || multiplier === 1) {
    return text;
  }

  const parsed = parseLeadingQuantity(text);
  if (!parsed) {
    return text;
  }

  const formatted = formatQuantity(parsed.value * multiplier);
  return `${parsed.leadingWhitespace}${formatted}${parsed.remainder}`;
}
