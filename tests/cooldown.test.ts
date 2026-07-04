import { describe, it, expect, vi } from "vitest";
import { Cooldown } from "../src/translate/cooldown";

function fakeCooldown(sequence: number[] = [10_000, 30_000, 60_000, 120_000]) {
  let t = 0;
  const onWait = vi.fn();
  const cd = new Cooldown({ cooldownsMs: sequence, now: () => t, onWait });
  return { cd, onWait, advance: (ms: number) => { t += ms; } };
}

describe("Cooldown", () => {
  it("başlangıçta engelli değildir", () => {
    const { cd } = fakeCooldown();
    expect(cd.isBlocked()).toBe(false);
  });

  it("escalate sonrası isBlocked true olur ve onWait tetiklenir", () => {
    const { cd, onWait } = fakeCooldown();
    cd.escalate();
    expect(cd.isBlocked()).toBe(true);
    expect(onWait).toHaveBeenCalledWith(10_000);
  });

  it("süre geçince tekrar engelsiz olur", () => {
    const { cd, advance } = fakeCooldown();
    cd.escalate();
    advance(10_000);
    expect(cd.isBlocked()).toBe(false);
  });

  it("art arda escalate çağrıları süreyi kademeli büyütür", () => {
    const { cd, onWait, advance } = fakeCooldown();
    cd.escalate();
    advance(10_000); // pencere kapandı
    cd.escalate();
    expect(onWait).toHaveBeenLastCalledWith(30_000);
    advance(30_000);
    cd.escalate();
    expect(onWait).toHaveBeenLastCalledWith(60_000);
    advance(60_000);
    cd.escalate();
    expect(onWait).toHaveBeenLastCalledWith(120_000);
  });

  it("en üst kademede kalıcı kalır, asla vazgeçmez", () => {
    const { cd, onWait, advance } = fakeCooldown();
    for (let i = 0; i < 4; i++) { cd.escalate(); advance(200_000); }
    onWait.mockClear();
    cd.escalate();
    expect(onWait).toHaveBeenCalledWith(120_000); // hep tavanda kalır
    expect(cd.isBlocked()).toBe(true);
  });

  it("aynı pencere içinde tekrar escalate çağrısı süreyi büyütmez", () => {
    const { cd, onWait } = fakeCooldown();
    cd.escalate();
    cd.escalate(); // hâlâ ilk pencere aktif — büyümemeli
    expect(onWait).toHaveBeenCalledTimes(1);
  });

  it("reset kademeyi başa sarar", () => {
    const { cd, onWait, advance } = fakeCooldown();
    cd.escalate();
    advance(10_000);
    cd.escalate(); // 30s kademesi
    cd.reset();
    advance(30_000);
    cd.escalate();
    expect(onWait).toHaveBeenLastCalledWith(10_000);
  });
});
