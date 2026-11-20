using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Forms;

namespace FKSohbet;

internal sealed class OverlayController : IDisposable
{
	private sealed class Row
	{
		public string Id = "";

		public string Name = "";

		public Bitmap Photo;

		public string PhotoKey = "";

		public bool Speaking;

		public bool Muted;

		public float Level;

		public float Speak;

		public float LevelSmooth;
	}

	public const float MarginDip = 14f;

	public const int PollMs = 400;

	public const int FollowMs = 150;

	private readonly Timer _poll = new Timer
	{
		Interval = 400
	};

	private readonly Timer _anim = new Timer
	{
		Interval = 16
	};

	private OverlayWindow _win;

	private readonly List<Row> _rows = new List<Row>
	{
		new Row()
	};

	private bool _enabled = true;

	private bool _inRoom;

	private bool _shown;

	private bool _disposed;

	private float _fade;

	private double _time;

	private long _lastTick;

	private Rectangle _anchor;

	private int _dpi = 96;

	private OverlayStack _stack;

	private Bitmap _canvas;

	private OverlayTarget _target = new OverlayTarget();

	private bool _targetRunning;

	private int _lastRunCheck;

	private Row Self => _rows[0];

	public bool IsShown => _shown;

	public bool Enabled => _enabled;

	public OverlayLayout Layout
	{
		get
		{
			OverlayStack stack = _stack;
			if (stack == null)
			{
				return null;
			}
			return stack.Rows[0];
		}
	}

	public OverlayStack Stack => _stack;

	public int RowCount => _rows.Count;

	public Point Position { get; private set; }

	public bool Animating => _anim.Enabled;

	public float SpeakAmount
	{
		get
		{
			if (!Self.Muted)
			{
				return Self.Speak;
			}
			return 0f;
		}
	}

	public IntPtr WindowHandle
	{
		get
		{
			if (_win == null || !_win.IsHandleCreated)
			{
				return IntPtr.Zero;
			}
			return _win.Handle;
		}
	}

	public OverlayTarget Target => _target;

	public bool TargetRunning => _targetRunning;

	public IntPtr AnchorWindow { get; private set; }

	public event Action<bool> VisibleChanged;

	public event Action TargetStatusChanged;

	public OverlayController()
	{
		_poll.Tick += delegate
		{
			Poll();
		};
		_anim.Tick += delegate
		{
			Animate();
		};
		_poll.Start();
	}

	public void SetEnabled(bool on)
	{
		_enabled = on;
		Poll();
	}

	public void SetInRoom(bool inRoom)
	{
		_inRoom = inRoom;
		Poll();
	}

	public void SetTarget(OverlayTarget t)
	{
		_target = t ?? new OverlayTarget();
		_lastRunCheck = 0;
		_targetRunning = _target.IsSet && TargetFinder.IsRunning(_target);
		Poll();
		TargetStatusChanged?.Invoke();
	}

	private static string CleanName(string name)
	{
		name = (name ?? "").Trim();
		if (name.Length <= 64)
		{
			return name;
		}
		return name.Substring(0, 64);
	}

	private static void SetPhoto(Row r, string url)
	{
		string text = (string.IsNullOrEmpty(url) ? "" : (url.Length + ":" + url.GetHashCode()));
		if (!(text == r.PhotoKey))
		{
			r.PhotoKey = text;
			Bitmap photo = r.Photo;
			r.Photo = OverlayRenderer.DecodePhoto(url);
			photo?.Dispose();
		}
	}

	public void SetProfile(string name, string photoDataUrl)
	{
		Self.Name = CleanName(name);
		Self.PhotoKey = null;
		SetPhoto(Self, photoDataUrl);
		_stack = null;
		Redraw();
	}

	public void SetMembers(IList<(string id, string name, string photo)> members)
	{
		List<Row> list = new List<Row> { Self };
		if (members != null)
		{
			foreach (var m in members)
			{
				if (list.Count >= 2)
				{
					break;
				}
				if (!string.IsNullOrEmpty(m.id) && !list.Exists((Row r) => r.Id == m.id))
				{
					Row row = _rows.Find((Row x) => x.Id == m.id) ?? new Row
					{
						Id = m.id
					};
					row.Name = CleanName(m.name);
					SetPhoto(row, m.photo);
					list.Add(row);
				}
			}
		}
		foreach (Row row2 in _rows)
		{
			if (!list.Contains(row2))
			{
				row2.Photo?.Dispose();
			}
		}
		_rows.Clear();
		_rows.AddRange(list);
		_stack = null;
		Redraw();
		Kick();
	}

