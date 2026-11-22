// A starter tree for a new Finny, in the owner's own words (the names used most in the "Pengeluaran" workbook).
// Offered once, when there are no categories yet; the workbook import (Sprint 2) brings the full list.
export const STARTER: Record<"income" | "expense" | "saving" | "investment", [string, string[]][]> = {
  income: [["Gaji", ["Gaji Bulanan", "THR", "Tunjangan Lainnya"]], ["Pendapatan Lainnya", ["Bunga Bank", "Pendapatan Lain-Lain", "Piutang Lain-Lain"]]],
  expense: [
    ["Kebutuhan Pribadi", ["Makan di Luar", "Beli Kopi", "Beli Jajanan", "Beli Rokok", "Nonton Film atau Musik", "Biaya Produktivitas"]],
    ["Transportasi", ["Biaya Bensin", "Biaya Transportasi Publik", "Biaya Perawatan Kendaraan"]],
    ["Kebutuhan Rumah Tangga", ["Belanja Dapur dan Rumah Tangga", "Biaya Listrik", "Biaya Air", "Biaya Telekomunikasi"]],
    ["Bank dan Finansial", ["Biaya Bank", "Biaya Transaksi"]],
    ["Lainnya", []],
  ],
  saving: [["Dana Darurat", []], ["Tabungan", []]],
  investment: [["Saham", []], ["Reksadana", []], ["Emas", []]],
};
