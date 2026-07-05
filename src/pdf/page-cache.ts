export interface CleanablePage {
  cleanup(): void;
}

/**
 * Sayfa başına tek getirme + bellek serbestleştirme.
 *
 * pdf.js her `getDocument().getPage(n)` çağrısında sayfanın operatör listesini
 * ayrıştırıp bellekte tutar ve kendiliğinden BIRAKMAZ. Bir sayfa hattın üç ayrı
 * adımında (metin çıkarma, OCR, render) ayrı ayrı getirilirse hem 3 kat iş yapılır
 * hem de 654 sayfalık bir kitapta ayrıştırılmış sayfalar birikip belleği doldurur;
 * düşük RAM'li makinede bu, çeviri ilerledikçe artan bir yavaşlamaya yol açar.
 *
 * Bu önbellek tek sayfayı tutar: aynı sayfa numarası tekrar istenince aynı nesneyi
 * döndürür; yeni sayfaya geçilince önceki sayfanın `cleanup()`'ı çağrılarak
 * ayrıştırılmış veri hemen serbest bırakılır. Hat sayfaları sırayla işlediği için
 * tek nesnelik önbellek yeterlidir.
 */
export class PageCache<P extends CleanablePage> {
  private num = -1;
  private page: P | null = null;

  constructor(private fetch: (n: number) => Promise<P>) {}

  async get(n: number): Promise<P> {
    if (this.num !== n || this.page === null) {
      this.page?.cleanup();
      this.page = await this.fetch(n);
      this.num = n;
    }
    return this.page;
  }

  dispose(): void {
    this.page?.cleanup();
    this.page = null;
    this.num = -1;
  }
}
