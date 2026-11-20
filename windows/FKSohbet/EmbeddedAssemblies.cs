using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace FKSohbet;

internal static class EmbeddedAssemblies
{
	private static readonly object Sync = new object();

	private static Assembly _core;

	private static Assembly _winforms;

	public static Assembly Resolve(object sender, ResolveEventArgs args)
	{
		string name = new AssemblyName(args.Name).Name;
		lock (Sync)
		{
			if (name == "Microsoft.Web.WebView2.Core")
			{
				return _core ?? (_core = Load("dep.Microsoft.Web.WebView2.Core.dll"));
			}
			if (name == "Microsoft.Web.WebView2.WinForms")
			{
				return _winforms ?? (_winforms = Load("dep.Microsoft.Web.WebView2.WinForms.dll"));
			}
		}
		return null;
	}

	private static Assembly Load(string resource)
	{
		byte[] array = ReadResource(resource);
		if (array != null)
		{
			return Assembly.Load(array);
		}
		return null;
	}

	internal static byte[] ReadResource(string resource)
	{
		using Stream stream = typeof(EmbeddedAssemblies).Assembly.GetManifestResourceStream(resource);
		if (stream == null)
		{
			return null;
		}
		using MemoryStream memoryStream = new MemoryStream();
		stream.CopyTo(memoryStream);
		return memoryStream.ToArray();
	}

	public static string ExtractNativeLoader(string runtimeRoot)
	{
		string text = RuntimeInformation.ProcessArchitecture switch
		{
			Architecture.X86 => "x86",
			Architecture.Arm64 => "arm64",
			_ => "x64",
		};
		byte[] array = ReadResource("native." + text + ".WebView2Loader.dll");
		if (array == null)
		{
			throw new InvalidOperationException("WebView2Loader (" + text + ") bulunamadı.");
		}
		string text2;
		using (SHA256 sHA = SHA256.Create())
		{
			text2 = BitConverter.ToString(sHA.ComputeHash(array), 0, 8).Replace("-", "").ToLowerInvariant();
		}
		string text3 = Path.Combine(runtimeRoot, text + "-" + text2);
		string text4 = Path.Combine(text3, "WebView2Loader.dll");
		Directory.CreateDirectory(text3);
		if (!File.Exists(text4) || new FileInfo(text4).Length != array.Length)
		{
			string text5 = text4 + "." + Guid.NewGuid().ToString("N") + ".tmp";
			File.WriteAllBytes(text5, array);
			try
			{
				if (File.Exists(text4))
				{
					File.Delete(text4);
				}
				File.Move(text5, text4);
			}
			catch
			{
				try
				{
					File.Delete(text5);
				}
				catch
				{
				}
				if (!File.Exists(text4))
				{
					throw;
				}
			}
		}
		return text3;
	}
}
