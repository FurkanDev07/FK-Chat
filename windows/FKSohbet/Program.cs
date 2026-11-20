using System;
using System.Diagnostics;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Windows.Forms;

namespace FKSohbet;

internal static class Program
{
	public const string AppName = "FK Sohbet";

	public const string RuntimeDownloadUrl = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

	private const string MutexName = "Local\\FKSohbet.SingleInstance.v1";

	private const string ShowEventName = "Local\\FKSohbet.Show.v1";

	private static int _reporting;

	public static string Version
	{
		get
		{
			Version version = typeof(Program).Assembly.GetName().Version;
			return version.Major + "." + version.Minor + "." + version.Build;
		}
	}

	public static bool StartedByAutostart { get; private set; }

	[STAThread]
	private static int Main(string[] args)
	{
		AppDomain.CurrentDomain.AssemblyResolve += EmbeddedAssemblies.Resolve;
		if (args.Length >= 1 && args[0] == "--overlay-test-game")
		{
			Application.EnableVisualStyles();
			return OverlaySelfTest.RunTestGame(args.Length > 1 && args[1] == "windowed", (args.Length > 2) ? args[2] : null);
		}
		if (args.Length >= 2 && args[0] == "--overlay-selftest")
		{
			Application.EnableVisualStyles();
			Application.SetCompatibleTextRenderingDefault(defaultValue: false);
			return OverlaySelfTest.Run(args[1]);
		}
		StartedByAutostart = args.Any((string a) => string.Equals(a, "--autostart", StringComparison.OrdinalIgnoreCase));
		bool createdNew;
		using Mutex obj = new Mutex(initiallyOwned: true, "Local\\FKSohbet.SingleInstance.v1", out createdNew);
		using EventWaitHandle eventWaitHandle = new EventWaitHandle(initialState: false, EventResetMode.AutoReset, "Local\\FKSohbet.Show.v1");
		if (!createdNew)
		{
			if (!StartedByAutostart)
			{
				eventWaitHandle.Set();
			}
			return 0;
		}
		Application.EnableVisualStyles();
		Application.SetCompatibleTextRenderingDefault(defaultValue: false);
		Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
		Application.ThreadException += (object s, ThreadExceptionEventArgs e) =>
		{
			ReportFatal(e.Exception);
		};
		AppDomain.CurrentDomain.UnhandledException += (object s, UnhandledExceptionEventArgs e) =>
		{
			ReportFatal(e.ExceptionObject as Exception);
		};
		try
		{
			return Run(eventWaitHandle);
		}
		catch (Exception ex)
		{
			ReportFatal(ex);
			return 1;
		}
		finally
		{
			GC.KeepAlive(obj);
		}
	}

	[MethodImpl(MethodImplOptions.NoInlining)]
	private static int Run(EventWaitHandle showEvent)
	{
		LegacyMigration.MoveDataFolder();
		AppPaths.Init();
		HostSettings.Load();
		LegacyMigration.MoveAutostart();
		if (!WebViewRuntime.Prepare(EmbeddedAssemblies.ExtractNativeLoader(AppPaths.RuntimeDir)))
		{
			return 2;
		}
		Application.Run(new MainForm(showEvent, StartedByAutostart));
		return 0;
	}

	internal static void ReportFatal(Exception ex)
	{
		if (ex == null || Interlocked.Exchange(ref _reporting, 1) == 1)
		{
			return;
		}
		try
		{
			MessageBox.Show("FK Sohbet beklenmeyen bir hatayla karşılaştı:\n\n" + ex.Message, "FK Sohbet", MessageBoxButtons.OK, MessageBoxIcon.Hand);
		}
		catch
		{
		}
		finally
		{
			Interlocked.Exchange(ref _reporting, 0);
		}
	}

	internal static void OpenExternal(string url)
	{
		try
		{
			Process.Start(new ProcessStartInfo(url)
			{
				UseShellExecute = true
			});
		}
		catch
		{
		}
	}
}
