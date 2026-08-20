using UnityEngine;

namespace IronNestFCS.Logic.FCS;

public enum Progress {
    Pending,
    Calculating,
    SelectingBullet,
    LoadingBullet,
    LoadingPowder,
    WaitLoading,
    Aiming,
    WaitingForFire,
    BackToIdle,
    Finished,
    Failed,
}

public enum PendingHint {
    None,
    ShellMismatch,
    ChargeRangeInsufficient,
    AmmoMismatch,
}

public class ArtilleryTask {
    public int targetId;
    public float angel;
    public float distance;
    public Vector3 position;
    public BulletType bulletType;
    public Progress progress;

    // Lightweight UI hint for a task that remains in the pending queue.
    public PendingHint pendingHint;

    // Snapshot of the solved firing data. Keeping it on the task lets the UI show
    // exactly what the automation decided instead of only the current phase.
    public int chargeCount;
    public float elevation;

    // Runtime diagnostics used by the watchdog/recovery path and the recent-task UI.
    public float startedAt;
    public float completedAt;
    public string failureReason = "";

    // Runtime-only dispatch memory. If a preloaded gun is tried and its fixed shell/charge cannot
    // solve the target, exclude that side and let the same task fall back to the other gun.
    // Bit 0 = Left, bit 1 = Right. Reset when a brand-new target is enqueued.
    public int dispatchExcludedGunMask;

    // ---- 外部火控桥接（桥接任务）----
    // 外部终端下发的任务 ID，用于回传关联；空表示本地 T1~T4 任务。
    public string externalId = "";

    // 相对/绝对开火截止时刻（FCS 时钟）；null 表示就绪即打。
    public float? fireDeadline;

    // 时间敏感优先级（数值越小越优先），用于抢占队列排序。
    public int priority;

    // 外部显式指定的装药号（1..6）；null 表示由游戏内解算决定。
    public int? requestedCharge;
}
