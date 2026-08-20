using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using IronNestFCS.Abstractions;

namespace IronNestFCS;

/// <summary>
/// 本地 HTTP + SSE 桥接服务器。仅绑定 127.0.0.1；可选共享 token 防止其它本地进程冒充。
/// 监听与客户端处理在后台线程；命令由主线程通过 <see cref="DequeueCommand"/> 拉取，
/// 事件由主线程通过 <see cref="Publish"/> 推送给 SSE 订阅者。所有载荷为 JSON 字符串。
/// </summary>
public sealed class BridgeServer : IBridgeHost, IDisposable
{
    private const int PortScanRange = 20;
    private const int MaxBodyLength = 1 << 20;

    private readonly int _preferredPort;
    private readonly string _token;
    private readonly ConcurrentQueue<string> _commands = new();
    private readonly ConcurrentDictionary<long, StreamWriter> _sseClients = new();
    private readonly object _sseLock = new();

    private TcpListener? _listener;
    private Thread? _acceptThread;
    private volatile bool _running;
    private long _nextClientId;

    public bool IsListening => _listener != null && _running;
    public int Port { get; private set; }

    public BridgeServer(int preferredPort, string token)
    {
        _preferredPort = preferredPort;
        _token = token ?? string.Empty;
    }

    public bool Start()
    {
        for (var port = _preferredPort; port < _preferredPort + PortScanRange; port++)
        {
            TcpListener? listener = null;
            try
            {
                listener = new TcpListener(IPAddress.Loopback, port);
                listener.Start();
                _listener = listener;
                Port = port;
                _running = true;
                _acceptThread = new Thread(AcceptLoop) { IsBackground = true, Name = "IronNestFCS.Bridge" };
                _acceptThread.Start();
                return true;
            }
            catch
            {
                try { listener?.Stop(); } catch { /* try next port */ }
            }
        }

        return false;
    }

    public void Dispose()
    {
        _running = false;
        try { _listener?.Stop(); } catch { /* ignore */ }

        lock (_sseLock)
        {
            foreach (var client in _sseClients.Values)
            {
                try { client.Dispose(); } catch { /* ignore */ }
            }
            _sseClients.Clear();
        }
    }

    private void AcceptLoop()
    {
        while (_running)
        {
            TcpClient client;
            try { client = _listener!.AcceptTcpClient(); }
            catch { break; }

            ThreadPool.QueueUserWorkItem(_ => SafeHandleClient(client));
        }
    }

    private void SafeHandleClient(TcpClient client)
    {
        try { HandleClient(client); }
        catch { /* per-client errors are non-fatal */ }
        finally
        {
            try { client.Dispose(); } catch { /* ignore */ }
        }
    }

    private void HandleClient(TcpClient client)
    {
        var stream = client.GetStream();

        // 请求行 + 头部读取（使用 leaveOpen 的读取器，后续 SSE 自管写流）。
        using var reader = new StreamReader(stream, new UTF8Encoding(false), false, 8192, leaveOpen: true);

        string? requestLine;
        try { requestLine = reader.ReadLine(); } catch { return; }
        if (requestLine == null) return;

        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        while (true)
        {
            string? line;
            try { line = reader.ReadLine(); } catch { return; }
            if (line == null || line.Length == 0) break;
            var idx = line.IndexOf(':');
            if (idx > 0) headers[line.Substring(0, idx).Trim()] = line.Substring(idx + 1).Trim();
        }

        var parts = requestLine.Split(' ');
        if (parts.Length < 2) return;
        var method = parts[0].ToUpperInvariant();
        var rawPath = parts[1];
        var question = rawPath.IndexOf('?');
        var route = question >= 0 ? rawPath.Substring(0, question) : rawPath;
        var query = question >= 0 ? rawPath.Substring(question + 1) : string.Empty;

        if (method == "OPTIONS")
        {
            WriteSimple(stream, "204 No Content", string.Empty, CorsHeaders);
            return;
        }

        if (!Authorized(query, headers))
        {
            WriteSimple(stream, "403 Forbidden", "Forbidden", CorsHeaders);
            return;
        }

        if (route == "/ping")
        {
            var body = $"{{\"ok\":true,\"port\":{Port},\"listening\":true}}";
            WriteSimple(stream, "200 OK", body, CorsHeaders);
        }
        else if (route == "/events")
        {
            HandleSse(stream, reader);
        }
        else if (route == "/command" && method == "POST")
        {
            var length = 0;
            if (headers.TryGetValue("Content-Length", out var lenStr)) int.TryParse(lenStr, out length);
            var body = ReadBody(reader, length);
            if (body.Length > 0) _commands.Enqueue(body);
            WriteSimple(stream, "200 OK", "{\"ok\":true}", CorsHeaders);
        }
        else
        {
            WriteSimple(stream, "404 Not Found", "Not Found", CorsHeaders);
        }
    }

