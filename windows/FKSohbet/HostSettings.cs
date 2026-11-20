using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

namespace FKSohbet;

internal static class HostSettings
{
	public static bool Notifications = true;

	public static bool Background = true;

	public static bool Hotkey = true;

	public static string HotkeyDisplay = "Ctrl + Shift + M";

	public static string HotkeyKey = "M";

	public static uint HotkeyVk = 77u;

	public static uint HotkeyModifiers = 16390u;

	public static bool Overlay = true;

	public static string TargetExe = "";

	public static string TargetPath = "";

	public static string TargetTitle = "";

	public static string TargetName = "";

	public static string TargetIcon = "";

	public static bool TrayHintShown;

	private const string RunKey = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";

	private const string RunValue = "FK Sohbet";

	public static OverlayTarget Target => new OverlayTarget
	{
		Exe = TargetExe,
		Path = TargetPath,
		Title = TargetTitle,
		Name = TargetName,
		Icon = TargetIcon
	};

	private static string RunCommand => "\"" + Application.ExecutablePath + "\" --autostart";

	public static bool Autostart
	{
		get
		{
			try
			{
				using RegistryKey registryKey = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run", writable: false);
				return registryKey?.GetValue("FK Sohbet") is string text && text.Length > 0;
			}
			catch
			{
				return false;
			}
		}
	}

	public static void Load()
	{
		try
		{
			if (!File.Exists(AppPaths.SettingsFile))
			{
				return;
			}
			Dictionary<string, string> dictionary = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
			string[] array = File.ReadAllLines(AppPaths.SettingsFile, Encoding.UTF8);
			foreach (string text in array)
			{
				int num = text.IndexOf('=');
				if (num > 0)
				{
					dictionary[text.Substring(0, num).Trim()] = text.Substring(num + 1).Trim();
				}
			}
			Notifications = Bool(dictionary, "notifications", Notifications);
			Background = Bool(dictionary, "background", Background);
			Hotkey = Bool(dictionary, "hotkey", Hotkey);
			HotkeyDisplay = Val(dictionary, "hotkeyDisplay", 50);
			if (string.IsNullOrEmpty(HotkeyDisplay))
			{
				HotkeyDisplay = "Ctrl + Shift + M";
			}
			HotkeyKey = Val(dictionary, "hotkeyKey", 20);
			if (string.IsNullOrEmpty(HotkeyKey))
			{
				HotkeyKey = "M";
			}
			HotkeyVk = Uint(dictionary, "hotkeyVk", HotkeyVk);
			HotkeyModifiers = Uint(dictionary, "hotkeyModifiers", HotkeyModifiers);
			Overlay = Bool(dictionary, "overlay", Overlay);
			TargetExe = Val(dictionary, "targetExe", 260);
			TargetPath = Val(dictionary, "targetPath", 1024);
			TargetTitle = Val(dictionary, "targetTitle", 200);
			TargetName = Val(dictionary, "targetName", 120);
			TargetIcon = Val(dictionary, "targetIcon", 20000);
			if (!TargetExe.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
			{
				TargetExe = (TargetPath = (TargetTitle = (TargetName = (TargetIcon = ""))));
			}
			TrayHintShown = Bool(dictionary, "trayHintShown", TrayHintShown);
		}
		catch
		{
		}
		try
		{
			if (Autostart)
			{
				SetAutostart(enable: true);
			}
		}
		catch
		{
		}
	}

	public static void Save()
	{
		try
		{
			string contents = string.Join("\r\n", "notifications=" + Str(Notifications), "background=" + Str(Background), "hotkey=" + Str(Hotkey), "hotkeyDisplay=" + OverlayTarget.Clean(HotkeyDisplay, 50), "hotkeyKey=" + OverlayTarget.Clean(HotkeyKey, 20), "hotkeyVk=" + HotkeyVk.ToString(CultureInfo.InvariantCulture), "hotkeyModifiers=" + HotkeyModifiers.ToString(CultureInfo.InvariantCulture), "overlay=" + Str(Overlay), "targetExe=" + OverlayTarget.Clean(TargetExe, 260), "targetPath=" + OverlayTarget.Clean(TargetPath, 1024), "targetTitle=" + OverlayTarget.Clean(TargetTitle, 200), "targetName=" + OverlayTarget.Clean(TargetName, 120), "targetIcon=" + (TargetIcon.StartsWith("data:image/png;base64,") ? OverlayTarget.Clean(TargetIcon, 20000) : ""), "trayHintShown=" + Str(TrayHintShown));
			string text = AppPaths.SettingsFile + ".tmp";
			File.WriteAllText(text, contents, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
			if (File.Exists(AppPaths.SettingsFile))
			{
				File.Delete(AppPaths.SettingsFile);
			}
			File.Move(text, AppPaths.SettingsFile);
		}
		catch
		{
		}
	}

	private static string Val(Dictionary<string, string> map, string key, int max)
	{
		if (!map.TryGetValue(key, out var value))
		{
			return "";
		}
		return OverlayTarget.Clean(value, max);
	}

	public static bool SetAutostart(bool enable)
	{
		try
		{
			using (RegistryKey registryKey = Registry.CurrentUser.CreateSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run"))
			{
				if (registryKey == null)
				{
					return false;
				}
				if (enable)
				{
					if (!string.Equals(registryKey.GetValue("FK Sohbet") as string, RunCommand, StringComparison.OrdinalIgnoreCase))
					{
						registryKey.SetValue("FK Sohbet", RunCommand, RegistryValueKind.String);
					}
				}
				else if (registryKey.GetValue("FK Sohbet") != null)
				{
					registryKey.DeleteValue("FK Sohbet", throwOnMissingValue: false);
				}
			}
			return Autostart == enable;
		}
		catch
		{
			return false;
		}
	}

	private static bool Bool(Dictionary<string, string> m, string key, bool def)
	{
		if (!m.TryGetValue(key, out var value))
		{
			return def;
		}
		if (!(value == "1"))
		{
			return value.Equals("true", StringComparison.OrdinalIgnoreCase);
		}
		return true;
	}

	private static uint Uint(Dictionary<string, string> m, string key, uint def)
	{
		if (!m.TryGetValue(key, out var value) || string.IsNullOrEmpty(value))
		{
			return def;
		}
		if (uint.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var result))
		{
			return result;
		}
		return def;
	}

	private static string Str(bool b)
	{
		if (!b)
		{
			return "0";
		}
		return "1";
	}
}
