// How a category looks (FINNY-38/39): an icon and a colour, guessed from its name when the owner hasn't chosen one.
// Pure, shared with the browser; tests/unit/category-look.test.mts.
// Dango Board's pastel pairs (owner, 23 Nov 2026: "make it look good like Dango Board"): a soft fill and a readable ink.
export const PALETTE: Record<string, string> = {
  pink: "#EC4899", lavender: "#8B5CF6", mint: "#10B981", peach: "#F97316", sky: "#0EA5E9", lemon: "#EAB308", rose: "#F43F5E", slate: "#64748B",
};
export const PALETTE_KEYS = Object.keys(PALETTE);

// Keyword → icon (Indonesian and English). The first match in the name wins, in this order.
const RULES: [RegExp, string][] = [
  [/kopi|coffee|ngopi|cafe|kafe/, "coffee"], [/rokok|vape|cigar/, "cigarette"], [/jajan|snack|camilan|cookie/, "cookie"],
  [/makan|food|resto|warung|gofood|grabfood|kuliner/, "utensils"], [/bensin|bbm|fuel|pertamina|shell/, "fuel"],
  [/kendaraan|motor|mobil|servis|parkir|car/, "car"], [/transport|ojek|gojek|grab|kereta|krl|mrt|bus|busway|emoney|e-money|toll|tol/, "bus"],
  [/pesawat|travel|liburan|hotel|tiket|flight|holiday/, "plane"], [/film|movie|nonton|bioskop|netflix|disney|streaming/, "clapperboard"],
  [/musik|music|spotify/, "music"], [/listrik|pln|electric/, "zap"], [/air|pdam|water/, "droplet"],
  [/internet|wifi|indihome/, "wifi"], [/telekomunikasi|pulsa|paket data|phone|hp/, "smartphone"],
  [/dapur|belanja|grocer|groceries|supermarket|indomaret|alfamart|shopping/, "shopping-cart"], [/rumah|house|home|sewa|kos|kontrakan|rent/, "home"],
  [/produktivitas|laptop|kerja|work|software|langganan|subscription/, "laptop"], [/pakaian|baju|clothing|fashion/, "shirt"],
  [/kesehatan|dokter|obat|apotek|health|bpjs kes/, "heart-pulse"], [/pendidikan|kursus|buku|sekolah|kuliah|education|course|book/, "graduation-cap"],
  [/anak|bayi|child|baby/, "baby"], [/hewan|kucing|anjing|pet/, "paw-print"], [/hadiah|kado|gift|thr|bonus/, "gift"],
  [/zakat|infaq|sedekah|donasi|ziswaf|charity/, "hand-heart"], [/bunga|interest|bagi hasil/, "percent"],
  [/piutang|pinjam|utang|debt|loan|cicilan/, "hand-coins"], [/biaya bank|admin|bank|transaksi|fee/, "landmark"],
  [/gaji|salary|tunjangan|pendapatan|income|upah/, "wallet"], [/darurat|emergency/, "shield-check"],
  [/tabungan|saving|nabung/, "piggy-bank"], [/emas|gold|gem/, "gem"], [/saham|stock/, "trending-up"],
  [/reksadana|mutual|fund|obligasi|sukuk|bond|deposito/, "pie-chart"], [/kripto|crypto|bitcoin/, "bitcoin"],
  [/bisnis|usaha|business/, "briefcase"], [/keluarga|istri|suami|orang tua|ibu|ayah|family|mom/, "users"],
  [/pribadi|personal/, "sparkles"], [/lain|other|misc/, "shapes"],
];
const KIND_ICON: Record<string, string> = { income: "wallet", expense: "receipt", saving: "piggy-bank", investment: "trending-up" };

export function guessIcon(name: string, kind: string): string {
  const n = name.toLowerCase();
  for (const [re, icon] of RULES) if (re.test(n)) return icon;
  return KIND_ICON[kind] ?? "receipt";
}
/** A stable colour from the name (the same name always gets the same colour). */
export function guessColor(name: string): string {
  let h = 0; for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE_KEYS[h % PALETTE_KEYS.length];
}
export function lookOf(c: { name: string; kind: string; icon?: string | null; color?: string | null }) {
  const color = c.color && PALETTE[c.color] ? c.color : guessColor(c.name);
  return { icon: c.icon || guessIcon(c.name, c.kind), color, hex: PALETTE[color] };
}
