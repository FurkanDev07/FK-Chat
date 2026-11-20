using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;

namespace FKSohbet;

internal static class WebAssets
{
	public const string Host = "fksohbet.example";

	public const string Origin = "https://fksohbet.example";

	public const string StartUrl = "https://fksohbet.example/index.html";

	private const string Prefix = "web/";

	private static readonly Dictionary<string, string> Resources;

	public static int Count => Resources.Count;

	static WebAssets()
	{
		Resources = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
		string[] manifestResourceNames = Assembly.GetExecutingAssembly().GetManifestResourceNames();
		foreach (string text in manifestResourceNames)
		{
			string text2 = text.Replace('\\', '/');
			if (text2.StartsWith("web/", StringComparison.Ordinal))
			{
				Resources[text2.Substring("web/".Length)] = text;
			}
		}
	}

	public static bool IsAppUrl(string url)
	{
		if (Uri.TryCreate(url, UriKind.Absolute, out var result) && result.Scheme == Uri.UriSchemeHttps && string.Equals(result.Host, "fksohbet.example", StringComparison.OrdinalIgnoreCase))
		{
			return result.IsDefaultPort;
		}
		return false;
	}

	public static byte[] Get(string url, out string contentType)
	{
		contentType = null;
		if (!Uri.TryCreate(url, UriKind.Absolute, out var result) || !IsAppUrl(url))
		{
			return null;
		}
		string text = Uri.UnescapeDataString(result.AbsolutePath).TrimStart('/');
		if (text.Length == 0)
		{
			text = "index.html";
		}
		if (text.Contains(".."))
		{
			return null;
		}
		if (!Resources.TryGetValue(text, out var value))
		{
			return null;
		}
		contentType = ContentType(text);
		return EmbeddedAssemblies.ReadResource(value);
	}

	private static string ContentType(string path)
	{
		return Path.GetExtension(path).ToLowerInvariant() switch
		{
			".html" => "text/html; charset=utf-8",
			".js" => "text/javascript; charset=utf-8",
			".css" => "text/css; charset=utf-8",
			".png" => "image/png",
			".svg" => "image/svg+xml",
			".ico" => "image/x-icon",
			".json" => "application/json; charset=utf-8",
			".txt" => "text/plain; charset=utf-8",
			".wav" => "audio/wav",
			_ => "application/octet-stream",
		};
	}
}
