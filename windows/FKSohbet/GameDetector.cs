using System;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;

namespace FKSohbet;

internal static class GameDetector
{
	public struct Target
	{
		public IntPtr Window;

		public Rectangle Monitor;

		public int Dpi;
	}

	private static readonly string[] ShellClasses = new string[9] { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "MultitaskingViewFrame", "XamlExplorerHostIslandWindow", "ForegroundStaging", "LockScreenBackstopFrame", "Windows.UI.Core.CoreWindow" };

	public static bool TryFind(out Target target)
	{
		target = default;
		IntPtr foregroundWindow = OverlayNative.GetForegroundWindow();
		if (foregroundWindow == IntPtr.Zero)
		{
			return false;
		}
		OverlayNative.GetWindowThreadProcessId(foregroundWindow, out var pid);
		if (pid == (uint)Process.GetCurrentProcess().Id)
		{
			return false;
		}
		if (!OverlayNative.IsWindowVisible(foregroundWindow) || OverlayNative.IsIconic(foregroundWindow))
		{
			return false;
		}
		StringBuilder stringBuilder = new StringBuilder(256);
		OverlayNative.GetClassName(foregroundWindow, stringBuilder, stringBuilder.Capacity);
		string text = stringBuilder.ToString();
		string[] shellClasses = ShellClasses;
		foreach (string text2 in shellClasses)
		{
			if (text == text2)
			{
				return false;
			}
		}
		IntPtr ıntPtr = OverlayNative.MonitorFromWindow(foregroundWindow, 2u);
		OverlayNative.MONITORINFO mi = new OverlayNative.MONITORINFO
		{
			cbSize = Marshal.SizeOf(typeof(OverlayNative.MONITORINFO))
		};
		if (ıntPtr == IntPtr.Zero || !OverlayNative.GetMonitorInfo(ıntPtr, ref mi))
		{
			return false;
		}
		Rectangle monitor = mi.rcMonitor.ToRectangle();
		bool flag = false;
		if (OverlayNative.GetWindowRect(foregroundWindow, out var r))
		{
			Rectangle rectangle = r.ToRectangle();
			flag = rectangle.Left <= monitor.Left && rectangle.Top <= monitor.Top && rectangle.Right >= monitor.Right && rectangle.Bottom >= monitor.Bottom;
		}
		if (!flag)
		{
			try
			{
				flag = OverlayNative.SHQueryUserNotificationState(out var state) == 0 && state == 3;
			}
			catch
			{
			}
		}
		if (!flag)
		{
			return false;
		}
		target = new Target
		{
			Window = foregroundWindow,
			Monitor = monitor,
			Dpi = MonitorDpi(ıntPtr)
		};
		return true;
	}

	public static int MonitorDpi(IntPtr mon)
	{
		try
		{
			if (OverlayNative.GetDpiForMonitor(mon, 0, out var dpiX, out var _) == 0 && dpiX >= 48 && dpiX <= 960)
			{
				return (int)dpiX;
			}
		}
		catch
		{
		}
		return 96;
	}
}
