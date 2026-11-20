using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;

namespace FKSohbet;

internal static class OverlayNative
{
	public struct POINT(int x, int y)
	{
		public int X = x;

		public int Y = y;
	}

	public struct SIZE(int cx, int cy)
	{
		public int CX = cx;

		public int CY = cy;
	}

	[StructLayout(LayoutKind.Sequential, Pack = 1)]
	public struct BLENDFUNCTION
	{
		public byte BlendOp;

		public byte BlendFlags;

		public byte SourceConstantAlpha;

		public byte AlphaFormat;
	}

	public struct RECT
	{
		public int Left;

		public int Top;

		public int Right;

		public int Bottom;

		public Rectangle ToRectangle()
		{
			return Rectangle.FromLTRB(Left, Top, Right, Bottom);
		}
	}

	public struct MONITORINFO
	{
		public int cbSize;

		public RECT rcMonitor;

		public RECT rcWork;

		public uint dwFlags;
	}

	public const int WS_EX_LAYERED = 524288;

	public const int WS_EX_TRANSPARENT = 32;

	public const int WS_EX_TOOLWINDOW = 128;

	public const int WS_EX_NOACTIVATE = 134217728;

	public const int WS_EX_TOPMOST = 8;

	public const int WM_NCHITTEST = 132;

	public const int HTTRANSPARENT = -1;

	public const int WM_MOUSEACTIVATE = 33;

	public const int MA_NOACTIVATE = 3;

	public const int SW_SHOWNOACTIVATE = 4;

	public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);

	public const uint SWP_NOSIZE = 1u;

	public const uint SWP_NOMOVE = 2u;

	public const uint SWP_NOACTIVATE = 16u;

	public const uint SWP_NOOWNERZORDER = 512u;

	[DllImport("user32.dll")]
	public static extern IntPtr GetDC(IntPtr hWnd);

	[DllImport("user32.dll")]
	public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

	[DllImport("gdi32.dll")]
	public static extern IntPtr CreateCompatibleDC(IntPtr hDC);

	[DllImport("gdi32.dll")]
	public static extern bool DeleteDC(IntPtr hdc);

	[DllImport("gdi32.dll")]
	public static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);

	[DllImport("gdi32.dll")]
	public static extern bool DeleteObject(IntPtr hObject);

	[DllImport("user32.dll", SetLastError = true)]
	public static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize, IntPtr hdcSrc, ref POINT pprSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);

	[DllImport("user32.dll")]
	public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

	[DllImport("user32.dll")]
	public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);

	[DllImport("user32.dll")]
	public static extern IntPtr GetForegroundWindow();

	[DllImport("user32.dll")]
	public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);

	[DllImport("user32.dll")]
	public static extern bool IsWindowVisible(IntPtr hWnd);

	[DllImport("user32.dll")]
	public static extern bool IsIconic(IntPtr hWnd);

	[DllImport("user32.dll", CharSet = CharSet.Unicode)]
	public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);

	[DllImport("user32.dll")]
	public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);

	[DllImport("user32.dll")]
	public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);

	[DllImport("user32.dll", CharSet = CharSet.Unicode)]
	public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO mi);

	[DllImport("shell32.dll")]
	public static extern int SHQueryUserNotificationState(out int state);

	[DllImport("shcore.dll")]
	public static extern int GetDpiForMonitor(IntPtr hmonitor, int type, out uint dpiX, out uint dpiY);
}
