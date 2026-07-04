export const STR = {
  appName: "PDF Çevirmen",
  tagline: "Ücretsiz, sınırsız, kurulumsuz PDF çevirisi — dosyanız bilgisayarınızdan çıkmaz.",
  dropHint: "PDF dosyasını buraya sürükleyin ya da tıklayıp seçin",
  privacy:
    "Gizlilik: PDF dosyanız hiçbir sunucuya yüklenmez; tüm işlem tarayıcınızda yapılır. " +
    "Yalnızca çevrilecek metin parçaları seçtiğiniz çeviri servisine (Google/Lingva/Gemini) gönderilir.",
  sourceLang: "Kaynak dil",
  targetLang: "Hedef dil",
  auto: "Otomatik algıla",
  settings: "Ayarlar",
  geminiKeyLabel: "Gemini API anahtarı (isteğe bağlı — daha kaliteli çeviri)",
  geminiKeyHint:
    "Google AI Studio'dan ücretsiz alınır. Anahtar yalnızca bu tarayıcıda saklanır, " +
    "yalnızca Google'ın resmî API'sine gönderilir.",
  pageRange: "Sayfa aralığı",
  pageRangeAll: "Tümü",
  start: "Çeviriyi Başlat",
  cancel: "İptal",
  download: "Çevrilmiş PDF'i İndir",
  compare: "Orijinalle karşılaştır",
  progress: (done: number, total: number) => `Sayfa ${done}/${total} çevrildi`,
  preparing: "PDF okunuyor…",
  buildingPdf: "Çıktı PDF'i oluşturuluyor…",
  doneMsg: "Çeviri tamamlandı.",
  cancelled: "Çeviri iptal edildi. O ana kadar biten sayfaları indirebilirsiniz.",
  errPassword: "Bu PDF parola korumalı. Lütfen parolasız bir kopya kullanın.",
  errBroken: "Dosya açılamadı. PDF bozuk ya da desteklenmeyen bir biçimde olabilir.",
  errNotPdf: "Lütfen bir PDF dosyası seçin.",
  errScannedAll:
    "Bu PDF'te okunabilir metin bulunamadı (görsel okuma da sonuç vermedi). " +
    "Sayfalar boş ya da çok düşük kaliteli olabilir.",
  warnScannedSome: (n: number) =>
    `${n} sayfa taranmış görüntü olduğu için çevrilemedi; bu sayfalar olduğu gibi kopyalandı.`,
  warnFailedBlocks: (n: number) =>
    `${n} metin bloğu çevrilemedi ve orijinal haliyle bırakıldı.`,
  warnBigFile:
    "Bu PDF çok büyük (300+ sayfa). Tamamını çevirebilirsiniz ama sayfa aralığı seçmek daha hızlı olur.",
  geminiQuota:
    "Gemini ücretsiz kotası doldu. Google motoruyla devam edilsin mi?",
  engineGoogle: "Hızlı motor (anahtarsız)",
  engineGemini: "Kaliteli motor (Gemini anahtarınız kayıtlı)",
  netPaused: "Bağlantı sorunu. Tekrar denemek için düğmeye basın.",
  retry: "Yeniden dene",
  ocrFigures: "Görsellerdeki metinleri de çevir (daha yavaş)",
  ocrReading: (n: number) => `Sayfa ${n} görselden okunuyor…`,
  ocrPreparing: "Görsel okuma motoru hazırlanıyor (ilk kullanımda ~12 MB iner)…",
  warnOcrFailed: (n: number) =>
    `${n} sayfada görsel okuma başarısız oldu; bu sayfalar olduğu gibi bırakıldı.`,
  footerPrivacy: "Dosyanız bilgisayarınızdan çıkmaz",
  footerOpenSource: "Açık kaynak (MIT)",
  footerVersion: "v2",
  waitingRateLimit: (sec: number) =>
    `Çeviri servisi yoğun — ${sec} saniye bekleniyor, sonra kaldığı yerden devam edecek…`,
  errServiceDown:
    "Çeviri servisine art arda ulaşılamadı (art arda sayfalar çevrilemedi). " +
    "İnternetinizi kontrol edin ya da birkaç dakika sonra 'Çeviriyi Başlat' ile tekrar deneyin. " +
    "O ana kadar biten sayfaları indirebilirsiniz.",
} as const;

// Kaynak diller: otomatik + yaygın diller (her alfabe kaynak olabilir)
export const SOURCE_LANGS: [string, string][] = [
  ["auto", "Otomatik algıla"], ["en", "İngilizce"], ["de", "Almanca"],
  ["fr", "Fransızca"], ["es", "İspanyolca"], ["it", "İtalyanca"],
  ["pt", "Portekizce"], ["nl", "Felemenkçe"], ["ru", "Rusça"],
  ["uk", "Ukraynaca"], ["pl", "Lehçe"], ["ar", "Arapça"], ["fa", "Farsça"],
  ["zh-CN", "Çince"], ["ja", "Japonca"], ["ko", "Korece"], ["hi", "Hintçe"],
  ["el", "Yunanca"], ["sv", "İsveççe"], ["tr", "Türkçe"],
];

// Hedef diller: v1'de Noto Sans'ın kapsadığı Latin/Kiril/Yunan alfabeli diller
export const TARGET_LANGS: [string, string][] = [
  ["tr", "Türkçe"], ["en", "İngilizce"], ["de", "Almanca"], ["fr", "Fransızca"],
  ["es", "İspanyolca"], ["it", "İtalyanca"], ["pt", "Portekizce"],
  ["nl", "Felemenkçe"], ["sv", "İsveççe"], ["no", "Norveççe"], ["da", "Danca"],
  ["fi", "Fince"], ["pl", "Lehçe"], ["cs", "Çekçe"], ["sk", "Slovakça"],
  ["hu", "Macarca"], ["ro", "Romence"], ["bg", "Bulgarca"], ["el", "Yunanca"],
  ["ru", "Rusça"], ["uk", "Ukraynaca"], ["sr", "Sırpça"], ["hr", "Hırvatça"],
  ["bs", "Boşnakça"], ["sq", "Arnavutça"], ["az", "Azerbaycan dili"],
  ["id", "Endonezce"], ["ms", "Malayca"], ["vi", "Vietnamca"], ["et", "Estonca"],
  ["lv", "Letonca"], ["lt", "Litvanca"],
];