    private const string CorsHeaders =
        "Access-Control-Allow-Origin: *\r\n" +
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
        "Access-Control-Allow-Headers: Content-Type, Authorization\r\n";

    private bool Authorized(string query, Dictionary<string, string> headers)
    {
        if (_token.Length == 0) return true;
        if (query.Contains("token=" + _token)) return true;
        if (headers.TryGetValue("Authorization", out var auth) && auth == "Bearer " + _token) return true;
        return false;
    }

    private void HandleSse(NetworkStream stream, StreamReader reader)
    {
        var writer = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true };
        writer.Write("HTTP/1.1 200 OK\r\n");
        writer.Write("Content-Type: text/event-stream\r\n");
        writer.Write("Cache-Control: no-cache\r\n");
        writer.Write("Connection: keep-alive\r\n");
        writer.Write(CorsHeaders);
        writer.Write("\r\n");
        writer.Flush();

        var id = Interlocked.Increment(ref _nextClientId);
        lock (_sseLock) _sseClients[id] = writer;
        try
        {
            // 阻塞读直到客户端断开（本地 SSE 订阅者不会主动发送数据）。
            var buffer = new char[1];
            while (_running)
            {
                int read;
                try { read = reader.Read(buffer, 0, 1); }
                catch { break; }
                if (read <= 0) break;
            }
        }
        finally
        {
            lock (_sseLock) _sseClients.TryRemove(id, out _);
            try { writer.Dispose(); } catch { /* ignore */ }
        }
    }

    private static string ReadBody(StreamReader reader, int length)
    {
        if (length <= 0) return string.Empty;
        var remaining = Math.Min(length, MaxBodyLength);
        var buffer = new char[Math.Min(remaining, 8192)];
        var sb = new StringBuilder();
        while (remaining > 0)
        {
            int read;
            try { read = reader.Read(buffer, 0, Math.Min(buffer.Length, remaining)); }
            catch { break; }
            if (read <= 0) break;
            sb.Append(buffer, 0, read);
            remaining -= read;
        }

        return sb.ToString();
    }

    private static void WriteSimple(NetworkStream stream, string status, string body, string extraHeaders)
    {
        var bodyBytes = Encoding.UTF8.GetBytes(body ?? string.Empty);
        var header = "HTTP/1.1 " + status + "\r\n"
                     + "Content-Type: application/json\r\n"
                     + "Content-Length: " + bodyBytes.Length + "\r\n"
                     + "Connection: close\r\n"
                     + extraHeaders
                     + "\r\n";
        var headerBytes = Encoding.UTF8.GetBytes(header);
        try
        {
            stream.Write(headerBytes, 0, headerBytes.Length);
            stream.Write(bodyBytes, 0, bodyBytes.Length);
            stream.Flush();
        }
        catch { /* client may already be gone */ }
    }

    public string? DequeueCommand()
    {
        return _commands.TryDequeue(out var command) ? command : null;
    }

    public void Publish(string eventJson)
    {
        if (string.IsNullOrEmpty(eventJson)) return;

        StreamWriter[] clients;
        lock (_sseLock) clients = new List<StreamWriter>(_sseClients.Values).ToArray();

        foreach (var client in clients)
        {
            try
            {
                client.Write("data: " + eventJson + "\n\n");
                client.Flush();
            }
            catch { /* dead client is removed by its own read loop */ }
        }
    }
}
