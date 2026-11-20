using System;
using System.Runtime.InteropServices;

namespace FKSohbet;

internal static class Native
{
	public delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

	public const int WM_HOTKEY = 786;

	public const uint MOD_ALT = 1u;

	public const uint MOD_CONTROL = 2u;

	public const uint MOD_SHIFT = 4u;

	public const uint MOD_WIN = 8u;

	public const uint MOD_NOREPEAT = 16384u;

	public const int WH_KEYBOARD_LL = 13;

	public const int WM_KEYDOWN = 256;

	public const int WM_SYSKEYDOWN = 260;

	[DllImport("user32.dll", SetLastError = true)]
	public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

	[DllImport("user32.dll", SetLastError = true)]
	public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

	[DllImport("user32.dll", SetLastError = true)]
	public static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);

	[DllImport("user32.dll", SetLastError = true)]
	public static extern bool UnhookWindowsHookEx(IntPtr hhk);

	[DllImport("user32.dll")]
	public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

	[DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
	public static extern IntPtr GetModuleHandle(string lpModuleName);

	[DllImport("user32.dll")]
	public static extern short GetAsyncKeyState(int vKey);

	[DllImport("user32.dll")]
	private static extern bool SetForegroundWindow(IntPtr hWnd);

	[DllImport("dwmapi.dll")]
	private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

	public static void UseDarkTitleBar(IntPtr hwnd)
	{
		try
		{
			int value = 1;
			if (DwmSetWindowAttribute(hwnd, 20, ref value, 4) != 0)
			{
				DwmSetWindowAttribute(hwnd, 19, ref value, 4);
			}
		}
		catch
		{
		}
	}

	public static void ForceForeground(IntPtr hwnd)
	{
		try
		{
			SetForegroundWindow(hwnd);
		}
		catch
		{
		}
	}
}
