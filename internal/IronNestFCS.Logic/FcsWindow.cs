namespace IronNestFCS.Logic;

/// <summary>
/// 游戏内详细火控 UI（IMGUI）暂时留空。
/// 状态显示已改由外部炮控终端通过桥接（HTTP + SSE）呈现，这里只保留空占位，
/// 后续若需要游戏内回显再补充。
/// </summary>
public class FcsWindow
{
    public FcsWindow(FSC fcs)
    {
        // 详细火控 UI 暂时留空；fcs 参数保留供后续回显使用。
    }

    public void OnGui()
    {
        // 详细火控 UI 暂时留空。
    }
}
