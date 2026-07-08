// src/services/focusService.ts

export interface FocusConfig {
  targetMinutes: number
  targetWords: number
}

export class FocusSession {
  private elapsed = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private onTick: ((elapsed: number) => void) | null = null
  private onComplete: (() => void) | null = null
  private paused = false

  get isRunning(): boolean { return this.timer !== null && !this.paused }
  get isPaused(): boolean { return this.paused }
  get currentElapsed(): number { return this.elapsed }

  start(config: FocusConfig, callbacks: { onTick: (e: number) => void; onComplete: () => void }): void {
    this.onTick = callbacks.onTick
    this.onComplete = callbacks.onComplete
    this.elapsed = 0
    this.paused = false
    this.timer = setInterval(() => {
      if (!this.paused) {
        this.elapsed++
        this.onTick?.(this.elapsed)
        if (this.elapsed >= config.targetMinutes * 60) {
          this.stop()
          this.onComplete?.()
        }
      }
    }, 1000)
  }

  togglePause(): void {
    this.paused = !this.paused
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.paused = false
  }
}
