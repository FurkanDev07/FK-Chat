using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace FKSohbet;

internal static class LegacyMigration
{
	private const string OldName = "MC Sohbet";

	private const string OldMutexName = "Local\\MCSohbet.SingleInstance.v1";

	private const string OldOrigin = "https://mcsohbet.example";

	private const string OldStorageKey = "mcsohbet.settings.v1";

	private const string NewStorageKey = "fksohbet.settings.v1";

	private const string FlagName = "migrate-storage.flag";

	private static string FlagFile => Path.Combine(AppPaths.DataRoot, "migrate-storage.flag");

	public static void MoveDataFolder()
	{
		try
		{
			string folderPath = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
			if (string.IsNullOrEmpty(folderPath))
			{
				return;
			}
			string text = Path.Combine(folderPath, "MC Sohbet");
			string text2 = Path.Combine(folderPath, "FK Sohbet");
			if (!Directory.Exists(text) || Directory.Exists(text2))
			{
				return;
			}
			while (OldAppRunning())
			{
				if (MessageBox.Show("MC Sohbet'in adı artık FK Sohbet.\n\nAyarlarının (mikrofon, hoparlör, ses düzeyleri) FK Sohbet'e taşınabilmesi için açık olan MC Sohbet'i kapat (tepsi simgesine sağ tıklayıp Çıkış), sonra \"Yeniden dene\"ye tıkla.\n\n\"İptal\": ayarlar taşınmadan devam edilir.", "FK Sohbet", MessageBoxButtons.RetryCancel, MessageBoxIcon.Asterisk) != DialogResult.Retry)
				{
					return;
				}
				Thread.Sleep(500);
			}
			Directory.Move(text, text2);
			File.WriteAllText(Path.Combine(text2, "migrate-storage.flag"), "1");
		}
		catch
		{
		}
	}

	private static bool OldAppRunning()
	{
		try
		{
			if (Mutex.TryOpenExisting("Local\\MCSohbet.SingleInstance.v1", out var result))
			{
				result.Dispose();
				return true;
			}
		}
		catch (UnauthorizedAccessException)
		{
			return true;
		}
		catch
		{
		}
		return false;
	}

	public static void MoveAutostart()
	{
		try
		{
			bool flag;
			using (RegistryKey registryKey = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run", writable: true))
			{
				if (registryKey == null)
				{
					return;
				}
				flag = registryKey.GetValue("MC Sohbet") is string text && text.Length > 0;
				if (flag)
				{
					registryKey.DeleteValue("MC Sohbet", throwOnMissingValue: false);
				}
			}
			if (flag)
			{
				HostSettings.SetAutostart(enable: true);
			}
		}
		catch
		{
		}
	}

	public static async Task CopyLocalStorageAsync(CoreWebView2 core)
	{
		if (!File.Exists(FlagFile))
		{
			return;
		}
		try
		{
			File.Delete(FlagFile);
		}
		catch
		{
		}
		EventHandler<CoreWebView2WebResourceRequestedEventArgs> serveBlank = (object s, CoreWebView2WebResourceRequestedEventArgs e) =>
		{
			if (e.Request.Uri.StartsWith("https://mcsohbet.example/", StringComparison.OrdinalIgnoreCase))
			{
				byte[] bytes = Encoding.UTF8.GetBytes("<!doctype html><meta charset=\"utf-8\"><title></title>");
				e.Response = core.Environment.CreateWebResourceResponse((Stream)new MemoryStream(bytes, writable: false), 200, "OK", "Content-Type: text/html; charset=utf-8");
			}
		};
		TaskCompletionSource<bool> loaded = new TaskCompletionSource<bool>();
		EventHandler<CoreWebView2NavigationCompletedEventArgs> done = (object s, CoreWebView2NavigationCompletedEventArgs e) =>
		{
			loaded.TrySetResult(e.IsSuccess);
		};
		try
		{
			core.AddWebResourceRequestedFilter("https://mcsohbet.example/*", (CoreWebView2WebResourceContext)0);
			core.WebResourceRequested += serveBlank;
			core.NavigationCompleted += done;
			core.Navigate("https://mcsohbet.example/migrate.html");
			if (await Task.WhenAny(loaded.Task, Task.Delay(5000)) != loaded.Task || !loaded.Task.Result)
			{
				return;
			}
			string text = SafeSettingsLiteral(await core.ExecuteScriptAsync("localStorage.getItem('mcsohbet.settings.v1')"));
			if (text == null)
			{
				return;
			}
			await core.AddScriptToExecuteOnDocumentCreatedAsync("try{if(!localStorage.getItem('fksohbet.settings.v1'))localStorage.setItem('fksohbet.settings.v1'," + text + ");}catch(e){}");
			try
			{
				await core.ExecuteScriptAsync("localStorage.removeItem('mcsohbet.settings.v1')");
			}
			catch
			{
			}
		}
		catch
		{
		}
		finally
		{
			try
			{
				core.NavigationCompleted -= done;
			}
			catch
			{
			}
			try
			{
				core.WebResourceRequested -= serveBlank;
			}
			catch
			{
			}
			try
			{
				core.RemoveWebResourceRequestedFilter("https://mcsohbet.example/*", (CoreWebView2WebResourceContext)0);
			}
			catch
			{
			}
		}
	}

	private static string SafeSettingsLiteral(string raw)
	{
		if (string.IsNullOrEmpty(raw) || raw == "null" || raw.Length > 65536)
		{
			return null;
		}
		try
		{
			JavaScriptSerializer javaScriptSerializer = new JavaScriptSerializer();
			if (!(javaScriptSerializer.DeserializeObject(raw) is string text))
			{
				return null;
			}
			if (!(javaScriptSerializer.DeserializeObject(text) is Dictionary<string, object>))
			{
				return null;
			}
			return javaScriptSerializer.Serialize(text);
		}
		catch
		{
			return null;
		}
	}
}
