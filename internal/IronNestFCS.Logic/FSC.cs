using HarmonyInstance = HarmonyLib.Harmony;
using System.Collections;
using System.Text.Json;
using IronNestFCS.Abstractions;
using IronNestFCS.Logic.Execution;
using IronNestFCS.Logic.FCS;
using IronNestFCS.Logic.Infrastructure;
using IronNestFCS.Logic.Localization;
using IronNestFCS.Logic.Scheduling;
using MelonLoader;

namespace IronNestFCS.Logic;

public enum LeftRight
{
    Left,
    Right,
}

/// <summary>
/// Reloadable TaskSystem composition root. Persistent physical loading is injected from the stable Host.
/// </summary>
public class FSC
{
    private const string HarmonyId = "com.svr2kos2.ironnestfcs.logic";

    private HarmonyInstance? _harmony;
    private readonly List<object> _runningCoroutines = new();
    private readonly SceneExposureService _sceneExposure;
    private readonly IBridgeHost? _bridge;
    private int _lastResumeGeneration;
    private int _nextExternalTargetId = 1000;
    private float _nextStatusPublishAt;

    internal ILoadingSystem Loading { get; }
    internal FcsSceneInteractor SceneInteractor { get; private set; }
    internal PurchaseDeck PurchaseDeck { get; } = new();
    internal SharedConsoleCoordinator SharedResources { get; }
    internal TaskDispatcher Dispatcher { get; }
    internal FirePriorityCoordinator FirePriority { get; }
    internal FirePlanner Planner { get; }
    internal FirePlanExecutor PlanExecutor { get; }

    public readonly MapTable MapTable = new();
    public readonly BallisticCalculator BallisticCalculator = new();
    public readonly GunSystem LeftGun = new();
    public readonly GunSystem RightGun = new();
    public readonly Turret Turret = new();
    public readonly TriggerConsole TriggerConsole = new();

    public ArtilleryTask? LeftTask => PlanExecutor.LeftTask;
    public ArtilleryTask? RightTask => PlanExecutor.RightTask;
    public int PendingCount => Dispatcher.PendingCount;
    public Queue<ArtilleryTask> QueueCan => Dispatcher.QueueSnapshot;
    public Queue<ArtilleryTask> RecentTasks => Dispatcher.RecentSnapshot;
    public bool AutoFireEnabled => SceneInteractor.AutoFire;
    public bool MaxChargeEnabled => SceneInteractor.maxCharge;
    public int CompletedTaskCount => Dispatcher.CompletedTaskCount;
    public int SuccessfulTaskCount => Dispatcher.SuccessfulTaskCount;
    public int FailedTaskCount => Dispatcher.FailedTaskCount;
    public string FirePriorityStatusText => FirePriority.StatusText;
    public string FirePriorityLeftDetail => FirePriority.LeftDetail;
    public string FirePriorityRightDetail => FirePriority.RightDetail;

    public bool IsBound { get; private set; }

    public FSC(IFcsHostServices hostServices)
    {
        Loading = hostServices.Loading;
        _bridge = hostServices.Bridge;
        SceneInteractor = new FcsSceneInteractor(this);
        SharedResources = new SharedConsoleCoordinator(this);
        FirePriority = new FirePriorityCoordinator();
        PlanExecutor = new FirePlanExecutor(this);
        Planner = new FirePlanner(this);
        Dispatcher = new TaskDispatcher(this);
        _sceneExposure = new SceneExposureService(this);
    }

    private static bool TryBindSafe(string name, Func<bool> binder)
    {
        try
        {
            var ok = binder();
            if (!ok)
                MelonLogger.Warning($"[FCS] Bind failed: {name}");
            return ok;
        }
        catch (Exception ex)
        {
            MelonLogger.Error($"[FCS] Bind exception in {name}: {ex}");
            return false;
        }
    }

