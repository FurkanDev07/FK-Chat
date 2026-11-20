using System;
using System.IO;

namespace FKSohbet;

internal static class AppPaths
{
	public static string DataRoot { get; private set; }

	public static string UserDataDir { get; private set; }

	public static string RuntimeDir { get; private set; }

	public static string WindowStateFile { get; private set; }

	public static string SettingsFile { get; private set; }

	public static void Init()
	{
		string text = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
		if (string.IsNullOrEmpty(text))
		{
			text = Path.GetTempPath();
		}
		DataRoot = Path.Combine(text, "FK Sohbet");
		UserDataDir = Path.Combine(DataRoot, "WebView2");
		RuntimeDir = Path.Combine(DataRoot, "runtime");
		WindowStateFile = Path.Combine(DataRoot, "window.dat");
		SettingsFile = Path.Combine(DataRoot, "settings.ini");
		Directory.CreateDirectory(UserDataDir);
		Directory.CreateDirectory(RuntimeDir);
	}
}
