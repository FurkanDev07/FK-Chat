using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Globalization;
using System.IO;
using System.Text;

namespace FKSohbet;

internal static class OverlayRenderer
{
	private const float H = 40f;

	private const float PadL = 5f;

	private const float PhotoD = 30f;

	private const float Gap1 = 9f;

	private const float NameMax = 160f;

	private const float Gap2 = 10f;

	private const float PadR = 13f;

	private const float BarW = 3f;

	private const float BarGap = 2.5f;

	private const float BarIdle = 3f;

	private const float BarMax = 18f;

	private const int Bars = 4;

	private static readonly float AnimW = 19.5f;

	public static readonly Color Green = Color.FromArgb(110, 187, 48);

	public static readonly Color Text = Color.FromArgb(253, 255, 251);

	public static readonly Color Danger = Color.FromArgb(229, 72, 77);

	public const string FallbackName = "Sen";

	private static readonly StringFormat NameFormat = new StringFormat(StringFormat.GenericTypographic)
	{
		FormatFlags = (StringFormatFlags.MeasureTrailingSpaces | StringFormatFlags.NoWrap),
		Trimming = StringTrimming.None,
		LineAlignment = StringAlignment.Center
	};

	public const float CompactFactor = 0.85f;

	public const float RowGapDip = 4f;

	public const int MaxRows = 2;

	private static Font FontFor(float scale, bool bold = false)
	{
		float emSize = (bold ? 13f : 13.5f) * scale;
		try
		{
			return new Font("Segoe UI Semibold", emSize, bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Pixel);
		}
		catch
		{
			return new Font(FontFamily.GenericSansSerif, emSize, FontStyle.Bold, GraphicsUnit.Pixel);
		}
	}

	public static OverlayLayout Measure(string name, float scale)
	{
		if (scale < 0.5f)
		{
			scale = 0.5f;
		}
		if (scale > 4f)
		{
			scale = 4f;
		}
		string text = (string.IsNullOrWhiteSpace(name) ? "Sen" : name.Trim());
		float num2;
		using (Bitmap image = new Bitmap(1, 1))
		{
			using Graphics graphics = Graphics.FromImage(image);
			using Font font = FontFor(scale);
			graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
			float num = 160f * scale;
			num2 = graphics.MeasureString(text, font, PointF.Empty, NameFormat).Width;
			if (num2 > num)
			{
				TextElementEnumerator textElementEnumerator = StringInfo.GetTextElementEnumerator(text);
				List<string> list = new List<string>();
				while (textElementEnumerator.MoveNext())
				{
					list.Add((string)textElementEnumerator.Current);
				}
				int num3 = list.Count;
				while (num3 > 1)
				{
					num3--;
					string text2 = string.Concat(list.GetRange(0, num3)).TrimEnd() + "…";
					float width = graphics.MeasureString(text2, font, PointF.Empty, NameFormat).Width;
					if (width <= num)
					{
						text = text2;
						num2 = width;
						break;
					}
				}
			}
		}
		float num4 = 40f * scale;
		float x = 5f * scale;
		RectangleF photo = new RectangleF(x, (num4 - 30f * scale) / 2f, 30f * scale, 30f * scale);
		x = photo.Right + 9f * scale;
		RectangleF name2 = new RectangleF(x, 0f, (float)Math.Ceiling(num2), num4);
		x = name2.Right + 10f * scale;
		RectangleF anim = new RectangleF(x, (num4 - 18f * scale) / 2f, AnimW * scale, 18f * scale);
		x = anim.Right + 13f * scale;
		return new OverlayLayout
		{
			Scale = scale,
			Size = new Size((int)Math.Ceiling(x), (int)Math.Ceiling(num4)),
			Photo = photo,
			Name = name2,
			Anim = anim,
			NameText = text
		};
	}

