using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace FKSohbet;

internal static class ProgramList
{
	internal static class Native
	{
		public delegate bool EnumProc(IntPtr h, IntPtr l);

		public struct RECT
		{
			public int Left;

			public int Top;

			public int Right;

			public int Bottom;
		}

		public struct POINT
		{
			public int X;

			public int Y;
		}

		[DllImport("user32.dll")]
		public static extern bool EnumWindows(EnumProc cb, IntPtr l);

		[DllImport("user32.dll")]
		public static extern bool IsWindowVisible(IntPtr h);

		[DllImport("user32.dll")]
		public static extern bool IsIconic(IntPtr h);

		[DllImport("user32.dll")]
		public static extern bool IsWindow(IntPtr h);

		[DllImport("user32.dll")]
		public static extern IntPtr GetWindow(IntPtr h, uint cmd);

		[DllImport("user32.dll")]
		public static extern int GetWindowLong(IntPtr h, int i);

		[DllImport("user32.dll")]
		public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

		[DllImport("user32.dll", CharSet = CharSet.Unicode)]
		public static extern int GetWindowTextLength(IntPtr h);

		[DllImport("user32.dll", CharSet = CharSet.Unicode)]
		public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);

		[DllImport("user32.dll", CharSet = CharSet.Unicode)]
		public static extern int GetClassName(IntPtr h, StringBuilder sb, int max);

		[DllImport("user32.dll")]
		public static extern bool GetWindowRect(IntPtr h, out RECT r);

		[DllImport("user32.dll")]
		public static extern bool GetClientRect(IntPtr h, out RECT r);

		[DllImport("user32.dll")]
		public static extern bool ClientToScreen(IntPtr h, ref POINT p);

		[DllImport("user32.dll")]
		public static extern IntPtr GetForegroundWindow();

