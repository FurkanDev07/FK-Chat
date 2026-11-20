using System;
using System.Collections.Generic;

namespace FKSohbet;

internal sealed class ProgramInfo
{
	public string Name = "";

	public string Title = "";

	public string Exe = "";

	public string Path = "";

	public string Tag = "";

	public string Icon = "";

	public int Pid;

	public IntPtr Window;

	public Dictionary<string, object> ToJson()
	{
		return new Dictionary<string, object>
		{
			["name"] = Name,
			["title"] = Title,
			["exe"] = Exe,
			["path"] = Path,
			["tag"] = Tag,
			["icon"] = Icon,
			["pid"] = Pid
		};
	}
}