    public bool TryBind()
    {
        SceneInteractor = new FcsSceneInteractor(this);
        _harmony = new HarmonyInstance(HarmonyId);

        SharedResources.Reset();
        FcsRuntimeClock.Reset();
        _lastResumeGeneration = FcsRuntimeClock.ResumeGeneration;
        TimeToImpactReader.Reset();
        FcsLocalization.ResetGameLanguage();
        PlanExecutor.DisposeState();

        IsBound = Loading.IsBound
                  && TryBindSafe(nameof(MapTable), MapTable.TryBind)
                  && TryBindSafe(nameof(BallisticCalculator), BallisticCalculator.TryBind)
                  && TryBindSafe("LeftGun", () => LeftGun.TryBind("Left"))
                  && TryBindSafe("RightGun", () => RightGun.TryBind("Right"))
                  && TryBindSafe(nameof(PurchaseDeck), PurchaseDeck.TryBind)
                  && TryBindSafe(nameof(Turret), Turret.TryBind)
                  && TryBindSafe(nameof(TriggerConsole), TriggerConsole.TryBind);

        if (!Loading.IsBound)
            MelonLogger.Warning("[FCS] Persistent LoadingSystem is not bound.");

        if (IsBound)
            FcsLocalization.BindGameLanguage();
        FirePriority.Reset();

        MelonLogger.Msg("[FCS] Initialize: " + (IsBound ? "success" : "failed"));
        if (IsBound)
        {
            SceneInteractor.Initialize();
            TrackCoroutine(SharedResources.ResetFireControlsAfterBind());
            TrackCoroutine(TriggerConsole.ReviewStateLoop());
            TrackCoroutine(SharedResources.ReplenishPowderLoop());
        }

        return IsBound;
    }

    public void Update()
    {
        FcsRuntimeClock.Update();
        if (!FcsRuntimeClock.IsFocused)
            return;

        if (_lastResumeGeneration != FcsRuntimeClock.ResumeGeneration)
        {
            _lastResumeGeneration = FcsRuntimeClock.ResumeGeneration;
            Dispatcher.TryDispatch();
        }

        FcsLocalization.TickGameLanguage();
        if (PurchaseDeck.SyncTick())
            SceneInteractor.RefreshBulletTypeButtons();
        SceneInteractor.Update();
        PlanExecutor.Tick();
        CaptureEstimatedFlightTime(LeftRight.Left);
        CaptureEstimatedFlightTime(LeftRight.Right);
        ProcessBridgeCommands();
        PublishStatusIfDue();
    }

    private void CaptureEstimatedFlightTime(LeftRight side)
    {
        var plan = PlanExecutor.GetPlan(side);
        if (plan == null
            || plan.Task.progress != Progress.WaitingForFire
            || !float.IsNaN(plan.EstimatedFlightSeconds))
        {
            return;
        }

        if (TimeToImpactReader.TryReadEstimatedSeconds(side, out var seconds))
            plan.TrySetEstimatedFlightSeconds(seconds);
    }

    // ---- 内外火控桥接 ----

    /// <summary>主线程轮询桥接命令并处理（每帧一次）。</summary>
    private void ProcessBridgeCommands()
    {
        if (_bridge == null || !_bridge.IsListening)
            return;

        string? json;
        while ((json = _bridge.DequeueCommand()) != null)
        {
            try
            {
                var command = JsonSerializer.Deserialize<BridgeCommand>(json);
                if (command == null)
                    continue;

                switch (command.Type)
                {
                    case "sync":
                        ApplySchedule(command);
                        break;
                    case "clear":
                        ClearPlanState();
                        break;
                    case "autofire":
                        if (command.Autofire.HasValue)
                        {
                            SceneInteractor.AutoFire = command.Autofire.Value;
                            if (SceneInteractor.AutoFire)
                                PlanExecutor.OnAutoFireEnabled();
                            MelonLogger.Msg($"[FCS Bridge] AutoFire {(SceneInteractor.AutoFire ? "ON" : "OFF")}");
                        }
                        break;
                    default:
                        MelonLogger.Warning($"[FCS Bridge] unknown command type: {command.Type}");
                        break;
                }
            }
            catch (Exception ex)
            {
                MelonLogger.Error($"[FCS Bridge] command processing error: {ex.Message}");
            }
        }
    }

    private void ApplySchedule(BridgeCommand command)
    {
        ClearPlanState();

        if (command.Autofire.HasValue)
        {
            SceneInteractor.AutoFire = command.Autofire.Value;
            if (SceneInteractor.AutoFire)
                PlanExecutor.OnAutoFireEnabled();
        }

        if (command.Tasks == null)
            return;

        foreach (var bridgeTask in command.Tasks)
            EnqueueExternalTask(bridgeTask);

        MelonLogger.Msg($"[FCS Bridge] applied schedule {command.ScheduleId ?? ""} with {command.Tasks.Count} task(s); autofire={SceneInteractor.AutoFire}");
    }

    /// <summary>把外部桥接任务转换为本地 ArtilleryTask 并入队。</summary>
    public void EnqueueExternalTask(BridgeTask bridgeTask)
    {
        if (bridgeTask == null || bridgeTask.DistanceKm <= 0f)
            return;

        var task = new ArtilleryTask
        {
            targetId = _nextExternalTargetId++,
            externalId = bridgeTask.Id ?? "",
            angel = bridgeTask.BearingDeg,
            distance = bridgeTask.DistanceKm,
            bulletType = ParseBulletType(bridgeTask.ShellType),
            priority = bridgeTask.Priority,
            requestedCharge = bridgeTask.Charge is >= 1 and <= 6 ? bridgeTask.Charge : null
        };

        if (bridgeTask.FireAtSec.HasValue && bridgeTask.FireAtSec.Value >= 0f)
            task.fireDeadline = FcsRuntimeClock.Now + bridgeTask.FireAtSec.Value;

        Dispatcher.EnqueueTask(task);
    }

