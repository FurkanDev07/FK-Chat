using System;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace FKSohbet;

internal static class WebViewRuntime
{
	public static string Version { get; private set; }

	public static bool Prepare(string loaderDir)
	{
		CoreWebView2Environment.SetLoaderDllFolderPath(loaderDir);
		do
		{
			string text = null;
			try
			{
				text = CoreWebView2Environment.GetAvailableBrowserVersionString((string)null, (CoreWebView2EnvironmentOptions)null);
			}
			catch (WebView2RuntimeNotFoundException)
			{
			}
			catch (Exception)
			{
			}
			if (!string.IsNullOrEmpty(text))
			{
				Version = text;
				return true;
			}
			if (MessageBox.Show("FK Sohbet'in çalışması için Microsoft Edge WebView2 Runtime gereklidir, ancak bu bilgisayarda bulunamadı.\n\nWindows 11 ve güncel Windows 10 sürümlerinde genellikle yüklü gelir.\n\nMicrosoft'un resmi WebView2 kurulum dosyası şimdi indirilsin mi?", "FK Sohbet", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation) != DialogResult.Yes)
			{
				return false;
			}
			Program.OpenExternal("https://go.microsoft.com/fwlink/p/?LinkId=2124703");
		}
		while (MessageBox.Show("İndirilen kurulum dosyasını çalıştırın. Kurulum tamamlandıktan sonra FK Sohbet'i başlatmak için \"Yeniden dene\"ye tıklayın.", "FK Sohbet", MessageBoxButtons.RetryCancel, MessageBoxIcon.Asterisk) == DialogResult.Retry);
		return false;
	}
}
