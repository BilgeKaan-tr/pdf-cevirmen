export interface CooldownOpts {
  cooldownsMs?: number[];
  now?: () => number;
  onWait?: (ms: number) => void;
}

/**
 * Hız sınırı / geçici engel algılandığında motoru KALICI OLARAK devre dışı
 * bırakmak yerine kademeli, kendi kendini onaran bir bekleme penceresi tutar.
 * Pencere aktifken çağıranlar hemen (ağa gitmeden) vazgeçebilir; pencere
 * kendiliğinden kapanınca motor otomatik olarak tekrar denenir — hiçbir
 * durumda "bu iş için sonsuza dek kapandı" durumu oluşmaz.
 */
export class Cooldown {
  private blockedUntil = 0;
  private idx = 0;
  private readonly cooldowns: number[];
  private readonly now: () => number;
  private readonly onWait?: (ms: number) => void;

  constructor(opts: CooldownOpts = {}) {
    this.cooldowns = opts.cooldownsMs ?? [10_000, 30_000, 60_000, 120_000];
    this.now = opts.now ?? Date.now;
    this.onWait = opts.onWait;
  }

  isBlocked(): boolean {
    return this.now() < this.blockedUntil;
  }

  /** Şu anki bekleme bitene kadar kalan milisaniye (bloklu değilse 0). */
  remainingMs(): number {
    return Math.max(0, this.blockedUntil - this.now());
  }

  /** Yeni bir hız-sınırı sinyali geldiğinde çağrılır; pencereyi kademeli büyütür. */
  escalate(): void {
    const now = this.now();
    if (now < this.blockedUntil) return; // aynı pencerede tekrar büyütme
    const cd = this.cooldowns[Math.min(this.idx, this.cooldowns.length - 1)];
    this.idx = Math.min(this.idx + 1, this.cooldowns.length - 1); // tavanda kalır, asla vazgeçmez
    this.blockedUntil = now + cd;
    this.onWait?.(cd);
  }

  /** Başarılı istekten sonra çağrılır; kademe başa sarılır. */
  reset(): void {
    this.idx = 0;
    this.blockedUntil = 0;
  }
}
