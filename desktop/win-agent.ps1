param([switch]$Once)
# Read-only Win32 discovery. No DLL injection, keyboard emulation, or orders.
# One persistent PowerShell process avoids repeatedly starting Windows PowerShell.
# A 250ms tick tracks manual window movement while reducing native enumeration CPU
# compared with the original 160ms sampling interval.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public sealed class WindowSnapshot {
  public string id { get; set; }
  public int pid { get; set; }
  public string exe { get; set; }
  public string title { get; set; }
  public int left { get; set; }
  public int top { get; set; }
  public int width { get; set; }
  public int height { get; set; }
  public bool minimized { get; set; }
}
public static class H00kWindowAgent {
  private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lparam);
  [StructLayout(LayoutKind.Sequential)] private struct RECT {
    public int Left, Top, Right, Bottom;
  }
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern int GetWindowTextLengthW(IntPtr hwnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowTextW(IntPtr hwnd, StringBuilder text, int max);
  [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out RECT bounds, int size);
  [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")] private static extern int DwmGetWindowAttributeInt(IntPtr hwnd, int attribute, out int value, int size);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassNameW(IntPtr hwnd, StringBuilder value, int size);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr hwnd, uint command);
  [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

  public static void EnablePhysicalDpi() {
    try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { /* older Windows */ }
  }
  public static List<WindowSnapshot> Snapshot() {
    var windows = new List<WindowSnapshot>();
    EnumWindows((hwnd, _) => {
      try {
        if (!IsWindowVisible(hwnd) || GetWindow(hwnd, 4) != IntPtr.Zero) return true;
        int cloaked;
        try {
          if (DwmGetWindowAttributeInt(hwnd, 14, out cloaked, sizeof(int)) == 0
              && cloaked != 0) return true;
        } catch { /* DWM unavailable */ }
        var className = new StringBuilder(128);
        GetClassNameW(hwnd, className, className.Capacity);
        var windowClass = className.ToString();
        if (windowClass == "Progman" || windowClass == "WorkerW"
            || windowClass == "Shell_TrayWnd" || windowClass == "Shell_SecondaryTrayWnd") return true;
        // Many real apps have no caption text. Their visible bounds must
        // still block unsafe automatic docking, even if not offered as a target.
        var len = GetWindowTextLengthW(hwnd);
        if (len > 512) return true;
        var title = new StringBuilder(Math.Max(2, len + 1));
        if (len > 0) GetWindowTextW(hwnd, title, title.Capacity);
        RECT bounds;
        if (!GetWindowRect(hwnd, out bounds)) return true;
        // GetWindowRect may include invisible Windows resize borders (visible as a black seam).
        // DWM's extended-frame bounds represent the actual visible target boundary.
        RECT visible;
        try {
          if (DwmGetWindowAttribute(hwnd, 9, out visible, Marshal.SizeOf(typeof(RECT))) == 0
            && visible.Right > visible.Left && visible.Bottom > visible.Top)
            bounds = visible;
        } catch { /* older Windows or DWM unavailable: use GetWindowRect */ }
        if (bounds.Right - bounds.Left < 140 || bounds.Bottom - bounds.Top < 80) return true;
        uint pid;
        GetWindowThreadProcessId(hwnd, out pid);
        if (pid == 0 || pid == Process.GetCurrentProcess().Id) return true;
        // Protected/elevated processes can deny name lookup. Keep the visible
        // window available in the manual picker instead of silently dropping it.
        string processName;
        try { processName = Process.GetProcessById((int)pid).ProcessName; }
        catch { processName = "Unknown"; }
        windows.Add(new WindowSnapshot {
          id = hwnd.ToInt64().ToString(),
          pid = (int)pid, exe = processName, title = title.ToString(),
          left = bounds.Left, top = bounds.Top,
          width = bounds.Right - bounds.Left, height = bounds.Bottom - bounds.Top,
          minimized = IsIconic(hwnd)
        });
      } catch { /* windows may close during enumeration; protected processes may deny details */ }
      return true;
    }, IntPtr.Zero);
    return windows;
  }
}
'@
[H00kWindowAgent]::EnablePhysicalDpi()

# Windows 7 SP1 ships with PowerShell 2.0, which lacks ConvertTo-Json.
# Use the built-in .NET Framework serializer without downloading software.
$legacySerializer = $null
if (-not (Get-Command ConvertTo-Json -ErrorAction SilentlyContinue)) {
  try {
    Add-Type -AssemblyName System.Web.Extensions
    $legacySerializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  } catch {
    [Console]::Error.WriteLine('H00K_LEGACY_JSON_UNAVAILABLE: .NET Framework System.Web.Extensions is required on Windows 7')
    exit 43
  }
}
# ECO is configured only by the local Electron main process, never by h00k.top.
# Do not let malformed or unbounded environment values stall window recovery.
$pollIntervalMs = 250
if ($env:H00K_AGENT_INTERVAL_MS -match '^[0-9]{1,4}$') {
  $candidate = [int]$env:H00K_AGENT_INTERVAL_MS
  if ($candidate -ge 250 -and $candidate -le 3000) { $pollIntervalMs = $candidate }
}
while ($true) {
  try {
    $current = @([H00kWindowAgent]::Snapshot())
    $json = if ($null -ne $legacySerializer) {
      $legacySerializer.Serialize($current)
    } else {
      ConvertTo-Json -InputObject $current -Depth 4 -Compress
    }
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
  } catch {
    [Console]::Out.WriteLine('[]')
    [Console]::Out.Flush()
  }
  if ($Once) { break }
  Start-Sleep -Milliseconds $pollIntervalMs
}
