using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace FKSohbet;

internal sealed class RemoteControlForm : Form
{
	private sealed class ScreenPanel : Panel
	{
		public ScreenPanel()
		{
			DoubleBuffered = true;
			TabStop = true;
		}
	}

	private readonly Action<Dictionary<string, object>> _sendInput;

	private readonly Action<string> _sendLaunch;

	private readonly Action<string> _sendText;

	private readonly ScreenPanel _screen;

	private readonly Label _status;

	private readonly TextBox _launchBox;

	private readonly TextBox _textBox;

	private Image _image;

	private DateTime _lastMove = DateTime.MinValue;

	public RemoteControlForm(string peerName, Action<Dictionary<string, object>> sendInput, Action<string> sendLaunch, Action<string> sendText)
	{
		_sendInput = sendInput;
		_sendLaunch = sendLaunch;
		_sendText = sendText;
		Text = "FK Sohbet - " + peerName + "'s PC";
		BackColor = Color.FromArgb(25, 25, 25);
		ForeColor = Color.FromArgb(253, 255, 251);
		Font = new Font("Segoe UI", 9f);
		StartPosition = FormStartPosition.CenterScreen;
		ClientSize = new Size(1140, 730);
		MinimumSize = new Size(760, 520);
		KeyPreview = true;
		try
		{
			Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
		}
		catch
		{
		}
		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Top,
			AutoSize = true,
			WrapContents = true,
			Padding = new Padding(8, 6, 8, 6),
			BackColor = Color.FromArgb(32, 32, 32)
		};
		flowLayoutPanel.Controls.Add(SectionLabel("Kısayol"));
		AddKeysButton(flowLayoutPanel, "Kopyala", new int[2] { 17, 67 });
		AddKeysButton(flowLayoutPanel, "Yapıştır", new int[2] { 17, 86 });
		AddKeysButton(flowLayoutPanel, "Kes", new int[2] { 17, 88 });
		AddKeysButton(flowLayoutPanel, "Geri Al", new int[2] { 17, 90 });
		AddKeysButton(flowLayoutPanel, "Tümünü Seç", new int[2] { 17, 65 });
		AddKeysButton(flowLayoutPanel, "Kaydet", new int[2] { 17, 83 });
		AddKeysButton(flowLayoutPanel, "Alt+Tab", new int[2] { 18, 9 });
		AddKeysButton(flowLayoutPanel, "Alt+F4", new int[2] { 18, 115 });
		AddKeysButton(flowLayoutPanel, "Win+D", new int[2] { 91, 68 });
		AddKeysButton(flowLayoutPanel, "Win+E", new int[2] { 91, 69 });
		AddKeysButton(flowLayoutPanel, "Esc", new int[1] { 27 });
		AddKeysButton(flowLayoutPanel, "Enter", new int[1] { 13 });
		AddKeysButton(flowLayoutPanel, "Sil", new int[1] { 46 });
		flowLayoutPanel.Controls.Add(SectionLabel("Uygulama Aç"));
		AddLaunchButton(flowLayoutPanel, "Explorer", "explorer");
		AddLaunchButton(flowLayoutPanel, "Notepad", "notepad");
		AddLaunchButton(flowLayoutPanel, "Hesap Makinesi", "calc");
		AddLaunchButton(flowLayoutPanel, "Görev Yöneticisi", "taskmgr");
		AddLaunchButton(flowLayoutPanel, "Komut İstemi", "cmd");
		AddLaunchButton(flowLayoutPanel, "PowerShell", "powershell");
		_launchBox = new TextBox
		{
			Width = 170,
			Margin = new Padding(3, 5, 3, 3)
		};
		_launchBox.KeyDown += (object s, KeyEventArgs e) =>
		{
			if (e.KeyCode == Keys.Return)
			{
				e.SuppressKeyPress = true;
				LaunchFromBox();
			}
		};
		flowLayoutPanel.Controls.Add(_launchBox);
		flowLayoutPanel.Controls.Add(MakeButton("Uygulamayı Aç", delegate
		{
			LaunchFromBox();
		}));
		flowLayoutPanel.Controls.Add(SectionLabel("Metin Yaz"));
		_textBox = new TextBox
		{
			Width = 200,
			Margin = new Padding(3, 5, 3, 3)
		};
		_textBox.KeyDown += (object s, KeyEventArgs e) =>
		{
			if (e.KeyCode == Keys.Return)
			{
				e.SuppressKeyPress = true;
				SendTextFromBox();
			}
		};
		flowLayoutPanel.Controls.Add(_textBox);
		flowLayoutPanel.Controls.Add(MakeButton("Metni Yaz", delegate
		{
			SendTextFromBox();
		}));
		_status = new Label
		{
			AutoSize = true,
			Text = "Bağlantı bekleniyor...",
			ForeColor = Color.FromArgb(170, 170, 170),
			Margin = new Padding(10, 8, 3, 3)
		};
		flowLayoutPanel.Controls.Add(_status);
		Button button = MakeButton("Bağlantıyı Kes", delegate
		{
			Close();
		});
		button.BackColor = Color.FromArgb(229, 72, 77);
		button.ForeColor = Color.White;
		flowLayoutPanel.Controls.Add(button);
		_screen = new ScreenPanel
		{
			Dock = DockStyle.Fill,
			BackColor = Color.Black
		};
		_screen.Paint += DrawScreen;
		_screen.MouseMove += OnMouseMove;
		_screen.MouseDown += OnMouseDown;
		_screen.MouseUp += OnMouseUp;
		_screen.MouseWheel += OnMouseWheel;
		Controls.Add(_screen);
		Controls.Add(flowLayoutPanel);
		KeyDown += OnKeyDown;
		KeyUp += OnKeyUp;
		Shown += delegate
		{
			_screen.Focus();
		};
	}

	public void SetFrame(byte[] jpeg)
	{
		if (jpeg == null || jpeg.Length == 0)
		{
			return;
		}
		try
		{
			Image ımage;
			using (MemoryStream stream = new MemoryStream(jpeg))
			{
				using Image original = Image.FromStream(stream);
				ımage = new Bitmap(original);
			}
			Image image = _image;
			_image = ımage;
			image?.Dispose();
			_status.Text = "Bağlı · " + ımage.Width + "×" + ımage.Height;
			_screen.Invalidate();
		}
		catch
		{
		}
	}

	private void DrawScreen(object sender, PaintEventArgs e)
	{
		Graphics graphics = e.Graphics;
		graphics.FillRectangle(Brushes.Black, _screen.ClientRectangle);
		if (_image == null)
		{
			TextRenderer.DrawText(graphics, "Karşı tarafın ekranı bekleniyor...", Font, _screen.ClientRectangle, Color.FromArgb(170, 170, 170), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
			return;
		}
		RectangleF ımageRect = GetImageRect();
		if (ımageRect.Width > 0f)
		{
			graphics.DrawImage(_image, ımageRect);
		}
	}

	private RectangleF GetImageRect()
	{
		if (_image == null)
		{
			return RectangleF.Empty;
		}
		Size clientSize = _screen.ClientSize;
		if (clientSize.Width <= 0 || clientSize.Height <= 0)
		{
			return RectangleF.Empty;
		}
		float num = Math.Min((float)clientSize.Width / (float)_image.Width, (float)clientSize.Height / (float)_image.Height);
		float num2 = (float)_image.Width * num;
		float num3 = (float)_image.Height * num;
		return new RectangleF(((float)clientSize.Width - num2) / 2f, ((float)clientSize.Height - num3) / 2f, num2, num3);
	}

	private bool ToNorm(MouseEventArgs e, out double nx, out double ny)
	{
		nx = 0.0;
		ny = 0.0;
		RectangleF ımageRect = GetImageRect();
		if (ımageRect.Width <= 0f || ımageRect.Height <= 0f)
		{
			return false;
		}
		nx = Math.Min(1.0, Math.Max(0.0, ((float)e.X - ımageRect.X) / ımageRect.Width));
		ny = Math.Min(1.0, Math.Max(0.0, ((float)e.Y - ımageRect.Y) / ımageRect.Height));
		return true;
	}

	private void OnMouseMove(object sender, MouseEventArgs e)
	{
		DateTime utcNow = DateTime.UtcNow;
		if (!((utcNow - _lastMove).TotalMilliseconds < 33.0) && ToNorm(e, out var nx, out var ny))
		{
			_lastMove = utcNow;
			_sendInput(new Dictionary<string, object>
			{
				["kind"] = "move",
				["x"] = nx,
				["y"] = ny
			});
		}
	}

	private void OnMouseDown(object sender, MouseEventArgs e)
	{
		_screen.Focus();
		SendButton(e, down: true);
	}

	private void OnMouseUp(object sender, MouseEventArgs e)
	{
		SendButton(e, down: false);
	}

	private void SendButton(MouseEventArgs e, bool down)
	{
		string value;
		switch (e.Button)
		{
		default:
			return;
		case MouseButtons.Left:
			value = "left";
			break;
		case MouseButtons.Right:
			value = "right";
			break;
		case MouseButtons.Middle:
			value = "middle";
			break;
		}
		if (ToNorm(e, out var nx, out var ny))
		{
			_sendInput(new Dictionary<string, object>
			{
				["kind"] = "button",
				["button"] = value,
				["down"] = down,
				["x"] = nx,
				["y"] = ny
			});
		}
	}

	private void OnMouseWheel(object sender, MouseEventArgs e)
	{
		if (ToNorm(e, out var nx, out var ny))
		{
			_sendInput(new Dictionary<string, object>
			{
				["kind"] = "wheel",
				["delta"] = e.Delta,
				["x"] = nx,
				["y"] = ny
			});
		}
	}

	protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
	{
		switch (keyData)
		{
		case Keys.Tab | Keys.Alt:
			SendKeys(18, 9);
			return true;
		case Keys.F4 | Keys.Alt:
			SendKeys(18, 115);
			return true;
		default:
			return base.ProcessCmdKey(ref msg, keyData);
		}
	}

	private void OnKeyDown(object sender, KeyEventArgs e)
	{
		if (!(ActiveControl is TextBox))
		{
			_sendInput(new Dictionary<string, object>
			{
				["kind"] = "key",
				["vk"] = (int)e.KeyCode,
				["down"] = true
			});
			e.SuppressKeyPress = true;
		}
	}

	private void OnKeyUp(object sender, KeyEventArgs e)
	{
		if (!(ActiveControl is TextBox))
		{
			_sendInput(new Dictionary<string, object>
			{
				["kind"] = "key",
				["vk"] = (int)e.KeyCode,
				["down"] = false
			});
		}
	}

	private void SendKeys(params int[] vks)
	{
		List<object> list = new List<object>();
		foreach (int num in vks)
		{
			list.Add(num);
		}
		_sendInput(new Dictionary<string, object>
		{
			["kind"] = "keys",
			["vks"] = list
		});
	}

	private void LaunchFromBox()
	{
		string text = _launchBox.Text.Trim();
		if (text.Length != 0)
		{
			_sendLaunch(text);
			_launchBox.Clear();
			_screen.Focus();
		}
	}

	private void SendTextFromBox()
	{
		string text = _textBox.Text;
		if (text.Length != 0)
		{
			_sendText(text);
			_textBox.Clear();
			_screen.Focus();
		}
	}

	private static Label SectionLabel(string text)
	{
		return new Label
		{
			AutoSize = true,
			Text = text,
			Font = new Font("Segoe UI", 9f, FontStyle.Bold),
			ForeColor = Color.FromArgb(110, 187, 48),
			Margin = new Padding(8, 8, 2, 3)
		};
	}

	private Button MakeButton(string text, EventHandler onClick)
	{
		Button button = new Button();
		button.Text = text;
		button.AutoSize = true;
		button.FlatStyle = FlatStyle.Flat;
		button.BackColor = Color.FromArgb(48, 48, 48);
		button.ForeColor = Color.FromArgb(253, 255, 251);
		button.Margin = new Padding(3);
		button.Padding = new Padding(6, 2, 6, 2);
		button.FlatAppearance.BorderColor = Color.FromArgb(70, 70, 70);
		button.Click += (object s, EventArgs e) =>
		{
			onClick(s, e);
			_screen.Focus();
		};
		return button;
	}

	private void AddKeysButton(Control parent, string text, int[] vks)
	{
		parent.Controls.Add(MakeButton(text, delegate
		{
			SendKeys(vks);
		}));
	}

	private void AddLaunchButton(Control parent, string text, string app)
	{
		parent.Controls.Add(MakeButton(text, delegate
		{
			_sendLaunch(app);
		}));
	}

	protected override void OnFormClosed(FormClosedEventArgs e)
	{
		_image?.Dispose();
		_image = null;
		base.OnFormClosed(e);
	}
}
