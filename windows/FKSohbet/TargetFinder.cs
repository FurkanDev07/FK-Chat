using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;

namespace FKSohbet;

internal static class TargetFinder
{
	public struct Placement
	{
		public IntPtr Window;

		public Rectangle Client;

		public Rectangle Monitor;

		public int Dpi;
	}

	public static bool TryFindForeground(OverlayTarget t, out Placement place)
	{
		place = default;
		if (t == null || !t.IsSet)
		{
			return false;
		}
		IntPtr foregroundWindow = ProgramList.Native.GetForegroundWindow();
		if (foregroundWindow == IntPtr.Zero)
		{
			return false;
		}
		ProgramList.Native.GetWindowThreadProcessId(foregroundWindow, out var pid);
		if (pid == 0 || pid == (uint)Process.GetCurrentProcess().Id)
		{
			return false;
		}
		if (!ProgramList.Native.IsWindowVisible(foregroundWindow) || ProgramList.Native.IsIconic(foregroundWindow))
		{
			return false;
		}
		string text = ProgramList.ExePathOf(pid);
		string exe = ((text.Length > 0) ? Path.GetFileName(text) : "");
		if (!t.Matches(exe, ProgramList.WindowTitle(foregroundWindow)))
		{
			return false;
		}
		return TryPlace(foregroundWindow, out place);
	}

	public static bool TryPlace(IntPtr h, out Placement place)
	{
		place = default;
		if (!ProgramList.Native.GetClientRect(h, out var r))
		{
			return false;
		}
		ProgramList.Native.POINT p = default;
		if (!ProgramList.Native.ClientToScreen(h, ref p))
		{
			return false;
		}
		int num = r.Right - r.Left;
		int num2 = r.Bottom - r.Top;
		if (num < 60 || num2 < 40)
		{
			return false;
		}
		IntPtr ıntPtr = OverlayNative.MonitorFromWindow(h, 2u);
		OverlayNative.MONITORINFO mi = new OverlayNative.MONITORINFO
		{
			cbSize = Marshal.SizeOf(typeof(OverlayNative.MONITORINFO))
		};
		if (ıntPtr == IntPtr.Zero || !OverlayNative.GetMonitorInfo(ıntPtr, ref mi))
		{
			return false;
		}
		place = new Placement
		{
			Window = h,
			Client = new Rectangle(p.X, p.Y, num, num2),
			Monitor = mi.rcMonitor.ToRectangle(),
			Dpi = GameDetector.MonitorDpi(ıntPtr)
		};
		return true;
	}

	public static bool IsRunning(OverlayTarget t)
	{
		if (t == null || !t.IsSet)
		{
			return false;
		}
		uint own = (uint)Process.GetCurrentProcess().Id;
		bool found = false;
		ProgramList.Native.EnumWindows((IntPtr h, IntPtr l) =>
		{
			try
			{
				if (!ProgramList.Native.IsWindowVisible(h) || ProgramList.Native.GetWindow(h, 4u) != IntPtr.Zero)
				{
					return true;
				}
				ProgramList.Native.GetWindowThreadProcessId(h, out var pid);
				if (pid == 0 || pid == own)
				{
					return true;
				}
				string text = ProgramList.ExePathOf(pid);
				if (text.Length == 0)
				{
					return true;
				}
				if (t.Matches(Path.GetFileName(text), ProgramList.WindowTitle(h)))
				{
					found = true;
					return false;
				}
			}
			catch
			{
			}
			return true;
		}, IntPtr.Zero);
		return found;
	}
}
