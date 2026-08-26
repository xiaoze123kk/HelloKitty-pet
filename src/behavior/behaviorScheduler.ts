import { chooseBehaviorPlan } from "./behaviorDirector";
import type {
  BehaviorId,
  BehaviorPlan,
  BehaviorSchedulerInput,
  BehaviorStep,
} from "./types";

interface ActivePlan {
  plan: BehaviorPlan;
  index: number;
  startedAt: number;
  waitingForAnimation: boolean;
}

const STEP_TIMEOUT_MS = 5_000;

export class BehaviorScheduler {
  private active: ActivePlan | null = null;
  private readonly cooldowns: Partial<Record<BehaviorPlan["id"], number>> = {};
  private startedBehavior: BehaviorId | null = null;

  tick(input: BehaviorSchedulerInput): BehaviorStep | null {
    if (this.active) {
      const step = this.active.plan.steps[this.active.index];
      if (!step) {
        this.finish(input.context.now);
        return null;
      }
      if (
        !this.active.waitingForAnimation &&
        step.durationMs !== undefined &&
        input.context.now - this.active.startedAt >= step.durationMs
      ) {
        return this.advance(input.context.now);
      }
      if (
        this.active.waitingForAnimation &&
        input.context.now - this.active.startedAt >= STEP_TIMEOUT_MS
      ) {
        return this.advance(input.context.now);
      }
      return null;
    }

    if (
      input.stateKey !== "idle" ||
      (input.idleSubState !== null && input.idleSubState !== "still") ||
      input.context.dnd ||
      input.context.settingsOpen ||
      input.context.dialogueOpen ||
      !input.context.idleActionsEnabled
    ) {
      return null;
    }

    const plan = chooseBehaviorPlan({ ...input, cooldowns: this.cooldowns });
    if (!plan) return null;
    this.active = {
      plan,
      index: 0,
      startedAt: input.context.now,
      waitingForAnimation: plan.steps[0]?.waitForAnimation !== false,
    };
    this.startedBehavior = plan.id;
    return plan.steps[0] ?? null;
  }

  consumeStartedBehavior(): BehaviorId | null {
    const started = this.startedBehavior;
    this.startedBehavior = null;
    return started;
  }

  isActive(): boolean {
    return this.active !== null;
  }

  onAnimationFinished(now: number): BehaviorStep | null {
    if (!this.active || !this.active.waitingForAnimation) return null;
    return this.advance(now);
  }

  cancel(): void {
    this.active = null;
    this.startedBehavior = null;
  }

  reset(): void {
    this.active = null;
    this.startedBehavior = null;
    for (const key of Object.keys(this.cooldowns)) delete this.cooldowns[key as keyof typeof this.cooldowns];
  }

  private advance(now: number): BehaviorStep | null {
    if (!this.active) return null;
    this.active.index += 1;
    const next = this.active.plan.steps[this.active.index];
    if (!next) {
      this.finish(now);
      return null;
    }
    this.active.startedAt = now;
    this.active.waitingForAnimation = next.waitForAnimation !== false;
    if (!this.active.waitingForAnimation && next.durationMs === undefined) {
      this.finish(now);
    }
    return next;
  }

  private finish(now: number): void {
    if (!this.active) return;
    this.cooldowns[this.active.plan.id] = now + this.active.plan.cooldownMs;
    this.active = null;
  }
}
