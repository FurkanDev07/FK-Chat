using System;
using System.Drawing;
using System.Windows.Forms;

namespace FKSohbet;

internal sealed class OverlayWindow : Form
{
	protected override bool ShowWithoutActivation => true;

	protected override CreateParams CreateParams
	{
		get
		{
			CreateParams createParams = base.CreateParams;
			createParams.ExStyle |= 134742184;
			return createParams;
		}
	}

	public OverlayWindow()
	{
		FormBorderStyle = FormBorderStyle.None;
		ShowInTaskbar = false;
		StartPosition = FormStartPosition.Manual;
		Text = "FK Sohbet — oyun içi gösterge";
		Size = new Size(1, 1);
	}

	protected override void WndProc(ref Message m)
	{
		if (m.Msg == 132)
		{
			m.Result = (IntPtr)(-1);
		}
		else if (m.Msg == 33)
		{
			m.Result = (IntPtr)3;
		}
		else
		{
			base.WndProc(ref m);
		}
	}

	public void Present(Bitmap bmp, Point pos, byte opacity)
	{
		IntPtr dC = OverlayNative.GetDC(IntPtr.Zero);
		IntPtr ıntPtr = OverlayNative.CreateCompatibleDC(dC);
		IntPtr ıntPtr2 = IntPtr.Zero;
		IntPtr ıntPtr3 = IntPtr.Zero;
		try
		{
			ıntPtr2 = bmp.GetHbitmap(Color.FromArgb(0));
			ıntPtr3 = OverlayNative.SelectObject(ıntPtr, ıntPtr2);
			OverlayNative.SIZE psize = new OverlayNative.SIZE(bmp.Width, bmp.Height);
			OverlayNative.POINT pprSrc = new OverlayNative.POINT(0, 0);
			OverlayNative.POINT pptDst = new OverlayNative.POINT(pos.X, pos.Y);
			OverlayNative.BLENDFUNCTION pblend = new OverlayNative.BLENDFUNCTION
			{
				BlendOp = 0,
				BlendFlags = 0,
				SourceConstantAlpha = opacity,
				AlphaFormat = 1
			};
			OverlayNative.UpdateLayeredWindow(Handle, dC, ref pptDst, ref psize, ıntPtr, ref pprSrc, 0, ref pblend, 2);
		}
		finally
		{
			if (ıntPtr3 != IntPtr.Zero)
			{
				OverlayNative.SelectObject(ıntPtr, ıntPtr3);
			}
			if (ıntPtr2 != IntPtr.Zero)
			{
				OverlayNative.DeleteObject(ıntPtr2);
			}
			OverlayNative.DeleteDC(ıntPtr);
			OverlayNative.ReleaseDC(IntPtr.Zero, dC);
		}
	}

	public void ShowNoActivate()
	{
		OverlayNative.ShowWindow(Handle, 4);
		KeepOnTop();
	}

	public void KeepOnTop()
	{
		OverlayNative.SetWindowPos(Handle, OverlayNative.HWND_TOPMOST, 0, 0, 0, 0, 531u);
	}

	public void HideNoActivate()
	{
		OverlayNative.ShowWindow(Handle, 0);
	}
}
