using System;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace FKSohbet;

internal static class WindowPlacement
{
	public static void Restore(Form form, float scale)
	{
		Rectangle workingArea = Screen.FromPoint(Cursor.Position).WorkingArea;
		try
		{
			if (File.Exists(AppPaths.WindowStateFile))
			{
				string[] array = File.ReadAllText(AppPaths.WindowStateFile).Split(',');
				if (array.Length == 4)
				{
					Rectangle rectangle = new Rectangle(int.Parse(array[0], CultureInfo.InvariantCulture), int.Parse(array[1], CultureInfo.InvariantCulture), int.Parse(array[2], CultureInfo.InvariantCulture), int.Parse(array[3], CultureInfo.InvariantCulture));
					if (rectangle.Width >= form.MinimumSize.Width && rectangle.Height >= form.MinimumSize.Height && IsVisibleOnAnyScreen(rectangle))
					{
						form.Bounds = rectangle;
						return;
					}
				}
			}
		}
		catch
		{
		}
		int num = Math.Min((int)(460f * scale), workingArea.Width);
		int num2 = Math.Min((int)(760f * scale), workingArea.Height);
		form.Bounds = new Rectangle(workingArea.Left + (workingArea.Width - num) / 2, workingArea.Top + (workingArea.Height - num2) / 2, num, num2);
	}

	public static void Save(Form form)
	{
		try
		{
			Rectangle rectangle = ((form.WindowState == FormWindowState.Normal) ? form.Bounds : form.RestoreBounds);
			if (rectangle.Width > 0 && rectangle.Height > 0)
			{
				string contents = string.Join(",", rectangle.X.ToString(CultureInfo.InvariantCulture), rectangle.Y.ToString(CultureInfo.InvariantCulture), rectangle.Width.ToString(CultureInfo.InvariantCulture), rectangle.Height.ToString(CultureInfo.InvariantCulture));
				File.WriteAllText(AppPaths.WindowStateFile, contents, Encoding.ASCII);
			}
		}
		catch
		{
		}
	}

	private static bool IsVisibleOnAnyScreen(Rectangle r)
	{
		Screen[] allScreens = Screen.AllScreens;
		for (int i = 0; i < allScreens.Length; i++)
		{
			Rectangle rectangle = Rectangle.Intersect(allScreens[i].WorkingArea, r);
			if (rectangle.Width >= 100 && rectangle.Height >= 60)
			{
				return true;
			}
		}
		return false;
	}
}
