export interface SignConfirmResult {
  liveSign: string;
  confirmedSign: string | null;
}

export class SignConfirmationTracker {
  private lastSign = "";
  private holdCount = 0;
  private confirmed = false;
  private noSignFrames = 0;

  constructor(
    private readonly confirmFrames = 5,
    private readonly resetNoSignFrames = 10,
    private readonly allowRepeatAfterFrames = 30
  ) {}

  update(currentSign: string): SignConfirmResult {
    const sign = currentSign || "";

    if (!sign) {
      this.noSignFrames += 1;
      if (this.noSignFrames > this.resetNoSignFrames) {
        this.lastSign = "";
        this.holdCount = 0;
        this.confirmed = false;
      }
      return { liveSign: "", confirmedSign: null };
    }

    this.noSignFrames = 0;

    if (sign === this.lastSign) {
      this.holdCount += 1;

      if (this.holdCount >= this.confirmFrames && !this.confirmed) {
        this.confirmed = true;
        return { liveSign: sign, confirmedSign: sign };
      }

      if (this.holdCount > this.allowRepeatAfterFrames && this.confirmed) {
        this.holdCount = 0;
        this.confirmed = false;
      }

      return { liveSign: sign, confirmedSign: null };
    }

    this.lastSign = sign;
    this.holdCount = 1;
    this.confirmed = false;
    return { liveSign: sign, confirmedSign: null };
  }

  reset() {
    this.lastSign = "";
    this.holdCount = 0;
    this.confirmed = false;
    this.noSignFrames = 0;
  }
}

