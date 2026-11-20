using System.Drawing;

namespace FKSohbet;

internal sealed class OverlayStack
{
	public float Scale;

	public bool Compact;

	public OverlayLayout[] Rows;

	public float[] RowY;

	public Size Size;
}