	public void SetVoice(bool speaking, double level, bool muted)
	{
		Row self = Self;
		self.Speaking = speaking && !muted;
		self.Level = (float)Math.Max(0.0, Math.Min(1.0, level));
		if (self.Muted != muted)
		{
			self.Muted = muted;
			Redraw();
		}
		Kick();
	}

	public void SetPeerVoice(string id, bool speaking, double level, bool muted)
	{
		Row row = _rows.Find((Row x) => x.Id == id && x.Id.Length > 0);
		if (row != null)
		{
			row.Speaking = speaking && !muted;
			row.Level = (float)Math.Max(0.0, Math.Min(1.0, level));
			if (row.Muted != muted)
			{
				row.Muted = muted;
				Redraw();
			}
			Kick();
		}
	}

	public bool PeerSpeaking(string id)
	{
		Row row = _rows.Find((Row x) => x.Id == id);
		if (row != null)
		{
			return row.Speak > 0.5f;
		}
		return false;
	}

	public void SetMuted(bool muted)
	{
		if (Self.Muted != muted)
		{
			Self.Muted = muted;
			if (muted)
			{
				Self.Speaking = false;
			}
			Kick();
			Redraw();
		}
	}

	public void Poll()
	{
		if (_disposed)
		{
			return;
		}
		bool flag = false;
		Rectangle rectangle = Rectangle.Empty;
		int num = 96;
		IntPtr anchorWindow = IntPtr.Zero;
		if (_enabled && _inRoom)
		{
			GameDetector.Target target;
			if (_target.IsSet)
			{
				if (TargetFinder.TryFindForeground(_target, out var place))
				{
					flag = true;
					rectangle = place.Client;
					num = place.Dpi;
					anchorWindow = place.Window;
				}
			}
			else if (GameDetector.TryFind(out target))
			{
				flag = true;
				rectangle = target.Monitor;
				num = target.Dpi;
				anchorWindow = target.Window;
			}
		}
		CheckRunning(flag);
		if (flag)
		{
			bool flag2 = rectangle != _anchor || num != _dpi;
			_anchor = rectangle;
			_dpi = num;
			AnchorWindow = anchorWindow;
			EnsureWindow();
			if (!_shown)
			{
				_shown = true;
				_stack = null;
				Redraw();
				_win.ShowNoActivate();
				Kick();
				VisibleChanged?.Invoke(obj: true);
				TargetStatusChanged?.Invoke();
			}
			else
			{
				_win.KeepOnTop();
				if (flag2 || _stack == null)
				{
					Redraw();
				}
			}
		}
		else if (_shown)
		{
			_shown = false;
			foreach (Row row in _rows)
			{
				row.Speaking = false;
			}
			Kick();
			VisibleChanged?.Invoke(obj: false);
			TargetStatusChanged?.Invoke();
		}
		int num2 = ((_target.IsSet && _shown) ? 150 : 400);
		if (_poll.Interval != num2)
		{
			_poll.Interval = num2;
		}
	}

	private void CheckRunning(bool foreground)
	{
		if (!_target.IsSet)
		{
			if (_targetRunning)
			{
				_targetRunning = false;
				TargetStatusChanged?.Invoke();
			}
			return;
		}
		bool flag = _targetRunning;
		if (foreground)
		{
			flag = true;
		}
		else if (Environment.TickCount - _lastRunCheck >= 1500 || _lastRunCheck == 0)
		{
			_lastRunCheck = Environment.TickCount | 1;
			flag = TargetFinder.IsRunning(_target);
		}
		if (flag != _targetRunning)
		{
			_targetRunning = flag;
			TargetStatusChanged?.Invoke();
		}
	}

	public static Point PlaceFor(Rectangle area, int dpi)
	{
		int num = (int)Math.Round(14f * (float)dpi / 96f);
		return new Point(area.Left + num, area.Top + num);
	}

