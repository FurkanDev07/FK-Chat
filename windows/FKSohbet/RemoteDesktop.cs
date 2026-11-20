using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace FKSohbet;

internal static class RemoteDesktop
{
	public sealed class CaptureResult
	{
		public string Data;

		public int Width;

		public int Height;
	}

	private struct INPUT
	{
		public uint type;

		public InputUnion U;
	}

	[StructLayout(LayoutKind.Explicit)]
	private struct InputUnion
	{
		[FieldOffset(0)]
		public MOUSEINPUT mi;

		[FieldOffset(0)]
		public KEYBDINPUT ki;

		[FieldOffset(0)]
		public HARDWAREINPUT hi;
	}

	private struct MOUSEINPUT
	{
		public int dx;

		public int dy;

		public uint mouseData;

		public uint dwFlags;

		public uint time;

		public IntPtr dwExtraInfo;
	}

	private struct KEYBDINPUT
	{
		public ushort wVk;

		public ushort wScan;

		public uint dwFlags;

		public uint time;

		public IntPtr dwExtraInfo;
	}

	private struct HARDWAREINPUT
	{
		public uint uMsg;

		public ushort wParamL;

		public ushort wParamH;
	}

	private struct POINT
	{
		public int X;

		public int Y;
	}

	private struct CURSORINFO
	{
		public int cbSize;

		public int flags;

		public IntPtr hCursor;

		public POINT ptScreenPos;
	}

	private struct ICONINFO
	{
		public bool fIcon;

		public int xHotspot;

		public int yHotspot;

		public IntPtr hbmMask;

		public IntPtr hbmColor;
	}

	private static readonly Dictionary<string, string> Presets = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
	{
		["explorer"] = "explorer.exe",
		["notepad"] = "notepad.exe",
		["calc"] = "calc.exe",
		["taskmgr"] = "taskmgr.exe",
		["cmd"] = "cmd.exe",
		["powershell"] = "powershell.exe",
		["mspaint"] = "mspaint.exe",
		["paint"] = "mspaint.exe"
	};