	public static string Initials(string name)
	{
		if (string.IsNullOrWhiteSpace(name))
		{
			return "";
		}
		StringBuilder stringBuilder = new StringBuilder();
		int num = 0;
		string[] array = name.Trim().Split(new char[1] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
		for (int i = 0; i < array.Length; i++)
		{
			TextElementEnumerator textElementEnumerator = StringInfo.GetTextElementEnumerator(array[i]);
			if (textElementEnumerator.MoveNext())
			{
				stringBuilder.Append((string)textElementEnumerator.Current);
				num++;
			}
			if (num >= 2)
			{
				break;
			}
		}
		return stringBuilder.ToString().ToUpper(new CultureInfo("tr-TR"));
	}

	private static GraphicsPath Pill(RectangleF r)
	{
		float height = r.Height;
		GraphicsPath graphicsPath = new GraphicsPath();
		graphicsPath.AddArc(r.Left, r.Top, height, height, 90f, 180f);
		graphicsPath.AddArc(r.Right - height, r.Top, height, height, 270f, 180f);
		graphicsPath.CloseFigure();
		return graphicsPath;
	}

	private static void FillRoundBar(Graphics g, Brush b, float x, float cy, float w, float h)
	{
		if (h < w)
		{
			h = w;
		}
		float num = cy - h / 2f;
		using GraphicsPath graphicsPath = new GraphicsPath();
		graphicsPath.AddArc(x, num, w, w, 180f, 180f);
		graphicsPath.AddArc(x, num + h - w, w, w, 0f, 180f);
		graphicsPath.CloseFigure();
		g.FillPath(b, graphicsPath);
	}

	private static Color Mix(Color a, Color b, float t, int alpha)
	{
		t = Math.Max(0f, Math.Min(1f, t));
		return Color.FromArgb(alpha, (int)((float)(int)a.R + (float)(b.R - a.R) * t), (int)((float)(int)a.G + (float)(b.G - a.G) * t), (int)((float)(int)a.B + (float)(b.B - a.B) * t));
	}

	public static float BarAmount(int i, OverlayFrame f)
	{
		double[] array = new double[4] { 7.1, 9.3, 8.2, 10.4 };
		double[] array2 = new double[4] { 0.0, 1.7, 3.1, 4.6 };
		double num = 0.5 + 0.5 * Math.Sin(f.Time * array[i] + array2[i]);
		double num2 = 0.35 + 0.65 * num * (0.55 + 0.45 * (double)Math.Max(0f, Math.Min(1f, f.Level)));
		return (float)((double)f.Speak * num2);
	}

	public static OverlayStack MeasureStack(IList<string> names, float scale)
	{
		int num = Math.Max(1, Math.Min(2, names?.Count ?? 0));
		bool flag = num > 1;
		float scale2 = (flag ? (scale * 0.85f) : scale);
		OverlayLayout[] array = new OverlayLayout[num];
		float[] array2 = new float[num];
		float num2 = 0f;
		float num3 = 0f;
		float num4 = (float)Math.Round(4f * scale);
		for (int i = 0; i < num; i++)
		{
			array[i] = Measure((names != null && i < names.Count) ? names[i] : "", scale2);
			array2[i] = num2;
			num2 += (float)array[i].Size.Height + ((i < num - 1) ? num4 : 0f);
			num3 = Math.Max(num3, array[i].Size.Width);
		}
		return new OverlayStack
		{
			Scale = scale,
			Compact = flag,
			Rows = array,
			RowY = array2,
			Size = new Size((int)Math.Ceiling(num3), (int)Math.Ceiling(num2))
		};
	}

	public static void DrawStack(Graphics g, OverlayStack S, IList<OverlayFrame> frames)
	{
		g.Clear(Color.Transparent);
		for (int i = 0; i < S.Rows.Length && i < frames.Count; i++)
		{
			GraphicsState gstate = g.Save();
			g.TranslateTransform(0f, S.RowY[i]);
			DrawRow(g, S.Rows[i], frames[i]);
			g.Restore(gstate);
		}
	}

	public static void Draw(Graphics g, OverlayLayout L, OverlayFrame f)
	{
		g.Clear(Color.Transparent);
		DrawRow(g, L, f);
	}

	public static void DrawRow(Graphics g, OverlayLayout L, OverlayFrame f)
	{
		float scale = L.Scale;
		g.SmoothingMode = SmoothingMode.AntiAlias;
		g.PixelOffsetMode = PixelOffsetMode.HighQuality;
		g.InterpolationMode = InterpolationMode.HighQualityBicubic;
		g.CompositingQuality = CompositingQuality.HighQuality;
		g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
		using (GraphicsPath path = Pill(new RectangleF(0.5f, 0.5f, (float)L.Size.Width - 1f, (float)L.Size.Height - 1f)))
		{
			using SolidBrush brush = new SolidBrush(Color.FromArgb(218, 25, 25, 25));
			using Pen pen = new Pen(Color.FromArgb(30, 253, 255, 251), Math.Max(1f, scale));
			g.FillPath(brush, path);
			g.DrawPath(pen, path);
		}
		RectangleF photo = L.Photo;
		if (f.Photo != null)
		{
			using GraphicsPath graphicsPath = new GraphicsPath();
			graphicsPath.AddEllipse(photo);
			GraphicsState gstate = g.Save();
			g.SetClip(graphicsPath);
			g.DrawImage(f.Photo, photo);
			g.Restore(gstate);
		}
		else
		{
			using (SolidBrush brush2 = new SolidBrush(Color.FromArgb(255, 42, 54, 34)))
			{
				g.FillEllipse(brush2, photo);
			}
			string text = Initials(f.Name);
			if (text.Length > 0)
			{
				using Font font = FontFor(scale * 0.98f, bold: true);
				using SolidBrush brush3 = new SolidBrush(Green);
				using StringFormat format = new StringFormat
				{
					Alignment = StringAlignment.Center,
					LineAlignment = StringAlignment.Center
				};
				g.DrawString(text, font, brush3, new RectangleF(photo.X, photo.Y + 0.5f * scale, photo.Width, photo.Height), format);
			}
			else
			{
				using SolidBrush brush4 = new SolidBrush(Color.FromArgb(170, 253, 255, 251));
				float num = photo.X + photo.Width / 2f;
				float num2 = photo.Width / 30f;
				g.FillEllipse(brush4, num - 5f * num2, photo.Y + 6f * num2, 10f * num2, 10f * num2);
				g.FillPie(brush4, num - 10f * num2, photo.Y + 18f * num2, 20f * num2, 18f * num2, 180f, 180f);
			}
		}
		using (Pen pen2 = new Pen(Color.FromArgb(40, 253, 255, 251), Math.Max(1f, scale)))
		{
			g.DrawEllipse(pen2, photo);
		}
		if (f.Speak > 0.01f && !f.Muted)
		{
			float width = 2f * scale;
			float num3 = -1.5f * scale;
			RectangleF rect = RectangleF.Inflate(photo, 0f - num3, 0f - num3);
			using Pen pen3 = new Pen(Color.FromArgb((int)(255f * Math.Min(1f, f.Speak)), Green), width);
			g.DrawEllipse(pen3, rect);
		}
		using (Font font2 = FontFor(scale))
		{
			using SolidBrush brush5 = new SolidBrush(Text);
			g.DrawString(L.NameText, font2, brush5, new RectangleF(L.Name.X, L.Name.Y + 0.5f * scale, L.Name.Width + 2f * scale, L.Name.Height), NameFormat);
		}
		RectangleF anim = L.Anim;
		float cy = anim.Y + anim.Height / 2f;
		if (f.Muted)
		{
			float num4 = anim.Height / 18f;
			float num5 = anim.X + anim.Width / 2f;
			using Pen pen4 = new Pen(Danger, 1.7f * scale)
			{
				StartCap = LineCap.Round,
				EndCap = LineCap.Round
			};
			using (GraphicsPath path2 = Pill(new RectangleF(num5 - 3f * num4, anim.Y + 1f * num4, 6f * num4, 10f * num4)))
			{
				g.DrawPath(pen4, path2);
			}
			g.DrawArc(pen4, num5 - 5.5f * num4, anim.Y + 3f * num4, 11f * num4, 10f * num4, 0f, 180f);
			g.DrawLine(pen4, num5, anim.Y + 13f * num4, num5, anim.Y + 16.5f * num4);
			g.DrawLine(pen4, num5 - 7f * num4, anim.Y + 1f * num4, num5 + 7f * num4, anim.Y + 17f * num4);
			return;
		}
		float num6 = 3f * scale;
		float num7 = 2.5f * scale;
		float num8 = 3f * scale;
		float num9 = 18f * scale;
		for (int i = 0; i < 4; i++)
		{
			float num10 = BarAmount(i, f);
			float h = num8 + (num9 - num8) * num10;
			using SolidBrush b = new SolidBrush(Mix(Color.FromArgb(253, 255, 251), Green, f.Speak * 1.4f, (int)(80f + 175f * Math.Min(1f, f.Speak * 1.4f))));
			FillRoundBar(g, b, anim.X + (float)i * (num6 + num7), cy, num6, h);
		}
	}

	public static Bitmap DecodePhoto(string dataUrl)
	{
		if (string.IsNullOrEmpty(dataUrl) || dataUrl.Length > 400000)
		{
			return null;
		}
		if (!dataUrl.StartsWith("data:image/png;base64,", StringComparison.Ordinal))
		{
			return null;
		}
		try
		{
			using MemoryStream stream = new MemoryStream(Convert.FromBase64String(dataUrl.Substring("data:image/png;base64,".Length)));
			using Image ımage = Image.FromStream(stream);
			if (ımage.Width < 8 || ımage.Height < 8 || ımage.Width > 1024 || ımage.Height > 1024)
			{
				return null;
			}
			return new Bitmap(ımage);
		}
		catch
		{
			return null;
		}
	}
}
