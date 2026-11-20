using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FKSohbet;

internal sealed class MainForm : Form
{
	private static readonly Color Background = Color.FromArgb(25, 25, 25);

	private const string BrowserArguments = "--autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling";

	private const int HotkeyId = 17995;

	private readonly WebView2 _view;

	private readonly NotifyIcon _tray;

	private readonly ToolStripMenuItem _trayMute;

	private readonly EventWaitHandle _showEvent;

	private readonly RegisteredWaitHandle _showWait;

	private readonly JavaScriptSerializer _json = new JavaScriptSerializer
	{
		MaxJsonLength = 4194304
	};

	private readonly OverlayController _overlay;

	private bool _startHidden;

	private bool _pageReady;

	private bool _exitRequested;

	private bool _exitNow;

	private bool _hotkeyRegistered;

	private IntPtr _keyboardHook = IntPtr.Zero;

	private Native.HookProc _keyboardProc;

	private DateTime _lastToggleMute = DateTime.MinValue;

	private string _lastWindowState = "";

	private System.Windows.Forms.Timer _shutdownTimer;

	private string _balloonAction;

	private RemoteControlForm _controlForm;

	private bool _controlledActive;

	private bool _controlCloseSilent;

	private int _captureSeq;

	private bool _captureBusy;

	private System.Windows.Forms.Timer _captureTimer;

	private bool _inCall;

	private bool _inRoom;

	private bool _muted;

	private bool _initStarted;

	public MainForm(EventWaitHandle showEvent, bool startHidden)
	{
		//IL_008b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0091: Expected Obj, but got Unknown
		_showEvent = showEvent;
		_startHidden = startHidden;
		Text = "FK Sohbet";
		AutoScaleMode = AutoScaleMode.None;
		StartPosition = FormStartPosition.Manual;
		BackColor = Background;
		Icon ıcon = null;
		try
		{
			ıcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
		}
		catch
		{
		}
		if (ıcon != null)
		{
			Icon = ıcon;
		}
		WebView2 val = new WebView2();
		((Control)(object)val).Dock = DockStyle.Fill;
		val.DefaultBackgroundColor = Background;
		_view = val;
		Controls.Add((Control)(object)_view);
		ContextMenuStrip contextMenuStrip = new ContextMenuStrip
		{
			ShowImageMargin = false
		};
		ToolStripMenuItem toolStripMenuItem = new ToolStripMenuItem("Göster", null, delegate
		{
			ShowFromTray();
		})
		{
			Font = new Font(SystemFonts.MenuFont, FontStyle.Bold)
		};
		_trayMute = new ToolStripMenuItem("Mikrofonu Kapat", null, delegate
		{
			PostEvent("toggle-mute");
		})
		{
			Enabled = false
		};
		ToolStripMenuItem toolStripMenuItem2 = new ToolStripMenuItem("Çıkış", null, delegate
		{
			RequestExit(confirmIfInCall: true);
		});
		contextMenuStrip.Items.AddRange(new ToolStripItem[4]
		{
			toolStripMenuItem,
			_trayMute,
			new ToolStripSeparator(),
			toolStripMenuItem2
		});
		_tray = new NotifyIcon
		{
			Icon = (ıcon ?? SystemIcons.Application),
			Text = "FK Sohbet",
			ContextMenuStrip = contextMenuStrip,
			Visible = true
		};
		_tray.MouseClick += (object s, MouseEventArgs e) =>
		{
			if (e.Button == MouseButtons.Left)
			{
				ShowFromTray();
			}
		};
		_overlay = new OverlayController();
		_overlay.SetEnabled(HostSettings.Overlay);
		_overlay.SetTarget(HostSettings.Target);
		_overlay.TargetStatusChanged += PostTargetStatus;
		_overlay.VisibleChanged += (bool v) =>
		{
			PostEvent("overlay", new Dictionary<string, object> { ["visible"] = v });
		};
		_tray.BalloonTipClicked += delegate
		{
			string balloonAction = _balloonAction;
			_balloonAction = null;
			ShowFromTray();
			if (!string.IsNullOrEmpty(balloonAction))
			{
				PostEvent("notification-click", new Dictionary<string, object> { ["action"] = balloonAction });
			}
		};
		_showWait = ThreadPool.RegisterWaitForSingleObject(_showEvent, delegate
		{
			try
			{
				if (IsHandleCreated)
				{
					BeginInvoke(new Action(ShowFromTray));
				}
			}
			catch
			{
			}
		}, null, -1, executeOnlyOnce: false);
	}

	protected override void OnHandleCreated(EventArgs e)
	{
		base.OnHandleCreated(e);
		Native.UseDarkTitleBar(Handle);
		if (HostSettings.Hotkey)
		{
			RegisterHotkey();
		}
	}

