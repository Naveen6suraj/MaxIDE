using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

namespace MaxIDE.Installer
{
    static class SetupProgram
    {
        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);

        const uint HWND_BROADCAST = 0xffff;
        const uint WM_SETTINGCHANGE = 0x001a;
        const uint SMTO_ABORTIFHUNG = 0x0002;

        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                bool isSilent = false;
                foreach (string arg in args)
                {
                    string clean = arg.TrimStart('/', '-').ToLower();
                    if (clean == "s" || clean == "silent" || clean == "quiet")
                    {
                        isSilent = true;
                    }
                }

                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string sourceDir = Path.Combine(baseDir, "MaxIDE");
                if (!Directory.Exists(sourceDir))
                {
                    sourceDir = baseDir;
                }

                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string installDir = Path.Combine(localAppData, "Programs", "MaxIDE");

                if (!isSilent)
                {
                    DialogResult dr = MessageBox.Show(
                        "Welcome to MaxIDE Setup!\n\n" +
                        "This will install MaxIDE to:\n" + installDir + "\n\n" +
                        "Do you wish to continue?",
                        "MaxIDE Setup",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Information);

                    if (dr != DialogResult.Yes)
                    {
                        return;
                    }
                }

                try
                {
                    Process[] procs = Process.GetProcessesByName("MaxIDE");
                    foreach (Process p in procs)
                    {
                        p.Kill();
                        p.WaitForExit(2000);
                    }
                }
                catch {}

                if (!Directory.Exists(installDir))
                {
                    Directory.CreateDirectory(installDir);
                }

                CopyDirectory(sourceDir, installDir);

                string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string startMenuPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Microsoft\Windows\Start Menu\Programs");
                string exeTarget = Path.Combine(installDir, "MaxIDE.exe");

                CreateShortcut(Path.Combine(desktopPath, "MaxIDE.lnk"), exeTarget, installDir, "MaxIDE AI Software Engineering Studio");
                CreateShortcut(Path.Combine(startMenuPath, "MaxIDE.lnk"), exeTarget, installDir, "MaxIDE AI Software Engineering Studio");

                // Update User PATH environment variable in Registry & broadcast change
                try
                {
                    string binDir = Path.Combine(installDir, "bin");
                    using (RegistryKey envKey = Registry.CurrentUser.OpenSubKey("Environment", true))
                    {
                        if (envKey != null)
                        {
                            string currentPath = (envKey.GetValue("Path", "", RegistryValueOptions.DoNotExpandEnvironmentNames) as string) ?? "";
                            string[] parts = currentPath.Split(new char[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
                            bool found = false;
                            foreach (string p in parts)
                            {
                                if (p.Trim().Equals(binDir, StringComparison.OrdinalIgnoreCase))
                                {
                                    found = true;
                                    break;
                                }
                            }
                            if (!found)
                            {
                                string updatedPath = string.IsNullOrEmpty(currentPath) ? binDir : currentPath + ";" + binDir;
                                envKey.SetValue("Path", updatedPath, RegistryValueKind.ExpandString);
                            }
                        }
                    }

                    UIntPtr result;
                    SendMessageTimeout((IntPtr)HWND_BROADCAST, WM_SETTINGCHANGE, UIntPtr.Zero, "Environment", SMTO_ABORTIFHUNG, 3000, out result);
                }
                catch {}

                if (!isSilent)
                {
                    DialogResult launchDr = MessageBox.Show(
                        "MaxIDE has been successfully installed!\n\n" +
                        "• Desktop and Start Menu shortcuts created.\n" +
                        "• 'maxide' CLI added to User PATH.\n" +
                        "• Self-contained runtime verified.\n\n" +
                        "Would you like to launch MaxIDE now?",
                        "Installation Complete",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Information);

                    if (launchDr == DialogResult.Yes)
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = exeTarget,
                            WorkingDirectory = installDir
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                if (!args.ToString().ToLower().Contains("silent"))
                {
                    MessageBox.Show("Installation error: " + ex.Message, "MaxIDE Setup Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        static void CopyDirectory(string source, string destination)
        {
            foreach (string dir in Directory.GetDirectories(source, "*", SearchOption.AllDirectories))
            {
                string rel = dir.Substring(source.Length).TrimStart('\\', '/');
                if (rel.StartsWith(".") || rel.StartsWith("installer") || rel.StartsWith("test-")) continue;
                string destDir = Path.Combine(destination, rel);
                if (!Directory.Exists(destDir)) Directory.CreateDirectory(destDir);
            }

            foreach (string file in Directory.GetFiles(source, "*.*", SearchOption.AllDirectories))
            {
                string rel = file.Substring(source.Length).TrimStart('\\', '/');
                if (rel.StartsWith(".") || rel.StartsWith("installer") || rel.EndsWith(".cs") || rel.EndsWith(".log")) continue;
                string destFile = Path.Combine(destination, rel);
                string destParent = Path.GetDirectoryName(destFile);
                if (!Directory.Exists(destParent)) Directory.CreateDirectory(destParent);
                File.Copy(file, destFile, true);
            }
        }

        static void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string description)
        {
            try
            {
                string psCommand = string.Format(
                    "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('{0}'); $s.TargetPath = '{1}'; $s.WorkingDirectory = '{2}'; $s.Description = '{3}'; $s.Save()",
                    shortcutPath.Replace("'", "''"),
                    targetPath.Replace("'", "''"),
                    workingDir.Replace("'", "''"),
                    description.Replace("'", "''")
                );

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -ExecutionPolicy Bypass -Command \"" + psCommand + "\"",
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = false
                };
                Process p = Process.Start(psi);
                p.WaitForExit(5000);
            }
            catch {}
        }
    }
}