	private void EnsureWindow()
	{
		if (_win == null)
		{
			_win = new OverlayWindow();
			_ = _win.Handle;
		}
	}

	private void Kick()
	{
		if (!_disposed && !_anim.Enabled)
		{
			_lastTick = Environment.TickCount;
			_anim.Start();
		}
	}

	private void Animate()
	{
		long num = Environment.TickCount;
		float num2 = Math.Max(0.001f, Math.Min(0.1f, (float)(num - _lastTick) / 1000f));
		_lastTick = num;
		_time += num2;
		bool flag = false;
		foreach (Row row in _rows)
		{
			bool flag2 = row.Speaking && !row.Muted;
			float step = (flag2 ? (num2 / 0.12f) : (num2 / 0.28f));
			row.Speak = Approach(row.Speak, flag2 ? 1f : 0f, step);
			row.LevelSmooth += (row.Level - row.LevelSmooth) * Math.Min(1f, num2 / 0.08f);
			if (flag2 || row.Speak > 0f)
			{
				flag = true;
			}
		}
		_fade = Approach(_fade, _shown ? 1f : 0f, num2 / (_shown ? 0.15f : 0.2f));
		if (_win != null)
		{
			if (_fade <= 0f && !_shown)
			{
				_win.HideNoActivate();
			}
			else
			{
				Redraw();
			}
		}
		if (!flag && (_shown ? (_fade >= 1f) : (_fade <= 0f)))
		{
			_anim.Stop();
		}
	}

	private static float Approach(float v, float target, float step)
	{
		if (!(v < target))
		{
			return Math.Max(target, v - step);
		}
		return Math.Min(target, v + step);
	}

	private OverlayFrame FrameOf(Row r)
	{
		return new OverlayFrame
		{
			Name = r.Name,
			Photo = r.Photo,
			Muted = r.Muted,
			Speak = (r.Muted ? 0f : r.Speak),
			Level = r.LevelSmooth,
			Time = _time
		};
	}

	public OverlayFrame CurrentFrame()
	{
		return FrameOf(Self);
	}

	public List<OverlayFrame> CurrentFrames()
	{
		List<OverlayFrame> list = new List<OverlayFrame>(_rows.Count);
		foreach (Row row in _rows)
		{
			list.Add(FrameOf(row));
		}
		return list;
	}

	public List<string> RowNames()
	{
		List<string> list = new List<string>(_rows.Count);
		for (int i = 0; i < _rows.Count; i++)
		{
			string item;
			if (i != 0)
			{
				item = (string.IsNullOrWhiteSpace(_rows[i].Name) ? "Arkadaş" : _rows[i].Name);
			}
			else
			{
				item = _rows[i].Name;
			}
			list.Add(item);
		}
		return list;
	}

	private void Redraw()
	{
		if (_win != null && (_shown || !(_fade <= 0f)))
		{
			float num = ((_dpi > 0) ? ((float)_dpi / 96f) : 1f);
			if (_stack == null || Math.Abs(_stack.Scale - num) > 0.001f || _stack.Rows.Length != _rows.Count)
			{
				_stack = OverlayRenderer.MeasureStack(RowNames(), num);
				_canvas?.Dispose();
				_canvas = new Bitmap(_stack.Size.Width, _stack.Size.Height, PixelFormat.Format32bppArgb);
			}
			using (Graphics g = Graphics.FromImage(_canvas))
			{
				OverlayRenderer.DrawStack(g, _stack, CurrentFrames());
			}
			Position = PlaceFor(_anchor, _dpi);
			_win.Present(_canvas, Position, (byte)Math.Round(255f * Math.Max(0f, Math.Min(1f, _fade))));
		}
	}

	public void Dispose()
	{
		if (_disposed)
		{
			return;
		}
		_disposed = true;
		_poll.Stop();
		_poll.Dispose();
		_anim.Stop();
		_anim.Dispose();
		try
		{
			_win?.Close();
			_win?.Dispose();
		}
		catch
		{
		}
		_canvas?.Dispose();
		foreach (Row row in _rows)
		{
			row.Photo?.Dispose();
		}
	}
}