	protected override void OnHandleDestroyed(EventArgs e)
	{
		UnregisterHotkey();
		base.OnHandleDestroyed(e);
	}

	protected override void SetVisibleCore(bool value)
	{
		if (_startHidden && !IsHandleCreated)
		{
			_startHidden = false;
			CreateHandle();
			_ = ((Control)(object)_view).Handle;
			base.SetVisibleCore(value: false);
			StartInitialize();
		}
		else
		{
			base.SetVisibleCore(value);
		}
	}

	protected override void OnLoad(EventArgs e)
	{
		base.OnLoad(e);
		StartInitialize();
	}

	private async void StartInitialize()
	{
		if (_initStarted)
		{
			return;
		}
		_initStarted = true;
		float num = ((DeviceDpi > 0) ? ((float)DeviceDpi / 96f) : 1f);
		MinimumSize = new Size((int)(400f * num), (int)(640f * num));
		WindowPlacement.Restore(this, num);
		try
		{
			CoreWebView2EnvironmentOptions val = new CoreWebView2EnvironmentOptions((string)null, (string)null, (string)null, false, (List<CoreWebView2CustomSchemeRegistration>)null)
			{
				AdditionalBrowserArguments = "--autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling",
				Language = "tr-TR",
				AllowSingleSignOnUsingOSPrimaryAccount = false
			};
			CoreWebView2Environment val2 = await CoreWebView2Environment.CreateAsync((string)null, AppPaths.UserDataDir, val);
			await _view.EnsureCoreWebView2Async(val2);
		}
		catch (Exception ex)
		{
			if (!Visible)
			{
				ShowFromTray();
			}
			MessageBox.Show(this, "WebView2 başlatılamadı:\n\n" + ex.Message + "\n\nMicrosoft Edge WebView2 Runtime'ın yüklü olduğundan emin olun.", "FK Sohbet", MessageBoxButtons.OK, MessageBoxIcon.Hand);
			_exitNow = true;
			Close();
			return;
		}
		await LegacyMigration.CopyLocalStorageAsync(_view.CoreWebView2);
		ConfigureWebView(_view.CoreWebView2);
		_view.CoreWebView2.Navigate("https://fksohbet.example/index.html");
	}

	protected override void OnShown(EventArgs e)
	{
		base.OnShown(e);
		ReportWindowState();
	}

	private void ConfigureWebView(CoreWebView2 core)
	{
		CoreWebView2Settings settings = core.Settings;
		settings.IsScriptEnabled = true;
		settings.IsWebMessageEnabled = true;
		settings.AreHostObjectsAllowed = false;
		settings.AreDevToolsEnabled = Environment.GetEnvironmentVariable("FKSOHBET_DEVTOOLS") == "1";
		settings.AreDefaultScriptDialogsEnabled = true;
		settings.AreDefaultContextMenusEnabled = true;
		settings.AreBrowserAcceleratorKeysEnabled = false;
		settings.IsZoomControlEnabled = false;
		settings.IsPinchZoomEnabled = false;
		settings.IsSwipeNavigationEnabled = false;
		settings.IsStatusBarEnabled = false;
		settings.IsBuiltInErrorPageEnabled = true;
		settings.IsGeneralAutofillEnabled = false;
		settings.IsPasswordAutosaveEnabled = false;
		core.AddWebResourceRequestedFilter("https://fksohbet.example/*", (CoreWebView2WebResourceContext)0);
		core.WebResourceRequested += (object sender, CoreWebView2WebResourceRequestedEventArgs e) =>
		{
			byte[] array = WebAssets.Get(e.Request.Uri, out var contentType);
			CoreWebView2Environment environment = _view.CoreWebView2.Environment;
			if (array == null)
			{
				e.Response = environment.CreateWebResourceResponse((Stream)null, 404, "Not Found", "Content-Type: text/plain");
			}
			else
			{
				e.Response = environment.CreateWebResourceResponse((Stream)new MemoryStream(array, writable: false), 200, "OK", "Content-Type: " + contentType + "\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff");
			}
		};
		core.NavigationStarting += (object sender, CoreWebView2NavigationStartingEventArgs e) =>
		{
			if (!WebAssets.IsAppUrl(e.Uri))
			{
				e.Cancel = true;
			}
		};
		core.FrameNavigationStarting += (object sender, CoreWebView2NavigationStartingEventArgs e) =>
		{
			if (!WebAssets.IsAppUrl(e.Uri))
			{
				e.Cancel = true;
			}
		};
		core.NewWindowRequested += (object sender, CoreWebView2NewWindowRequestedEventArgs e) =>
		{
			e.Handled = true;
		};
		core.DownloadStarting += (object sender, CoreWebView2DownloadStartingEventArgs e) =>
		{
			e.Cancel = false;
			e.Handled = false;
		};
		core.PermissionRequested += (object sender, CoreWebView2PermissionRequestedEventArgs e) =>
		{
			//IL_0011: Unknown result type (might be due to invalid IL or missing references)
			//IL_0017: Invalid comparison between Unknown and I4
			bool flag = WebAssets.IsAppUrl(e.Uri);
			e.State = (CoreWebView2PermissionState)((flag && (int)e.PermissionKind == 1) ? 1 : 2);
			e.Handled = true;
		};
		core.ContextMenuRequested += (object sender, CoreWebView2ContextMenuRequestedEventArgs e) =>
		{
			if (!e.ContextMenuTarget.IsEditable)
			{
				e.Handled = true;
			}
		};
		core.DocumentTitleChanged += delegate
		{
			Text = "FK Sohbet";
		};
		core.WebMessageReceived += OnWebMessage;
		core.ProcessFailed += OnProcessFailed;
	}

