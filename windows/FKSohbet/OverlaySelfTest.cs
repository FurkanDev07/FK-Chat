using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace FKSohbet;

internal static class OverlaySelfTest
{
	private struct Scan
	{
		public int Count;

		public int MinX;

		public int MaxX;

		public int MinY;

		public int MaxY;
	}

	private static readonly List<string> Lines = new List<string>();

	private static int _fail;

	private static void Check(string name, bool ok, string detail = "")
	{
		if (!ok)
		{
			_fail++;
		}
		Lines.Add((ok ? "PASS " : "FAIL ") + name + ((detail.Length > 0) ? ("  — " + detail) : ""));
	}

	private static void Info(string text)
	{
		Lines.Add("INFO " + text);
	}

	public static int Run(string dir)
	{
		Directory.CreateDirectory(dir);
		try
		{
			RenderTests(dir);
			StackTests(dir);
			MatchTests();
			LiveTests(dir);
			TargetLiveTests(dir);
		}
		catch (Exception ex)
		{
			Check("Beklenmeyen hata", ok: false, ex.ToString());
		}
		Lines.Add((_fail == 0) ? "ALL PASS" : ("FAILED: " + _fail));
		File.WriteAllLines(Path.Combine(dir, "report.txt"), Lines, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
		return (_fail != 0) ? 1 : 0;
	}

	private static Bitmap TestPhoto()
	{
		Bitmap bitmap = new Bitmap(96, 96, PixelFormat.Format32bppArgb);
		using Graphics graphics = Graphics.FromImage(bitmap);
		using LinearGradientBrush brush = new LinearGradientBrush(new Rectangle(0, 0, 96, 96), Color.FromArgb(240, 120, 40), Color.FromArgb(200, 60, 160), 45f);
		graphics.FillRectangle(brush, 0, 0, 96, 96);
		return bitmap;
	}

	private static string ToDataUrl(Bitmap b)
	{
		using MemoryStream memoryStream = new MemoryStream();
		b.Save(memoryStream, ImageFormat.Png);
		return "data:image/png;base64," + Convert.ToBase64String(memoryStream.ToArray());
	}

	private static bool IsGreen(Color c)
	{
		if (c.A > 120 && c.G > 140 && c.G > c.R + 40)
		{
			return c.G > c.B + 60;
		}
		return false;
	}

	private static bool IsRed(Color c)
	{
		if (c.A > 120 && c.R > 170 && c.G < 110)
		{
			return c.B < 120;
		}
		return false;
	}

	private static bool IsText(Color c)
	{
		if (c.A > 150 && c.R > 200 && c.G > 200)
		{
			return c.B > 200;
		}
		return false;
	}

	private static Scan ScanRect(Bitmap b, RectangleF r, Func<Color, bool> pred)
	{
		Scan result = new Scan
		{
			MinX = int.MaxValue,
			MinY = int.MaxValue,
			MaxX = -1,
			MaxY = -1
		};
		int num = Math.Max(0, (int)Math.Floor(r.Left));
		int num2 = Math.Min(b.Width - 1, (int)Math.Ceiling(r.Right));
		int num3 = Math.Max(0, (int)Math.Floor(r.Top));
		int num4 = Math.Min(b.Height - 1, (int)Math.Ceiling(r.Bottom));
		for (int i = num3; i <= num4; i++)
		{
			for (int j = num; j <= num2; j++)
			{
				if (pred(b.GetPixel(j, i)))
				{
					result.Count++;
					if (j < result.MinX)
					{
						result.MinX = j;
					}
					if (j > result.MaxX)
					{
						result.MaxX = j;
					}
					if (i < result.MinY)
					{
						result.MinY = i;
					}
					if (i > result.MaxY)
					{
						result.MaxY = i;
					}
				}
			}
		}
		return result;
	}

	private static Bitmap Render(OverlayLayout L, OverlayFrame f)
	{
		Bitmap bitmap = new Bitmap(L.Size.Width, L.Size.Height, PixelFormat.Format32bppArgb);
		using Graphics g = Graphics.FromImage(bitmap);
		OverlayRenderer.Draw(g, L, f);
		return bitmap;
	}

	private static void SavePreview(Bitmap overlay, string path)
	{
		using Bitmap bitmap = new Bitmap(overlay.Width + 40, overlay.Height + 40);
		using Graphics graphics = Graphics.FromImage(bitmap);
		using (LinearGradientBrush brush = new LinearGradientBrush(new Rectangle(0, 0, bitmap.Width, bitmap.Height), Color.FromArgb(70, 110, 150), Color.FromArgb(150, 170, 120), 30f))
		{
			graphics.FillRectangle(brush, 0, 0, bitmap.Width, bitmap.Height);
		}
		graphics.DrawImage(overlay, 14, 14);
		bitmap.Save(path, ImageFormat.Png);
	}

	private static void RenderTests(string dir)
	{
		using (Bitmap b = TestPhoto())
		{
			Bitmap bitmap = OverlayRenderer.DecodePhoto(ToDataUrl(b));
			Check("PNG profil fotoğrafı çözülüyor", bitmap != null && bitmap.Width == 96);
			Check("Geçersiz fotoğraf reddediliyor", OverlayRenderer.DecodePhoto("data:image/webp;base64,AAAA") == null && OverlayRenderer.DecodePhoto("data:image/png;base64,!!!") == null && OverlayRenderer.DecodePhoto(null) == null);
			string text = "Çok Uzun Bir İsim Soyisim Deneme Kullanıcısı Furkan";
			bool ok = true;
			string text2 = "";
			float[] array = new float[4] { 1f, 1.25f, 1.5f, 2f };
			foreach (float num in array)
			{
				string[] array2 = new string[4] { "Furkan Kaya", "", "A", text };
				foreach (string text3 in array2)
				{
					OverlayLayout overlayLayout = OverlayRenderer.Measure(text3, num);
					if (!(overlayLayout.Photo.Left >= 0f) || !(overlayLayout.Photo.Right < overlayLayout.Name.Left) || !(overlayLayout.Name.Right < overlayLayout.Anim.Left) || !(overlayLayout.Anim.Right <= (float)overlayLayout.Size.Width) || !(Math.Abs((overlayLayout.Photo.Top + overlayLayout.Photo.Bottom) / 2f - (overlayLayout.Anim.Top + overlayLayout.Anim.Bottom) / 2f) < 1f) || overlayLayout.Size.Height != (int)Math.Ceiling(40f * num) || !(overlayLayout.Name.Width <= 160f * num + 1f))
					{
						ok = false;
						text2 += $"[{num} '{text3}' P{overlayLayout.Photo} N{overlayLayout.Name} A{overlayLayout.Anim}] ";
					}
				}
			}
			Check("Yerleşim sırası PP → İsim → Animasyon (4 ölçek × 4 isim)", ok, text2);
			OverlayLayout overlayLayout2 = OverlayRenderer.Measure(text, 1f);
			Check("Uzun isim kısaltılır (…) ve gösterge küçük kalır", overlayLayout2.NameText.EndsWith("…") && overlayLayout2.Size.Width <= 260, overlayLayout2.NameText + " / " + overlayLayout2.Size.Width + " px");
			Check("İsim yoksa \"Sen\" yazılır", OverlayRenderer.Measure("", 1f).NameText == "Sen");
			OverlayLayout overlayLayout3 = OverlayRenderer.Measure("Furkan Kaya", 1f);
			Check("Kompakt boyut (%100 ölçek)", overlayLayout3.Size.Height == 40 && overlayLayout3.Size.Width < 220, overlayLayout3.Size.Width + "×" + overlayLayout3.Size.Height);
			Check("Baş harfler", OverlayRenderer.Initials("furkan kaya") == "FK" && OverlayRenderer.Initials("ilker") == "İ" && OverlayRenderer.Initials(" ") == "");
			OverlayLayout overlayLayout4 = OverlayRenderer.Measure("Furkan Kaya", 1.5f);
			OverlayFrame f = new OverlayFrame
			{
				Name = "Furkan Kaya",
				Photo = bitmap,
				Speak = 0f,
				Level = 0f,
				Time = 0.3
			};
			OverlayFrame f2 = new OverlayFrame
			{
				Name = "Furkan Kaya",
				Photo = bitmap,
				Speak = 1f,
				Level = 0.8f,
				Time = 0.3
			};
			OverlayFrame f3 = new OverlayFrame
			{
				Name = "Furkan Kaya",
				Photo = bitmap,
				Muted = true,
				Speak = 0f
			};
			OverlayFrame f4 = new OverlayFrame
			{
				Name = "Furkan Kaya",
				Photo = null,
				Speak = 1f,
				Level = 0.6f,
				Time = 1.1
			};
			using (Bitmap bitmap2 = Render(overlayLayout4, f))
			{
				using Bitmap bitmap3 = Render(overlayLayout4, f2);
				using Bitmap bitmap4 = Render(overlayLayout4, f3);
				using Bitmap bitmap5 = Render(overlayLayout4, f4);
				Color pixel = bitmap2.GetPixel((int)(overlayLayout4.Photo.X + overlayLayout4.Photo.Width / 2f), (int)(overlayLayout4.Photo.Y + overlayLayout4.Photo.Height / 2f));
				Check("PP en solda, fotoğraf net çiziliyor", pixel.R > 180 && pixel.B > 60 && pixel.G < 140, pixel.ToString());
				RectangleF r = new RectangleF(0f, 0f, bitmap3.Width, bitmap3.Height);
				Scan scan = ScanRect(bitmap3, new RectangleF(overlayLayout4.Photo.Right + 1f, 0f, bitmap3.Width, bitmap3.Height), IsText);
				Scan scan2 = ScanRect(bitmap3, new RectangleF(overlayLayout4.Photo.Right + 4f, 0f, bitmap3.Width, bitmap3.Height), IsGreen);
				Scan scan3 = ScanRect(bitmap3, r, (Color c) => c.A > 200 && c.R > 180 && c.G < 140 && c.B > 60);
				bool ok2 = scan3.Count > 50 && scan.Count > 30 && scan2.Count > 10 && scan3.MaxX < scan.MinX && scan.MaxX < scan2.MinX;
				Check("Piksellerde sıra: PP → İsim → Animasyon", ok2, $"PP x≤{scan3.MaxX}, isim x={scan.MinX}..{scan.MaxX}, animasyon x≥{scan2.MinX}");
				Scan scan4 = ScanRect(bitmap2, overlayLayout4.Anim, IsGreen);
				Scan scan5 = ScanRect(bitmap3, overlayLayout4.Anim, IsGreen);
				Scan scan6 = ScanRect(bitmap2, overlayLayout4.Anim, (Color c) => c.A > 150 && c.R > 70 && c.G > 70 && c.B > 70);
				Check("Sessiz: animasyon pasif (yeşil yok, küçük soluk noktalar)", scan4.Count == 0 && scan6.Count > 0 && scan6.MaxY - scan6.MinY <= 6, "yükseklik " + (scan6.MaxY - scan6.MinY + 1) + " px");
				Check("Konuşuyor: animasyon aktif (yeşil, yükselen çubuklar)", scan5.Count > 20 && scan5.MaxY - scan5.MinY >= 10, scan5.Count + " px, yükseklik " + (scan5.MaxY - scan5.MinY + 1) + " px");
				Scan scan7 = ScanRect(bitmap2, RectangleF.Inflate(overlayLayout4.Photo, 3f, 3f), IsGreen);
				Scan scan8 = ScanRect(bitmap3, RectangleF.Inflate(overlayLayout4.Photo, 3f, 3f), IsGreen);
				Check("Konuşurken PP çevresinde yeşil halka, sessizken yok", scan7.Count == 0 && scan8.Count > 20, scan7.Count + " / " + scan8.Count);
				Scan scan9 = ScanRect(bitmap4, overlayLayout4.Anim, IsRed);
				Scan scan10 = ScanRect(bitmap4, r, IsGreen);
				Check("Mikrofon kapalı: aynı yerde kırmızı simge, konuşma animasyonu yok", scan9.Count > 15 && scan10.Count == 0, scan9.Count + " kırmızı px");
				Check("Fotoğraf yoksa PP yerinde baş harfler (FK)", ScanRect(bitmap5, overlayLayout4.Photo, IsGreen).Count > 20);
				OverlayFrame f5 = new OverlayFrame
				{
					Name = "x",
					Speak = 1f,
					Level = 0.8f,
					Time = 0.4
				};
				bool flag = false;
				for (int num2 = 0; num2 < 4; num2++)
				{
					if (Math.Abs(OverlayRenderer.BarAmount(num2, f2) - OverlayRenderer.BarAmount(num2, f5)) > 0.05f)
					{
						flag = true;
					}
				}
				OverlayFrame f6 = new OverlayFrame
				{
					Speak = 0.5f,
					Level = 0.8f,
					Time = 0.3
				};
				bool flag2 = true;
				for (int num3 = 0; num3 < 4; num3++)
				{
					if (OverlayRenderer.BarAmount(num3, f) != 0f || !(OverlayRenderer.BarAmount(num3, f6) > 0f) || !((double)OverlayRenderer.BarAmount(num3, f6) < (double)OverlayRenderer.BarAmount(num3, f2) + 1E-06))
					{
						flag2 = false;
					}
				}
				Check("Çubuklar zamanla hareket ediyor ve açılış kademeli", flag & flag2);
				SavePreview(bitmap2, Path.Combine(dir, "render-1-sessiz.png"));
				SavePreview(bitmap3, Path.Combine(dir, "render-2-konusuyor.png"));
				SavePreview(bitmap4, Path.Combine(dir, "render-3-mikrofon-kapali.png"));
				SavePreview(bitmap5, Path.Combine(dir, "render-4-fotografsiz.png"));
			}
			array = new float[2] { 1f, 2f };
			foreach (float num4 in array)
			{
				using Bitmap overlay = Render(OverlayRenderer.Measure("Furkan Kaya", num4), new OverlayFrame
				{
					Name = "Furkan Kaya",
					Photo = bitmap,
					Speak = 1f,
					Level = 0.7f,
					Time = 0.9
				});
				SavePreview(overlay, Path.Combine(dir, $"render-olcek-{(int)(num4 * 100f)}.png"));
			}
			bitmap.Dispose();
		}
		(Rectangle, int, Point)[] array3 = new (Rectangle, int, Point)[6]
		{
			(new Rectangle(0, 0, 1920, 1080), 96, new Point(14, 14)),
			(new Rectangle(0, 0, 2560, 1440), 144, new Point(21, 21)),
			(new Rectangle(0, 0, 3840, 2160), 192, new Point(28, 28)),
			(new Rectangle(-1920, 0, 1920, 1080), 96, new Point(-1906, 14)),
			(new Rectangle(1920, -200, 3840, 2160), 192, new Point(1948, -172)),
			(new Rectangle(0, 0, 1280, 720), 120, new Point(18, 18))
		};
		bool ok3 = true;
		string text4 = "";
		(Rectangle, int, Point)[] array4 = array3;
		for (int num5 = 0; num5 < array4.Length; num5++)
		{
			(Rectangle, int, Point) tuple = array4[num5];
			Point point = OverlayController.PlaceFor(tuple.Item1, tuple.Item2);
			if (point != tuple.Item3)
			{
				ok3 = false;
				text4 += $"{tuple.Item1}@{tuple.Item2}→{point} ";
			}
		}
		Check("Sol üst konum: farklı çözünürlük, DPI ve monitörlerde doğru", ok3, text4);
	}

	private static void Pump(int ms)
	{
		Stopwatch stopwatch = Stopwatch.StartNew();
		while (stopwatch.ElapsedMilliseconds < ms)
		{
			Application.DoEvents();
			Thread.Sleep(8);
		}
	}

	private static bool PumpUntil(Func<bool> cond, int ms)
	{
		Stopwatch stopwatch = Stopwatch.StartNew();
		while (stopwatch.ElapsedMilliseconds < ms)
		{
			if (cond())
			{
				return true;
			}
			Application.DoEvents();
			Thread.Sleep(8);
		}
		return cond();
	}

	private static Process StartGame(bool windowed, string title = null, string exePath = null)
	{
		string arguments = "--overlay-test-game" + (windowed ? " windowed" : " full") + ((title != null) ? (" \"" + title + "\"") : "");
		Process process = Process.Start(new ProcessStartInfo(exePath ?? Application.ExecutablePath, arguments)
		{
			UseShellExecute = false
		});
		try
		{
			process.WaitForInputIdle(10000);
		}
		catch
		{
		}
		return process;
	}

	private static void Kill(Process p)
	{
		if (p == null)
		{
			return;
		}
		try
		{
			if (!p.HasExited)
			{
				p.Kill();
				p.WaitForExit(5000);
			}
		}
		catch
		{
		}
	}

	private static IntPtr GameWindow(Process p)
	{
		IntPtr found = IntPtr.Zero;
		PumpUntil(() =>
		{
			try
			{
				p.Refresh();
				found = p.MainWindowHandle;
			}
			catch
			{
			}
			return found != IntPtr.Zero;
		}, 10000);
		return found;
	}

	private static void Capture(Rectangle r, string path)
	{
		try
		{
			using Bitmap bitmap = new Bitmap(r.Width, r.Height);
			using (Graphics graphics = Graphics.FromImage(bitmap))
			{
				graphics.CopyFromScreen(r.Location, Point.Empty, r.Size);
			}
			bitmap.Save(path, ImageFormat.Png);
		}
		catch (Exception ex)
		{
			Info("Ekran görüntüsü alınamadı: " + ex.Message);
		}
	}

	private static int CountOnScreen(Rectangle r, Func<Color, bool> pred)
	{
		try
		{
			using Bitmap bitmap = new Bitmap(r.Width, r.Height);
			using (Graphics graphics = Graphics.FromImage(bitmap))
			{
				graphics.CopyFromScreen(r.Location, Point.Empty, r.Size);
			}
			return ScanRect(bitmap, new RectangleF(0f, 0f, bitmap.Width, bitmap.Height), pred).Count;
		}
		catch
		{
			return -1;
		}
	}

	[DllImport("user32.dll")]
	private static extern int GetWindowLong(IntPtr h, int i);

	[DllImport("user32.dll")]
	private static extern bool SetForegroundWindow(IntPtr h);

	private static void LiveTests(string dir)
	{
		Rectangle bounds = Screen.PrimaryScreen.Bounds;
		Rectangle rectangle = bounds;
		Info("Ekran: " + rectangle.ToString());
		string photoDataUrl;
		using (Bitmap b = TestPhoto())
		{
			photoDataUrl = ToDataUrl(b);
		}
		OverlayController ov = new OverlayController();
		List<bool> events = new List<bool>();
		ov.VisibleChanged += (bool v) =>
		{
			events.Add(v);
		};
		ov.SetProfile("Furkan Kaya", photoDataUrl);
		ov.SetEnabled(on: true);
		ov.SetInRoom(inRoom: false);
		Process p = StartGame(windowed: false);
		try
		{
			IntPtr ıntPtr = GameWindow(p);
			Check("Test oyunu (ayrı süreç, tam ekran) açıldı", ıntPtr != IntPtr.Zero);
			SetForegroundWindow(ıntPtr);
			bool flag = PumpUntil(() => GameDetector.TryFind(out var _), 5000);
			GameDetector.TryFind(out var target);
			bool ok = flag && target.Window == ıntPtr && target.Monitor == bounds;
			rectangle = target.Monitor;
			Check("Algılayıcı: öndeki tam ekran pencere oyun sayılıyor", ok, rectangle.ToString() + " dpi " + target.Dpi);
			Pump(900);
			Check("Odada değilken gösterge görünmez", !ov.IsShown);
			ov.SetInRoom(inRoom: true);
			bool flag2 = PumpUntil(() => ov.IsShown, 3000);
			Pump(400);
			Check("Oyun + oda: gösterge görünür", flag2 && events.Count > 0 && events[events.Count - 1]);
			Point point = OverlayController.PlaceFor(bounds, target.Dpi);
			OverlayNative.GetWindowRect(ov.WindowHandle, out var r);
			Rectangle rectangle2 = r.ToRectangle();
			Check("Gösterge sol üst köşede", rectangle2.Location == point && ov.Layout != null && rectangle2.Size == ov.Layout.Size, rectangle2.ToString());
			int windowLong = GetWindowLong(ov.WindowHandle, -20);
			bool ok2 = (windowLong & 0x80000) != 0 && (windowLong & 0x20) != 0 && (windowLong & 0x8000000) != 0 && (windowLong & 8) != 0 && (windowLong & 0x80) != 0;
			Check("Saydam, tıklamayı geçirir, odak almaz, en üstte, görev çubuğunda yok", ok2, "0x" + windowLong.ToString("X"));
			Check("Gösterge oyunun odağını çalmadı", OverlayNative.GetForegroundWindow() == ıntPtr);
			PumpUntil(() => !ov.Animating, 1500);
			Check("Sessizken animasyon/çizim döngüsü durur (boşta CPU yok)", !ov.Animating);
			Rectangle r2 = new Rectangle(bounds.Left, bounds.Top, Math.Min(bounds.Width, 420), 110);
			Rectangle r3 = Rectangle.Round(new RectangleF((float)rectangle2.X + ov.Layout.Anim.X - 2f, (float)rectangle2.Y + ov.Layout.Anim.Y - 2f, ov.Layout.Anim.Width + 4f, ov.Layout.Anim.Height + 4f));
			Capture(r2, Path.Combine(dir, "live-1-oyun-sessiz.png"));
			int num = CountOnScreen(r3, IsGreen);
			ov.SetVoice(speaking: true, 0.8, muted: false);
			bool flag3 = PumpUntil(() => ov.SpeakAmount >= 1f, 1500);
			Check("Konuşma başlayınca animasyon akıcı şekilde aktif", flag3 && ov.Animating, "açıklık " + ov.SpeakAmount.ToString("0.00"));
			Pump(150);
			Capture(r2, Path.Combine(dir, "live-2-oyun-konusuyor.png"));
			int num2 = CountOnScreen(r3, IsGreen);
			if (num2 > 0 || num > 0)
			{
				Check("Ekranda: konuşurken yeşil çubuklar var, sessizken yok", num == 0 && num2 > 5, num + " → " + num2 + " px");
			}
			else
			{
				Info("Ekran yakalamada katmanlı pencere görünmüyor (bu ortamın sınırı); çizim A bölümünde piksel düzeyinde doğrulandı.");
			}
			ov.SetVoice(speaking: false, 0.0, muted: false);
			bool ok3 = PumpUntil(() => ov.SpeakAmount <= 0f && !ov.Animating, 2000);
			Check("Konuşma bitince animasyon pasif, döngü durur", ok3);
			Capture(r2, Path.Combine(dir, "live-3-oyun-sustu.png"));
			if (num2 > 0)
			{
				Check("Ekranda: susunca yeşil çubuklar kayboldu", CountOnScreen(r3, IsGreen) == 0);
			}
			ov.SetMuted(muted: true);
			Pump(300);
			Capture(r2, Path.Combine(dir, "live-4-oyun-mikrofon-kapali.png"));
			ov.SetVoice(speaking: true, 0.9, muted: true);
			Pump(300);
			Check("Mikrofon kapalıyken konuşma animasyonu çalışmaz", ov.SpeakAmount == 0f);
			ov.SetMuted(muted: false);
			ov.SetProfile("Ayşe Yılmaz", "");
			Pump(200);
			Check("Profil değişince gösterge güncellenir (isim)", ov.Layout != null && ov.Layout.NameText == "Ayşe Yılmaz");
			Capture(r2, Path.Combine(dir, "live-5-profil-degisti.png"));
			ov.SetProfile("Furkan Kaya", photoDataUrl);
			using (Form form = new Form
			{
				Text = "FK Sohbet (test)",
				StartPosition = FormStartPosition.Manual,
				Bounds = new Rectangle(200, 200, 460, 300)
			})
			{
				form.Show();
				form.Activate();
				SetForegroundWindow(form.Handle);
				Check("FK Sohbet öndeyken gösterge gizlenir", PumpUntil(() => !ov.IsShown, 3000));
				form.Close();
			}
			SetForegroundWindow(ıntPtr);
			Check("Oyuna dönünce tekrar görünür", PumpUntil(() => ov.IsShown, 3000));
			ov.SetEnabled(on: false);
			Check("Ayar kapalıysa gösterge gizlenir", PumpUntil(() => !ov.IsShown, 2000));
			ov.SetEnabled(on: true);
			Check("Ayar açılınca tekrar görünür", PumpUntil(() => ov.IsShown, 2000));
			ov.SetInRoom(inRoom: false);
			Check("Odadan çıkınca gösterge gizlenir", PumpUntil(() => !ov.IsShown, 2000));
			ov.SetInRoom(inRoom: true);
			PumpUntil(() => ov.IsShown, 2000);
		}
		finally
		{
			Kill(p);
		}
		Check("Oyun kapanınca gösterge gizlenir", PumpUntil(() => !ov.IsShown, 3000));
		Process p2 = StartGame(windowed: true);
		try
		{
			IntPtr ıntPtr2 = GameWindow(p2);
			SetForegroundWindow(ıntPtr2);
			Pump(1200);
			Check("Tam ekran olmayan pencere oyun sayılmaz (gösterge yok)", ıntPtr2 != IntPtr.Zero && !ov.IsShown);
		}
		finally
		{
			Kill(p2);
		}
		ov.Dispose();
	}

	private static void StackTests(string dir)
	{
		Bitmap bitmap;
		using (Bitmap original = TestPhoto())
		{
			bitmap = new Bitmap(original);
		}
		string[] array = new string[2] { "Furkan Kaya", "Elif Nur Şahinoğlu Uzun İsim" };
		OverlayStack overlayStack = OverlayRenderer.MeasureStack(new string[1] { "Furkan Kaya" }, 1f);
		Check("Tek kişi: satır eskisiyle aynı (40 px)", !overlayStack.Compact && overlayStack.Size.Height == 40 && overlayStack.Size == OverlayRenderer.Measure("Furkan Kaya", 1f).Size, overlayStack.Size.ToString());
		OverlayStack overlayStack2 = OverlayRenderer.MeasureStack(array, 1f);
		bool flag = true;
		string text = "";
		for (int i = 0; i < overlayStack2.Rows.Length; i++)
		{
			OverlayLayout overlayLayout = overlayStack2.Rows[i];
			if (!(overlayLayout.Photo.Right <= overlayLayout.Name.Left) || !(overlayLayout.Name.Right <= overlayLayout.Anim.Left) || !(overlayLayout.Photo.Left < 8f))
			{
				flag = false;
				text = text + i + " ";
			}
		}
		Check("2 satırın ikisinde de sıra PP → İsim → Animasyon", flag && overlayStack2.Rows.Length == 2, text);
		bool flag2 = true;
		for (int j = 1; j < overlayStack2.Rows.Length; j++)
		{
			if (overlayStack2.RowY[j] < overlayStack2.RowY[j - 1] + (float)overlayStack2.Rows[j - 1].Size.Height)
			{
				flag2 = false;
			}
		}
		Check("Satırlar üst üste binmiyor, sıra korunuyor (en üstte sen)", flag2 && overlayStack2.RowY[0] == 0f);
		Check("2 kişi: kontrollü boyut (oyunu kapatmaz)", overlayStack2.Compact && overlayStack2.Rows[0].Size.Height == 34 && overlayStack2.Size.Height <= 224 && overlayStack2.Size.Width <= 230, overlayStack2.Size.Width + "×" + overlayStack2.Size.Height + " px (1920×1080 ekranın %" + (100.0 * (double)overlayStack2.Size.Width * (double)overlayStack2.Size.Height / 2073600.0).ToString("0.0") + "'i)");
		Check("Uzun isim kısaltılır (…)", overlayStack2.Rows[1].NameText.EndsWith("…"), overlayStack2.Rows[1].NameText);
		OverlayStack overlayStack3 = OverlayRenderer.MeasureStack(new string[3] { "1", "2", "3" }, 1f);
		Check("En fazla 2 satır", overlayStack3.Rows.Length == 2);
		List<OverlayFrame> list = new List<OverlayFrame>();
		for (int k = 0; k < 2; k++)
		{
			list.Add(new OverlayFrame
			{
				Name = array[k],
				Photo = ((k % 2 == 0) ? bitmap : null),
				Speak = ((k == 0) ? 1f : 0f),
				Level = 0.8f,
				Time = 0.5 + (double)k,
				Muted = (k == 1)
			});
		}
		using (Bitmap bitmap2 = new Bitmap(overlayStack2.Size.Width, overlayStack2.Size.Height, PixelFormat.Format32bppArgb))
		{
			using (Graphics g = Graphics.FromImage(bitmap2))
			{
				OverlayRenderer.DrawStack(g, overlayStack2, list);
			}
			SavePreview(bitmap2, Path.Combine(dir, "render-5-iki-kisi.png"));
			bool ok = true;
			string text2 = "";
			for (int l = 0; l < 2; l++)
			{
				OverlayLayout overlayLayout2 = overlayStack2.Rows[l];
				RectangleF r = new RectangleF(overlayLayout2.Anim.X, overlayStack2.RowY[l] + overlayLayout2.Anim.Y, overlayLayout2.Anim.Width, overlayLayout2.Anim.Height);
				int count = ScanRect(bitmap2, r, IsGreen).Count;
				int count2 = ScanRect(bitmap2, r, IsRed).Count;
				RectangleF r2 = new RectangleF(overlayLayout2.Name.X, overlayStack2.RowY[l], overlayLayout2.Name.Width, overlayLayout2.Size.Height);
				int count3 = ScanRect(bitmap2, r2, IsText).Count;
				if (!((list[l].Speak > 0f && !list[l].Muted) ? (count > 20) : (count == 0)) || !(list[l].Muted ? (count2 > 10) : (count2 == 0)) || count3 <= 20)
				{
					ok = false;
					text2 += $"[{l}: yeşil {count} kırmızı {count2} yazı {count3}] ";
				}
			}
			Check("Her satır kendi kişisinin durumunu çizer (konuşan yeşil, susan pasif, kapalı kırmızı)", ok, text2);
		}
		OverlayStack overlayStack4 = OverlayRenderer.MeasureStack(new string[2] { "Furkan", "Ayşe" }, 1f);
		List<OverlayFrame> frames = new List<OverlayFrame>
		{
			new OverlayFrame
			{
				Name = "Furkan",
				Photo = bitmap,
				Speak = 0f
			},
			new OverlayFrame
			{
				Name = "Ayşe",
				Speak = 1f,
				Level = 0.9f,
				Time = 1.1
			}
		};
		using (Bitmap bitmap3 = new Bitmap(overlayStack4.Size.Width, overlayStack4.Size.Height, PixelFormat.Format32bppArgb))
		{
			using (Graphics g2 = Graphics.FromImage(bitmap3))
			{
				OverlayRenderer.DrawStack(g2, overlayStack4, frames);
			}
			SavePreview(bitmap3, Path.Combine(dir, "render-6-iki-kisi.png"));
		}
		bitmap.Dispose();
	}

	private static void MatchTests()
	{
		Check("Başlık anahtarı", OverlayTarget.TitleKey("Minecraft 1.20.1 - Tek Oyunculu") == "Minecraft" && OverlayTarget.TitleKey("  Among Us") == "Among" && OverlayTarget.TitleKey("1.20") == "", OverlayTarget.TitleKey("Minecraft 1.20.1 - Tek Oyunculu"));
		OverlayTarget overlayTarget = new OverlayTarget
		{
			Exe = "javaw.exe",
			Title = "Minecraft 1.20.1",
			Name = "Minecraft 1.20.1"
		};
		Check("Minecraft (javaw.exe): sürüm/başlık değişse de tanınır", overlayTarget.Matches("JAVAW.EXE", "Minecraft* 1.21 - Çok Oyunculu") && overlayTarget.Matches("javaw.exe", "Minecraft Launcher"));
		Check("Başka bir Java programı Minecraft sayılmaz", !overlayTarget.Matches("javaw.exe", "Eclipse IDE") && !overlayTarget.Matches("javaw.exe", ""));
		OverlayTarget overlayTarget2 = new OverlayTarget
		{
			Exe = "Among Us.exe",
			Title = "Among Us"
		};
		Check("Normal program exe adıyla tanınır (başlık değişse de)", overlayTarget2.Matches("among us.exe", "Lobi") && !overlayTarget2.Matches("Godot_v4.2-stable_win64.exe", "Among Us"));
		Check("Seçim yoksa hiçbir pencere eşleşmez", !new OverlayTarget().Matches("x.exe", "x"));
		Check("Ortak çalıştırıcı listesi", OverlayTarget.IsGenericHost("pythonw.exe") && OverlayTarget.IsGenericHost("python3.11.exe") && !OverlayTarget.IsGenericHost("RobloxPlayerBeta.exe"));
	}

	[DllImport("user32.dll")]
	private static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool repaint);

