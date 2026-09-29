// Maps a raw ingredient line (e.g. "2 cups flour", "3 large eggs") to a
// representative emoji for a quick visual scan of the ingredients/grocery
// list. Matching is keyword-based against the ingredient text with word
// boundaries so e.g. "pear" doesn't match inside "pepper". Longer, more
// specific keywords are checked before shorter/generic ones (e.g. "olive
// oil" before "oil") by listing them earlier -- first match wins.
const EMOJI_RULES = [
  // Produce
  [/\bavocados?\b/, '🥑'],
  [/\btomat(o|oes)\b/, '🍅'],
  [/\b(yellow |white |red )?onions?\b/, '🧅'],
  [/\bgarlic\b/, '🧄'],
  [/\bpotato(es)?\b/, '🥔'],
  [/\bsweet potato(es)?\b/, '🍠'],
  [/\bcarrots?\b/, '🥕'],
  [/\b(iceberg |romaine )?lettuce\b/, '🥬'],
  [/\bcabbage\b/, '🥬'],
  [/\bspinach\b/, '🥬'],
  [/\bkale\b/, '🥬'],
  [/\bbroccoli\b/, '🥦'],
  [/\bcauliflower\b/, '🥦'],
  [/\bcucumbers?\b/, '🥒'],
  [/\bpickles?\b/, '🥒'],
  [/\bzucchini\b/, '🥒'],
  [/\bbell pepper|\bred pepper|\bgreen pepper|\bcapsicum/, '🫑'],
  [/\bchil(i|is|ies|e|es)\b|\bjalape[nñ]o/, '🌶️'],
  [/\bpeppercorns?\b|\bblack pepper\b|\bwhite pepper\b/, '🧂'],
  [/\bcorn\b/, '🌽'],
  [/\bmushrooms?\b/, '🍄'],
  [/\beggplants?\b|\baubergine/, '🍆'],
  [/\bcelery\b/, '🥬'],
  [/\bginger\b/, '🫚'],
  [/\bcilantro\b|\bcoriander\b|\bparsley\b|\bbasil\b|\bmint\b|\brosemary\b|\bthyme\b|\bdill\b|\boregano\b/, '🌿'],
  [/\bgreen onions?\b|\bscallions?\b|\bleeks?\b/, '🧅'],
  [/\bpeas\b/, '🫛'],
  [/\bbeans?\b|\blentils?\b|\bchickpeas?\b/, '🫘'],
  [/\bcorn(starch)?\b/, '🌽'],

  // Fruit
  [/\blemons?\b/, '🍋'],
  [/\blimes?\b/, '🍋'],
  [/\boranges?\b/, '🍊'],
  [/\bapples?\b/, '🍎'],
  [/\bbananas?\b/, '🍌'],
  [/\bgrapes?\b/, '🍇'],
  [/\bstrawberr(y|ies)\b/, '🍓'],
  [/\bblueberr(y|ies)\b/, '🫐'],
  [/\bpeach(es)?\b/, '🍑'],
  [/\bpineapples?\b/, '🍍'],
  [/\bmangoe?s?\b/, '🥭'],
  [/\bcoconut\b/, '🥥'],
  [/\bcherr(y|ies)\b/, '🍒'],
  [/\bwatermelons?\b/, '🍉'],
  [/\bkiwis?\b/, '🥝'],
  [/\braisins?\b/, '🍇'],

  // Dairy & eggs
  [/\beggs?\b/, '🥚'],
  [/\bmilk\b/, '🥛'],
  [/\bbutter\b/, '🧈'],
  [/\bcheese\b|\bmozzarella\b|\bparmesan\b|\bcheddar\b|\bfeta\b/, '🧀'],
  [/\byog(h)?urt\b/, '🥣'],
  [/\bcream\b|\bsour cream\b|\bheavy cream\b/, '🥛'],
  [/\bice cream\b/, '🍨'],

  // Meat & seafood
  [/\bbacon\b|\bpancetta\b/, '🥓'],
  [/\bsausages?\b|\bhot dogs?\b/, '🌭'],
  [/\bbeef\b|\bsteak\b|\bground beef\b/, '🥩'],
  [/\bpork\b|\bham\b/, '🥩'],
  [/\bchicken\b|\bpoultry\b/, '🍗'],
  [/\bturkey\b/, '🦃'],
  [/\bshrimp\b|\bprawns?\b/, '🦐'],
  [/\bcrab\b/, '🦀'],
  [/\blobster\b/, '🦞'],
  [/\bfish\b|\bsalmon\b|\btuna\b|\bcod\b|\banchov(y|ies)\b/, '🐟'],

  // Grains, baking & pantry
  [/\bbread\b|\btoast\b|\bbun(s)?\b|\bbagels?\b/, '🍞'],
  [/\bflour\b/, '🌾'],
  [/\brice\b/, '🍚'],
  [/\b(spaghetti|pasta|noodles?|penne|macaroni|linguine|fettuccine)\b/, '🍝'],
  [/\boats?\b|\boatmeal\b/, '🥣'],
  [/\bsugar\b/, '🍬'],
  [/\bhoney\b/, '🍯'],
  [/\bchocolate\b|\bcocoa\b/, '🍫'],
  [/\bvanilla\b/, '🌼'],
  [/\bcinnamon\b/, '🟤'],
  [/\bnuts?\b|\balmonds?\b|\bwalnuts?\b|\bpecans?\b|\bpeanuts?\b|\bcashews?\b/, '🥜'],
  [/\bolive oil\b|\bolives?\b/, '🫒'],
  [/\boil\b/, '🫗'],
  [/\bvinegar\b/, '🍶'],
  [/\bsalt\b/, '🧂'],
  [/\byeast\b|\bbaking (soda|powder)\b/, '🧁'],
  [/\btortillas?\b|\bwraps?\b/, '🌮'],
  [/\bpizza\b/, '🍕'],
  [/\bsoy sauce\b/, '🍶'],
  [/\bwater\b/, '💧'],
  [/\bwine\b/, '🍷'],
  [/\bbeer\b/, '🍺'],
  [/\bcoffee\b/, '☕'],
  [/\btea\b/, '🍵'],
  [/\bpepperoni\b|\bsalami\b/, '🍕'],
];

const FALLBACK_EMOJI = '🧾';

/**
 * Returns a best-guess emoji for a raw ingredient line. Always returns a
 * string (falls back to a neutral 🧾 for anything unrecognized), so callers
 * never need to null-check the result.
 */
export function getIngredientEmoji(text) {
  if (typeof text !== 'string' || !text.trim()) return FALLBACK_EMOJI;

  const lower = text.toLowerCase();
  for (const [pattern, emoji] of EMOJI_RULES) {
    if (pattern.test(lower)) return emoji;
  }
  return FALLBACK_EMOJI;
}