    /// <summary>清空任务计划（等价 F9 的“放弃计划”，但不重载 Logic、不打断已接受的物理装填）。</summary>
    public void ClearPlanState()
    {
        Dispatcher.DisposeState();
        PlanExecutor.DisposeState();
        FirePriority.Reset();
        MelonLogger.Msg("[FCS Bridge] cleared task plan state.");
    }

    private static BulletType ParseBulletType(string shellType)
    {
        if (!string.IsNullOrWhiteSpace(shellType)
            && Enum.TryParse<BulletType>(shellType, true, out var parsed))
        {
            return parsed;
        }

        return BulletType.HE;
    }

    private void PublishStatusIfDue()
    {
        if (_bridge == null || !_bridge.IsListening)
            return;

        if (FcsRuntimeClock.Now < _nextStatusPublishAt)
            return;

        _nextStatusPublishAt = FcsRuntimeClock.Now + 0.5f;
        PublishStatus();
    }

    private void PublishStatus()
    {
        if (_bridge == null || !_bridge.IsListening)
            return;

        try
        {
            var leftState = GunPhysicalState.Read("Left");
            var rightState = GunPhysicalState.Read("Right");
            var plans = new List<BridgePlanStatus>();
            AppendPlanStatus(plans, LeftRight.Left, PlanExecutor.GetPlan(LeftRight.Left));
            AppendPlanStatus(plans, LeftRight.Right, PlanExecutor.GetPlan(LeftRight.Right));

            var evt = new BridgeStatusEvent
            {
                Type = "status",
                Bound = IsBound,
                Autofire = SceneInteractor.AutoFire,
                ClockSec = FcsRuntimeClock.Now,
                TurretAzimuth = Turret.CurrentAzimuth,
                Pending = Dispatcher.PendingCount,
                Left = ToGunStatus(leftState),
                Right = ToGunStatus(rightState),
                Plans = plans
            };

            _bridge.Publish(JsonSerializer.Serialize(evt));
        }
        catch (Exception ex)
        {
            MelonLogger.Error($"[FCS Bridge] status publish failed: {ex.Message}");
        }
    }

    private static BridgeGunStatus? ToGunStatus(GunPhysicalState state)
    {
        return new BridgeGunStatus
        {
            Kind = state.Kind.ToString(),
            Shell = state.ShellType.HasValue ? state.ShellType.Value.ToString() : null,
            Charges = state.PowderCharges,
            Elevation = state.Elevation
        };
    }

    private static void AppendPlanStatus(List<BridgePlanStatus> plans, LeftRight side, FirePlan? plan)
    {
        if (plan == null)
            return;

        plans.Add(new BridgePlanStatus
        {
            Side = side.ToString(),
            ExternalId = plan.Task.externalId ?? "",
            Progress = plan.Task.progress.ToString(),
            FireDeadlineSec = plan.FireDeadline.HasValue
                ? plan.FireDeadline.Value - FcsRuntimeClock.Now
                : (float?)null
        });
    }

    public void Dispose()
    {
        foreach (var handle in _runningCoroutines)
        {
            try { MelonCoroutines.Stop(handle); }
            catch (Exception ex) { MelonLogger.Error($"[FCS] Stop coroutines failed: {ex}"); }
        }
        _runningCoroutines.Clear();

        LeftGun.ReleaseElevationOverride();
        RightGun.ReleaseElevationOverride();

        Dispatcher.DisposeState();
        PlanExecutor.DisposeState();
        FirePriority.Reset();
        TimeToImpactReader.Reset();
        FcsLocalization.ResetGameLanguage();

        SceneInteractor.ShutDown();

        try { _harmony?.UnpatchSelf(); }
        catch (Exception ex) { MelonLogger.Error($"[FCS] UnpatchSelf failed: {ex}"); }
        _harmony = null;
    }

    internal object TrackCoroutine(IEnumerator routine)
    {
        var handle = MelonCoroutines.Start(routine);
        _runningCoroutines.Add(handle);
        return handle;
    }

    public void EnqueueTask(ArtilleryTask task) => Dispatcher.EnqueueTask(task);

    public IEnumerator ExposeAllEntities() => _sceneExposure.ExposeAllEntities();
}