	[DllImport("user32.dll")]
	private static extern bool ShowWindow(IntPtr h, int cmd);

	private static Point ClientOrigin(IntPtr h)
	{
		ProgramList.Native.POINT p = default;
		ProgramList.Native.ClientToScreen(h, ref p);
		return new Point(p.X, p.Y);
	}

	private static void TargetLiveTests(string dir)
	{
		string text;
		using (Bitmap b = TestPhoto())
		{
			text = ToDataUrl(b);
		}
		string fileName = Path.GetFileName(Application.ExecutablePath);
		OverlayController ov = new OverlayController();
		ov.SetProfile("Furkan Kaya", text);
		ov.SetEnabled(on: true);
		ov.SetInRoom(inRoom: true);
		int statusEvents = 0;
		ov.TargetStatusChanged += () =>
		{
			statusEvents++;
		};
		OverlayTarget target = new OverlayTarget
		{
			Exe = fileName,
			Path = Application.ExecutablePath,
			Title = "Minecraft 1.20.1",
			Name = "Minecraft"
		};
		ov.SetTarget(target);
		Pump(500);
		Check("Seçili program kapalıyken: çalışmıyor bilgisi, gösterge yok", !ov.TargetRunning && !ov.IsShown);
		Process game = StartGame(windowed: true, "Minecraft 1.20.1");
		try
		{
			IntPtr ıntPtr = GameWindow(game);
			Check("Seçilecek program (ayrı süreç, pencereli) açıldı", ıntPtr != IntPtr.Zero);
			List<ProgramInfo> list = ProgramList.Enumerate();
			ProgramInfo programInfo = list.Find((ProgramInfo x) => x.Pid == game.Id);
			Check("Program listesinde: ad, exe, başlık, simge", programInfo != null && programInfo.Exe.Equals(fileName, StringComparison.OrdinalIgnoreCase) && programInfo.Title == "Minecraft 1.20.1" && programInfo.Name.Length > 0 && programInfo.Icon.StartsWith("data:image/png;base64,") && programInfo.Icon.Length > 200, (programInfo == null) ? ("yok (" + list.Count + " program)") : $"{programInfo.Name} | {programInfo.Title} | {programInfo.Exe} | simge {programInfo.Icon.Length} B");
			Check("FK Sohbet'in kendisi listede yok", !list.Exists((ProgramInfo x) => x.Pid == Process.GetCurrentProcess().Id));
			Check("Program açılınca otomatik algılandı (çalışıyor)", PumpUntil(() => ov.TargetRunning, 4000) && statusEvents > 0);
			SetForegroundWindow(ıntPtr);
			bool flag = PumpUntil(() => ov.IsShown, 3000);
			Pump(300);
			Point point = ClientOrigin(ıntPtr);
			Point point2 = new Point(point.X + 14, point.Y + 14);
			Check("Program öndeyken gösterge görünür, PENCERESİNİN sol üst köşesinde", flag && ov.Position == point2 && ov.AnchorWindow == ıntPtr, $"gösterge {ov.Position}, pencere içi {point}");
			Check("Gösterge programın odağını çalmadı", OverlayNative.GetForegroundWindow() == ıntPtr);
			OverlayNative.GetWindowRect(ıntPtr, out var r);
			Capture(Rectangle.FromLTRB(r.Left, r.Top, Math.Min(r.Left + 520, r.Right), Math.Min(r.Top + 260, r.Bottom)), Path.Combine(dir, "live-6-secili-program.png"));
			MoveWindow(ıntPtr, 420, 260, 900, 640, repaint: true);
			Point co2 = ClientOrigin(ıntPtr);
			bool flag2 = PumpUntil(() => ov.Position == new Point(co2.X + 14, co2.Y + 14), 2000);
			Check("Pencere taşınınca/boyutlanınca gösterge de sol üstüyle birlikte gelir", flag2 && co2 != point, $"{point} → {co2}, gösterge {ov.Position}");
			ov.SetMembers(new List<(string, string, string)>
			{
				("p1", "Mehmet", text),
				("p2", "Ayşe", "")
			});
			ov.SetPeerVoice("p1", speaking: true, 0.8, muted: false);
			ov.SetPeerVoice("p2", speaking: false, 0.0, muted: true);
			Pump(500);
			OverlayNative.GetWindowRect(ov.WindowHandle, out var r2);
			Rectangle rectangle = r2.ToRectangle();
			Check("2 kişi: gösterge 2 satır (fazla arkadaş alınmaz), pencere boyutu yığına eşit", ov.RowCount == 2 && ov.Stack != null && ov.Stack.Rows.Length == 2 && rectangle.Size == ov.Stack.Size, rectangle.ToString());
			Check("Konuşan arkadaşın (Mehmet) satırı aktif, alınmayan kişi pasif", ov.PeerSpeaking("p1") && !ov.PeerSpeaking("p2"));
			OverlayNative.GetWindowRect(ıntPtr, out var r3);
			Capture(Rectangle.FromLTRB(r3.Left, r3.Top, Math.Min(r3.Left + 520, r3.Right), Math.Min(r3.Top + 300, r3.Bottom)), Path.Combine(dir, "live-7-iki-kisi.png"));
			ov.SetPeerVoice("p1", speaking: false, 0.0, muted: false);
			Check("Susunca satır pasif, çizim döngüsü durur", PumpUntil(() => !ov.PeerSpeaking("p1") && !ov.Animating, 2000));
			ov.SetMembers(new List<(string, string, string)>());
			Pump(200);
			Check("Arkadaşlar ayrılınca tek satıra döner", ov.RowCount == 1 && ov.Stack != null && ov.Stack.Rows.Length == 1);
			ShowWindow(ıntPtr, 6);
			Check("Program simge durumuna küçülünce gösterge gizlenir", PumpUntil(() => !ov.IsShown, 2000));
			ShowWindow(ıntPtr, 9);
			SetForegroundWindow(ıntPtr);
			Check("Program geri gelince gösterge yine görünür", PumpUntil(() => ov.IsShown, 3000));
			using (Form form = new Form
			{
				Text = "Başka pencere",
				StartPosition = FormStartPosition.Manual,
				Bounds = new Rectangle(1200, 300, 400, 300)
			})
			{
				form.Show();
				form.Activate();
				SetForegroundWindow(form.Handle);
				Check("Başka bir pencere öndeyken gösterge görünmez (rastgele yerde çıkmaz)", PumpUntil(() => !ov.IsShown, 2000));
				form.Close();
			}
			SetForegroundWindow(ıntPtr);
			PumpUntil(() => ov.IsShown, 3000);
		}
		finally
		{
			Kill(game);
		}
		Check("Program kapanınca gösterge kapanır", PumpUntil(() => !ov.IsShown, 2000));
		Check("Program kapanınca \"çalışmıyor\" bilgisi", PumpUntil(() => !ov.TargetRunning, 4000));
		string text2 = Path.Combine(Path.GetTempPath(), "FKBaskaOyun.exe");
		try
		{
			File.Copy(Application.ExecutablePath, text2, overwrite: true);
		}
		catch
		{
		}
		Process p = StartGame(windowed: false, "Başka Oyun", text2);
		try
		{
			IntPtr ıntPtr2 = GameWindow(p);
			SetForegroundWindow(ıntPtr2);
			Pump(1200);
			Check("Seçili olmayan tam ekran program: gösterge yok", ıntPtr2 != IntPtr.Zero && !ov.IsShown && !ov.TargetRunning);
		}
		finally
		{
			Kill(p);
			try
			{
				Thread.Sleep(300);
				File.Delete(text2);
			}
			catch
			{
			}
		}
		Process p2 = StartGame(windowed: true, "Minecraft 1.21");
		try
		{
			SetForegroundWindow(GameWindow(p2));
			Check("Program yeniden açılınca gösterge otomatik etkinleşir", PumpUntil(() => ov.IsShown && ov.TargetRunning, 4000));
			ov.SetTarget(new OverlayTarget());
			Pump(800);
			Check("Seçim kaldırılınca pencereli program göstergesiz (eski otomatik tam ekran modu)", !ov.IsShown);
		}
		finally
		{
			Kill(p2);
		}
		ov.Dispose();
	}

	public static int RunTestGame(bool windowed, string title = null)
	{
		Form f = new Form
		{
			Text = (string.IsNullOrEmpty(title) ? "FK Test Oyunu" : title),
			FormBorderStyle = (windowed ? FormBorderStyle.Sizable : FormBorderStyle.None),
			StartPosition = FormStartPosition.Manual,
			Bounds = (windowed ? new Rectangle(100, 100, 800, 600) : Screen.PrimaryScreen.Bounds),
			BackColor = Color.FromArgb(40, 70, 110)
		};
		f.Paint += (object s, PaintEventArgs e) =>
		{
			Rectangle clientRectangle = f.ClientRectangle;
			using (LinearGradientBrush brush = new LinearGradientBrush(clientRectangle, Color.FromArgb(46, 84, 130), Color.FromArgb(120, 150, 90), 35f))
			{
				e.Graphics.FillRectangle(brush, clientRectangle);
			}
			using Font font = new Font(FontFamily.GenericSansSerif, 28f, FontStyle.Bold);
			TextRenderer.DrawText(e.Graphics, "TEST OYUNU", font, clientRectangle, Color.FromArgb(230, 240, 250), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
		};
		Application.Run(f);
		return 0;
	}
}
