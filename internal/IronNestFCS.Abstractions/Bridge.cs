using System.Text.Json.Serialization;

namespace IronNestFCS.Abstractions;

/// <summary>
/// 内外火控桥接（外部炮控终端 &lt;-&gt; 游戏内 FCS）。
/// 命令从终端流向游戏（主线程轮询 <see cref="DequeueCommand"/>），事件从游戏流向终端（SSE）。
/// 所有载荷均为 JSON 字符串，以安全跨越 collectible AssemblyLoadContext 边界。
/// </summary>
public interface IBridgeHost
{
    /// <summary>桥接服务器是否正在监听。</summary>
    bool IsListening { get; }

    /// <summary>实际监听端口（端口被占用时会自动顺延）。</summary>
    int Port { get; }

    /// <summary>非阻塞取出下一条命令；无命令返回 null。仅主线程调用。</summary>
    string? DequeueCommand();

    /// <summary>发布一条事件（JSON 字符串）到所有 SSE 订阅者。仅主线程调用。</summary>
    void Publish(string eventJson);
}

/// <summary>
/// 桥接命令：外部终端 -> 游戏。type 取值：
/// "sync"（下发/替换整个射击计划）、"clear"（清空队列，等价 F9 的计划重置）、
/// "autofire"（开关自动开火）。
/// </summary>
public sealed class BridgeCommand
{
    [JsonPropertyName("type")] public string Type { get; set; } = "";

    [JsonPropertyName("scheduleId")] public string? ScheduleId { get; set; }

    [JsonPropertyName("autofire")] public bool? Autofire { get; set; }

    [JsonPropertyName("tasks")] public System.Collections.Generic.List<BridgeTask>? Tasks { get; set; }
}

/// <summary>桥接射击任务（外部终端下发的一发）。</summary>
public sealed class BridgeTask
{
    /// <summary>外部任务 ID，用于回传关联。</summary>
    [JsonPropertyName("id")] public string Id { get; set; } = "";

    /// <summary>任务类型：static / tot / moving / train。</summary>
    [JsonPropertyName("kind")] public string Kind { get; set; } = "static";

    /// <summary>军事方位角（北 0°，顺时针），度。</summary>
    [JsonPropertyName("bearingDeg")] public float BearingDeg { get; set; }

    /// <summary>目标距离，km。</summary>
    [JsonPropertyName("distanceKm")] public float DistanceKm { get; set; }

    /// <summary>弹种，如 HE / AP / HCHE。</summary>
    [JsonPropertyName("shellType")] public string ShellType { get; set; } = "HE";

    /// <summary>指定装药号（1..6）；缺省由游戏内解算决定。</summary>
    [JsonPropertyName("charge")] public int? Charge { get; set; }

    /// <summary>相对开火时刻（从计划被接收起算的秒数）；null 表示就绪即打。</summary>
    [JsonPropertyName("fireAtSec")] public float? FireAtSec { get; set; }

    /// <summary>优先级，数值越小越优先（用于时间敏感抢占队列）。</summary>
    [JsonPropertyName("priority")] public int Priority { get; set; }
}

/// <summary>单炮物理状态事件载荷。</summary>
public sealed class BridgeGunStatus
{
    [JsonPropertyName("kind")] public string Kind { get; set; } = "";
    [JsonPropertyName("shell")] public string? Shell { get; set; }
    [JsonPropertyName("charges")] public int Charges { get; set; }
    [JsonPropertyName("elevation")] public float Elevation { get; set; }
}

/// <summary>已提交 FirePlan 的状态事件载荷。</summary>
public sealed class BridgePlanStatus
{
    [JsonPropertyName("side")] public string Side { get; set; } = "";
    [JsonPropertyName("externalId")] public string ExternalId { get; set; } = "";
    [JsonPropertyName("progress")] public string Progress { get; set; } = "";
    [JsonPropertyName("fireDeadlineSec")] public float? FireDeadlineSec { get; set; }
}

/// <summary>状态事件（游戏 -> 终端），周期发布。</summary>
public sealed class BridgeStatusEvent
{
    [JsonPropertyName("type")] public string Type { get; set; } = "status";
    [JsonPropertyName("bound")] public bool Bound { get; set; }
    [JsonPropertyName("autofire")] public bool Autofire { get; set; }
    [JsonPropertyName("clockSec")] public float ClockSec { get; set; }
    [JsonPropertyName("turretAzimuth")] public float TurretAzimuth { get; set; }
    [JsonPropertyName("pending")] public int Pending { get; set; }
    [JsonPropertyName("left")] public BridgeGunStatus? Left { get; set; }
    [JsonPropertyName("right")] public BridgeGunStatus? Right { get; set; }
    [JsonPropertyName("plans")] public System.Collections.Generic.List<BridgePlanStatus>? Plans { get; set; }
    [JsonPropertyName("message")] public string? Message { get; set; }
}