	private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
	{
		if (!WebAssets.IsAppUrl(e.Source))
		{
			return;
		}
		Dictionary<string, object> dictionary;
		try
		{
			dictionary = _json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
		}
		catch
		{
			return;
		}
		if (dictionary == null || !dictionary.TryGetValue("cmd", out var value) || !(value is string text) || text == null)
		{
			return;
		}
		switch (text.Length)
		{
		case 5:
			switch (text[0])
			{
			case 'r':
				if (text == "ready")
				{
					_pageReady = true;
					SendInit();
					ReportWindowState(force: true);
					PostEvent("overlay", new Dictionary<string, object> { ["visible"] = _overlay.IsShown });
					PostTargetStatus();
				}
				break;
			case 's':
				if (text == "state")
				{
					_inCall = Bool(dictionary, "inCall") == true;
					_inRoom = Bool(dictionary, "inRoom") == true;
					_muted = Bool(dictionary, "muted") == true;
					UpdateTray();
					_overlay.SetMuted(_muted);
					_overlay.SetInRoom(_inRoom);
				}
				break;
			}
			break;
		case 12:
			if (text[0] == 'c')
			{
				if (text == "control-open")
				{
					OpenControlWindow(Str(dictionary, "name"));
				}
				else if (text == "control-text")
				{
					ApplyControlText(dictionary);
				}
			}
			break;
		case 13:
			switch (text[0])
			{
			case 'c':
				switch (text)
				{
				case "control-close":
					CloseControlWindow();
					break;
				case "control-frame":
					SetControlFrame(dictionary);
					break;
				case "control-input":
					ApplyControlInput(dictionary);
					break;
				}
				break;
			case 'l':
				if (text == "list-programs")
				{
					ListPrograms();
				}
				break;
			case 'o':
			{
				if (!(text == "overlay-voice"))
				{
					break;
				}
				_overlay.SetVoice(Bool(dictionary, "speaking") == true, Num(dictionary, "level"), Bool(dictionary, "muted") == true);
				if (!dictionary.TryGetValue("peers", out var value2) || !(value2 is IEnumerable enumerable) || value2 is string)
				{
					break;
				}
				{
					foreach (object item in enumerable)
					{
						if (item is Dictionary<string, object> m)
						{
							string text2 = Str(m, "id");
							if (!string.IsNullOrEmpty(text2))
							{
								_overlay.SetPeerVoice(text2, Bool(m, "speaking") == true, Num(m, "level"), Bool(m, "muted") == true);
							}
						}
					}
					break;
				}
			}
			}
			break;
		case 14:
			switch (text[0])
			{
			case 'c':
				if (text == "control-launch")
				{
					ApplyControlLaunch(dictionary);
				}
				break;
			case 'o':
				if (text == "overlay-target")
				{
					SetOverlayTarget(dictionary);
				}
				break;
			case 's':
				if (text == "shutdown-ready" && _exitRequested)
				{
					FinishExit();
				}
				break;
			}
			break;
		case 15:
			switch (text[8])
			{
			case 'm':
				if (text == "overlay-members")
				{
					_overlay.SetMembers(ParseMembers(dictionary));
				}
				break;
			case 'p':
				if (text == "overlay-profile")
				{
					_overlay.SetProfile(Str(dictionary, "name"), Str(dictionary, "photo"));
				}
				break;
			}
			break;
		case 17:
			if (text == "control-host-stop")
			{
				StopControlledCapture();
			}
			break;
		case 18:
			if (text == "control-host-start")
			{
				StartControlledCapture(Str(dictionary, "name"));
			}
			break;
		case 8:
			if (text == "settings")
			{
				ApplySettings(dictionary);
			}
			break;
		case 6:
			if (text == "notify")
			{
				string text3 = Str(dictionary, "action");
				bool valueOrDefault = Bool(dictionary, "force") == true;
				ShowNotification(Str(dictionary, "title") ?? "FK Sohbet", Str(dictionary, "body"), valueOrDefault, (!string.IsNullOrEmpty(text3)) ? text3 : null);
			}
			break;
		case 16:
			if (text == "open-mic-privacy")
			{
				Program.OpenExternal("ms-settings:privacy-microphone");
			}
			break;
		case 9:
			if (text == "save-file")
			{
				SaveFileFromWeb(Str(dictionary, "name"), Str(dictionary, "data"));
			}
			break;
		case 7:
		case 10:
		case 11:
			break;
		}
	}

