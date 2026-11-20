using System;
using System.Text;

namespace FKSohbet;

internal sealed class OverlayTarget
{
	public string Exe = "";

	public string Path = "";

	public string Title = "";

	public string Name = "";

	public string Icon = "";

	private static readonly string[] GenericHosts = new string[13]
	{
		"javaw.exe", "java.exe", "python.exe", "pythonw.exe", "py.exe", "node.exe", "electron.exe", "applicationframehost.exe", "rundll32.exe", "dllhost.exe",
		"mono.exe", "love.exe", "nw.exe"
	};

	public bool IsSet => !string.IsNullOrEmpty(Exe);

	public static bool IsGenericHost(string exe)
	{
		if (string.IsNullOrEmpty(exe))
		{
			return false;
		}
		string text = exe.ToLowerInvariant();
		string[] genericHosts = GenericHosts;
		foreach (string text2 in genericHosts)
		{
			if (text == text2)
			{
				return true;
			}
		}
		if (text.StartsWith("python", StringComparison.Ordinal))
		{
			return text.EndsWith(".exe", StringComparison.Ordinal);
		}
		return false;
	}

	public static string TitleKey(string title)
	{
		if (string.IsNullOrWhiteSpace(title))
		{
			return "";
		}
		StringBuilder stringBuilder = new StringBuilder();
		string text = title.Trim();
		foreach (char c in text)
		{
			if (char.IsLetter(c) || (stringBuilder.Length > 0 && char.IsDigit(c)) || (stringBuilder.Length > 0 && (c == '\'' || c == '_')))
			{
				stringBuilder.Append(c);
			}
			else if (stringBuilder.Length > 0)
			{
				break;
			}
		}
		if (stringBuilder.Length < 2)
		{
			return "";
		}
		return stringBuilder.ToString();
	}

	public bool Matches(string exe, string title)
	{
		if (!IsSet || string.IsNullOrEmpty(exe))
		{
			return false;
		}
		if (!string.Equals(exe, Exe, StringComparison.OrdinalIgnoreCase))
		{
			return false;
		}
		if (!IsGenericHost(Exe))
		{
			return true;
		}
		string text = TitleKey(Title);
		if (text.Length == 0)
		{
			return true;
		}
		return (title ?? "").TrimStart().StartsWith(text, StringComparison.OrdinalIgnoreCase);
	}

	public static string Clean(string s, int max)
	{
		s = (s ?? "").Replace("\r", " ").Replace("\n", " ").Replace("\0", "")
			.Trim();
		if (s.Length <= max)
		{
			return s;
		}
		return s.Substring(0, max);
	}
}