		[DllImport("user32.dll", CharSet = CharSet.Unicode)]
		public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);

		[DllImport("user32.dll", EntryPoint = "GetClassLongPtrW")]
		private static extern IntPtr GetClassLongPtr64(IntPtr h, int i);

		[DllImport("user32.dll", EntryPoint = "GetClassLongW")]
		private static extern uint GetClassLong32(IntPtr h, int i);

		public static IntPtr GetClassLongPtrSafe(IntPtr h, int i)
		{
			try
			{
				return (IntPtr.Size == 8) ? GetClassLongPtr64(h, i) : ((IntPtr)(int)GetClassLong32(h, i));
			}
			catch
			{
				return IntPtr.Zero;
			}
		}

		[DllImport("dwmapi.dll")]
		public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int value, int size);

		[DllImport("kernel32.dll", SetLastError = true)]
		public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);

		[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
		public static extern bool QueryFullProcessImageName(IntPtr hp, uint flags, StringBuilder sb, ref int size);

		[DllImport("kernel32.dll")]
		public static extern bool CloseHandle(IntPtr h);
	}

	private static readonly string[] SkipClasses = new string[9] { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "MultitaskingViewFrame", "XamlExplorerHostIslandWindow", "ForegroundStaging", "Windows.UI.Core.CoreWindow", "TopLevelWindowForOverflowXamlIsland" };

	private static readonly string[] SkipExes = new string[6] { "explorer.exe", "textinputhost.exe", "shellexperiencehost.exe", "searchhost.exe", "startmenuexperiencehost.exe", "lockapp.exe" };

	private static readonly Dictionary<uint, string> PathCache = new Dictionary<uint, string>();

	private static int _cacheTick = Environment.TickCount;

	public static List<ProgramInfo> Enumerate(bool withIcons = true)
	{
		uint own = (uint)Process.GetCurrentProcess().Id;
		Dictionary<uint, (IntPtr hwnd, long area, string title)> byPid = new Dictionary<uint, (IntPtr, long, string)>();
		Native.EnumWindows((IntPtr h, IntPtr l) =>
		{
			try
			{
				if (!IsCandidate(h, own, out var pid, out var title, out var area))
				{
					return true;
				}
				if (!byPid.TryGetValue(pid, out (IntPtr, long, string) value) || area > value.Item2)
				{
					byPid[pid] = (h, area, title);
				}
			}
			catch
			{
			}
			return true;
		}, IntPtr.Zero);
		List<ProgramInfo> list = new List<ProgramInfo>();
		foreach (KeyValuePair<uint, (IntPtr, long, string)> item in byPid)
		{
			string text = ExePathOf(item.Key);
			string text2 = (string.IsNullOrEmpty(text) ? "" : Path.GetFileName(text));
			if (text2.Length == 0)
			{
				continue;
			}
			bool flag = false;
			string[] skipExes = SkipExes;
			foreach (string b in skipExes)
			{
				if (string.Equals(text2, b, StringComparison.OrdinalIgnoreCase))
				{
					flag = true;
				}
			}
			if (!flag)
			{
				ProgramInfo programInfo = new ProgramInfo
				{
					Pid = (int)item.Key,
					Window = item.Value.Item1,
					Title = item.Value.Item3,
					Exe = text2,
					Path = text
				};
				programInfo.Name = FriendlyName(programInfo);
				programInfo.Tag = TagOf(programInfo);
				if (withIcons)
				{
					programInfo.Icon = IconPng(programInfo.Window, programInfo.Path);
				}
				list.Add(programInfo);
			}
		}
		list.Sort((ProgramInfo a, ProgramInfo programInfo2) => string.Compare(a.Name, programInfo2.Name, StringComparison.CurrentCultureIgnoreCase));
		return list;
	}

	private static bool IsCandidate(IntPtr h, uint own, out uint pid, out string title, out long area)
	{
		pid = 0u;
		title = "";
		area = 0L;
		if (!Native.IsWindowVisible(h))
		{
			return false;
		}
		if (Native.GetWindow(h, 4u) != IntPtr.Zero)
		{
			return false;
		}
		int windowLong = Native.GetWindowLong(h, -20);
		if ((windowLong & 0x80) != 0 && (windowLong & 0x40000) == 0)
		{
			return false;
		}
		if (IsCloaked(h))
		{
			return false;
		}
		Native.GetWindowThreadProcessId(h, out pid);
		if (pid == 0 || pid == own)
		{
			return false;
		}
		title = WindowTitle(h);
		if (title.Length == 0)
		{
			return false;
		}
		StringBuilder stringBuilder = new StringBuilder(256);
		Native.GetClassName(h, stringBuilder, stringBuilder.Capacity);
		string[] skipClasses = SkipClasses;
		foreach (string text in skipClasses)
		{
			if (stringBuilder.ToString() == text)
			{
				return false;
			}
		}
		if (!Native.GetWindowRect(h, out var r))
		{
			return false;
		}
		long num = r.Right - r.Left;
		long num2 = r.Bottom - r.Top;
		bool flag = Native.IsIconic(h);
		if (!flag && (num < 40 || num2 < 40))
		{
			return false;
		}
		area = (flag ? 1 : (num * num2));
		return true;
	}

	public static bool IsCloaked(IntPtr h)
	{
		try
		{
			int value;
			return Native.DwmGetWindowAttribute(h, 14, out value, 4) == 0 && value != 0;
		}
		catch
		{
			return false;
		}
	}

	public static string WindowTitle(IntPtr h)
	{
		int windowTextLength = Native.GetWindowTextLength(h);
		if (windowTextLength <= 0)
		{
			return "";
		}
		StringBuilder stringBuilder = new StringBuilder(Math.Min(windowTextLength, 512) + 1);
		Native.GetWindowText(h, stringBuilder, stringBuilder.Capacity);
		return OverlayTarget.Clean(stringBuilder.ToString(), 200);
	}

	public static string ExePathOf(uint pid)
	{
		if (Environment.TickCount - _cacheTick > 5000)
		{
			PathCache.Clear();
			_cacheTick = Environment.TickCount;
		}
		if (PathCache.TryGetValue(pid, out var value))
		{
			return value;
		}
		string text = "";
		IntPtr ıntPtr = Native.OpenProcess(4096u, inherit: false, pid);
		if (ıntPtr != IntPtr.Zero)
		{
			try
			{
				StringBuilder stringBuilder = new StringBuilder(1024);
				int size = stringBuilder.Capacity;
				if (Native.QueryFullProcessImageName(ıntPtr, 0u, stringBuilder, ref size))
				{
					text = stringBuilder.ToString(0, size);
				}
			}
			finally
			{
				Native.CloseHandle(ıntPtr);
			}
		}
		if (text.Length == 0)
		{
			try
			{
				text = Process.GetProcessById((int)pid).MainModule.FileName;
			}
			catch
			{
			}
		}
		PathCache[pid] = text;
		return text;
	}

	public static string FriendlyName(ProgramInfo p)
	{
		string fileNameWithoutExtension = Path.GetFileNameWithoutExtension(p.Exe);
		if (OverlayTarget.IsGenericHost(p.Exe))
		{
			if (p.Title.Length <= 0)
			{
				return fileNameWithoutExtension;
			}
			return p.Title;
		}
		string text = "";
		try
		{
			FileVersionInfo versionInfo = FileVersionInfo.GetVersionInfo(p.Path);
			text = (versionInfo.FileDescription ?? "").Trim();
			if (text.Length < 2 || text.Length > 60 || text.IndexOf(".exe", StringComparison.OrdinalIgnoreCase) >= 0)
			{
				text = (versionInfo.ProductName ?? "").Trim();
			}
			if (text.Length < 2 || text.Length > 60)
			{
				text = "";
			}
		}
		catch
		{
		}
		if (text.Length > 0)
		{
			return text;
		}
		if (p.Title.Length <= 0 || p.Title.Length > 60)
		{
			return fileNameWithoutExtension;
		}
		return p.Title;
	}

	public static string TagOf(ProgramInfo p)
	{
		string text = (p.Path ?? "").Replace('/', '\\').ToLowerInvariant();
		string text2 = (p.Exe ?? "").ToLowerInvariant();
		if (text.Contains("\\steamapps\\common\\"))
		{
			return "Steam oyunu";
		}
		if (text.Contains("\\epic games\\"))
		{
			return "Epic Games";
		}
		if (text.Contains("\\windowsapps\\") || text.Contains("\\xboxgames\\"))
		{
			return "Microsoft Store / Xbox";
		}
		if (text.Contains("\\riot games\\"))
		{
			return "Riot Games";
		}
		if (text.Contains("\\ubisoft\\"))
		{
			return "Ubisoft";
		}
		if (text.Contains("\\ea games\\") || text.Contains("\\electronic arts\\"))
		{
			return "EA";
		}
		if (text2.StartsWith("godot"))
		{
			return "Godot";
		}
		if (text2 == "javaw.exe" || text2 == "java.exe")
		{
			if (!(p.Title ?? "").StartsWith("Minecraft", StringComparison.OrdinalIgnoreCase))
			{
				return "Java";
			}
			return "Minecraft (Java)";
		}
		if (text2.StartsWith("unity"))
		{
			return "Unity";
		}
		if (text2.EndsWith("-win64-shipping.exe") || text2.EndsWith("-win32-shipping.exe"))
		{
			return "Unreal Engine oyunu";
		}
		return "";
	}

	public static string IconPng(IntPtr hwnd, string path)
	{
		try
		{
			IntPtr ıntPtr = IntPtr.Zero;
			if (hwnd != IntPtr.Zero)
			{
				int[] array = new int[3] { 1, 2, 0 };
				foreach (int num in array)
				{
					if (Native.SendMessageTimeout(hwnd, 127u, (IntPtr)num, IntPtr.Zero, 2u, 120u, out var result) != IntPtr.Zero && result != IntPtr.Zero)
					{
						ıntPtr = result;
						break;
					}
				}
				if (ıntPtr == IntPtr.Zero)
				{
					ıntPtr = Native.GetClassLongPtrSafe(hwnd, -14);
				}
				if (ıntPtr == IntPtr.Zero)
				{
					ıntPtr = Native.GetClassLongPtrSafe(hwnd, -34);
				}
			}
			if (ıntPtr != IntPtr.Zero)
			{
				using Icon ıcon = Icon.FromHandle(ıntPtr);
				using Bitmap src = ıcon.ToBitmap();
				return ToPng32(src);
			}
			if (!string.IsNullOrEmpty(path) && File.Exists(path))
			{
				using Icon ıcon2 = Icon.ExtractAssociatedIcon(path);
				if (ıcon2 != null)
				{
					using (Bitmap src2 = ıcon2.ToBitmap())
					{
						return ToPng32(src2);
					}
				}
			}
		}
		catch
		{
		}
		return "";
	}

	private static string ToPng32(Bitmap src)
	{
		using Bitmap bitmap = new Bitmap(32, 32, PixelFormat.Format32bppArgb);
		using (Graphics graphics = Graphics.FromImage(bitmap))
		{
			graphics.Clear(Color.Transparent);
			graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
			graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
			graphics.DrawImage(src, new Rectangle(0, 0, 32, 32));
		}
		using MemoryStream memoryStream = new MemoryStream();
		bitmap.Save(memoryStream, ImageFormat.Png);
		return "data:image/png;base64," + Convert.ToBase64String(memoryStream.ToArray());
	}
}