	private void SaveFileFromWeb(string name, string dataUrl)
	{
		if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(dataUrl))
		{
			return;
		}
		try
		{
			int num = dataUrl.IndexOf(',');
			byte[] bytes = ((num < 0) ? Convert.FromBase64String(dataUrl) : Convert.FromBase64String(dataUrl.Substring(num + 1)));
			using SaveFileDialog saveFileDialog = new SaveFileDialog();
			saveFileDialog.FileName = name;
			string extension = Path.GetExtension(name);
			if (!string.IsNullOrEmpty(extension))
			{
				saveFileDialog.Filter = extension.TrimStart('.').ToUpperInvariant() + " Dosyası (*" + extension + ")|*" + extension + "|Tüm Dosyalar (*.*)|*.*";
			}
			else
			{
				saveFileDialog.Filter = "Tüm Dosyalar (*.*)|*.*";
			}
			saveFileDialog.Title = "Dosyayı Kaydet";
			saveFileDialog.RestoreDirectory = true;
			if (saveFileDialog.ShowDialog(this) == DialogResult.OK)
			{
				File.WriteAllBytes(saveFileDialog.FileName, bytes);
				ShowNotification("FK Sohbet", Path.GetFileName(saveFileDialog.FileName) + " başarıyla kaydedildi.", force: true);
			}
		}
		catch (Exception ex)
		{
			MessageBox.Show(this, "Dosya kaydedilirken hata oluştu: " + ex.Message, "FK Sohbet", MessageBoxButtons.OK, MessageBoxIcon.Hand);
		}
	}

	private static List<(string id, string name, string photo)> ParseMembers(Dictionary<string, object> msg)
	{
		List<(string, string, string)> list = new List<(string, string, string)>();
		if (msg.TryGetValue("members", out var value) && value is IEnumerable enumerable && !(value is string))
		{
			foreach (object item in enumerable)
			{
				if (!(item is Dictionary<string, object> m))
				{
					continue;
				}
				string text = Str(m, "id");
				if (!string.IsNullOrEmpty(text) && text.Length <= 64)
				{
					list.Add((text, Str(m, "name") ?? "", Str(m, "photo") ?? ""));
					if (list.Count >= 5)
					{
						break;
					}
				}
			}
		}
		return list;
	}

	private void ListPrograms()
	{
		List<object> list = new List<object>();
		try
		{
			foreach (ProgramInfo item in ProgramList.Enumerate())
			{
				list.Add(item.ToJson());
			}
		}
		catch
		{
		}
		PostEvent("programs", new Dictionary<string, object> { ["items"] = list });
	}

	private void SetOverlayTarget(Dictionary<string, object> msg)
	{
		if (Bool(msg, "clear") == true)
		{
			HostSettings.TargetExe = (HostSettings.TargetPath = (HostSettings.TargetTitle = (HostSettings.TargetName = (HostSettings.TargetIcon = ""))));
		}
		else
		{
			string text = OverlayTarget.Clean(Str(msg, "exe"), 260);
			if (!text.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || text.IndexOfAny(new char[2] { '\\', '/' }) >= 0)
			{
				PostTargetStatus();
				return;
			}
			HostSettings.TargetExe = text;
			HostSettings.TargetPath = OverlayTarget.Clean(Str(msg, "path"), 1024);
			HostSettings.TargetTitle = OverlayTarget.Clean(Str(msg, "title"), 200);
			HostSettings.TargetName = OverlayTarget.Clean(Str(msg, "name"), 120);
			string text2 = Str(msg, "icon") ?? "";
			HostSettings.TargetIcon = ((text2.StartsWith("data:image/png;base64,", StringComparison.Ordinal) && text2.Length <= 20000) ? text2 : "");
		}
		HostSettings.Save();
		_overlay.SetTarget(HostSettings.Target);
	}

	private void PostTargetStatus()
	{
		OverlayTarget target = _overlay.Target;
		bool flag = true;
		if (target.IsSet && !_overlay.TargetRunning && target.Path.Length > 0)
		{
			try
			{
				flag = File.Exists(target.Path);
			}
			catch
			{
				flag = true;
			}
		}
		PostEvent("overlay-target", new Dictionary<string, object>
		{
			["set"] = target.IsSet,
			["name"] = ((target.Name.Length > 0) ? target.Name : target.Exe),
			["exe"] = target.Exe,
			["path"] = target.Path,
			["title"] = target.Title,
			["icon"] = target.Icon,
			["running"] = _overlay.TargetRunning,
			["active"] = _overlay.IsShown && target.IsSet,
			["found"] = flag
		});
	}

	private void SendInit()
	{
		PostEvent("init", new Dictionary<string, object>
		{
			["version"] = Program.Version,
			["autostart"] = HostSettings.Autostart,
			["notifications"] = HostSettings.Notifications,
			["background"] = HostSettings.Background,
			["hotkey"] = HostSettings.Hotkey,
			["hotkeyDisplay"] = HostSettings.HotkeyDisplay,
			["hotkeyKey"] = HostSettings.HotkeyKey,
			["hotkeyVk"] = HostSettings.HotkeyVk,
			["hotkeyModifiers"] = HostSettings.HotkeyModifiers,
			["overlay"] = HostSettings.Overlay,
			["hotkeyOk"] = !HostSettings.Hotkey || _hotkeyRegistered
		});
	}

	private void ApplySettings(Dictionary<string, object> msg)
	{
		bool flag = false;
		bool? flag2 = Bool(msg, "autostart");
		if (flag2.HasValue && !HostSettings.SetAutostart(flag2 == true))
		{
			flag = true;
			ShowNotification("FK Sohbet", "Windows açılışında başlatma ayarı değiştirilemedi.", force: true);
		}
		flag2 = Bool(msg, "notifications");
		if (flag2.HasValue)
		{
			HostSettings.Notifications = flag2 == true;
		}
		flag2 = Bool(msg, "background");
		if (flag2.HasValue)
		{
			HostSettings.Background = flag2 == true;
		}
		flag2 = Bool(msg, "overlay");
		if (flag2.HasValue)
		{
			bool enabled = (HostSettings.Overlay = flag2 == true);
			_overlay.SetEnabled(enabled);
		}
		string text = Str(msg, "hotkeyDisplay");
		if (!string.IsNullOrEmpty(text))
		{
			HostSettings.HotkeyDisplay = text;
		}
		string text2 = Str(msg, "hotkeyKey");
		if (!string.IsNullOrEmpty(text2))
		{
			HostSettings.HotkeyKey = text2;
		}
		uint? num = Uint(msg, "hotkeyVk");
		if (num.HasValue && num.Value != 0)
		{
			HostSettings.HotkeyVk = num.Value;
		}
		uint? num2 = Uint(msg, "hotkeyModifiers");
		if (num2.HasValue)
		{
			HostSettings.HotkeyModifiers = num2.Value;
		}
		flag2 = Bool(msg, "hotkey");
		if (flag2.HasValue || num.HasValue || num2.HasValue)
		{
			if (flag2.HasValue)
			{
				HostSettings.Hotkey = flag2 == true;
			}
			if (HostSettings.Hotkey)
			{
				RegisterHotkey();
			}
			else
			{
				UnregisterHotkey();
			}
			PostEvent("hotkey-status", new Dictionary<string, object>
			{
				["ok"] = !HostSettings.Hotkey || _hotkeyRegistered,
				["display"] = HostSettings.HotkeyDisplay,
				["key"] = HostSettings.HotkeyKey,
				["vk"] = HostSettings.HotkeyVk,
				["modifiers"] = HostSettings.HotkeyModifiers
			});
		}
		HostSettings.Save();
		if (flag)
		{
			SendInit();
		}
	}

	private void PostEvent(string evt, Dictionary<string, object> payload = null)
	{
		if (!_pageReady || _view.CoreWebView2 == null)
		{
			return;
		}
		Dictionary<string, object> dictionary = payload ?? new Dictionary<string, object>();
		dictionary["evt"] = evt;
		try
		{
			_view.CoreWebView2.PostWebMessageAsJson(_json.Serialize(dictionary));
		}
		catch
		{
		}
	}

	private void OpenControlWindow(string name)
	{
		string text = (string.IsNullOrEmpty(name) ? "Arkadaşın" : name);
		if (_controlForm != null && !_controlForm.IsDisposed)
		{
			if (!(_controlForm.Text != "FK Sohbet - " + text + "'s PC"))
			{
				_controlForm.Activate();
				return;
			}
			CloseControlWindow();
		}
		RemoteControlForm form = new RemoteControlForm(text, PostControlInput, PostControlLaunch, PostControlText);
		form.FormClosed += delegate
		{
			bool controlCloseSilent = _controlCloseSilent;
			if (_controlForm == form)
			{
				_controlForm = null;
			}
			if (!controlCloseSilent)
			{
				PostEvent("control-closed");
			}
		};
		_controlForm = form;
		form.Show();
		form.Activate();
	}

	private void CloseControlWindow()
	{
		RemoteControlForm controlForm = _controlForm;
		_controlForm = null;
		if (controlForm == null || controlForm.IsDisposed)
		{
			return;
		}
		_controlCloseSilent = true;
		try
		{
			controlForm.Close();
		}
		catch
		{
		}
		finally
		{
			_controlCloseSilent = false;
		}
	}

	private void SetControlFrame(Dictionary<string, object> msg)
	{
		RemoteControlForm controlForm = _controlForm;
		string text = Str(msg, "data");
		if (controlForm == null || controlForm.IsDisposed || string.IsNullOrEmpty(text))
		{
			return;
		}
		try
		{
			controlForm.SetFrame(Convert.FromBase64String(text));
		}
		catch
		{
		}
	}

	private void PostControlInput(Dictionary<string, object> input)
	{
		PostEvent("control-input", input);
	}

	private void PostControlLaunch(string app)
	{
		PostEvent("control-launch", new Dictionary<string, object> { ["app"] = app });
	}

	private void PostControlText(string text)
	{
		PostEvent("control-text", new Dictionary<string, object> { ["text"] = text });
	}

	private void StartControlledCapture(string name)
	{
		_controlledActive = true;
		if (_captureTimer == null)
		{
			_captureTimer = new System.Windows.Forms.Timer
			{
				Interval = 125
			};
			_captureTimer.Tick += CaptureTick;
		}
		_captureTimer.Start();
		ShowNotification("FK Sohbet", (string.IsNullOrEmpty(name) ? "Arkadaşın" : name) + " bilgisayarını kontrol ediyor. Durdurmak için FK Sohbet penceresindeki 'Kontrolü Durdur' düğmesini kullanın.", force: true);
	}

	private void StopControlledCapture()
	{
		_controlledActive = false;
		if (_captureTimer != null)
		{
			_captureTimer.Stop();
		}
	}

	private void CaptureTick(object sender, EventArgs e)
	{
		if (!_controlledActive || _captureBusy)
		{
			return;
		}
		_captureBusy = true;
		try
		{
			RemoteDesktop.CaptureResult captureResult = RemoteDesktop.Capture(1280, 55L);
			if (captureResult != null)
			{
				PostEvent("control-capture", new Dictionary<string, object>
				{
					["seq"] = ++_captureSeq,
					["w"] = captureResult.Width,
					["h"] = captureResult.Height,
					["data"] = captureResult.Data
				});
			}
		}
		catch
		{
		}
		finally
		{
			_captureBusy = false;
		}
	}

	private void ApplyControlInput(Dictionary<string, object> msg)
	{
		if (_controlledActive)
		{
			RemoteDesktop.ApplyInput(msg);
		}
	}

	private void ApplyControlLaunch(Dictionary<string, object> msg)
	{
		if (_controlledActive)
		{
			RemoteDesktop.LaunchApp(Str(msg, "app"));
		}
	}

	private void ApplyControlText(Dictionary<string, object> msg)
	{
		if (_controlledActive)
		{
			RemoteDesktop.TypeText(Str(msg, "text"));
		}
	}

	private static string Str(Dictionary<string, object> m, string k)
	{
		if (!m.TryGetValue(k, out var value))
		{
			return null;
		}
		return value as string;
	}

	private static bool? Bool(Dictionary<string, object> m, string k)
	{
		if (!m.TryGetValue(k, out var value) || !(value is bool))
		{
			return null;
		}
		return (bool)value;
	}

	private static double Num(Dictionary<string, object> m, string k)
	{
		if (!m.TryGetValue(k, out var value) || value == null || value is bool || value is string)
		{
			return 0.0;
		}
		try
		{
			return Convert.ToDouble(value, CultureInfo.InvariantCulture);
		}
		catch
		{
			return 0.0;
		}
	}

	private static uint? Uint(Dictionary<string, object> m, string k)
	{
		if (!m.TryGetValue(k, out var value) || value == null || value is bool || value is string)
		{
			return null;
		}
		try
		{
			return Convert.ToUInt32(value, CultureInfo.InvariantCulture);
		}
		catch
		{
			return null;
		}
	}

	private void UpdateTray()
	{
		_trayMute.Enabled = _inRoom;
		_trayMute.Text = (_muted ? "Mikrofonu Aç" : "Mikrofonu Kapat");
		string text;
		if (_inCall)
		{
			text = (_muted ? "Bağlandı · mikrofon kapalı" : "Bağlandı");
		}
		else
		{
			text = (_inRoom ? "Oda açık" : "Hazır");
		}
		string text2 = "FK Sohbet — " + text;
		_tray.Text = ((text2.Length > 63) ? text2.Substring(0, 63) : text2);
	}

	private void ShowNotification(string title, string body, bool force = false, string action = null)
	{
		if (string.IsNullOrEmpty(body) || (!force && !HostSettings.Notifications))
		{
			return;
		}
		bool flag = Visible && WindowState != FormWindowState.Minimized && Form.ActiveForm == this;
		if (!force & flag)
		{
			return;
		}
		_balloonAction = action;
		try
		{
			_tray.ShowBalloonTip(4000, title, body, ToolTipIcon.None);
		}
		catch
		{
		}
	}

	private void ShowFromTray()
	{
		if (!_exitNow)
		{
			if (!Visible)
			{
				Show();
			}
			if (WindowState == FormWindowState.Minimized)
			{
				WindowState = FormWindowState.Normal;
			}
			Activate();
			Native.ForceForeground(Handle);
			ReportWindowState();
		}
	}

	private void HideToTray()
	{
		Hide();
		ReportWindowState();
		if (!HostSettings.TrayHintShown)
		{
			HostSettings.TrayHintShown = true;
			HostSettings.Save();
			_balloonAction = null;
			try
			{
				_tray.ShowBalloonTip(5000, "FK Sohbet", "FK Sohbet arka planda çalışmaya devam ediyor. Kapatmak için tepsi simgesine sağ tıklayıp Çıkış'ı seçin.", ToolTipIcon.None);
			}
			catch
			{
			}
		}
	}

	protected override void OnResize(EventArgs e)
	{
		base.OnResize(e);
		ReportWindowState();
	}

	protected override void OnVisibleChanged(EventArgs e)
	{
		base.OnVisibleChanged(e);
		ReportWindowState();
	}

	private void ReportWindowState(bool force = false)
	{
		string text;
		if (Visible)
		{
			text = ((WindowState == FormWindowState.Minimized) ? "minimized" : "normal");
		}
		else
		{
			text = "hidden";
		}
		if (force || !(text == _lastWindowState))
		{
			_lastWindowState = text;
			PostEvent("window", new Dictionary<string, object> { ["state"] = text });
		}
	}

	private void TriggerToggleMute()
	{
		DateTime utcNow = DateTime.UtcNow;
		if (!((utcNow - _lastToggleMute).TotalMilliseconds < 250.0))
		{
			_lastToggleMute = utcNow;
			PostEvent("toggle-mute");
		}
	}

	private void RegisterHotkey()
	{
		if (!HostSettings.Hotkey || !IsHandleCreated)
		{
			return;
		}
		UnregisterHotkey();
		uint hotkeyVk = HostSettings.HotkeyVk;
		if (hotkeyVk == 0)
		{
			return;
		}
		uint hotkeyModifiers = HostSettings.HotkeyModifiers;
		bool flag = false;
		try
		{
			flag = Native.RegisterHotKey(Handle, 17995, hotkeyModifiers, hotkeyVk);
		}
		catch
		{
		}
		if (flag)
		{
			_hotkeyRegistered = true;
			return;
		}
		try
		{
			if (_keyboardProc == null)
			{
				_keyboardProc = LowLevelKeyboardCallback;
			}
			using (Process process = Process.GetCurrentProcess())
			{
				using ProcessModule processModule = process.MainModule;
				_keyboardHook = Native.SetWindowsHookEx(13, _keyboardProc, Native.GetModuleHandle(processModule.ModuleName), 0u);
			}
			_hotkeyRegistered = _keyboardHook != IntPtr.Zero;
		}
		catch
		{
			_hotkeyRegistered = false;
		}
	}

	private void UnregisterHotkey()
	{
		if (_hotkeyRegistered)
		{
			try
			{
				Native.UnregisterHotKey(Handle, 17995);
			}
			catch
			{
			}
			_hotkeyRegistered = false;
		}
		if (_keyboardHook != IntPtr.Zero)
		{
			try
			{
				Native.UnhookWindowsHookEx(_keyboardHook);
			}
			catch
			{
			}
			_keyboardHook = IntPtr.Zero;
		}
	}

	private IntPtr LowLevelKeyboardCallback(int nCode, IntPtr wParam, IntPtr lParam)
	{
		if (nCode >= 0 && ((int)wParam == 256 || (int)wParam == 260) && Marshal.ReadInt32(lParam) == (int)HostSettings.HotkeyVk)
		{
			bool flag = (HostSettings.HotkeyModifiers & 2) != 0;
			bool flag2 = (HostSettings.HotkeyModifiers & 4) != 0;
			bool flag3 = (HostSettings.HotkeyModifiers & 1) != 0;
			bool flag4 = (HostSettings.HotkeyModifiers & 8) != 0;
			bool flag5 = (Native.GetAsyncKeyState(17) & 0x8000) != 0;
			bool flag6 = (Native.GetAsyncKeyState(16) & 0x8000) != 0;
			bool flag7 = (Native.GetAsyncKeyState(18) & 0x8000) != 0;
			bool flag8 = ((Native.GetAsyncKeyState(91) | Native.GetAsyncKeyState(92)) & 0x8000) != 0;
			if (flag == flag5 && flag2 == flag6 && flag3 == flag7 && flag4 == flag8)
			{
				TriggerToggleMute();
			}
		}
		return Native.CallNextHookEx(_keyboardHook, nCode, wParam, lParam);
	}

	protected override void WndProc(ref Message m)
	{
		if (m.Msg == 786 && m.WParam.ToInt32() == 17995)
		{
			TriggerToggleMute();
		}
		else
		{
			base.WndProc(ref m);
		}
	}

	protected override void OnFormClosing(FormClosingEventArgs e)
	{
		if (_exitNow)
		{
			base.OnFormClosing(e);
		}
		else if (e.CloseReason == CloseReason.UserClosing)
		{
			e.Cancel = true;
			if (HostSettings.Background)
			{
				HideToTray();
			}
			else
			{
				RequestExit(confirmIfInCall: true);
			}
		}
		else
		{
			_exitNow = true;
			base.OnFormClosing(e);
		}
	}

	private void RequestExit(bool confirmIfInCall)
	{
		if (_exitRequested)
		{
			return;
		}
		if (confirmIfInCall && (_inCall || _inRoom))
		{
			if (!Visible)
			{
				ShowFromTray();
			}
			string text = (_inCall ? "Görüşme devam ediyor. Çıkarsan bağlantı kesilecek.\n\nFK Sohbet kapatılsın mı?" : "Odan açık. Çıkarsan oda kapanacak.\n\nFK Sohbet kapatılsın mı?");
			if (MessageBox.Show(this, text, "FK Sohbet", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes)
			{
				return;
			}
		}
		_exitRequested = true;
		if (!_pageReady)
		{
			FinishExit();
			return;
		}
		PostEvent("shutdown-request");
		_shutdownTimer = new System.Windows.Forms.Timer
		{
			Interval = 1500
		};
		_shutdownTimer.Tick += delegate
		{
			FinishExit();
		};
		_shutdownTimer.Start();
	}

	private void FinishExit()
	{
		if (!_exitNow)
		{
			_exitNow = true;
			_shutdownTimer?.Stop();
			Close();
		}
	}

	protected override void OnFormClosed(FormClosedEventArgs e)
	{
		WindowPlacement.Save(this);
		HostSettings.Save();
		try
		{
			_controlledActive = false;
			if (_captureTimer != null)
			{
				_captureTimer.Stop();
				_captureTimer.Dispose();
				_captureTimer = null;
			}
		}
		catch
		{
		}
		try
		{
			CloseControlWindow();
		}
		catch
		{
		}
		try
		{
			_showWait.Unregister(null);
		}
		catch
		{
		}
		try
		{
			_tray.Visible = false;
			_tray.Dispose();
		}
		catch
		{
		}
		try
		{
			_overlay.Dispose();
		}
		catch
		{
		}
		try
		{
			((Component)(object)_view).Dispose();
		}
		catch
		{
		}
		base.OnFormClosed(e);
	}

	private void OnProcessFailed(object sender, CoreWebView2ProcessFailedEventArgs e)
	{
		//IL_0001: Unknown result type (might be due to invalid IL or missing references)
		//IL_0006: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_000a: Unknown result type (might be due to invalid IL or missing references)
		//IL_000c: Unknown result type (might be due to invalid IL or missing references)
		//IL_000e: Invalid comparison between Unknown and I4
		CoreWebView2ProcessFailedKind processFailedKind = e.ProcessFailedKind;
		if ((int)processFailedKind != 0)
		{
			if ((int)processFailedKind - 1 <= 1)
			{
				_pageReady = false;
				_inCall = (_inRoom = (_muted = false));
				UpdateTray();
				_overlay.SetInRoom(inRoom: false);
				try
				{
					_view.CoreWebView2.Navigate("https://fksohbet.example/index.html");
				}
				catch
				{
				}
				ShowNotification("FK Sohbet", "Arayüz yeniden yüklendi. Bağlantı koptuysa tekrar bağlanın.", force: true);
			}
		}
		else if (!_exitNow)
		{
			ShowFromTray();
			if (MessageBox.Show(this, "FK Sohbet'in tarayıcı bileşeni beklenmedik şekilde kapandı. Yeniden başlatılsın mı?", "FK Sohbet", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation) == DialogResult.Yes)
			{
				_exitNow = true;
				Application.Restart();
			}
			else
			{
				_exitNow = true;
				Close();
			}
		}
	}
}
