// A made-up workbook with the same structure as the owner's "Catatan Keuangan Pribadi" books and the Transaction Log of
// "Personal Wealth Management". Never real data. Used by the unit tests and written to .xlsx for the e2e suite.
const D = (s) => new Date(s + "T00:00:00Z");
const HDR = ["Tanggal", "Keterangan", "Entitas Pengirim", "Entitas Penerima", "Akun Terkait", "Jenis Transaksi", "Jumlah Transaksi", "Saldo"];
/** Rows [date, description, from, to, akun, "Debet"|"Kredit", amount]; the running Saldo is filled in like the workbook does. */
function account(name, rows) {
  let saldo = 0;
  const data = [["SALDO SAAT INI", null, null], HDR];
  for (const [d, k, f, t, a, j, n] of rows) { saldo += j === "Kredit" ? n : -n; data.push([D(d), k, f, t, a, j, n, saldo]); }
  data[0][2] = saldo;
  return { sheet: name, data };
}
export const OWNER = "Rina";
export const BOOKS = [
  { sheet: "HOME", data: [[null, "Catatan Keuangan Pribadi"], [null, "Input Data"]] },
  { sheet: "COA", data: [["Nama Akun", "Kode", "COA1", "COA2", "COA3", "COA4", "COA5", "COA6"],
    ["Beli Kopi", null, "Pengeluaran", "Kebutuhan Pribadi", "Beli Kopi"],
    ["Biaya Parkir", null, "Pengeluaran", "Transportasi", "Biaya Parkir"],
    ["Makan di Luar", null, "Pengeluaran", "Kebutuhan Rumah Tangga", "Kebutuhan Pokok", "Makan di Luar"],
    ["Biaya Listrik", null, "Pengeluaran", "Kebutuhan Rumah Tangga", "Properti", "Rumah", "Sarana Pelengkap Properti", "Biaya Listrik"],
    ["Gaji Bulanan", null, "Pendapatan", "Pendapatan Tetap", "Gaji", "Gaji Bulanan"],
    ["Modal Awal", null, "Ekuitas", "Modal Awal"],
    ["Piutang Lain-Lain", null, "Aset", "Aset Lancar", "Piutang", "Piutang Lain-Lain"],
    ["Utang Konsumtif", null, "Liabilitas", "Liabilitas Lancar", "Utang", "Utang Konsumtif"]] },
  account("Kas Tunai", [ // the template's example sheet
    ["2023-01-28", "Simpan Uang Tunai di Rumah", "Contoh", "Contoh", "Tabungan Bank-0003", "Kredit", 400000],
    ["2023-02-28", "Simpan Uang Tunai di Rumah", "Contoh", "Contoh", "Tabungan Bank-0001", "Kredit", 1000000]]),
  account("Bank Satu", [
    ["2024-06-01", "Saldo Awal Bank Satu", OWNER, OWNER, "Modal Awal", "Kredit", 1000000],
    ["2024-06-02", "Ngopi di Kedai", OWNER, "Lainnya", "Beli Kopi", "Debet", 43890],
    ["2024-06-03", "Gaji Juni", "Kantor", OWNER, "Gaji Bulanan", "Kredit", 5000000],
    ["2024-06-04", "Top up GoPay", OWNER, OWNER, "GoPay", "Debet", 100000],
    ["2024-06-05", "Bayar kartu", OWNER, "Bank", "Kartu Kredit", "Debet", 200000],
    ["2024-06-06", "Pinjamkan Budi", OWNER, "Budi", "Piutang Lain-Lain", "Debet", 50000],
    ["2024-06-07", "Budi bayar", "Budi", OWNER, "Piutang Lain-Lain", "Kredit", 50000],
    ["2024-06-08", "Tarik tunai", OWNER, OWNER, "Kas Tunai", "Debet", 300000],
    ["2024-06-09", "Bayar PinjamDulu 1/2", OWNER, "PinjamDulu", "PinjamDulu", "Debet", 500000],
    ["2024-06-10", "Refund kopi", "Lainnya", OWNER, "Beli Kopi", "Kredit", 10000],
    ["2024-06-11", "Pindah ke tabungan lama", OWNER, OWNER, "Tabungan Bank-0001", "Debet", 25000]]),
  account("GoPay", [
    ["2024-06-04", "Top up dari Bank Satu", OWNER, OWNER, "Bank Satu", "Kredit", 100000],
    ["2024-06-05", "Makan siang", OWNER, "Warung", "Makan di Luar", "Debet", 35000],
    ["2024-06-12", "Parkir motor", OWNER, "Lainnya", "Biaya Parkir", "Debet", 2000],
    ["2024-06-12", "Parkir motor", OWNER, "Lainnya", "Biaya Parkir", "Debet", 2000]]), // two identical rows: two transactions
  account("CLOSED Kartu Kredit", [
    ["2024-06-01", "Limit Awal Kartu Kredit", "Bank", OWNER, "CLOSED Kartu Kredit", "Kredit", 10000000],
    ["2024-06-02", "Belanja", OWNER, "Toko", "Makan di Luar", "Debet", 200000],
    ["2024-06-06", "Pembayaran kartu", OWNER, "Bank", "Bank Satu", "Kredit", 200000],
    ["2024-06-10", "Token listrik", OWNER, "PLN", "Biaya Listrik", "Debet", 150000]]),
  account("PinjamDulu", [
    ["2024-06-01", "Saldo Awal PinjamDulu", "PinjamDulu", OWNER, "Modal Awal", "Kredit", 3000000],
    ["2024-06-02", "Utang kebutuhan hidup", "PinjamDulu", OWNER, "Utang Konsumtif", "Debet", 1000000],
    ["2024-06-09", "Pembayaran 1/2", OWNER, "PinjamDulu", "Utang Konsumtif", "Kredit", 500000]]),
  { sheet: "Total Transaksi Gabungan", data: [HDR, [D("2024-06-02"), "Ngopi di Kedai", OWNER, "Lainnya", "Beli Kopi", "Debet", 43890, 0]] },
];
export const WEALTH = [
  { sheet: "Read Me", data: [["READ-ME"]] },
  { sheet: "Transaction Log", data: [[null, "Transaction Log"], [], [null, "Date", "Month", "Month Year", "Account", "Type", "Category", "Description", "Total"],
    [null, D("2024-06-02"), "June", "June 2024", "Bank Satu", "Expense", "Coffee", "Ngopi di Kedai", 43890],
    [null, D("2024-06-15"), "June", "June 2024", "GoPay", "Expense", "Transportation", "Parkir", 12000],
    [null, D("2024-06-16"), "June", "June 2024", "Bank Satu", "Income", "Gifts", "Hadiah", 250000]] },
];