	public static CaptureResult Capture(int maxWidth, long quality)
	{
		try
		{
			Rectangle bounds = Screen.PrimaryScreen.Bounds;
			if (bounds.Width <= 0 || bounds.Height <= 0)
			{
				return null;
			}
			double num = Math.Min(1.0, (double)maxWidth / (double)bounds.Width);
			int width = Math.Max(16, (int)Math.Round((double)bounds.Width * num));
			int height = Math.Max(16, (int)Math.Round((double)bounds.Height * num));
			using Bitmap image = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
			using Graphics graphics = Graphics.FromImage(image);
			graphics.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);
			DrawCursor(graphics, bounds.Location);
			using Bitmap bitmap = new Bitmap(width, height, PixelFormat.Format24bppRgb);
			using Graphics graphics2 = Graphics.FromImage(bitmap);
			graphics2.InterpolationMode = InterpolationMode.HighQualityBicubic;
			graphics2.DrawImage(image, new Rectangle(0, 0, width, height));
			ImageCodecInfo jpegEncoder = GetJpegEncoder();
			if (jpegEncoder == null)
			{
				return null;
			}
			using EncoderParameters encoderParameters = new EncoderParameters(1);
			encoderParameters.Param[0] = new EncoderParameter(Encoder.Quality, quality);
			using MemoryStream memoryStream = new MemoryStream();
			bitmap.Save(memoryStream, jpegEncoder, encoderParameters);
			return new CaptureResult
			{
				Data = Convert.ToBase64String(memoryStream.ToArray()),
				Width = width,
				Height = height
			};
		}
		catch
		{
			return null;
		}
	}

	private static ImageCodecInfo GetJpegEncoder()
	{
		ImageCodecInfo[] ımageEncoders = ImageCodecInfo.GetImageEncoders();
		foreach (ImageCodecInfo ımageCodecInfo in ımageEncoders)
		{
			if (ımageCodecInfo.FormatID == ImageFormat.Jpeg.Guid)
			{
				return ımageCodecInfo;
			}
		}
		return null;
	}

	private static void DrawCursor(Graphics g, Point origin)
	{
		try
		{
			CURSORINFO pci = new CURSORINFO
			{
				cbSize = Marshal.SizeOf(typeof(CURSORINFO))
			};
			if (!GetCursorInfo(ref pci) || pci.flags != 1 || pci.hCursor == IntPtr.Zero)
			{
				return;
			}
			ICONINFO piconinfo = default;
			int num = 0;
			int num2 = 0;
			if (GetIconInfo(pci.hCursor, ref piconinfo))
			{
				num = piconinfo.xHotspot;
				num2 = piconinfo.yHotspot;
				if (piconinfo.hbmMask != IntPtr.Zero)
				{
					DeleteObject(piconinfo.hbmMask);
				}
				if (piconinfo.hbmColor != IntPtr.Zero)
				{
					DeleteObject(piconinfo.hbmColor);
				}
			}
			IntPtr hdc = g.GetHdc();
			try
			{
				DrawIconEx(hdc, pci.ptScreenPos.X - origin.X - num, pci.ptScreenPos.Y - origin.Y - num2, pci.hCursor, 0, 0, 0, IntPtr.Zero, 3u);
			}
			finally
			{
				g.ReleaseHdc(hdc);
			}
		}
		catch
		{
		}
	}

	public static void ApplyInput(Dictionary<string, object> m)
	{
		if (m == null)
		{
			return;
		}
		switch (GetStr(m, "kind"))
		{
		case "move":
		{
			if (TryPos(m, out var absX, out var absY))
			{
				Send(MouseInput(32769u, absX, absY, 0u));
			}
			break;
		}
		case "button":
		{
			if (TryPos(m, out var absX2, out var absY2))
			{
				uint num3;
				switch (GetStr(m, "button"))
				{
				default:
					return;
				case "left":
					num3 = (GetBool(m, "down") ? 2u : 4u);
					break;
				case "right":
					num3 = (GetBool(m, "down") ? 8u : 16u);
					break;
				case "middle":
					num3 = (GetBool(m, "down") ? 32u : 64u);
					break;
				}
				Send(MouseInput(0x8001 | num3, absX2, absY2, 0u));
			}
			break;
		}
		case "wheel":
		{
			if (TryPos(m, out var absX3, out var absY3))
			{
				Send(MouseInput(34817u, absX3, absY3, (uint)(int)GetNum(m, "delta")));
			}
			break;
		}
		case "key":
		{
			int num4 = (int)GetNum(m, "vk");
			if (num4 >= 1 && num4 <= 254)
			{
				Send(KeyInput((ushort)num4, GetBool(m, "down")));
			}
			break;
		}
		case "keys":
		{
			List<ushort> list = new List<ushort>();
			if (m.TryGetValue("vks", out var value) && value is IEnumerable enumerable && !(value is string))
			{
				foreach (object item in enumerable)
				{
					try
					{
						int num = Convert.ToInt32(item, CultureInfo.InvariantCulture);
						if (num >= 1 && num <= 254)
						{
							list.Add((ushort)num);
						}
					}
					catch
					{
					}
					if (list.Count >= 6)
					{
						break;
					}
				}
			}
			if (list.Count == 0)
			{
				break;
			}
			List<INPUT> list2 = new List<INPUT>();
			foreach (ushort item2 in list)
			{
				list2.Add(KeyInput(item2, down: true));
			}
			for (int num2 = list.Count - 1; num2 >= 0; num2--)
			{
				list2.Add(KeyInput(list[num2], down: false));
			}
			Send(list2.ToArray());
			break;
		}
		}
	}

	public static void TypeText(string text)
	{
		if (string.IsNullOrEmpty(text))
		{
			return;
		}
		if (text.Length > 500)
		{
			text = text.Substring(0, 500);
		}
		List<INPUT> list = new List<INPUT>();
		string text2 = text;
		foreach (char wScan in text2)
		{
			list.Add(new INPUT
			{
				type = 1u,
				U = new InputUnion
				{
					ki = new KEYBDINPUT
					{
						wVk = 0,
						wScan = wScan,
						dwFlags = 4u
					}
				}
			});
			list.Add(new INPUT
			{
				type = 1u,
				U = new InputUnion
				{
					ki = new KEYBDINPUT
					{
						wVk = 0,
						wScan = wScan,
						dwFlags = 6u
					}
				}
			});
			if (list.Count >= 200)
			{
				Send(list.ToArray());
				list.Clear();
			}
		}
		if (list.Count > 0)
		{
			Send(list.ToArray());
		}
	}

	public static bool LaunchApp(string app)
	{
		if (string.IsNullOrWhiteSpace(app))
		{
			return false;
		}
		app = app.Trim();
		if (app.Length > 260 || app.IndexOfAny(new char[2] { '\r', '\n' }) >= 0)
		{
			return false;
		}
		string fileName = (Presets.TryGetValue(app, out var value) ? value : app);
		try
		{
			Process.Start(new ProcessStartInfo
			{
				FileName = fileName,
				UseShellExecute = true
			});
			return true;
		}
		catch
		{
			try
			{
				Process.Start(new ProcessStartInfo
				{
					FileName = fileName,
					UseShellExecute = false
				});
				return true;
			}
			catch
			{
				return false;
			}
		}
	}

	private static bool TryPos(Dictionary<string, object> m, out int absX, out int absY)
	{
		double num = Math.Min(1.0, Math.Max(0.0, GetNum(m, "x")));
		double num2 = Math.Min(1.0, Math.Max(0.0, GetNum(m, "y")));
		absX = (int)Math.Round(num * 65535.0);
		absY = (int)Math.Round(num2 * 65535.0);
		return true;
	}

	private static INPUT MouseInput(uint flags, int x, int y, uint data)
	{
		return new INPUT
		{
			type = 0u,
			U = new InputUnion
			{
				mi = new MOUSEINPUT
				{
					dx = x,
					dy = y,
					mouseData = data,
					dwFlags = flags
				}
			}
		};
	}

	private static INPUT KeyInput(ushort vk, bool down)
	{
		uint num = 0u;
		if (IsExtendedKey(vk))
		{
			num |= 1;
		}
		if (!down)
		{
			num |= 2;
		}
		return new INPUT
		{
			type = 1u,
			U = new InputUnion
			{
				ki = new KEYBDINPUT
				{
					wVk = vk,
					wScan = 0,
					dwFlags = num
				}
			}
		};
	}

	private static bool IsExtendedKey(int vk)
	{
		switch (vk)
		{
		case 33:
		case 34:
		case 35:
		case 36:
		case 37:
		case 38:
		case 39:
		case 40:
		case 45:
		case 46:
		case 91:
		case 92:
		case 93:
		case 111:
		case 144:
		case 163:
		case 165:
			return true;
		default:
			return false;
		}
	}

	private static void Send(params INPUT[] inputs)
	{
		if (inputs == null || inputs.Length == 0)
		{
			return;
		}
		try
		{
			SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
		}
		catch
		{
		}
	}

	private static string GetStr(Dictionary<string, object> m, string k)
	{
		if (m == null || !m.TryGetValue(k, out var value))
		{
			return null;
		}
		return value as string;
	}

	private static bool GetBool(Dictionary<string, object> m, string k)
	{
		bool flag = false;
		int num;
		if (m != null && m.TryGetValue(k, out var value))
		{
			if (value is bool)
			{
				flag = (bool)value;
				num = 1;
			}
			else
			{
				num = 0;
			}
		}
		else
		{
			num = 0;
		}
		return (byte)(num & (flag ? 1 : 0)) != 0;
	}

	private static double GetNum(Dictionary<string, object> m, string k)
	{
		if (m == null || !m.TryGetValue(k, out var value) || value == null || value is bool || value is string)
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

	[DllImport("user32.dll", SetLastError = true)]
	private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

	[DllImport("user32.dll")]
	private static extern bool GetCursorInfo(ref CURSORINFO pci);

	[DllImport("user32.dll")]
	private static extern bool GetIconInfo(IntPtr hIcon, ref ICONINFO piconinfo);

	[DllImport("user32.dll")]
	private static extern bool DrawIconEx(IntPtr hdc, int xLeft, int yTop, IntPtr hIcon, int cxWidth, int cyHeight, int istepIfAniCur, IntPtr hbrFlickerFreeDraw, uint diFlags);

	[DllImport("gdi32.dll")]
	private static extern bool DeleteObject(IntPtr hObject);
}
